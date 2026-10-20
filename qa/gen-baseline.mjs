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

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

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
        'dist/index.js': sha(path.join(target, 'dist', 'index.js')),
        'dist/index.d.ts': sha(path.join(target, 'dist', 'index.d.ts'))
    },
    note: 'Frozen baseline of the published package. The compatibility gate compares the built package of the branch against this folder. Regenerate it only on purpose.'
};

writeFileSync(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
