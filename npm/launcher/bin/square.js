#!/usr/bin/env node
// Runs the Square CLI binary that npm installed for this platform.
'use strict';

const { spawn } = require('node:child_process');
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

// Linux builds are glibc-only. On other C libraries (e.g. musl on Alpine), npm
// skips the platform package, and an older npm that installs it anyway can't
// run it. Node reports glibcVersionRuntime only when it runs on glibc.
function failIfNotGlibc() {
  if (process.platform === 'linux' && !process.report?.getReport().header.glibcVersionRuntime) {
    fail(
      "the Square CLI publishes Linux builds for glibc only, and this system doesn't use glibc (Alpine, for example, uses musl). " +
        'Use a glibc-based distribution or image, such as Debian or Ubuntu.',
    );
  }
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
  failIfNotGlibc();
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
      // Leave it to spawn to report the permission error.
    }
  }
}

const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit' });

// Pass termination signals on, so stopping this process (an agent's timeout,
// a process manager, `kill <pid>`) also stops the binary instead of orphaning it.
const FORWARDED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
for (const signal of FORWARDED_SIGNALS) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  failIfNotGlibc();
  fail(`couldn't run ${binary}: ${error.message}`);
});
child.on('exit', (code, signal) => {
  if (signal) {
    // Die from the same signal, so callers see how the binary ended.
    for (const s of FORWARDED_SIGNALS) process.removeAllListeners(s);
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
