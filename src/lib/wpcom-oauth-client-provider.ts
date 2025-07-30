/**
 * WordPress.com OAuth Client Provider
 * Implements the OAuth client provider interface for WordPress.com's implicit flow
 */

import { EventEmitter } from 'node:events';
import open from 'open';
import {
  OAuthClientProvider,
  WPComOAuthOptions,
  WPComTokens,
  OAuthError,
  OAuthCallbackServerOptions,
} from './oauth-types.js';
import {
  generateServerUrlHash,
  getValidTokens,
  writeTokens,
  deleteTokens,
} from './wpcom-auth-config.js';
import { setupWPComOAuthCallbackServer } from './oauth-callback-server.js';
import { log } from './utils.js';
import { CONFIG } from './config.js';

/**
 * Default WordPress.com OAuth configuration
 */
const DEFAULT_WPCOM_CONFIG = {
  authorizeEndpoint: 'https://public-api.wordpress.com/oauth2/authorize',
  clientId: CONFIG.WPCOM_CLIENT_ID,
  scopes: ['global'],
  callbackPort: CONFIG.OAUTH_CALLBACK_PORT,
  host: CONFIG.OAUTH_HOST,
};

export class WPComOAuthClientProvider implements OAuthClientProvider {
  private options: WPComOAuthOptions;
  private serverUrlHash: string;
  private events: EventEmitter;
  private authPromise: Promise<WPComTokens> | null = null;

  constructor(options: Partial<WPComOAuthOptions>) {
    this.options = {
      ...DEFAULT_WPCOM_CONFIG,
      ...options,
    } as WPComOAuthOptions;

    this.serverUrlHash = generateServerUrlHash(this.options.serverUrl);
    this.events = new EventEmitter();

    // Set reasonable timeout for auth operations
    this.events.setMaxListeners(10);

    log(`Initialized WPCom OAuth provider for server: ${this.options.serverUrl}`);
    log(`Server hash: ${this.serverUrlHash}`);
  }

  /**
   * Get current tokens if available and valid
   */
  async tokens(): Promise<WPComTokens | null> {
    try {
      const tokens = getValidTokens(this.serverUrlHash);
      if (tokens) {
        log('Found valid stored tokens');
        return tokens;
      }

      log('No valid tokens available');
      return null;
    } catch (error) {
      log('Error retrieving tokens:', error);
      return null;
    }
  }

  /**
   * Initiate OAuth authorization flow
   */
  async authorize(): Promise<void> {
    // If authorization is already in progress, wait for it
    if (this.authPromise) {
      log('Authorization already in progress, waiting...');
      await this.authPromise;
      return;
    }

    // Check if we already have valid tokens
    const existingTokens = await this.tokens();
    if (existingTokens) {
      log('Already have valid tokens, skipping authorization');
      return;
    }

    log('Starting OAuth authorization flow');

    this.authPromise = this.performAuthorization();

    try {
      await this.authPromise;
      log('OAuth authorization completed successfully');
    } catch (error) {
      log('OAuth authorization failed:', error);
      throw error;
    } finally {
      this.authPromise = null;
    }
  }

  /**
   * Perform the actual OAuth authorization
   */
  private async performAuthorization(): Promise<WPComTokens> {
    const callbackServerOptions: OAuthCallbackServerOptions = {
      port: this.options.callbackPort,
      host: this.options.host,
      serverUrlHash: this.serverUrlHash,
      timeout: CONFIG.OAUTH_TIMEOUT,
    };

    const callbackServer = setupWPComOAuthCallbackServer(callbackServerOptions, this.events);

    try {
      // Start the callback server
      await callbackServer.start();

      // Generate state parameter for security
      const state = this.generateState();

      // Build authorization URL
      const authUrl = this.buildAuthorizationUrl(callbackServer.getCallbackUrl(), state);

      log(`Opening browser to: ${authUrl}`);

      // Open browser to authorization URL
      await open(authUrl);

      // Wait for authorization result
      const tokens = await this.waitForAuthorizationResult();

      return tokens;
    } finally {
      // Always stop the callback server
      await callbackServer.stop();
    }
  }

  /**
   * Build the WordPress.com authorization URL
   */
  private buildAuthorizationUrl(callbackUrl: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: callbackUrl,
      response_type: 'token', // Implicit flow
      scope: this.options.scopes?.join(' ') || 'global',
      state: state,
    });

    return `${this.options.authorizeEndpoint}?${params.toString()}`;
  }

  /**
   * Generate a secure state parameter
   */
  private generateState(): string {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }

  /**
   * Wait for authorization result from callback server
   */
  private async waitForAuthorizationResult(): Promise<WPComTokens> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new OAuthError('Authorization timeout', 'TIMEOUT'));
      }, CONFIG.LOCK_TIMEOUT);

      const cleanup = () => {
        this.events.removeAllListeners('oauth-success');
        this.events.removeAllListeners('oauth-error');
        clearTimeout(timeout);
      };

      this.events.once('oauth-success', (tokens: WPComTokens) => {
        cleanup();
        log('OAuth authorization successful');
        resolve(tokens);
      });

      this.events.once('oauth-error', (error: Error) => {
        cleanup();
        log('OAuth authorization error:', error.message);
        reject(error);
      });
    });
  }

  /**
   * Clear stored tokens (for logout/reset)
   */
  async clearTokens(): Promise<void> {
    try {
      deleteTokens(this.serverUrlHash);
      log('Cleared stored tokens');
    } catch (error) {
      log('Error clearing tokens:', error);
      throw error;
    }
  }

  /**
   * Get authorization status
   */
  async isAuthorized(): Promise<boolean> {
    const tokens = await this.tokens();
    return tokens !== null;
  }

  /**
   * Get server URL hash
   */
  getServerUrlHash(): string {
    return this.serverUrlHash;
  }

  /**
   * Get OAuth options
   */
  getOptions(): WPComOAuthOptions {
    return { ...this.options };
  }
}
