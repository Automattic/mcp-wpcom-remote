/**
 * WordPress.com OAuth token storage and configuration management
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { WPComTokens, TokenValidationResult } from './oauth-types.js';
import { log } from './utils.js';

// Hardcoded version for directory naming
const VERSION = '0.2.1';

/**
 * Generate a hash for the server URL to use as filename
 */
export function generateServerUrlHash(serverUrl: string): string {
  return crypto.createHash('sha256').update(serverUrl).digest('hex').substring(0, 16);
}

/**
 * Get the auth directory path
 */
export function getAuthDirectory(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.mcp-auth', `wpcom-remote-${VERSION}`);
}

/**
 * Get the tokens file path for a server
 */
export function getTokensFilePath(serverUrlHash: string): string {
  return path.join(getAuthDirectory(), `${serverUrlHash}_tokens.json`);
}

/**
 * Ensure auth directory exists
 */
function ensureAuthDirectory(): void {
  const authDir = getAuthDirectory();
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read stored tokens for a server
 */
export function readTokens(serverUrlHash: string): WPComTokens | null {
  try {
    const tokensPath = getTokensFilePath(serverUrlHash);
    if (!fs.existsSync(tokensPath)) {
      return null;
    }

    const tokensData = fs.readFileSync(tokensPath, 'utf8');
    const tokens = JSON.parse(tokensData) as WPComTokens;

    log(`Loaded tokens for server hash: ${serverUrlHash}`);
    return tokens;
  } catch (error) {
    log(`Error reading tokens for ${serverUrlHash}:`, error);
    return null;
  }
}

/**
 * Write tokens to storage
 */
export function writeTokens(serverUrlHash: string, tokens: WPComTokens): void {
  try {
    ensureAuthDirectory();
    const tokensPath = getTokensFilePath(serverUrlHash);

    // Set secure file permissions
    const tokensData = JSON.stringify(tokens, null, 2);
    fs.writeFileSync(tokensPath, tokensData, { mode: 0o600 });

    log(`Stored tokens for server hash: ${serverUrlHash}`);
  } catch (error) {
    log(`Error writing tokens for ${serverUrlHash}:`, error);
    throw error;
  }
}

/**
 * Delete stored tokens
 */
export function deleteTokens(serverUrlHash: string): void {
  try {
    const tokensPath = getTokensFilePath(serverUrlHash);
    if (fs.existsSync(tokensPath)) {
      fs.unlinkSync(tokensPath);
      log(`Deleted tokens for server hash: ${serverUrlHash}`);
    }
  } catch (error) {
    log(`Error deleting tokens for ${serverUrlHash}:`, error);
  }
}

/**
 * Check if tokens are valid (not expired)
 */
export function isTokenValid(tokens: WPComTokens): TokenValidationResult {
  if (!tokens || !tokens.access_token) {
    return { isValid: false, error: 'No access token' };
  }

  // If no expiration info, assume valid
  if (!tokens.expires_in || !tokens.obtained_at) {
    return { isValid: true };
  }

  const now = Date.now();
  const expiresAt = tokens.obtained_at + tokens.expires_in * 1000;
  const expiresIn = Math.floor((expiresAt - now) / 1000);

  // Add 60 second buffer for token refresh
  const isValid = expiresIn > 60;

  return {
    isValid,
    expiresIn: Math.max(0, expiresIn),
    error: isValid ? undefined : 'Token expired',
  };
}

/**
 * Get valid tokens for a server, or null if not available/expired
 */
export function getValidTokens(serverUrlHash: string): WPComTokens | null {
  const tokens = readTokens(serverUrlHash);
  if (!tokens) {
    return null;
  }

  const validation = isTokenValid(tokens);
  if (!validation.isValid) {
    log(`Tokens for ${serverUrlHash} are invalid: ${validation.error}`);
    deleteTokens(serverUrlHash); // Clean up expired tokens
    return null;
  }

  return tokens;
}

/**
 * List all stored server hashes
 */
export function listStoredServers(): string[] {
  try {
    const authDir = getAuthDirectory();
    if (!fs.existsSync(authDir)) {
      return [];
    }

    const files = fs.readdirSync(authDir);
    return files
      .filter(file => file.endsWith('_tokens.json'))
      .map(file => file.replace('_tokens.json', ''));
  } catch (error) {
    log('Error listing stored servers:', error);
    return [];
  }
}

/**
 * Clean up expired tokens
 */
export function cleanupExpiredTokens(): void {
  const servers = listStoredServers();
  let cleaned = 0;

  for (const serverHash of servers) {
    const tokens = readTokens(serverHash);
    if (tokens && !isTokenValid(tokens).isValid) {
      deleteTokens(serverHash);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    log(`Cleaned up ${cleaned} expired token files`);
  }
}
