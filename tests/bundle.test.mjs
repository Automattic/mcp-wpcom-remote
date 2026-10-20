import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('the built proxy starts and exits cleanly on stdin EOF', () => {
  const cache = mkdtempSync(join(tmpdir(), 'wpcom-bundle-'));
  try {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../dist/proxy.js', import.meta.url))],
      {
        input: '',
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          WP_API_URL: 'http://127.0.0.1:1/mcp',
          WP_MCP_CONFIG_DIR: cache,
          OAUTH_ENABLED: 'false',
          JWT_TOKEN: 'fixture-token',
          LOG_FILE: '',
          LOG_LEVEL: '0',
        },
      }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
});
