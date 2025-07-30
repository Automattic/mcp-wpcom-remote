1) Clone this repository
2) Run `npm i && npm run build`
3) configure Claude Desktop

{
  "mcpServers": {
    "wordpress.com": {
      "command": "node", // Or full path to node. (`which node`)
      "args": [
        "/full-path-to/mcp-wpcom-remote/dist/proxy.js"
      ]
      // Optional: override the default API URL
      // "env": {
      //   "WP_API_URL": "https://your-custom-api-endpoint.com/wpcom/v2/mcp/v1"
      // }
    }
  }
}