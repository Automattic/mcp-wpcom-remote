# MCP WordPress.com Remote

🔌 **A Model Context Protocol (MCP) server for seamless WordPress.com integration**

Connect AI assistants like Claude Desktop to your WordPress.com sites with secure OAuth authentication and persistent token storage.

## ✨ Features

- **Secure OAuth 2.0 Authentication** - One-click setup with persistent token storage
- **Version Isolation** - Each version stores tokens separately for compatibility
- **Multi-instance Coordination** - Lockfiles prevent authentication conflicts
- **Automatic Token Management** - Handles validation, refresh, and cleanup
- **Complete MCP Support** - Tools, resources, prompts, and more

## 🚀 Quick Start

### Installation

```bash
npm install @automattic/mcp-wpcom-remote
```

### Configuration

Add to your MCP client configuration (e.g., Claude Desktop's `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "npx",
      "args": [
        "-y",
        "@automattic/mcp-wpcom-remote"
      ]
    }
  }
}
```

### First Run

1. **Start your MCP client** (Claude Desktop, etc.)
2. **Browser opens automatically** for WordPress.com authorization
3. **Authorize the application** - tokens are stored permanently
4. **Start using WordPress.com features** in your AI assistant

That's it! No re-authentication needed until tokens expire.

## ⚙️ Advanced Configuration

### Custom API Endpoint

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "npx",
      "args": [
        "-y",
        "@automattic/mcp-wpcom-remote"
      ],
      "env": {
        "WP_API_URL": "https://your-custom-endpoint.com/wpcom/v2/mcp/v1"
      }
    }
  }
}
```

### Custom OAuth Application

**⚠️ Required when changing `OAUTH_CALLBACK_PORT`**

If you need to use a different OAuth callback port (other than the default 3000), you must create your own OAuth application:

1. **Create an OAuth App** at the [WordPress.com Application Manager](https://developer.wordpress.com/apps/)
2. **Set the Redirect URL** to: `http://127.0.0.1:YOUR_PORT/oauth/callback`
   - Replace `YOUR_PORT` with your desired port number
   - Example: `http://127.0.0.1:8080/oauth/callback`
3. **Note your Client ID** from the application details
4. **Configure the MCP server**:

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "npx",
      "args": ["@automattic/mcp-wpcom-remote"],
      "env": {
        "OAUTH_CALLBACK_PORT": "8080",
        "WPCOM_CLIENT_ID": "your_client_id_here"
      }
    }
  }
}
```

For more details on OAuth configuration, see the [WordPress.com OAuth2 documentation](https://developer.wordpress.com/docs/oauth2/).

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WP_API_URL` | WordPress.com API endpoint | `https://public-api.wordpress.com/wpcom/v2/mcp/v1` |
| `OAUTH_ENABLED` | Enable OAuth authentication | `true` |
| `OAUTH_CALLBACK_PORT` | OAuth callback port | `3000` |
| `OAUTH_HOST` | OAuth callback hostname | `127.0.0.1` |
| `WPCOM_CLIENT_ID` | Custom OAuth client ID | _(uses default)_ |
| `WPCOM_MCP_CONFIG_DIR` | Config directory override | `~/.mcp-auth` |

### Disable OAuth

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "npx",
      "args": ["@automattic/mcp-wpcom-remote"],
      "env": {
        "OAUTH_ENABLED": "false"
      }
    }
  }
}
```

## 🛠️ Development Mode

For development and testing, you can use the local repository instead of the published npm package:

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Automattic/mcp-wpcom-remote.git
   cd mcp-wpcom-remote
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

### Configuration

Configure your MCP client to use the local version:

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "node",
      "args": [
        "/path/to/your/mcp-wpcom-remote/dist/proxy.js"
      ]
    }
  }
}
```

**Example with full paths:**

**💡 Tip:** If you use nvm, nodenv, or other Node.js version managers, your MCP client might not find the correct Node.js binary. In this case, use the full path to your Node.js installation:

```bash
# Find your Node.js path
which node
# Example output: /Users/yourname/.nvm/versions/node/v22.14.0/bin/node
```
```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "/usr/local/bin/node",
      "args": [
        "/Users/yourname/projects/mcp-wpcom-remote/dist/proxy.js"
      ]
    }
  }
}
```

### Development Workflow

- **Watch mode:** `npm run build:watch` - Automatically rebuilds on file changes
- **Testing:** `npm test` - Run the test suite

**Note:** Make sure to rebuild (`npm run build`) after making changes to see them reflected in your MCP client.

## 🔧 Token Management

### Storage Location

Tokens are automatically stored in:
```
~/.mcp-auth/wpcom-remote-{version}/
```

### Manual Management

```bash
# View stored tokens
ls -la ~/.mcp-auth/wpcom-remote-*/

# Clear all tokens (forces re-authentication)
rm -rf ~/.mcp-auth/wpcom-remote-*/

# Clear tokens for specific version
rm -rf ~/.mcp-auth/wpcom-remote-0.2.1/
```

## 🛡️ Security Features

- **Secure file permissions** (600) on all token files
- **PKCE verification** for OAuth flows
- **State parameters** to prevent CSRF attacks
- **Automatic token validation** before each request
- **Expired token cleanup** during startup

## 🐛 Troubleshooting

### OAuth Issues

**Browser doesn't open:**
- Check if port 3000 is available
- If you need a different port, see [Custom OAuth Application](#custom-oauth-application) section

**Authorization fails:**
- Verify WordPress.com account permissions
- Check if port 3000 is available
- Try clearing tokens and re-authenticating

### Multi-instance Messages

If you see "waiting for other instance" messages, this is normal - the server coordinates OAuth between multiple instances using lockfiles.

### Port Conflicts

If port 3000 is already in use, you'll need to:

1. **Create a custom OAuth application** (see [Custom OAuth Application](#custom-oauth-application) section above)
2. **Configure both the port and client ID**:

```json
{
  "env": {
    "OAUTH_CALLBACK_PORT": "8080",
    "WPCOM_CLIENT_ID": "your_client_id_here"
  }
}
```

**Note:** Simply changing the port without creating a custom OAuth app will cause authentication failures.

## 📋 Requirements

- **Node.js 22+** (required for fetch API support)
- **WordPress.com account** (for OAuth authentication)

## 📝 License

GPL v2 or later

## 🤝 Contributing

Contributions welcome! This project is maintained by Automattic Inc.

---

**Need help?** Check the [troubleshooting section](#-troubleshooting) or open an issue.
