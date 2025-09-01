# Testing MCP WordPress.com Remote

This document provides testing instructions for the MCP WordPress.com Remote package.

## Overview

This package wraps [@automattic/mcp-wordpress-remote](https://www.npmjs.com/package/@automattic/mcp-wordpress-remote) with WordPress.com-specific defaults.

## Testing Setup

### Prerequisites

1. **WordPress.com account** for OAuth testing
2. **Node.js 22+** installed
3. **Claude Desktop** or another MCP client for testing

### Local Development Setup

```bash
# Clone and setup
git clone https://github.a8c.com/Automattic/mcp-wpcom-remote
cd mcp-wpcom-remote
npm install
npm run build
```

## Configuration Testing

### Basic WordPress.com Configuration

1. **Configure Claude Desktop:**

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "node",
      "args": ["/path/to/mcp-wpcom-remote/dist/proxy.js"]
    }
  }
}
```

2. **Start Claude Desktop** and verify:
   - Browser opens automatically to WordPress.com
   - OAuth authorization completes successfully
   - MCP client connects without errors

### Custom Configuration Testing

Test with custom settings:

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "node",
      "args": ["/path/to/mcp-wpcom-remote/dist/proxy.js"],
      "env": {
        "OAUTH_CALLBACK_PORT": "8080",
        "LOG_FILE": "/tmp/wpcom-mcp.log"
      }
    }
  }
}
```

Verify:

- Callback server starts on port 8080
- Logs are written to specified file
- OAuth flow works with custom port

### JWT Token Testing

Test JWT authentication:

```json
{
  "mcpServers": {
    "wordpress.com": {
      "command": "node",
      "args": ["/path/to/mcp-wpcom-remote/dist/proxy.js"],
      "env": {
        "JWT_TOKEN": "your-jwt-token-here"
      }
    }
  }
}
```

Verify:

- No OAuth flow is triggered
- JWT token is used for authentication
- API requests work correctly

## Functional Testing

### WordPress.com API Access

Test basic WordPress.com functionality:

1. **List available tools:**

   - Ask Claude: "What WordPress.com tools are available?"

2. **Test site information:**

   - Ask Claude: "What WordPress.com sites do I have access to?"

3. **Test content access:**
   - Ask Claude: "Show me my recent WordPress.com posts"

### Error Handling

Test error scenarios:

1. **Invalid JWT token:**

   ```json
   {
     "env": {
       "JWT_TOKEN": "invalid-token"
     }
   }
   ```

   - Should show clear authentication error

2. **Port conflict:**

   ```json
   {
     "env": {
       "OAUTH_CALLBACK_PORT": "80"
     }
   }
   ```

   - Should show port binding error

3. **Network issues:**
   - Disconnect internet during OAuth flow
   - Should show appropriate network error

## Token Management Testing

### Token Persistence

1. **First run:**

   - Complete OAuth flow
   - Verify tokens stored in `~/.mcp-auth/wpcom-remote-*/`

2. **Second run:**
   - Restart MCP client
   - Should connect without OAuth flow
   - Verify existing tokens are used

### Token Cleanup

```bash
# Clear all tokens
rm -rf ~/.mcp-auth/wpcom-remote-*/

# Test fresh authentication
# Restart MCP client and verify OAuth flow triggers
```

## Comparison Testing

### vs mcp-wordpress-remote

Test both packages to verify WordPress.com optimization:

1. **Generic package** (should require manual configuration):

   ```json
   {
     "command": "npx",
     "args": ["-y", "@automattic/mcp-wordpress-remote"],
     "env": {
       "WP_API_URL": "https://public-api.wordpress.com/wpcom/v2/mcp/v1",
       "OAUTH_ENABLED": "true",
       "WPCOM_CLIENT_ID": "121755"
     }
   }
   ```

2. **WordPress.com package** (should work with zero config):
   ```json
   {
     "command": "npx",
     "args": ["-y", "@automattic/mcp-wpcom-remote"]
   }
   ```

Both should work identically, but the WordPress.com package requires no environment configuration.

## Performance Testing

### Startup Time

Measure startup time for both approaches:

```bash
# Time the startup
time npx -y @automattic/mcp-wpcom-remote <<< '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0"}}}'
```

Should be similar to the underlying package since it's just a wrapper.

### Memory Usage

Monitor memory usage:

```bash
# Monitor memory during operation
ps aux | grep proxy
```

Should have minimal overhead compared to the underlying package.

## Troubleshooting

### Package Not Found

```bash
# Install the underlying package
npm install -g @automattic/mcp-wordpress-remote

# Or install locally
npm install @automattic/mcp-wordpress-remote
```

### Build Issues

```bash
# Clean and rebuild
rm -rf dist node_modules
npm install
npm run build
```

### Proxy Resolution Issues

```bash
# Check if the underlying package is properly installed
node -e "console.log(require.resolve('@automattic/mcp-wordpress-remote/package.json'))"
```

## Manual Testing Checklist

- [ ] Package installs without errors
- [ ] Proxy starts successfully
- [ ] WordPress.com OAuth flow works
- [ ] Default configuration is applied
- [ ] Custom environment variables override defaults
- [ ] JWT authentication works when configured
- [ ] Error messages are clear and helpful
- [ ] Token persistence works correctly
- [ ] Multiple MCP clients can run simultaneously
- [ ] Cleanup and shutdown work properly

## Automated Testing

This package relies on the testing of the underlying `@automattic/mcp-wordpress-remote` package. The wrapper functionality primarily involves:

- Environment variable setup
- Process spawning
- Signal handling

For comprehensive testing of MCP functionality, refer to the [mcp-wordpress-remote testing documentation](https://github.com/Automattic/mcp-wordpress-remote/blob/main/TESTING.md).

## Support

- **Issues**: Report issues specific to WordPress.com integration
- **General MCP Issues**: Use [@automattic/mcp-wordpress-remote](https://github.com/Automattic/mcp-wordpress-remote) for general WordPress MCP issues
- **WordPress.com API**: Check [WordPress.com developer documentation](https://developer.wordpress.com/docs/api/)
