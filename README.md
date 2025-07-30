# MCP WordPress Remote

A Model Context Protocol (MCP) server that provides secure access to WordPress.com via remote API connections. This server uses persistent OAuth token storage for maximum convenience and seamless long-term usage.

## Features

- **Persistent OAuth Authentication**: Secure OAuth 2.0 authentication with permanent token storage
- **Secure Token Storage**: OAuth tokens stored in `~/.mcp-auth/` with proper file permissions
- **Version Isolation**: Each version gets its own storage directory for compatibility
- **Multi-instance Coordination**: Lockfiles prevent conflicts between multiple instances
- **Automatic Token Management**: Handles token validation and cleanup automatically
- **WordPress.com Integration**: Optimized for WordPress.com public API access

## Authentication

### Persistent OAuth 2.0

OAuth provides secure authentication for WordPress.com public API access with **permanent token storage**.

#### Configuration

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "npx",
      "args": ["@automattic/mcp-wpcom-remote"]
    }
  }
}
```

To override the default API URL, you can optionally set the `WP_API_URL` environment variable:

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "npx",
      "args": ["@automattic/mcp-wpcom-remote"],
      "env": {
        "WP_API_URL": "https://your-custom-api-endpoint.com/wpcom/v2/mcp/v1"
      }
    }
  }
}
```

#### Environment Variables

- `WP_API_URL`: WordPress.com public API endpoint (optional, defaults to `https://public-api.wordpress.com/wpcom/v2/mcp/v1`)
- `OAUTH_ENABLED`: OAuth is enabled by default. Set to "false" to disable OAuth authentication
- `OAUTH_CALLBACK_PORT`: Port for OAuth callback server (default: 3000)
- `OAUTH_HOST`: Hostname for OAuth callback (default: 127.0.0.1)
- `WPCOM_CLIENT_ID`: WordPress.com OAuth client ID (optional, uses default if not set)
- `WPCOM_MCP_CONFIG_DIR`: Override default config directory `~/.mcp-auth`

#### First-time Setup

1. When you first start the server, it will automatically open your browser
2. Authorize the application on WordPress.com
3. The tokens will be stored permanently in `~/.mcp-auth/wpcom-remote-{version}/`
4. All subsequent starts will use the stored tokens automatically
5. **No re-authentication needed** until tokens expire or are manually cleared

## Installation

```bash
npm install @automattic/mcp-wpcom-remote
```

## Usage

1. Configure your MCP client with one of the authentication methods above
2. Start your MCP client (Claude Desktop, etc.)
3. The server will automatically handle authentication based on your configuration
4. For OAuth: Follow the browser prompt for first-time authorization

## Token Management

### Persistent Token Storage

OAuth tokens are stored permanently in `~/.mcp-auth/wpcom-remote-{version}/` with:

- **Secure file permissions** (600)
- **Version isolation** (each version gets its own directory)
- **Server-specific files** (hashed by server URL)
- **Process coordination** (lockfiles prevent conflicts)

### Storage Structure

```
~/.mcp-auth/wpcom-remote-{version}/
├── {server_hash}_tokens.json         # OAuth access tokens
├── {server_hash}_client_info.json    # OAuth client registration
├── {server_hash}_code_verifier.txt   # PKCE verification codes
└── {server_hash}_lock.json           # Process coordination
```

### Automatic Management

The server automatically:

- Validates tokens before use
- Loads tokens from persistent storage on startup
- Cleans up expired tokens periodically
- Coordinates between multiple instances using lockfiles

### Manual Token Management

```bash
# Check stored tokens
ls -la ~/.mcp-auth/wpcom-remote-*/

# Clear all tokens (forces re-authentication)
rm -rf ~/.mcp-auth/wpcom-remote-*/

# Clear tokens for specific version only
rm -rf ~/.mcp-auth/wpcom-remote-0.2.1/

# Clear tokens for specific server
rm ~/.mcp-auth/wpcom-remote-*/[hash]_*
```

## Troubleshooting

### OAuth Issues

1. **Browser doesn't open**: Check if the callback port is available
2. **Authorization fails**: Verify your WordPress.com permissions
3. **Tokens expire quickly**: This is normal for security; re-authentication is automatic

### Port Conflicts

If the default OAuth callback port (3000) is in use:

```json
"OAUTH_CALLBACK_PORT": "3001"
```

### Multi-instance Coordination

The server uses lockfiles to coordinate OAuth authentication between multiple instances. If you see "waiting for other instance" messages, this is normal behavior.

## Security

- OAuth tokens are stored with secure file permissions (600)
- State parameters are used to prevent CSRF attacks
- Tokens are validated before each use
- Expired tokens are automatically cleaned up

## Requirements

- Node.js 22+
- WordPress.com site (for OAuth) or WordPress site with appropriate authentication plugins

## License

GPL v2 or later
