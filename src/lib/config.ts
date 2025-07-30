import * as os from 'os';
import * as path from 'path';

/**
 * Centralized configuration for MCP WordPress.com Remote
 * All default values are defined here and can be overridden via environment variables
 */
export const CONFIG = {
  // API Configuration
  WP_API_URL: process.env.WP_API_URL || 'https://public-api.wordpress.com/wpcom/v2/mcp/v1',
  
  // OAuth Configuration
  OAUTH_ENABLED: process.env.OAUTH_ENABLED !== 'false', // Enabled by default, disable with 'false'
  OAUTH_CALLBACK_PORT: parseInt(process.env.OAUTH_CALLBACK_PORT || '3000'),
  OAUTH_HOST: process.env.OAUTH_HOST || '127.0.0.1',
  WPCOM_CLIENT_ID: process.env.WPCOM_CLIENT_ID || '121755', // Default WordPress.com MCP client ID
  
  // Timeout Configuration (in milliseconds)
  OAUTH_TIMEOUT: 30000, // 30 seconds
  LOCK_TIMEOUT: 300000, // 5 minutes
  
  // Directory Configuration
  WPCOM_MCP_CONFIG_DIR: process.env.WPCOM_MCP_CONFIG_DIR || path.join(os.homedir(), '.mcp-auth'),
  
  // Logging Configuration
  LOG_FILE: process.env.LOG_FILE || null,
  
  // Authentication Configuration
  JWT_TOKEN: process.env.JWT_TOKEN,
  WP_API_USERNAME: process.env.WP_API_USERNAME,
  WP_API_PASSWORD: process.env.WP_API_PASSWORD,
  WOO_CUSTOMER_KEY: process.env.WOO_CUSTOMER_KEY,
  WOO_CUSTOMER_SECRET: process.env.WOO_CUSTOMER_SECRET,
  
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const;

/**
 * Type-safe configuration access with JSDoc descriptions
 */
export const getConfig = () => ({
  /** WordPress.com public API endpoint */
  wpApiUrl: CONFIG.WP_API_URL,
  
  /** Whether OAuth authentication is enabled */
  oauthEnabled: CONFIG.OAUTH_ENABLED,
  
  /** Port for OAuth callback server */
  oauthCallbackPort: CONFIG.OAUTH_CALLBACK_PORT,
  
  /** Hostname for OAuth callback */
  oauthHost: CONFIG.OAUTH_HOST,
  
  /** WordPress.com OAuth client ID */
  wpcomClientId: CONFIG.WPCOM_CLIENT_ID,
  
  /** OAuth operation timeout in milliseconds */
  oauthTimeout: CONFIG.OAUTH_TIMEOUT,
  
  /** Lock operation timeout in milliseconds */
  lockTimeout: CONFIG.LOCK_TIMEOUT,
  
  /** Configuration directory path */
  configDir: CONFIG.WPCOM_MCP_CONFIG_DIR,
  
  /** Log file path (null if not set) */
  logFile: CONFIG.LOG_FILE,
  
  /** JWT token for authentication */
  jwtToken: CONFIG.JWT_TOKEN,
  
  /** WordPress API username for basic auth */
  wpApiUsername: CONFIG.WP_API_USERNAME,
  
  /** WordPress API password for basic auth */
  wpApiPassword: CONFIG.WP_API_PASSWORD,
  
  /** WooCommerce customer key */
  wooCustomerKey: CONFIG.WOO_CUSTOMER_KEY,
  
  /** WooCommerce customer secret */
  wooCustomerSecret: CONFIG.WOO_CUSTOMER_SECRET,
  
  /** Current environment */
  nodeEnv: CONFIG.NODE_ENV,
});
