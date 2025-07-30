/**
 * OAuth callback server for WordPress.com implicit flow
 */

import express from 'express';
import { Server } from 'node:http';
import { EventEmitter } from 'node:events';
import { OAuthCallbackServerOptions, WPComTokens, OAuthError } from './oauth-types.js';
import { writeTokens } from './persistent-auth-config.js';
import { log } from './utils.js';

/**
 * HTML page for extracting tokens from URL fragment
 */
const TOKEN_EXTRACTION_HTML = `
<!DOCTYPE html>
<html>
<head>
    <title>WordPress.com OAuth Authorization</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 40px;
            text-align: center;
        }
        .success { color: green; }
        .error { color: red; }
        .loading { color: blue; }
    </style>
</head>
<body>
    <h1>WordPress.com OAuth Authorization</h1>
    <div id="status" class="loading">Processing authorization...</div>
    <div id="details"></div>

    <script>
        function displayStatus(message, type = 'loading') {
            const statusEl = document.getElementById('status');
            statusEl.textContent = message;
            statusEl.className = type;
        }

        function displayDetails(message) {
            document.getElementById('details').textContent = message;
        }

        // Extract tokens from URL fragment
        const fragment = window.location.hash.substring(1);
        const params = new URLSearchParams(fragment);

        if (params.has('access_token')) {
            const tokens = {
                access_token: params.get('access_token'),
                token_type: params.get('token_type') || 'Bearer',
                expires_in: params.get('expires_in') ? parseInt(params.get('expires_in')) : undefined,
                scope: params.get('scope'),
                obtained_at: Date.now()
            };

            // Send tokens to server
            fetch('/oauth/tokens', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(tokens)
            })
            .then(response => {
                if (response.ok) {
                    displayStatus('Authorization successful!', 'success');
                    displayDetails('You can now close this window.');
                    // Auto-close after 2 seconds
                    setTimeout(() => window.close(), 2000);
                } else {
                    throw new Error('Failed to save tokens');
                }
            })
            .catch(error => {
                displayStatus('Error saving authorization', 'error');
                displayDetails(error.message);
            });
        } else if (params.has('error')) {
            const error = params.get('error');
            const errorDescription = params.get('error_description');
            displayStatus('Authorization failed', 'error');
            displayDetails(\`Error: \${error}\${errorDescription ? ' - ' + errorDescription : ''}\`);
        } else {
            displayStatus('No authorization data received', 'error');
            displayDetails('Please try the authorization process again.');
        }
    </script>
</body>
</html>
`;

export class OAuthCallbackServer {
  private app: express.Application;
  private server: Server | null = null;
  private events: EventEmitter;
  private options: OAuthCallbackServerOptions;

  constructor(options: OAuthCallbackServerOptions, events: EventEmitter) {
    this.options = options;
    this.events = events;
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // Serve the token extraction page
    this.app.get('/oauth/callback', (req, res) => {
      log('OAuth callback page requested');
      res.send(TOKEN_EXTRACTION_HTML);
    });

    // Receive tokens from the client-side JavaScript
    this.app.post('/oauth/tokens', (req, res) => {
      try {
        const tokens = req.body as WPComTokens;

        if (!tokens.access_token) {
          throw new OAuthError('No access token received');
        }

        log('OAuth tokens received via callback');

        // Store the tokens
        writeTokens(this.options.serverUrlHash, tokens);

        // Emit success event
        this.events.emit('oauth-success', tokens);

        res.json({ success: true });
      } catch (error) {
        log('Error processing OAuth tokens:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.events.emit('oauth-error', new OAuthError(errorMessage));
        res.status(400).json({ error: errorMessage });
      }
    });

    // Health check endpoint
    this.app.get('/oauth/health', (req, res) => {
      res.json({ status: 'ok', serverHash: this.options.serverUrlHash });
    });

    // Error handling
    this.app.use(
      (error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
        log('Express error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    );
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.options.port, this.options.host, () => {
          log(
            `OAuth callback server listening on http://${this.options.host}:${this.options.port}`
          );
          resolve();
        });

        this.server.on('error', (error: Error) => {
          log('OAuth callback server error:', error);
          reject(error);
        });

        // Set timeout for server startup
        if (this.options.timeout) {
          setTimeout(() => {
            if (!this.server?.listening) {
              reject(new OAuthError('OAuth callback server startup timeout'));
            }
          }, this.options.timeout);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          log('OAuth callback server stopped');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getCallbackUrl(): string {
    return `http://${this.options.host}:${this.options.port}/oauth/callback`;
  }

  isRunning(): boolean {
    return this.server?.listening ?? false;
  }
}

/**
 * Setup WordPress.com OAuth callback server
 */
export function setupWPComOAuthCallbackServer(
  options: OAuthCallbackServerOptions,
  events: EventEmitter
): OAuthCallbackServer {
  return new OAuthCallbackServer(options, events);
}
