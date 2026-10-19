import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Run the real entrypoint with an isolated environment and inert upstream
// module, so configuration is tested without starting OAuth or opening tabs.
const source = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});

async function launch(env = {}) {
  let upstreamEnvironment;
  const logs = [];
  const process = {
    env: { HOME: '/isolated-test', ...env },
    exit(code) {
      throw new Error(`Unexpected proxy exit: ${code}`);
    },
  };
  await vm.runInNewContext(outputText, {
    exports: {},
    process,
    require(name) {
      if (name === 'node:path') return { join };
      if (name === '@automattic/mcp-wordpress-remote/lib') {
        return {
          logger: { info: message => logs.push(message), error: message => logs.push(message) },
        };
      }
      if (name === '@automattic/mcp-wordpress-remote') {
        upstreamEnvironment = { ...process.env };
        return {};
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  assert.ok(upstreamEnvironment, 'the wrapper must launch the upstream proxy');
  return { env: upstreamEnvironment, logs };
}

test('leaves the callback port unset for upstream automatic selection', async () => {
  const { env, logs } = await launch();
  assert.equal(env.OAUTH_CALLBACK_PORT, undefined);
  assert.equal(env.OAUTH_HOST, '127.0.0.1');
  assert.equal(env.OAUTH_ENABLED, 'true');
  assert.ok(logs.includes('Callback port: automatic'));
});

test('preserves an explicitly configured callback port', async () => {
  const { env, logs } = await launch({ OAUTH_CALLBACK_PORT: '8080' });
  assert.equal(env.OAUTH_CALLBACK_PORT, '8080');
  assert.ok(logs.includes('Callback port: 8080'));
});
