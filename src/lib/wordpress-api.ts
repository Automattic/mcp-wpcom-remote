/**
 * External dependencies
 */
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { WordPressRequestParams, WordPressResponse } from './types.js';
import { WPComTokens } from './oauth-types.js';
import {
  getValidTokens,
  generateServerUrlHash,
  cleanupExpiredTokens,
} from './persistent-auth-config.js';
import { PersistentWPComOAuthClientProvider } from './persistent-oauth-client-provider.js';
import { log } from './utils.js';
import { CONFIG } from './config.js';

/**
 * WordPress API request function with OAuth support for general WordPress.com API
 *
 * @param {Object} params - Query parameters for the request
 * @return {Promise<any>} API response as JSON
 */

// Global OAuth provider for general WordPress.com API access
let oauthProvider: PersistentWPComOAuthClientProvider | null = null;
let globalEvents: EventEmitter | null = null;

function validateEnvironment() {
  // Check if we have any form of authentication configured
  const hasJWT = !!CONFIG.JWT_TOKEN;
  const hasBasicAuth = !!(CONFIG.WP_API_USERNAME && CONFIG.WP_API_PASSWORD);
  const oauthEnabled = CONFIG.OAUTH_ENABLED;

  // Log authentication method being used
  if (hasJWT) {
    log('Authentication: Using JWT token');
  } else if (hasBasicAuth) {
    log('Authentication: Using Basic auth (username/password)');
  } else if (oauthEnabled) {
    log(
      'Authentication: Using OAuth (default) - will trigger browser authentication if no stored tokens'
    );
  }

  if (!hasJWT && !hasBasicAuth && !oauthEnabled) {
    throw new Error(
      'No authentication method configured. Please set one of:\n' +
        '- JWT_TOKEN for JWT authentication\n' +
        '- WP_API_USERNAME and WP_API_PASSWORD for Basic auth\n' +
        '- OAuth is enabled by default (set OAUTH_ENABLED=false to disable)'
    );
  }
}

/**
 * Get OAuth tokens for general WordPress.com API access
 */
async function getOAuthTokens(): Promise<WPComTokens | null> {
  try {
    // Check if OAuth is enabled (enabled by default, disabled only if explicitly set to false)
    const oauthEnabled = CONFIG.OAUTH_ENABLED;
    if (!oauthEnabled) {
      log('OAuth: Disabled via OAUTH_ENABLED=false');
      return null;
    }

    log('OAuth: Attempting to get tokens for general WordPress.com API...');

    const serverUrl = CONFIG.WP_API_URL;
    const serverUrlHash = generateServerUrlHash(serverUrl);

    // Try to get existing valid tokens first
    const existingTokens = await getValidTokens(serverUrlHash);
    if (existingTokens) {
      log('OAuth: Using existing valid tokens from persistent storage');
      return existingTokens;
    }

    log('OAuth: No existing valid tokens found in persistent storage, initializing auth flow...');

    // Initialize OAuth provider if needed
    if (!oauthProvider) {
      const callbackPort = CONFIG.OAUTH_CALLBACK_PORT;
      const host = CONFIG.OAUTH_HOST;

      log(`OAuth: Setting up provider for general API access with callback port ${callbackPort}`);

      try {
        oauthProvider = new PersistentWPComOAuthClientProvider({
          serverUrl,
          callbackPort,
          host,
          clientId: CONFIG.WPCOM_CLIENT_ID,
        });
        log('OAuth: Provider initialized successfully');
      } catch (providerError) {
        log('OAuth: Failed to initialize provider:', providerError);
        throw providerError;
      }
    }

    // This will trigger OAuth flow if needed
    log('OAuth: Starting authentication for general WordPress.com API access...');
    try {
      await oauthProvider.authorize();
      log('OAuth: Authorization completed');
    } catch (authError) {
      log('OAuth: Authorization failed:', authError);
      throw authError;
    }

    // Get the tokens after successful authorization
    const tokens = await oauthProvider.tokens();
    if (tokens) {
      log('OAuth: Tokens obtained for general API access');
      return tokens;
    } else {
      log('OAuth: No tokens available after authorization');
      return null;
    }
  } catch (error) {
    log('OAuth: Error getting tokens - Details:', error);
    log('OAuth: Error message:', error instanceof Error ? error.message : 'Unknown error');
    log('OAuth: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return null;
  }
}

function removeTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function wpRequest(
  params: WordPressRequestParams = { method: 'init' }
): Promise<WordPressResponse> {
  // Validate environment variables first
  validateEnvironment();

  const method = 'POST';
  const baseUrl = removeTrailingSlash(CONFIG.WP_API_URL);

  // Log the request parameters for debugging
  log(`Request method: ${params.method || 'init'}`);
  log(`Request args: ${JSON.stringify(params.args || {})}`);

  // Prepare authorization header
  let authHeader: string;

  // Try OAuth first (if enabled and available)
  const oauthTokens = await getOAuthTokens();
  if (oauthTokens) {
    authHeader = `Bearer ${oauthTokens.access_token}`;
    log(`Using OAuth token authentication for general WordPress.com API`);
    log(`Token length: ${oauthTokens.access_token.length}`);
  } else if (CONFIG.JWT_TOKEN) {
    // Use JWT token for authentication
    authHeader = `Bearer ${CONFIG.JWT_TOKEN}`;
    log(`Using JWT token authentication`);
    log(`Token length: ${CONFIG.JWT_TOKEN.length}`);
  } else {
    // Determine which credentials to use based on the method and args
    let username: string;
    let password: string;

    if (
      params.method === 'tools/call' &&
      params.args &&
      params.args.tool &&
      params.args.tool.startsWith('wc_reports_')
    ) {
      // Use WooCommerce credentials for WooCommerce report tools
      username = CONFIG.WOO_CUSTOMER_KEY!;
      password = CONFIG.WOO_CUSTOMER_SECRET!;

      // Log which credentials are being used
      log(`Using WooCommerce credentials for tool: ${params.args.tool}`);

      // Validate WooCommerce credentials
      if (!username || !password) {
        throw new Error(
          'Missing WooCommerce credentials. Please set WOO_CUSTOMER_KEY and WOO_CUSTOMER_SECRET environment variables.'
        );
      }
    } else {
      // Use standard WordPress credentials for other methods
      username = CONFIG.WP_API_USERNAME!;
      password = CONFIG.WP_API_PASSWORD!;

      // Log which credentials are being used
      log(`Using WordPress credentials for method: ${params.method || 'init'}`);
    }

    // Log credential information (without exposing the actual values)
    log(`Username length: ${username ? username.length : 0}`);
    log(`Password length: ${password ? password.length : 0}`);

    // Prepare Basic auth header
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    authHeader = `Basic ${auth}`;
    log(`Auth header length: ${auth.length}`);
  }

  log(`Environment: ${CONFIG.NODE_ENV}`);
  log(`API URL: ${baseUrl}`);

  // Build URL with query params for GET requests
  const url = baseUrl;
  log(`Requesting URL: ${url}`);

  const headers: Record<string, string> = {
    Authorization: authHeader,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
    body: JSON.stringify(params),
  };

  try {
    log(`Sending request to WordPress.com API...`);
    const response = await fetch(url, fetchOptions);
    log(`Response status: ${response.status}`);

    // Handle error responses
    if (!response.ok) {
      const errorText = await response.text();
      log(`Error response: ${errorText}`);
      throw new Error(`WordPress.com API error (${response.status}): ${errorText}`);
    }

    const responseData = await response.json();
    log(`Response received successfully`);
    return responseData as WordPressResponse;
  } catch (error) {
    log(`Error in wpRequest: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
