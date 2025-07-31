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
  const oauthEnabled = CONFIG.OAUTH_ENABLED;

  // Detailed logging for authentication configuration
  log('=== Authentication Configuration ===');
  log(`JWT_TOKEN: ${hasJWT ? 'CONFIGURED' : 'NOT SET'}`);
  log(`OAuth enabled: ${oauthEnabled ? 'YES' : 'NO (explicitly disabled)'}`);
  
  const shouldUseOAuth = oauthEnabled && !hasJWT;
  log(`OAuth will be primary method: ${shouldUseOAuth ? 'YES' : 'NO'}`);
  log('===================================');

  // Log authentication method being used
  if (hasJWT) {
    log('Authentication: Using JWT token (highest priority)');
  } else if (shouldUseOAuth) {
    log('Authentication: Using OAuth as primary method');
    log('Authentication: OAuth flow will be triggered if no valid tokens exist');
  }

  if (!hasJWT && !oauthEnabled) {
    throw new Error(
      'No authentication method configured. Please set one of:\n' +
        '- JWT_TOKEN for JWT authentication\n' +
        '- OAuth is enabled by default (set OAUTH_ENABLED=false to disable)'
    );
  }

  // Return authentication method priority
  return {
    hasJWT,
    oauthEnabled,
    shouldUseOAuth
  };
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

    log('OAuth: No existing valid tokens found in persistent storage');
    log('OAuth: This will trigger the OAuth authentication flow');
    log('OAuth: Your browser should open automatically for authentication');
    log('OAuth: If the browser does not open, check the logs for a manual URL to open');

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
    
    // For more specific error handling, we could examine the error type
    // and decide whether to throw or return null based on the error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Don't silently ignore OAuth errors - they should be reported
    // but we still return null to allow fallback auth methods to be tried
    // unless OAuth is the primary authentication method
    log('OAuth: Authentication failed, but returning null to allow fallback authentication methods');
    return null;
  }
}

function removeTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function wpRequest(
  params: WordPressRequestParams = { method: 'init' }
): Promise<WordPressResponse> {
  // Validate environment variables first and get authentication priority
  const authConfig = validateEnvironment();

  const method = 'POST';
  const baseUrl = removeTrailingSlash(CONFIG.WP_API_URL);

  // Log the request parameters for debugging
  log(`Request method: ${params.method || 'init'}`);
  log(`Request args: ${JSON.stringify(params.args || {})}`);

  // Prepare authorization header
  let authHeader: string = '';

  // Determine authentication method based on priority
  if (authConfig.hasJWT) {
    // Use JWT token for authentication (highest priority if set)
    authHeader = `Bearer ${CONFIG.JWT_TOKEN}`;
    log(`Using JWT token authentication`);
    log(`Token length: ${CONFIG.JWT_TOKEN!.length}`);
  } else if (authConfig.shouldUseOAuth) {
    // OAuth is the primary method when no other auth is configured
    log('OAuth is the primary authentication method - attempting to get tokens...');
    const oauthTokens = await getOAuthTokens();
    if (oauthTokens) {
      authHeader = `Bearer ${oauthTokens.access_token}`;
      log(`Using OAuth token authentication for general WordPress.com API`);
      log(`Token length: ${oauthTokens.access_token.length}`);
    } else {
      // OAuth failed and it's the primary method - no alternatives
      throw new Error(
        'OAuth authentication failed and no alternative authentication method is configured. ' +
        'Please complete the OAuth flow or set up JWT token authentication.'
      );
    }
  }

  // Ensure we have an authorization header
  if (!authHeader) {
    throw new Error('No authentication method available. Please configure JWT_TOKEN or enable OAuth.');
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
