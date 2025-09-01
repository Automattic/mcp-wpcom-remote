# MCP WordPress.com Remote

**A Model Context Protocol (MCP) server for seamless WordPress.com integration**

This package wraps [@automattic/mcp-wordpress-remote](https://www.npmjs.com/package/@automattic/mcp-wordpress-remote) with WordPress.com-optimized defaults, making it easy to connect AI assistants like Claude Desktop to WordPress.com sites.

## Features

- **WordPress.com Optimized** - Pre-configured for WordPress.com public API
- **Secure OAuth 2.0 Authentication** - One-click setup with persistent token storage
- **Zero Configuration** - Works out of the box for WordPress.com sites
- **Complete MCP Support** - Tools, resources, prompts, and more

## Quick Start

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
      "args": ["-y", "@automattic/mcp-wpcom-remote"]
    }
  }
}
```

### First Run

1. **Start your MCP client** (Claude Desktop, etc.)
2. **Browser opens automatically** for WordPress.com authorization
3. **Authorize the application** - tokens are stored permanently
4. **Start using WordPress.com features** in your AI assistant

That's it! No additional configuration needed for WordPress.com.

## WordPress.com Defaults

This package automatically configures:

- **API Endpoint**: `https://public-api.wordpress.com/wpcom/v2/mcp/v1`
- **OAuth Client ID**: `121755` (WordPress.com MCP client)
- **OAuth Enabled**: `true` by default
- **Callback Port**: `3000`
- **Config Directory**: `~/.mcp-auth/wpcom-remote-{version}/`

## Advanced Configuration

### Custom Configuration

You can override any default settings using environment variables:

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "npx",
      "args": ["-y", "@automattic/mcp-wpcom-remote"],
      "env": {
        "OAUTH_CALLBACK_PORT": "8080",
        "LOG_FILE": "/path/to/logfile.log"
      }
    }
  }
}
```

### JWT Token Authentication

For server-to-server authentication:

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "npx",
      "args": ["-y", "@automattic/mcp-wpcom-remote"],
      "env": {
        "JWT_TOKEN": "your-jwt-token-here"
      }
    }
  }
}
```

### Custom WordPress.com Endpoint

If you need to use a different WordPress.com endpoint:

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "npx",
      "args": ["-y", "@automattic/mcp-wpcom-remote"],
      "env": {
        "WP_API_URL": "https://your-custom-endpoint.com/wpcom/v2/mcp/v1"
      }
    }
  }
}
```

## Environment Variables

| Variable               | Default                                            | Description                   |
| ---------------------- | -------------------------------------------------- | ----------------------------- |
| `WP_API_URL`           | `https://public-api.wordpress.com/wpcom/v2/mcp/v1` | WordPress.com API endpoint    |
| `OAUTH_ENABLED`        | `true`                                             | Enable OAuth authentication   |
| `OAUTH_CALLBACK_PORT`  | `3000`                                             | OAuth callback port           |
| `OAUTH_HOST`           | `127.0.0.1`                                        | OAuth callback hostname       |
| `WPCOM_CLIENT_ID`      | `121755`                                           | WordPress.com OAuth client ID |
| `WPCOM_MCP_CONFIG_DIR` | `~/.mcp-auth`                                      | Config directory override     |
| `JWT_TOKEN`            | _(none)_                                           | JWT token for authentication  |
| `LOG_FILE`             | _(none)_                                           | Log file path                 |

## Development Mode

For development and testing, you can use the local repository:

### Setup

1. **Clone the repository:**

   ```bash
   git clone https://github.a8c.com/Automattic/mcp-wpcom-remote.git
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
      "args": ["/path/to/your/mcp-wpcom-remote/dist/proxy.js"]
    }
  }
}
```

## Troubleshooting

### OAuth Issues

**Browser doesn't open:**

- Check if port 3000 is available
- Try a different port with `OAUTH_CALLBACK_PORT`

**Authorization fails:**

- Verify WordPress.com account permissions
- Try clearing tokens: `rm -rf ~/.mcp-auth/wpcom-remote-*/`

### Port Conflicts

If port 3000 is already in use:

```json
{
  "env": {
    "OAUTH_CALLBACK_PORT": "8080"
  }
}
```

## What's Different from mcp-wordpress-remote

This package (`mcp-wpcom-remote`) is a WordPress.com-optimized wrapper that:

- **Pre-configures WordPress.com API endpoint**
- **Uses WordPress.com OAuth client ID by default**
- **Enables OAuth by default** (vs disabled in the generic package)
- **Uses wpcom-specific config directory** for token isolation
- **Integrates logging** from the underlying package for consistent log formatting

For self-hosted WordPress sites, use [@automattic/mcp-wordpress-remote](https://www.npmjs.com/package/@automattic/mcp-wordpress-remote) directly.

## Requirements

- **Node.js 22+** (inherited from underlying package)
- **WordPress.com account** (for OAuth authentication)

## License

GPL v2 or later

## Contributing

Contributions welcome! This project is maintained by Automattic Inc.

---

**Need help?** Check the [troubleshooting section](#troubleshooting) or open an issue.
