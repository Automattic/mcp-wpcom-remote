import open from 'open';
import { EventEmitter } from 'node:events';
import {
  WPComTokens,
  WPComClientInfo,
  generateServerUrlHash,
  readTokens,
  writeTokens,
  readClientInfo,
  writeClientInfo,
  writeTextFile,
  readTextFile,
  deleteConfigFile,
  isTokenValid,
} from './persistent-auth-config.js';
import { OAuthError } from './oauth-types.js';
import { setupWPComOAuthCallbackServer } from './oauth-callback-server.js';
import { log } from './utils.js';
import { CONFIG } from './config.js';

/**
 * WordPress.com OAuth configuration for persistent storage
 */
const WPCOM_PERSISTENT_CONFIG = {
  authorizeEndpoint: 'https://public-api.wordpress.com/oauth2/authorize',
  clientId: CONFIG.WPCOM_CLIENT_ID,
  scopes: ['global'],
  callbackPort: CONFIG.OAUTH_CALLBACK_PORT,
  host: CONFIG.OAUTH_HOST,
};

/**
 * OAuth provider options for WordPress.com
 */
export interface WPComOAuthOptions {
  serverUrl: string;
  callbackPort: number;
  host: string;
  clientId?: string;
  scopes?: string[];
  authorizeEndpoint?: string;
}

/**
 * Persistent WordPress.com OAuth Client Provider
 * Stores tokens permanently in ~/.mcp-auth/wpcom-remote-{version}/
 */
export class PersistentWPComOAuthClientProvider {
  private options: WPComOAuthOptions;
  private serverUrlHash: string;
  private events: EventEmitter;
  private authPromise: Promise<WPComTokens> | null = null;

  constructor(options: Partial<WPComOAuthOptions>) {
    this.options = {
      ...WPCOM_PERSISTENT_CONFIG,
      ...options,
    } as WPComOAuthOptions;

    this.serverUrlHash = generateServerUrlHash(this.options.serverUrl);
    this.events = new EventEmitter();

    // Set reasonable timeout for auth operations
    this.events.setMaxListeners(10);

    log('Initialized Persistent WPCom OAuth provider for general API access');
    log(`Server URL: ${this.options.serverUrl}`);
    log(`Server hash: ${this.serverUrlHash}`);
    log(`Client ID: ${this.options.clientId}`);
  }

  /**
   * Get current tokens if available and valid from persistent storage
   */
  async tokens(): Promise<WPComTokens | null> {
    try {
      const tokens = await readTokens(this.serverUrlHash);
      if (tokens) {
        const validation = isTokenValid(tokens);
        if (validation.isValid) {
          log('Found valid tokens in persistent storage');
          if (validation.expiresIn) {
            log(`Tokens expire in ${validation.expiresIn} seconds`);
          }
          return tokens;
        } else {
          log(`Tokens in persistent storage are invalid: ${validation.error}`);
          return null;
        }
      }

      log('No tokens found in persistent storage');
      return null;
    } catch (error) {
      log('Error retrieving tokens from persistent storage:', error);
      return null;
    }
  }

  /**
   * Save tokens to persistent storage
   */
  async saveTokens(tokens: WPComTokens): Promise<void> {
    try {
      await writeTokens(this.serverUrlHash, tokens);
      log('Tokens saved to persistent storage');
    } catch (error) {
      log('Error saving tokens to persistent storage:', error);
      throw error;
    }
  }

  /**
   * Get client information from persistent storage
   */
  async clientInformation(): Promise<WPComClientInfo | null> {
    try {
      const clientInfo = await readClientInfo(this.serverUrlHash);
      if (clientInfo) {
        log('Found client information in persistent storage');
        return clientInfo;
      }

      log('No client information found in persistent storage');
      return null;
    } catch (error) {
      log('Error retrieving client information:', error);
      return null;
    }
  }

  /**
   * Save client information to persistent storage
   */
  async saveClientInformation(clientInfo: WPComClientInfo): Promise<void> {
    try {
      await writeClientInfo(this.serverUrlHash, clientInfo);
      log('Client information saved to persistent storage');
    } catch (error) {
      log('Error saving client information:', error);
      throw error;
    }
  }

  /**
   * Save PKCE code verifier
   */
  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    try {
      await writeTextFile(this.serverUrlHash, 'code_verifier.txt', codeVerifier);
      log('Code verifier saved');
    } catch (error) {
      log('Error saving code verifier:', error);
      throw error;
    }
  }

  /**
   * Get PKCE code verifier
   */
  async codeVerifier(): Promise<string> {
    try {
      const verifier = await readTextFile(
        this.serverUrlHash,
        'code_verifier.txt',
        'No code verifier saved for session'
      );
      log('Code verifier retrieved');
      return verifier;
    } catch (error) {
      log('Error retrieving code verifier:', error);
      throw error;
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

    // Check if we already have valid tokens in persistent storage
    const existingTokens = await this.tokens();
    if (existingTokens) {
      log('Already have valid tokens in persistent storage, skipping authorization');
      return;
    }

    log(
      'Starting OAuth authorization flow for general WordPress.com API access (persistent storage)'
    );

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
    const callbackServerOptions = {
      port: this.options.callbackPort,
      host: this.options.host,
      serverUrlHash: this.serverUrlHash,
      timeout: CONFIG.OAUTH_TIMEOUT,
    };

    log(`OAuth: Setting up callback server on ${this.options.host}:${this.options.callbackPort}`);
    const callbackServer = setupWPComOAuthCallbackServer(callbackServerOptions, this.events);

    try {
      // Start the callback server
      log('OAuth: Starting callback server...');
      await callbackServer.start();
      log('OAuth: Callback server started successfully');

      // Generate state parameter for security
      const state = this.generateState();
      log(`OAuth: Generated state parameter: ${state}`);

      // Build authorization URL
      const authUrl = this.buildAuthorizationUrl(callbackServer.getCallbackUrl(), state);

      log(`OAuth: Built authorization URL: ${authUrl}`);
      log(`OAuth: Callback URL: ${callbackServer.getCallbackUrl()}`);

      // Open browser to authorization URL
      log('OAuth: Attempting to open browser...');
      try {
        await open(authUrl);
        log('OAuth: Browser opened successfully');
      } catch (browserError) {
        log('OAuth: Failed to open browser automatically:', browserError);
        log('\n=== MANUAL ACTION REQUIRED ===');
        log('Please manually open the following URL in your browser:');
        log(`${authUrl}`);
        log('===============================\n');
        // Don't throw here, continue waiting for manual authorization
      }

      // Wait for authorization result
      log('OAuth: Waiting for authorization result...');
      const tokens = await this.waitForAuthorizationResult();
      log('OAuth: Authorization result received');

      // Save tokens to persistent storage
      log('OAuth: Saving tokens to persistent storage...');
      await this.saveTokens(tokens);
      log('OAuth: Tokens saved successfully');

      return tokens;
    } catch (error) {
      log('OAuth: Error during authorization flow:', error);
      log('OAuth: Error details:', error instanceof Error ? error.message : 'Unknown error');
      if (error instanceof Error && error.stack) {
        log('OAuth: Stack trace:', error.stack);
      }
      throw error;
    } finally {
      // Always stop the callback server
      log('OAuth: Stopping callback server...');
      try {
        await callbackServer.stop();
        log('OAuth: Callback server stopped');
      } catch (stopError) {
        log('OAuth: Error stopping callback server:', stopError);
      }
    }
  }

  /**
   * Build the WordPress.com authorization URL for general API access
   */
  private buildAuthorizationUrl(callbackUrl: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.options.clientId || WPCOM_PERSISTENT_CONFIG.clientId,
      redirect_uri: callbackUrl,
      response_type: 'token', // Implicit flow
      scope: this.options.scopes?.join(' ') || 'global',
      state: state,
    });

    return `${this.options.authorizeEndpoint || WPCOM_PERSISTENT_CONFIG.authorizeEndpoint}?${params.toString()}`;
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
        log('OAuth authorization successful for general API access (persistent storage)');
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
   * Clear stored tokens and credentials
   */
  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier'): Promise<void> {
    log(`Invalidating credentials: ${scope}`);

    switch (scope) {
      case 'all':
        await Promise.all([
          deleteConfigFile(this.serverUrlHash, 'client_info.json'),
          deleteConfigFile(this.serverUrlHash, 'tokens.json'),
          deleteConfigFile(this.serverUrlHash, 'code_verifier.txt'),
        ]);
        log('All credentials invalidated');
        break;

      case 'client':
        await deleteConfigFile(this.serverUrlHash, 'client_info.json');
        log('Client information invalidated');
        break;

      case 'tokens':
        await deleteConfigFile(this.serverUrlHash, 'tokens.json');
        log('OAuth tokens invalidated');
        break;

      case 'verifier':
        await deleteConfigFile(this.serverUrlHash, 'code_verifier.txt');
        log('Code verifier invalidated');
        break;

      default:
        throw new Error(`Unknown credential scope: ${scope}`);
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
   * Get the server URL hash
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

  /**
   * Redirect to authorization URL (for browser opening)
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    log(`\nPlease authorize this client by visiting:\n${authorizationUrl.toString()}\n`);

    try {
      await open(authorizationUrl.toString());
      log('Browser opened automatically.');
    } catch (error) {
      log(
        'Could not open browser automatically. Please copy and paste the URL above into your browser.'
      );
    }
  }
}
