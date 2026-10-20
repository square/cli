// Run with: node --test npm/build-packages.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { PLATFORMS, buildPackages } from './build-packages.mjs';

// Fake release assets: each "binary" is a shell script that echoes its args
// and exits 3, so the launcher can run it on any Unix host.
function fakeRelease({ corrupt } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'square-cli-assets-'));
  const lines = [];
  for (const { asset } of PLATFORMS) {
    const body = `#!/bin/sh\necho "${asset} $*"\nexit 3\n`;
    writeFileSync(path.join(dir, asset), body);
    const sum = createHash('sha256').update(corrupt === asset ? 'tampered' : body).digest('hex');
    lines.push(`${sum}  ${asset}`);
  }
  writeFileSync(path.join(dir, 'checksums.txt'), `${lines.join('\n')}\n`);
  writeFileSync(path.join(dir, 'THIRD-PARTY-NOTICES.md'), '# Third-party notices\n');
  return dir;
}

test('builds platform packages first, then @square/cli pinned to the same version', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'square-cli-npm-'));
  const dirs = buildPackages('0.3.0', fakeRelease(), out);
  const manifests = dirs.map((d) => JSON.parse(readFileSync(path.join(d, 'package.json'), 'utf8')));

  assert.equal(manifests.at(-1).name, '@square/cli');
  assert.deepEqual(manifests.at(-1).optionalDependencies, {
    '@square/cli-darwin-arm64': '0.3.0',
    '@square/cli-darwin-x64': '0.3.0',
    '@square/cli-linux-arm64': '0.3.0',
    '@square/cli-linux-x64': '0.3.0',
    '@square/cli-win32-x64': '0.3.0',
  });
  for (const m of manifests.slice(0, -1)) {
    assert.equal(m.version, '0.3.0');
    assert.equal(m.bin, undefined, `${m.name} must not claim the square bin`);
    assert.equal(m.os.length, 1);
  }
  for (const d of dirs) {
    assert.match(readFileSync(path.join(d, 'LICENSE'), 'utf8'), /proprietary software/);
    statSync(path.join(d, 'THIRD-PARTY-NOTICES.md'));
  }
});

test('refuses a binary that does not match checksums.txt', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'square-cli-npm-'));
  assert.throws(
    () => buildPackages('0.3.0', fakeRelease({ corrupt: 'square-linux-x64' }), out),
    /checksum mismatch for square-linux-x64/,
  );
});

test('refuses a tag instead of a version', () => {
  assert.throws(() => buildPackages('v0.3.0', fakeRelease(), mkdtempSync(path.join(tmpdir(), 'x-'))), /not a release version/);
});

test('launcher runs the installed platform binary and passes through args and exit code', { skip: process.platform === 'win32' }, () => {
  const out = mkdtempSync(path.join(tmpdir(), 'square-cli-npm-'));
  const dirs = buildPackages('0.3.0', fakeRelease(), out);

  // Lay the packages out the way npm installs them on this machine.
  const nodeModules = path.join(mkdtempSync(path.join(tmpdir(), 'square-cli-install-')), 'node_modules');
  const host = `@square/cli-${process.platform}-${process.arch}`;
  for (const d of dirs) {
    const { name } = JSON.parse(readFileSync(path.join(d, 'package.json'), 'utf8'));
    if (name === '@square/cli' || name === host) cpSync(d, path.join(nodeModules, name), { recursive: true });
  }
  const launcher = path.join(nodeModules, '@square/cli/bin/square.js');

  const run = spawnSync(process.execPath, [launcher, 'catalog', 'item list'], { encoding: 'utf8' });
  assert.equal(run.status, 3);
  assert.match(run.stdout, / catalog item list\n$/);

  // Without the platform package (e.g. --omit=optional), fail with a fix.
  const bare = path.join(mkdtempSync(path.join(tmpdir(), 'square-cli-bare-')), 'node_modules', '@square/cli');
  cpSync(path.join(nodeModules, '@square/cli'), bare, { recursive: true });
  const missing = spawnSync(process.execPath, [path.join(bare, 'bin/square.js')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /isn't installed.*npm install -g @square\/cli/s);
});
