#!/usr/bin/env node
// Runs the Square CLI binary that npm installed for this platform.
'use strict';

const { spawnSync } = require('node:child_process');
const { accessSync, chmodSync, constants } = require('node:fs');
const path = require('node:path');

const PLATFORM_PACKAGES = {
  'darwin-arm64': '@square/cli-darwin-arm64',
  'darwin-x64': '@square/cli-darwin-x64',
  'linux-arm64': '@square/cli-linux-arm64',
  'linux-x64': '@square/cli-linux-x64',
  'win32-x64': '@square/cli-win32-x64',
};

function fail(message) {
  process.stderr.write(`square: ${message}\n`);
  process.exit(1);
}

const platform = `${process.platform}-${process.arch}`;
const pkg = PLATFORM_PACKAGES[platform];
if (!pkg) {
  fail(
    `no Square CLI build for ${platform}. Supported platforms: ${Object.keys(PLATFORM_PACKAGES).join(', ')}.`,
  );
}

let binary;
try {
  const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
  binary = path.join(pkgDir, 'bin', process.platform === 'win32' ? 'square.exe' : 'square');
} catch {
  fail(
    `${pkg} isn't installed. npm skips it when optional dependencies are disabled ` +
      '(--omit=optional, --no-optional). Reinstall with: npm install -g @square/cli',
  );
}

if (process.platform !== 'win32') {
  try {
    accessSync(binary, constants.X_OK);
  } catch {
    try {
      chmodSync(binary, 0o755);
    } catch {
      // Leave it to spawnSync to report the permission error.
    }
  }
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) {
  fail(`couldn't run ${binary}: ${result.error.message}`);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
