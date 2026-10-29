// Run with: node --test npm/build-packages.test.mjs
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { PLATFORMS, buildPackages } from './build-packages.mjs';

// Fake release assets: each "binary" is a shell script that prints a version
// for --version, prints its PID and sleeps for `wait`, and otherwise echoes its
// args and exits 3, so the launcher and install script can run it on any Unix host.
function fakeRelease({ corrupt, reportedVersion = '0.3.0' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'square-cli-assets-'));
  const lines = [];
  for (const { asset } of PLATFORMS) {
    const body =
      `#!/bin/sh\n[ "$1" = --version ] && { echo ${reportedVersion}; exit 0; }\n` +
      `[ "$1" = wait ] && { echo $$; exec sleep 30; }\necho "${asset} $*"\nexit 3\n`;
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

test('each package packs only its own files, and each platform package holds its own binary', () => {
  // Written out by hand so a mix-up in PLATFORMS can't also hide here.
  const expected = {
    '@square/cli-darwin-arm64': ['square-darwin-arm64', 'bin/square'],
    '@square/cli-darwin-x64': ['square-darwin-x64', 'bin/square'],
    '@square/cli-linux-arm64': ['square-linux-arm64', 'bin/square'],
    '@square/cli-linux-x64': ['square-linux-x64', 'bin/square'],
    '@square/cli-win32-x64': ['square-windows-x64.exe', 'bin/square.exe'],
  };
  const legal = ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'package.json'];
  const release = fakeRelease();
  const dirs = buildPackages('0.3.0', release, mkdtempSync(path.join(tmpdir(), 'square-cli-npm-')));
  assert.equal(dirs.length, Object.keys(expected).length + 1);

  for (const dir of dirs) {
    const pack = spawnSync('npm', ['pack', '--dry-run', '--json', dir], { encoding: 'utf8', shell: process.platform === 'win32' });
    assert.equal(pack.status, 0, pack.stderr);
    const { name, files } = JSON.parse(pack.stdout)[0];
    const paths = files.map((f) => f.path).sort();
    if (name === '@square/cli') {
      assert.deepEqual(paths, ['README.md', 'bin/square.js', 'install.js', ...legal].sort());
      continue;
    }
    const [asset, binPath] = expected[name];
    assert.deepEqual(paths, [binPath, ...legal].sort(), name);
    assert.ok(files.find((f) => f.path === binPath).mode & 0o111, `${name}: ${binPath} must stay executable`);
    assert.deepEqual(readFileSync(path.join(dir, binPath)), readFileSync(path.join(release, asset)), `${name} must ship ${asset}`);
  }
});

test('refuses a binary that does not match checksums.txt', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'square-cli-npm-'));
  assert.throws(
    () => buildPackages('0.3.0', fakeRelease({ corrupt: 'square-linux-x64' }), out),
    /checksum mismatch for square-linux-x64/,
  );
});

test('rebuilding into the same output directory works', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'square-cli-npm-'));
  const release = fakeRelease();
  buildPackages('0.3.0', release, out);
  assert.equal(buildPackages('0.3.0', release, out).length, PLATFORMS.length + 1);
});

test('refuses a tag instead of a version', () => {
  assert.throws(() => buildPackages('v0.3.0', fakeRelease(), mkdtempSync(path.join(tmpdir(), 'x-'))), /not a release version/);
});

// Lays the packages out the way npm installs them on this machine and returns
// the installed @square/cli directory.
function install(release, { withPlatformPackage = true } = {}) {
  const dirs = buildPackages('0.3.0', release, mkdtempSync(path.join(tmpdir(), 'square-cli-npm-')));
  const nodeModules = path.join(mkdtempSync(path.join(tmpdir(), 'square-cli-install-')), 'node_modules');
  const host = `@square/cli-${process.platform}-${process.arch}`;
  for (const d of dirs) {
    const { name } = JSON.parse(readFileSync(path.join(d, 'package.json'), 'utf8'));
    if (name === '@square/cli' || (withPlatformPackage && name === host)) {
      cpSync(d, path.join(nodeModules, name), { recursive: true });
    }
  }
  return path.join(nodeModules, '@square/cli');
}

const unix = { skip: process.platform === 'win32' };

test('launcher runs the installed platform binary and passes through args and exit code', unix, () => {
  const cli = install(fakeRelease());
  const run = spawnSync(process.execPath, [path.join(cli, 'bin/square.js'), 'catalog', 'item list'], { encoding: 'utf8' });
  assert.equal(run.status, 3);
  assert.match(run.stdout, / catalog item list\n$/);
});

test('stopping the launcher stops the binary instead of orphaning it', unix, async () => {
  const cli = install(fakeRelease());
  const launcher = spawn(process.execPath, [path.join(cli, 'bin/square.js'), 'wait'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const [line] = await once(launcher.stdout, 'data');
  const binaryPid = Number(String(line).trim());
  try {
    launcher.kill('SIGTERM');
    const [code, signal] = await once(launcher, 'exit');
    assert.deepEqual({ code, signal }, { code: null, signal: 'SIGTERM' });
    assert.throws(() => process.kill(binaryPid, 0), { code: 'ESRCH' }, 'the binary must not outlive the launcher');
  } finally {
    try {
      process.kill(binaryPid, 'SIGKILL');
    } catch {}
  }
});

test('launcher explains how to fix a missing platform package', unix, () => {
  const cli = install(fakeRelease(), { withPlatformPackage: false });
  const run = spawnSync(process.execPath, [path.join(cli, 'bin/square.js')], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /isn't installed.*npm install -g @square\/cli/s);
});

test('launcher explains that non-glibc Linux is unsupported instead of suggesting a reinstall', unix, () => {
  const cli = install(fakeRelease(), { withPlatformPackage: false });
  // Pretend to be x64 Linux without glibc (e.g. Alpine): Node reports no glibc version.
  const stub = path.join(mkdtempSync(path.join(tmpdir(), 'square-cli-no-glibc-')), 'no-glibc.cjs');
  writeFileSync(
    stub,
    `Object.defineProperty(process, 'platform', { value: 'linux' });
Object.defineProperty(process, 'arch', { value: 'x64' });
process.report.getReport = () => ({ header: {} });
`,
  );
  const run = spawnSync(process.execPath, ['--require', stub, path.join(cli, 'bin/square.js')], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /glibc only.*doesn't use glibc/s);
  assert.doesNotMatch(run.stderr, /Reinstall/);
});

function postinstall(cli, userAgent) {
  const run = spawnSync(process.execPath, ['install.js'], {
    cwd: cli,
    env: { ...process.env, npm_config_user_agent: userAgent },
  });
  assert.equal(run.status, 0, 'postinstall must never fail the install');
  return readFileSync(path.join(cli, 'bin/square.js'), 'utf8');
}

test('postinstall under npm swaps the launcher for the binary, which then runs directly', unix, () => {
  const cli = install(fakeRelease());
  const bin = postinstall(cli, 'npm/11.6.0 node/v24.10.0 darwin arm64');
  assert.match(bin, /^#!\/bin\/sh/);
  // Running it again (e.g. npm rebuild) leaves nothing behind.
  postinstall(cli, 'npm/11.6.0 node/v24.10.0 darwin arm64');
  assert.deepEqual(readdirSync(path.join(cli, 'bin')), ['square.js']);
  const run = spawnSync(path.join(cli, 'bin/square.js'), ['catalog', 'item list'], { encoding: 'utf8' });
  assert.equal(run.status, 3);
  assert.match(run.stdout, / catalog item list\n$/);
});

test('postinstall keeps the launcher for other package managers, wrong versions, and missing binaries', unix, () => {
  const launcher = /^#!\/usr\/bin\/env node/;
  assert.match(postinstall(install(fakeRelease()), 'pnpm/10.32.1 npm/? node/v24.10.0'), launcher);
  assert.match(postinstall(install(fakeRelease({ reportedVersion: '9.9.9' })), 'npm/11.6.0'), launcher);
  assert.match(postinstall(install(fakeRelease(), { withPlatformPackage: false }), 'npm/11.6.0'), launcher);
});
