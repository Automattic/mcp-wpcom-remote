/**
 * Multi-instance coordination for WordPress.com OAuth
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { AuthCoordinator, WPComTokens, OAuthError } from './oauth-types.js';
import { getAuthDirectory, getValidTokens } from './wpcom-auth-config.js';
import { WPComOAuthClientProvider } from './wpcom-oauth-client-provider.js';
import { log } from './utils.js';
import { CONFIG } from './config.js';

/**
 * Lockfile management for coordinating between multiple instances
 */
class LockfileManager {
  private lockfilePath: string;
  private isOwner: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(serverUrlHash: string) {
    const authDir = getAuthDirectory();
    this.lockfilePath = path.join(authDir, `${serverUrlHash}_auth.lock`);
  }

  /**
   * Try to acquire the lock
   */
  tryAcquire(): boolean {
    try {
      // Check if lockfile already exists
      if (fs.existsSync(this.lockfilePath)) {
        const lockData = this.readLockfile();
        if (lockData && this.isLockValid(lockData)) {
          return false; // Lock is held by another process
        }
        // Lock is stale, remove it
        this.release();
      }

      // Create new lockfile
      const lockData = {
        pid: process.pid,
        timestamp: Date.now(),
        hostname: require('os').hostname(),
      };

      fs.writeFileSync(this.lockfilePath, JSON.stringify(lockData), { mode: 0o600 });
      this.isOwner = true;

      // Start monitoring the lock
      this.startMonitoring();

      log(`Acquired auth lock: ${this.lockfilePath}`);
      return true;
    } catch (error) {
      log('Error acquiring lock:', error);
      return false;
    }
  }

  /**
   * Release the lock
   */
  release(): void {
    try {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }

      if (this.isOwner && fs.existsSync(this.lockfilePath)) {
        fs.unlinkSync(this.lockfilePath);
        log(`Released auth lock: ${this.lockfilePath}`);
      }

      this.isOwner = false;
    } catch (error) {
      log('Error releasing lock:', error);
    }
  }

  /**
   * Check if we own the lock
   */
  isLockOwner(): boolean {
    return this.isOwner;
  }

  /**
   * Wait for lock to be released
   */
  async waitForRelease(timeout: number = CONFIG.LOCK_TIMEOUT): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkLock = () => {
        if (!fs.existsSync(this.lockfilePath)) {
          resolve();
          return;
        }

        const lockData = this.readLockfile();
        if (!lockData || !this.isLockValid(lockData)) {
          // Lock is stale, clean it up
          this.release();
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          reject(new OAuthError('Timeout waiting for auth lock', 'LOCK_TIMEOUT'));
          return;
        }

        // Check again in 1 second
        setTimeout(checkLock, 1000);
      };

      checkLock();
    });
  }

  /**
   * Read lockfile data
   */
  private readLockfile(): any {
    try {
      const data = fs.readFileSync(this.lockfilePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Check if lock is still valid (process is running)
   */
  private isLockValid(lockData: any): boolean {
    try {
      // Check if the process is still running
      process.kill(lockData.pid, 0);

      // Check if lock is not too old (safety measure)
      const age = Date.now() - lockData.timestamp;
      return age < 600000; // 10 minutes max age
    } catch {
      // Process doesn't exist or we can't signal it
      return false;
    }
  }

  /**
   * Monitor lock validity
   */
  private startMonitoring(): void {
    this.checkInterval = setInterval(() => {
      if (this.isOwner && !fs.existsSync(this.lockfilePath)) {
        log('Lock file was removed externally');
        this.isOwner = false;
        if (this.checkInterval) {
          clearInterval(this.checkInterval);
          this.checkInterval = null;
        }
      }
    }, 5000); // Check every 5 seconds
  }
}

/**
 * WordPress.com OAuth authentication coordinator
 */
export class WPComAuthCoordinator implements AuthCoordinator {
  private serverUrlHash: string;
  private callbackPort: number;
  private events: EventEmitter;
  private lockManager: LockfileManager;
  private oauthProvider: WPComOAuthClientProvider | null = null;
  private isStarted: boolean = false;

  constructor(serverUrlHash: string, callbackPort: number, events: EventEmitter) {
    this.serverUrlHash = serverUrlHash;
    this.callbackPort = callbackPort;
    this.events = events;
    this.lockManager = new LockfileManager(serverUrlHash);
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    log('Starting WPCom auth coordinator');
    this.isStarted = true;

    // Setup cleanup on process exit
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  async stop(): Promise<void> {
    log('Stopping WPCom auth coordinator');
    this.cleanup();
    this.isStarted = false;
  }

  async waitForAuth(): Promise<WPComTokens> {
    if (!this.isStarted) {
      throw new OAuthError('Auth coordinator not started');
    }

    // First, check if we already have valid tokens
    const existingTokens = getValidTokens(this.serverUrlHash);
    if (existingTokens) {
      log('Found existing valid tokens');
      return existingTokens;
    }

    // Try to acquire the auth lock
    if (this.lockManager.tryAcquire()) {
      // We got the lock, perform authentication
      return await this.performAuthentication();
    } else {
      // Another instance is handling auth, wait for it
      return await this.waitForOtherInstanceAuth();
    }
  }

  private async performAuthentication(): Promise<WPComTokens> {
    try {
      log('Performing OAuth authentication as lock owner');

      if (!this.oauthProvider) {
        // We need server URL for the OAuth provider, use environment variable or default
        const serverUrl = CONFIG.WP_API_URL;

        this.oauthProvider = new WPComOAuthClientProvider({
          serverUrl,
          callbackPort: this.callbackPort,
          host: CONFIG.OAUTH_HOST,
        });
      }

      await this.oauthProvider.authorize();

      const tokens = await this.oauthProvider.tokens();
      if (!tokens) {
        throw new OAuthError('Authentication completed but no tokens available');
      }

      log('Authentication successful, tokens obtained');
      return tokens;
    } finally {
      // Always release the lock when done
      this.lockManager.release();
    }
  }

  private async waitForOtherInstanceAuth(): Promise<WPComTokens> {
    log('Waiting for another instance to complete authentication');

    try {
      // Wait for the lock to be released
      await this.lockManager.waitForRelease();

      // Check if tokens are now available
      const tokens = getValidTokens(this.serverUrlHash);
      if (tokens) {
        log('Tokens are now available from other instance');
        return tokens;
      }

      // No tokens available, try to auth ourselves
      return await this.waitForAuth();
    } catch (error) {
      log('Error waiting for other instance auth:', error);
      throw error;
    }
  }

  private cleanup(): void {
    this.lockManager.release();
  }
}

/**
 * Create a WordPress.com auth coordinator
 */
export function createWPComAuthCoordinator(
  serverUrlHash: string,
  callbackPort: number,
  events: EventEmitter
): AuthCoordinator {
  return new WPComAuthCoordinator(serverUrlHash, callbackPort, events);
}

/**
 * Lazy authentication coordinator that initializes only when needed
 */
export class LazyWPComAuthCoordinator implements AuthCoordinator {
  private coordinator: WPComAuthCoordinator | null = null;
  private serverUrlHash: string;
  private callbackPort: number;
  private events: EventEmitter;

  constructor(serverUrlHash: string, callbackPort: number, events: EventEmitter) {
    this.serverUrlHash = serverUrlHash;
    this.callbackPort = callbackPort;
    this.events = events;
  }

  async start(): Promise<void> {
    // Lazy initialization - start only when actually needed
  }

  async stop(): Promise<void> {
    if (this.coordinator) {
      await this.coordinator.stop();
      this.coordinator = null;
    }
  }

  async waitForAuth(): Promise<WPComTokens> {
    // First check if we already have valid tokens
    const existingTokens = getValidTokens(this.serverUrlHash);
    if (existingTokens) {
      return existingTokens;
    }

    // Initialize coordinator if needed
    if (!this.coordinator) {
      this.coordinator = new WPComAuthCoordinator(
        this.serverUrlHash,
        this.callbackPort,
        this.events
      );
      await this.coordinator.start();
    }

    return await this.coordinator.waitForAuth();
  }
}

/**
 * Create a lazy WordPress.com auth coordinator
 */
export function createLazyWPComAuthCoordinator(
  serverUrlHash: string,
  callbackPort: number,
  events: EventEmitter
): AuthCoordinator {
  return new LazyWPComAuthCoordinator(serverUrlHash, callbackPort, events);
}
