// Optional install-time speed-up: replace the JS launcher with a hard link to
// this platform's binary, so `square` starts without Node. Any failure leaves
// the launcher in place, which still works, so this never fails the install.
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PLATFORM_PACKAGES = {
  'darwin-arm64': '@square/cli-darwin-arm64',
  'darwin-x64': '@square/cli-darwin-x64',
  'linux-arm64': '@square/cli-linux-arm64',
  'linux-x64': '@square/cli-linux-x64',
};

function optimize() {
  // Only npm links bins as symlinks to the file itself. pnpm, Yarn, and Bun
  // may write shims that run `node <file>`, which a binary would break.
  // Windows always goes through a wrapper, so there is nothing to gain there.
  if (!(process.env.npm_config_user_agent || '').startsWith('npm/')) return;
  const pkg = PLATFORM_PACKAGES[`${process.platform}-${process.arch}`];
  if (!pkg) return;

  let binary;
  try {
    binary = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'bin', 'square');
  } catch {
    return;
  }

  // Only swap in a binary that runs and reports the version we expect.
  const { version } = require('./package.json');
  const check = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (check.status !== 0 || check.stdout.trim() !== version) return;

  const launcher = path.join(__dirname, 'bin', 'square.js');
  // Already swapped (e.g. npm rebuild). Renaming a hard link onto another link
  // to the same file is a no-op in POSIX, which would leave the temp file behind.
  const [a, b] = [fs.statSync(launcher), fs.statSync(binary)];
  if (a.ino === b.ino && a.dev === b.dev) return;

  const temp = `${launcher}.tmp-${process.pid}`;
  try {
    fs.linkSync(binary, temp);
    fs.renameSync(temp, launcher); // atomic: never leaves a half-written bin
  } catch {
    fs.rmSync(temp, { force: true });
  }
}

try {
  optimize();
} catch {
  // Keep the launcher.
}
