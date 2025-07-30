import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import fsSync from 'fs';
import crypto from 'crypto';
import { log } from './utils.js';
import { CONFIG } from './config.js';

// Hardcoded version for directory naming
const VERSION = '0.2.1';

/**
 * WordPress.com MCP Remote Authentication Configuration
 *
 * This module handles the storage and retrieval of authentication-related data for WordPress.com MCP Remote.
 *
 * Configuration directory structure:
 * - The config directory is determined by WPCOM_MCP_CONFIG_DIR env var or defaults to ~/.mcp-auth
 * - Each file is prefixed with a hash of the server URL to separate configurations for different servers
 *
 * Files stored in the config directory:
 * - {server_hash}_client_info.json: Contains OAuth client registration information
 * - {server_hash}_tokens.json: Contains OAuth access and refresh tokens
 * - {server_hash}_code_verifier.txt: Contains the PKCE code verifier for the current OAuth flow
 * - {server_hash}_lock.json: Contains process coordination lockfile
 *
 * All JSON files are stored with 2-space indentation for readability.
 */

/**
 * WordPress.com OAuth tokens structure
 */
export interface WPComTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  obtained_at: number;
  refresh_token?: string;
}

/**
 * WordPress.com OAuth client information
 */
export interface WPComClientInfo {
  client_id: string;
  client_secret?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  scope?: string;
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
 * Lockfile data structure
 */
export interface LockfileData {
  pid: number;
  port: number;
  timestamp: number;
}

/**
 * Creates a lockfile for the given server
 */
export async function createLockfile(
  serverUrlHash: string,
  pid: number,
  port: number
): Promise<void> {
  const lockData: LockfileData = {
    pid,
    port,
    timestamp: Date.now(),
  };
  await writeJsonFile(serverUrlHash, 'lock.json', lockData);
}

/**
 * Checks if a lockfile exists for the given server
 */
export async function checkLockfile(serverUrlHash: string): Promise<LockfileData | null> {
  try {
    const lockfile = await readJsonFile<LockfileData>(serverUrlHash, 'lock.json');
    return lockfile || null;
  } catch {
    return null;
  }
}

/**
 * Deletes the lockfile for the given server
 */
export async function deleteLockfile(serverUrlHash: string): Promise<void> {
  await deleteConfigFile(serverUrlHash, 'lock.json');
}

/**
 * Gets the configuration directory path
 */
export function getConfigDir(): string {
  const baseConfigDir = CONFIG.WPCOM_MCP_CONFIG_DIR;
  // Add a version subdirectory so we don't need to worry about backwards/forwards compatibility
  return path.join(baseConfigDir, `wpcom-remote-${VERSION}`);
}

/**
 * Ensures the configuration directory exists
 */
export async function ensureConfigDir(): Promise<void> {
  try {
    const configDir = getConfigDir();
    await fs.mkdir(configDir, { recursive: true });
  } catch (error) {
    log('Error creating config directory:', error);
    throw error;
  }
}

/**
 * Gets the file path for a config file
 */
export function getConfigFilePath(serverUrlHash: string, filename: string): string {
  const configDir = getConfigDir();
  return path.join(configDir, `${serverUrlHash}_${filename}`);
}

/**
 * Deletes a config file if it exists
 */
export async function deleteConfigFile(serverUrlHash: string, filename: string): Promise<void> {
  try {
    const filePath = getConfigFilePath(serverUrlHash, filename);
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log(`Error deleting ${filename}:`, error);
    }
  }
}

/**
 * Reads a JSON file and parses it
 */
export async function readJsonFile<T>(
  serverUrlHash: string,
  filename: string
): Promise<T | undefined> {
  try {
    await ensureConfigDir();

    const filePath = getConfigFilePath(serverUrlHash, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    log(`Error reading ${filename}:`, error);
    return undefined;
  }
}

/**
 * Writes a JSON object to a file
 */
export async function writeJsonFile(
  serverUrlHash: string,
  filename: string,
  data: any
): Promise<void> {
  try {
    await ensureConfigDir();
    const filePath = getConfigFilePath(serverUrlHash, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    log(`Error writing ${filename}:`, error);
    throw error;
  }
}

/**
 * Reads a text file
 */
export async function readTextFile(
  serverUrlHash: string,
  filename: string,
  errorMessage?: string
): Promise<string> {
  try {
    await ensureConfigDir();
    const filePath = getConfigFilePath(serverUrlHash, filename);
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new Error(errorMessage || `Error reading ${filename}`);
  }
}

/**
 * Writes a text string to a file
 */
export async function writeTextFile(
  serverUrlHash: string,
  filename: string,
  text: string
): Promise<void> {
  try {
    await ensureConfigDir();
    const filePath = getConfigFilePath(serverUrlHash, filename);
    await fs.writeFile(filePath, text, 'utf-8');
  } catch (error) {
    log(`Error writing ${filename}:`, error);
    throw error;
  }
}

/**
 * Generate a hash for the server URL to use as filename
 */
export function generateServerUrlHash(serverUrl: string): string {
  return crypto.createHash('md5').update(serverUrl).digest('hex');
}

/**
 * Read stored tokens for a server
 */
export async function readTokens(serverUrlHash: string): Promise<WPComTokens | null> {
  try {
    const tokens = await readJsonFile<WPComTokens>(serverUrlHash, 'tokens.json');
    if (tokens) {
      log(`Loaded tokens for server hash: ${serverUrlHash}`);
      return tokens;
    }
    return null;
  } catch (error) {
    log(`Error reading tokens for ${serverUrlHash}:`, error);
    return null;
  }
}

/**
 * Write tokens to storage
 */
export async function writeTokens(serverUrlHash: string, tokens: WPComTokens): Promise<void> {
  try {
    const tokensWithTimestamp = {
      ...tokens,
      obtained_at: Date.now(),
    };
    await writeJsonFile(serverUrlHash, 'tokens.json', tokensWithTimestamp);
    log(`Stored tokens for server hash: ${serverUrlHash}`);
  } catch (error) {
    log(`Error writing tokens for ${serverUrlHash}:`, error);
    throw error;
  }
}

/**
 * Delete stored tokens
 */
export async function deleteTokens(serverUrlHash: string): Promise<void> {
  try {
    await deleteConfigFile(serverUrlHash, 'tokens.json');
    log(`Deleted tokens for server hash: ${serverUrlHash}`);
  } catch (error) {
    log(`Error deleting tokens for ${serverUrlHash}:`, error);
  }
}

/**
 * Read stored client info for a server
 */
export async function readClientInfo(serverUrlHash: string): Promise<WPComClientInfo | null> {
  try {
    const clientInfo = await readJsonFile<WPComClientInfo>(serverUrlHash, 'client_info.json');
    if (clientInfo) {
      log(`Loaded client info for server hash: ${serverUrlHash}`);
      return clientInfo;
    }
    return null;
  } catch (error) {
    log(`Error reading client info for ${serverUrlHash}:`, error);
    return null;
  }
}

/**
 * Write client info to storage
 */
export async function writeClientInfo(
  serverUrlHash: string,
  clientInfo: WPComClientInfo
): Promise<void> {
  try {
    await writeJsonFile(serverUrlHash, 'client_info.json', clientInfo);
    log(`Stored client info for server hash: ${serverUrlHash}`);
  } catch (error) {
    log(`Error writing client info for ${serverUrlHash}:`, error);
    throw error;
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
export async function getValidTokens(serverUrlHash: string): Promise<WPComTokens | null> {
  const tokens = await readTokens(serverUrlHash);
  if (!tokens) {
    return null;
  }

  const validation = isTokenValid(tokens);
  if (!validation.isValid) {
    log(`Tokens for ${serverUrlHash} are invalid: ${validation.error}`);
    // Don't auto-delete expired tokens - let OAuth flow handle refresh
    return null;
  }

  return tokens;
}

/**
 * Clean up expired tokens (optional - mainly for maintenance)
 */
export async function cleanupExpiredTokens(): Promise<void> {
  try {
    const configDir = getConfigDir();
    if (!fsSync.existsSync(configDir)) {
      return;
    }

    const files = await fs.readdir(configDir);
    const tokenFiles = files.filter(file => file.endsWith('_tokens.json'));

    let cleaned = 0;
    for (const file of tokenFiles) {
      const serverHash = file.replace('_tokens.json', '');
      const tokens = await readTokens(serverHash);
      if (tokens && !isTokenValid(tokens).isValid) {
        await deleteTokens(serverHash);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log(`Cleaned up ${cleaned} expired token files`);
    }
  } catch (error) {
    log('Error during token cleanup:', error);
  }
}
