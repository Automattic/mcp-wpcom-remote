/**
 * WordPress.com OAuth configuration and token types
 */

export interface WPComOAuthOptions {
  clientId: string; // Hardcoded WordPress.com client ID
  serverUrl: string;
  callbackPort: number;
  host: string;
  scopes?: string[];
  authorizeEndpoint?: string;
}

export interface WPComTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  obtained_at: number;
}

export interface OAuthCallbackServerOptions {
  port: number;
  host: string;
  serverUrlHash: string;
  timeout?: number;
}

export interface AuthCoordinator {
  start(): Promise<void>;
  stop(): void;
  waitForAuth(): Promise<WPComTokens>;
}

/**
 * OAuth state management
 */
export interface OAuthState {
  state: string;
  serverUrlHash: string;
  timestamp: number;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  isValid: boolean;
  expiresIn?: number;
  error?: string;
}

/**
 * OAuth error types
 */
export class OAuthError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}

/**
 * OAuth client provider interface (compatible with MCP SDK)
 */
export interface OAuthClientProvider {
  tokens(): Promise<WPComTokens | null>;
  authorize(): Promise<void>;
}
