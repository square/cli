#!/usr/bin/env node
// Turns the assets of one square/cli GitHub release into npm package
// directories: one package per platform binary, plus @square/cli, which
// depends on all of them optionally and ships the launcher.
//
// Usage: node npm/build-packages.mjs <version> <assets-dir> <out-dir>
// Prints the package directories in publish order (platform packages first).

import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PLATFORMS = [
  { asset: 'square-darwin-arm64', os: 'darwin', cpu: 'arm64' },
  { asset: 'square-darwin-x64', os: 'darwin', cpu: 'x64' },
  { asset: 'square-linux-arm64', os: 'linux', cpu: 'arm64', libc: 'glibc' },
  { asset: 'square-linux-x64', os: 'linux', cpu: 'x64', libc: 'glibc' },
  { asset: 'square-windows-x64.exe', os: 'win32', cpu: 'x64' },
];

const SHARED_FIELDS = {
  license: 'SEE LICENSE IN LICENSE',
  homepage: 'https://developer.squareup.com/docs/cli',
  repository: { type: 'git', url: 'git+https://github.com/square/cli.git' },
  bugs: { url: 'https://github.com/square/cli/issues' },
};

const platformPackageName = ({ os, cpu }) => `@square/cli-${os}-${cpu}`;

function readChecksums(assetsDir) {
  const sums = new Map();
  for (const line of readFileSync(path.join(assetsDir, 'checksums.txt'), 'utf8').split('\n')) {
    const match = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/);
    if (match) sums.set(path.basename(match[2]), match[1]);
  }
  return sums;
}

function verifiedCopy(assetsDir, asset, checksums, dest) {
  const src = path.join(assetsDir, asset);
  const expected = checksums.get(asset);
  if (!expected) throw new Error(`checksums.txt has no entry for ${asset}`);
  const actual = createHash('sha256').update(readFileSync(src)).digest('hex');
  if (actual !== expected) throw new Error(`checksum mismatch for ${asset}`);
  copyFileSync(src, dest);
}

function writePackage(dir, manifest, legalFiles) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const [name, src] of Object.entries(legalFiles)) copyFileSync(src, path.join(dir, name));
}

export function buildPackages(version, assetsDir, outDir) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`not a release version: ${version}`);
  }
  const checksums = readChecksums(assetsDir);
  const legalFiles = {
    LICENSE: path.join(repoRoot, 'LICENSE'),
    'THIRD-PARTY-NOTICES.md': path.join(assetsDir, 'THIRD-PARTY-NOTICES.md'),
  };
  const dirs = [];

  for (const platform of PLATFORMS) {
    const name = platformPackageName(platform);
    const dir = path.join(outDir, name.replace('@square/', ''));
    const binName = platform.os === 'win32' ? 'square.exe' : 'square';
    writePackage(
      dir,
      {
        name,
        version,
        description: `The Square CLI binary for ${platform.os}-${platform.cpu}. Install @square/cli instead.`,
        ...SHARED_FIELDS,
        os: [platform.os],
        cpu: [platform.cpu],
        ...(platform.libc && { libc: [platform.libc] }),
        files: ['bin', 'LICENSE', 'THIRD-PARTY-NOTICES.md'],
        preferUnplugged: true,
      },
      legalFiles,
    );
    mkdirSync(path.join(dir, 'bin'));
    verifiedCopy(assetsDir, platform.asset, checksums, path.join(dir, 'bin', binName));
    chmodSync(path.join(dir, 'bin', binName), 0o755);
    dirs.push(dir);
  }

  const mainDir = path.join(outDir, 'cli');
  writePackage(
    mainDir,
    {
      name: '@square/cli',
      version,
      description: 'The Square CLI: command-line access to Square APIs for developers and AI agents.',
      ...SHARED_FIELDS,
      bin: { square: 'bin/square.js' },
      scripts: { postinstall: 'node install.js' },
      files: ['bin', 'install.js', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'README.md'],
      engines: { node: '>=18' },
      optionalDependencies: Object.fromEntries(PLATFORMS.map((p) => [platformPackageName(p), version])),
    },
    { ...legalFiles, 'README.md': path.join(repoRoot, 'README.md') },
  );
  mkdirSync(path.join(mainDir, 'bin'));
  copyFileSync(path.join(repoRoot, 'npm', 'launcher', 'bin', 'square.js'), path.join(mainDir, 'bin', 'square.js'));
  chmodSync(path.join(mainDir, 'bin', 'square.js'), 0o755);
  copyFileSync(path.join(repoRoot, 'npm', 'launcher', 'install.js'), path.join(mainDir, 'install.js'));
  dirs.push(mainDir);

  return dirs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, assetsDir, outDir] = process.argv.slice(2);
  if (!outDir) {
    console.error('usage: node npm/build-packages.mjs <version> <assets-dir> <out-dir>');
    process.exit(2);
  }
  for (const dir of buildPackages(version, assetsDir, outDir)) console.log(dir);
}
