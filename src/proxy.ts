#!/usr/bin/env node
/**
 * MCP WordPress.com Remote Proxy
 *
 * This wraps @automattic/mcp-wordpress-remote with WordPress.com specific
 * default configurations for seamless WordPress.com integration.
 */

import { logger } from '@automattic/mcp-wordpress-remote/lib';
import { join } from 'node:path';

// WordPress.com specific default configuration
const WPCOM_DEFAULTS = {
  // WordPress.com public API endpoint
  WP_API_URL: 'https://public-api.wordpress.com/wpcom/v2/mcp/v1',

  // OAuth configuration optimized for WordPress.com
  WP_OAUTH_CLIENT_ID: '121755', // Default WordPress.com MCP client ID
  OAUTH_ENABLED: 'true',
  OAUTH_FLOW_TYPE: 'implicit',
  OAUTH_SCOPES: 'global',
  OAUTH_USE_PKCE: 'false',
  OAUTH_RESOURCE_INDICATOR: 'false',
  OAUTH_CALLBACK_PORT: '3000',
  OAUTH_HOST: '127.0.0.1',
  OAUTH_AUTHORIZE_ENDPOINT: 'https://public-api.wordpress.com/oauth2/authorize',
  OAUTH_TOKEN_ENDPOINT: 'https://public-api.wordpress.com/oauth2/token',

  // WordPress.com specific config directory
  WPCOM_MCP_CONFIG_DIR:
    process.env.WPCOM_MCP_CONFIG_DIR ||
    join(process.env.HOME || process.env.USERPROFILE || '.', '.mcp-auth'),
};

/**
 * Set up environment with WordPress.com defaults while preserving user overrides
 */
function setupWordPressComEnvironment(): void {
  // Apply WordPress.com defaults only if not already set by user
  Object.entries(WPCOM_DEFAULTS).forEach(([key, defaultValue]) => {
    if (!process.env[key]) {
      process.env[key] = defaultValue;
    }
  });

  // Log the configuration being used
  logger.info(`Using WordPress.com API: ${process.env.WP_API_URL}`, 'WPCOM-PROXY');
  logger.info(`OAuth enabled: ${process.env.OAUTH_ENABLED}`, 'WPCOM-PROXY');
  logger.info(`Callback port: ${process.env.OAUTH_CALLBACK_PORT}`, 'WPCOM-PROXY');

  if (process.env.JWT_TOKEN) {
    logger.info('Using JWT token authentication', 'WPCOM-PROXY');
  } else if (process.env.OAUTH_ENABLED === 'true') {
    logger.info(
      `Using OAuth authentication (client ID: ${process.env.WP_OAUTH_CLIENT_ID})`,
      'WPCOM-PROXY'
    );
    logger.info(`OAuth flow type: ${process.env.OAUTH_FLOW_TYPE}`, 'WPCOM-PROXY');
    logger.info(`OAuth scopes: ${process.env.OAUTH_SCOPES}`, 'WPCOM-PROXY');
  }
}



/**
 * Main execution function
 */
async function main(): Promise<void> {
  logger.info('Starting WordPress.com MCP Remote Proxy', 'WPCOM-PROXY');

  // Set up WordPress.com specific environment
  setupWordPressComEnvironment();

  // Import and run the WordPress proxy directly (bundled)
  logger.info('Launching WordPress Remote proxy...', 'WPCOM-PROXY');

  try {
    // Import the entire WordPress proxy module (bundled)
    // The module will execute its main function automatically
    // @ts-ignore - Bundled module doesn't have type definitions
    await import('@automattic/mcp-wordpress-remote');
  } catch (error) {
    logger.error(`Error launching WordPress proxy: ${error}`, 'WPCOM-PROXY');
    process.exit(1);
  }
}

// Run the proxy
main().catch(error => {
  logger.error(`Fatal error: ${error.message}`, 'WPCOM-PROXY');
  process.exit(1);
});
