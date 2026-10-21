import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Freezes the published package `olx-br@1.0.6` as the baseline of the compatibility gate.
 *
 * Usage: node qa/gen-baseline.mjs <folder with the extracted tarball> <target folder>
 *
 * The whole `dist` folder of the published package is copied, because the entry point
 * requires the files of the folder next to it.
 */
const source = path.resolve(process.argv[2]);
const target = path.resolve(process.argv[3]);

mkdirSync(target, { recursive: true });

const dist = path.join(source, 'dist');
cpSync(dist, path.join(target, 'dist'), { recursive: true });

/**
 * The hash of a file with the line endings normalized to CRLF.
 *
 * The published package stores its files with CRLF and git stores them with LF. The
 * hash of the raw bytes would depend on the platform that generated the manifest, and
 * the check that reads the manifest would fail on the other one. The CRLF is the
 * canonical form of the published tarball, so the hash of the normalized content is
 * the same on every machine.
 *
 * @param {string} file Path of the file.
 * @returns {string} The hash of the content with CRLF line endings.
 */
const shaNormalized = (file) =>
    createHash('sha256')
        .update(
            readFileSync(file)
                .toString('binary')
                .replace(/\r\n/g, '\n')
                .replace(/\n/g, '\r\n'),
            'binary'
        )
        .digest('hex');

const files = [];
const walk = (folder) => {
    for (const entry of readdirSync(folder)) {
        const full = path.join(folder, entry);
        if (statSync(full).isDirectory()) {
            walk(full);
        } else {
            files.push(path.relative(target, full).replace(/\\/g, '/'));
        }
    }
};
walk(path.join(target, 'dist'));
files.sort();

const manifest = {
    package: 'olx-br@1.0.6',
    generatedFrom: 'https://registry.npmjs.org/olx-br/-/olx-br-1.0.6.tgz',
    generatedAt: '2026-10-20',
    entry: 'dist/index.js',
    declaration: 'dist/index.d.ts',
    files,
    sha256: {
        'dist/index.js': shaNormalized(path.join(target, 'dist', 'index.js')),
        'dist/index.d.ts': shaNormalized(path.join(target, 'dist', 'index.d.ts'))
    },
    note: 'Frozen baseline of the published package. The compatibility gate compares the built package of the branch against this folder. Regenerate it only on purpose.'
};

writeFileSync(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
