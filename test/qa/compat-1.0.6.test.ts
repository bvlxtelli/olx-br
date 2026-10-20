import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'fs';
import * as path from 'path';
import OlxSource from '../../src/index';

/**
 * Retro compatibility gate against the published package `olx-br@1.0.6`.
 *
 * The fork has no release history, so the contract of the public API is the package
 * published on npm. The baseline is frozen in `qa/baseline` and the comparison is done
 * against the **built** package of the branch (`dist/`), not against the source.
 *
 * The gate fails when the branch removes a public method, changes the signature of one,
 * changes the arity of one, removes an instance property or breaks the `export =`
 * contract of the package. Adding methods is allowed (it is additive).
 */

const here = __dirname;
const repoRoot = path.resolve(here, '..', '..');

const builtEntry = path.join(repoRoot, 'dist', 'index.js');
const builtDeclaration = path.join(repoRoot, 'dist', 'index.d.ts');
const baselineEntry = path.join(repoRoot, 'qa', 'baseline', 'dist', 'index.js');
const baselineDeclaration = path.join(repoRoot, 'qa', 'baseline', 'dist', 'index.d.ts');

const requireFromHere = createRequire(path.join(repoRoot, 'package.json'));

/** Throws a readable error when the package was not built yet. */
function requireBuilt(): typeof import('../../src/index') {
    if (!fs.existsSync(builtEntry) || !fs.existsSync(builtDeclaration)) {
        throw new Error(
            'the package is not built. Run "npm run build" before the tests: the compatibility ' +
                'gate compares the built package, not the source.'
        );
    }
    return requireFromHere(builtEntry);
}

/**
 * The newest modification time of the sources.
 *
 * The gate compares the **built** package. A build that is older than the source would
 * compare a package that nobody is going to publish, and a defect in the source would
 * slip through the gate. The build is therefore required to be up to date.
 */
function newestSourceTime(): number {
    let newest = 0;

    const walk = (folder: string) => {
        for (const entry of fs.readdirSync(folder)) {
            const full = path.join(folder, entry);
            if (fs.statSync(full).isDirectory()) {
                walk(full);
                continue;
            }
            if (!full.endsWith('.ts')) continue;
            newest = Math.max(newest, fs.statSync(full).mtimeMs);
        }
    };

    walk(path.join(repoRoot, 'src'));

    return newest;
}

type Surface = {
    statics: Record<string, number>;
    prototype: Record<string, number>;
    instanceProperties: string[];
    constructorArity: number;
};

function surfaceOf(OlxClass: any): Surface {
    const statics: Record<string, number> = {};
    for (const name of Object.getOwnPropertyNames(OlxClass)) {
        if (['length', 'name', 'prototype'].includes(name)) continue;
        if (typeof OlxClass[name] !== 'function') continue;
        statics[name] = OlxClass[name].length;
    }

    const prototype: Record<string, number> = {};
    for (const name of Object.getOwnPropertyNames(OlxClass.prototype)) {
        if (name === 'constructor') continue;
        if (typeof OlxClass.prototype[name] !== 'function') continue;
        prototype[name] = OlxClass.prototype[name].length;
    }

    const instance = new OlxClass('client-id', 'client-secret', 'https://example.com/callback');
    const instanceProperties = Object.keys(instance).sort();

    return {
        statics,
        prototype,
        instanceProperties,
        constructorArity: OlxClass.length
    };
}

/** Reads the public signatures of a declaration file. */
function signaturesOf(content: string): Record<string, string> {
    const signatures: Record<string, string> = {};
    const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    const statics = /static\s+(\w+)\s*\(([^)]*)\)\s*:\s*([^;]+);/g;
    let match = statics.exec(withoutComments);
    while (match !== null) {
        signatures[`static ${match[1]}`] = `${match[1]}(${match[2].replace(/\s+/g, ' ')}): ${match[3].trim()}`;
        match = statics.exec(withoutComments);
    }

    const instance = /^\s{4}(\w+)\s*\(([^)]*)\)\s*:\s*([^;]+);/gm;
    match = instance.exec(withoutComments);
    while (match !== null) {
        if (match[1] !== 'constructor' && !signatures[`static ${match[1]}`]) {
            signatures[match[1]] = `${match[1]}(${match[2].replace(/\s+/g, ' ')}): ${match[3].trim()}`;
        }
        match = instance.exec(withoutComments);
    }

    return signatures;
}

/** The parameter names of a signature, used to detect a renamed parameter. */
function parameterNames(signature: string): string[] {
    const inside = signature.slice(signature.indexOf('(') + 1, signature.indexOf(')'));
    return inside
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => part.split(/[\s?:=]/)[0].trim());
}

describe('retro compatibility with olx-br@1.0.6', () => {
    it('has the frozen baseline of the published package', () => {
        expect(fs.existsSync(baselineEntry)).toBe(true);
        expect(fs.existsSync(baselineDeclaration)).toBe(true);

        const manifest = JSON.parse(
            fs.readFileSync(path.join(repoRoot, 'qa', 'baseline', 'manifest.json'), 'utf8')
        );

        expect(manifest.package).toBe('olx-br@1.0.6');
    });

    it('compares a build that is up to date with the source', () => {
        if (!fs.existsSync(builtEntry)) {
            throw new Error('the package is not built. Run "npm run build" before the tests.');
        }

        const built = fs.statSync(builtEntry).mtimeMs;
        const source = newestSourceTime();

        expect(
            built,
            'the built package is older than the source. Run "npm run build" before the tests, ' +
                'otherwise the gate compares a package that nobody is going to publish.'
        ).toBeGreaterThanOrEqual(source);
    });

    it('keeps every static method of the published package', () => {
        const baseline = surfaceOf(requireFromHere(baselineEntry));
        const built = surfaceOf(requireBuilt());

        for (const [name, arity] of Object.entries(baseline.statics)) {
            expect(built.statics[name], `the static method ${name} was removed`).toBeDefined();
            expect(built.statics[name], `the arity of ${name} changed`).toBe(arity);
        }
    });

    it('keeps every static method of the published package in the source', () => {
        const baseline = surfaceOf(requireFromHere(baselineEntry));
        const source = surfaceOf(OlxSource);

        for (const [name, arity] of Object.entries(baseline.statics)) {
            expect(source.statics[name], `the static method ${name} was removed`).toBeDefined();
            expect(source.statics[name], `the arity of ${name} changed`).toBe(arity);
        }
    });

    it('keeps every instance method of the published package', () => {
        const baseline = surfaceOf(requireFromHere(baselineEntry));
        const built = surfaceOf(requireBuilt());

        for (const [name, arity] of Object.entries(baseline.prototype)) {
            expect(built.prototype[name], `the method ${name} was removed`).toBeDefined();
            expect(built.prototype[name], `the arity of ${name} changed`).toBe(arity);
        }
    });

    it('keeps every instance method of the published package in the source', () => {
        const baseline = surfaceOf(requireFromHere(baselineEntry));
        const source = surfaceOf(OlxSource);

        for (const [name, arity] of Object.entries(baseline.prototype)) {
            expect(source.prototype[name], `the method ${name} was removed`).toBeDefined();
            expect(source.prototype[name], `the arity of ${name} changed`).toBe(arity);
        }
    });

    it('keeps the properties of the instance', () => {
        const baseline = surfaceOf(requireFromHere(baselineEntry));
        const built = surfaceOf(requireBuilt());

        for (const property of baseline.instanceProperties) {
            expect(built.instanceProperties).toContain(property);
        }
    });

    it('keeps the signature of the constructor', () => {
        const baseline = surfaceOf(requireFromHere(baselineEntry));
        const built = surfaceOf(requireBuilt());

        expect(built.constructorArity).toBe(baseline.constructorArity);
    });

    it('removes no declaration of the published package', () => {
        const baseline = signaturesOf(fs.readFileSync(baselineDeclaration, 'utf8'));
        const built = signaturesOf(fs.readFileSync(builtDeclaration, 'utf8'));

        for (const [name, signature] of Object.entries(baseline)) {
            expect(built[name], `the declaration of ${name} was removed`).toBeDefined();

            // The number of the parameters is the contract: the parameter is positional,
            // so a renamed parameter does not break a consumer. The rename of the first
            // parameter of getAuthUrl is sanctioned by the contract of the fork.
            const baselineParameters = parameterNames(signature);
            const builtParameters = parameterNames(built[name]);

            expect(
                builtParameters.length,
                `the number of the parameters of ${name} changed`
            ).toBe(baselineParameters.length);

            if (baselineParameters.join(',') !== builtParameters.join(',')) {
                console.warn(
                    `[compat] the parameters of ${name} were renamed: ` +
                        `${baselineParameters.join(', ')} -> ${builtParameters.join(', ')}`
                );
            }

            const baselineReturn = signature.slice(signature.lastIndexOf(':') + 1).trim();
            const builtReturn = built[name].slice(built[name].lastIndexOf(':') + 1).trim();
            expect(builtReturn, `the return type of ${name} changed`).toBe(baselineReturn);
        }
    });

    it('keeps the export = contract of the package', () => {
        const built = requireBuilt();
        const builtModule = requireFromHere(builtEntry);

        expect(typeof builtModule).toBe('function');
        expect(builtModule.default).toBeUndefined();
        expect(builtModule.OlxApiError).toBeDefined();
        expect(fs.readFileSync(builtDeclaration, 'utf8')).toMatch(/export = Olx;/);
    });

    it('keeps the export = contract of the package in the source', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'src', 'index.ts'), 'utf8');

        expect(source).toMatch(/export = Olx;/);
        expect(source).not.toMatch(/export default Olx;/);
    });

    it('compiles a consumer written for the published package', () => {
        const tsc = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
        const project = path.join(repoRoot, 'qa', 'consumer', 'tsconfig.json');

        expect(fs.existsSync(tsc)).toBe(true);

        try {
            execFileSync(process.execPath, [tsc, '--noEmit', '-p', project], {
                cwd: repoRoot,
                stdio: 'pipe',
                encoding: 'utf8'
            });
        } catch (error) {
            const output = `${(error as { stdout?: string }).stdout || ''}${
                (error as { stderr?: string }).stderr || ''
            }`;
            throw new Error(`the consumer of olx-br@1.0.6 does not compile any more:\n${output}`);
        }
    });
});
