import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const source = path.resolve(process.argv[2]);
const target = path.resolve(process.argv[3]);

mkdirSync(target, { recursive: true });

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const js = readFileSync(path.join(source, 'dist', 'index.js'), 'utf8');
const dts = readFileSync(path.join(source, 'dist', 'index.d.ts'), 'utf8');

writeFileSync(path.join(target, 'olx-br-1.0.6.index.js'), js);
writeFileSync(path.join(target, 'olx-br-1.0.6.index.d.ts'), dts);

const manifest = {
    package: 'olx-br@1.0.6',
    generatedFrom: 'https://registry.npmjs.org/olx-br/-/olx-br-1.0.6.tgz',
    generatedAt: '2026-10-20',
    dtsFile: 'olx-br-1.0.6.index.d.ts',
    jsFile: 'olx-br-1.0.6.index.js',
    jsSha256: sha(path.join(target, 'olx-br-1.0.6.index.js')),
    dtsSha256: sha(path.join(target, 'olx-br-1.0.6.index.d.ts')),
    note: 'Frozen baseline of the published package. The compatibility gate compares the built package of the branch against this file. Regenerate it only on purpose, with qa/gen-baseline.mjs.'
};

writeFileSync(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
