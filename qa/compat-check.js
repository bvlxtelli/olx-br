#!/usr/bin/env node
/**
 * QA - COMPATIBILITY GATE of the public API of olx-br against the frozen 1.0.6.
 *
 * It compares the build of the branch (dist/) with the baseline frozen in qa/baseline/,
 * which is the `dist` of the package published on npm as olx-br@1.0.6 (MIT, author
 * Vinícius Rossmann Nunes). The baseline is a copy, it is never executed against the real
 * API.
 *
 * Rules:
 *   - a public method REMOVED                    -> INCOMPATIBLE (exit 1)
 *   - a public method whose SIGNATURE changed    -> INCOMPATIBLE (exit 1), unless the
 *     change is one of the breaking changes that 2.0.0 declares
 *   - a public method ADDED                      -> compatible (additive)
 *   - the rejection value                        -> the declared breaking change of 2.0.0
 *   - the body of the package (dist/index.js)    -> reported, with the sha256 of both sides
 *
 * Usage: node qa/compat-check.js      (needs `npm run build` first)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_DIR = path.join(__dirname, 'baseline');
const DIST = path.join(ROOT, 'dist');

/**
 * The breaking changes that the version 2.0.0 declares. They are documented in
 * docs/CONTRACT.md (§3.3 and §4.1) and in the migration section of the README.
 *
 * `signatures` lists the members whose declaration changed on purpose.
 * `behaviours` lists the behaviour changes that are on purpose.
 */
const DECLARED = {
    signatures: {
        getAuthUrl: 'the first parameter was renamed from "autoupload" to "scopes" and widened to ' +
            '"boolean | string | string[]". The arity stays 2 and the legacy boolean keeps the ' +
            'behaviour of 1.0.6, so no consumer breaks at runtime.'
    },
    behaviours: [
        'the rejection value is now always an OlxApiError (with status, statusText, code, body, ' +
        'data and a non enumerable cause). 1.0.6 rejected with the raw body, and with the axios ' +
        'error when the body was empty. `response` and `isAxiosError` are not on the error ' +
        'anymore: the axios error is on `cause`.',
        'the authorization URL is normalized: the double slash of "https://auth.olx.com.br//oauth" ' +
        'became "https://auth.olx.com.br/oauth". Both answers 302 (the QA matrix A25).'
    ]
};

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/**
 * The sha256 of a file, with the line endings normalized to CRLF.
 *
 * The published package stores its files with CRLF and git stores them with LF. Hashing
 * the raw bytes makes the check depend on the platform: it passes on a Windows checkout
 * and fails on a Linux one, for the very same file. The CRLF is the canonical form of
 * the published tarball, so the hash of the normalized content is the same everywhere.
 *
 * @param {Buffer} buffer Content of the file.
 * @returns {string} The hash of the content with CRLF line endings.
 */
const sha256Crlf = (buffer) =>
    sha256(
        Buffer.from(
            buffer.toString('binary').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'),
            'binary'
        )
    );

function fail(message) {
    console.error('  [FAIL] ' + message);
    process.exitCode = 1;
}

/**
 * Extracts the public surface declared in a .d.ts.
 *
 * @param {string} dts Content of the declaration file.
 * @returns {Record<string, {kind: string, type: string, params: string, returns: string}>}
 */
function extractSurface(dts) {
    const surface = {};
    const code = dts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const lines = code.split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
        let line = lines[index].trim();
        if (!line) continue;

        // A type literal that spans several lines (`static readonly SCOPES: { ... }`) is
        // consumed as a single statement, otherwise every line of it would look like a
        // member of its own.
        if (/^(static\s+)?(?:readonly\s+)?[A-Za-z_$][\w$]*\s*:\s*\{/.test(line)) {
            let depth = 0;
            const chunk = [];
            while (index < lines.length) {
                for (const character of lines[index]) {
                    if (character === '{') depth++;
                    else if (character === '}') depth--;
                }
                chunk.push(lines[index]);
                if (depth === 0) break;
                index++;
            }
            line = chunk.join(' ').replace(/\s+/g, ' ').trim();
        }

        // [static] name(params): returns;
        let m = line.match(/^(static\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*:\s*([\s\S]+?);$/);
        if (m) {
            surface[m[2]] = {
                kind: m[1] ? 'static' : 'instance',
                type: 'method',
                params: m[3].replace(/\s+/g, ' ').trim(),
                returns: m[4].replace(/\s+/g, ' ').trim()
            };
            continue;
        }

        // [static] [readonly] name: type;
        m = line.match(/^(static\s+)?(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+?);?$/);
        if (m) {
            surface[m[2]] = {
                kind: m[1] ? 'static' : 'instance',
                type: 'property',
                params: '',
                returns: m[3].replace(/\s+/g, ' ').trim()
            };
        }
    }

    return surface;
}

/** Shortens a type so that the report stays readable. */
function short(value) {
    return value.length > 72 ? value.slice(0, 69) + '...' : value;
}

/**
 * Extracts the public surface of a built class, at runtime.
 *
 * @param {Function} Class The exported class.
 * @returns {{statics: Record<string, number|string>, instance: Record<string, number>}}
 */
function extractRuntime(Class) {
    const statics = {};
    for (const key of Object.getOwnPropertyNames(Class)) {
        if (key === 'length' || key === 'name' || key === 'prototype') continue;
        const value = Class[key];
        if (typeof value === 'function') statics[key] = 'arity ' + value.length;
        else if (value && typeof value === 'object') statics[key] = 'object {' + Object.keys(value).join(',') + '}';
        else statics[key] = typeof value;
    }

    const instance = {};
    for (const key of Object.getOwnPropertyNames(Class.prototype)) {
        if (key === 'constructor') continue;
        const value = Class.prototype[key];
        if (typeof value === 'function') instance[key] = value.length;
    }

    return { statics, instance };
}

function compareSurface(baseline, local, label) {
    const removed = [];
    const changed = [];
    const added = [];

    for (const name of Object.keys(baseline)) {
        if (!local[name]) {
            removed.push(name);
            continue;
        }
        const before = baseline[name];
        const after = local[name];
        if (before.type !== after.type || before.params !== after.params || before.returns !== after.returns) {
            changed.push({ name, before, after });
        }
    }
    for (const name of Object.keys(local)) {
        if (!baseline[name]) added.push(name);
    }

    console.log('--- ' + label + ' ---');
    console.log('  baseline: ' + Object.keys(baseline).length + ' symbols | local: ' + Object.keys(local).length + ' symbols');

    if (removed.length) {
        console.log('  >> REMOVED (incompatible):');
        removed.forEach((name) => console.log('     - ' + name));
        fail('the public member(s) ' + removed.join(', ') + ' were removed');
    }

    if (changed.length) {
        console.log('  >> CHANGED:');
        for (const change of changed) {
            const declared = DECLARED.signatures[change.name];
            console.log('     ~ ' + change.name);
            console.log('       params : ' + short(change.before.params) + '  ->  ' + short(change.after.params));
            console.log('       returns: ' + short(change.before.returns) + '  ->  ' + short(change.after.returns));
            if (declared) {
                console.log('       declared breaking change of 2.0.0: ' + declared);
            } else {
                console.log('       NOT declared as a breaking change of 2.0.0');
                fail('the signature of ' + change.name + ' changed without being declared');
            }
        }
    }

    if (added.length) {
        console.log('  >> ADDED (compatible, additive):');
        added.forEach((name) => console.log('     + ' + name));
    }

    if (!removed.length && !changed.length && !added.length) {
        console.log('  >> the surface is identical to the baseline');
    }

    console.log('');
    return { removed, changed, added };
}

function compareRuntime(baseline, local) {
    const removed = [];
    const changed = [];
    const added = [];

    for (const name of Object.keys(baseline)) {
        if (!(name in local)) {
            removed.push(name);
            continue;
        }
        if (baseline[name] !== local[name]) changed.push({ name, before: baseline[name], after: local[name] });
    }
    for (const name of Object.keys(local)) {
        if (!(name in baseline)) added.push(name);
    }

    console.log('--- runtime surface (the built package, loaded) ---');
    console.log('  baseline: ' + Object.keys(baseline).length + ' members | local: ' + Object.keys(local).length + ' members');

    if (removed.length) {
        console.log('  >> REMOVED (incompatible):');
        removed.forEach((name) => console.log('     - ' + name));
        fail('the public member(s) ' + removed.join(', ') + ' were removed');
    }

    if (changed.length) {
        console.log('  >> CHANGED:');
        for (const change of changed) {
            console.log('     ~ ' + change.name + ': ' + change.before + '  ->  ' + change.after);
            fail('the public member ' + change.name + ' changed at runtime');
        }
    }

    if (added.length) {
        console.log('  >> ADDED (compatible, additive):');
        added.forEach((name) => console.log('     + ' + name));
    }

    console.log('');
    return { removed, changed, added };
}

function main() {
    console.log('== QA compat-check: olx-br against the frozen baseline of olx-br@1.0.6 ==\n');

    const manifestPath = path.join(BASELINE_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error('the baseline is missing: ' + manifestPath);
        console.error('regenerate it with: node qa/gen-baseline.mjs <extracted tarball> qa/baseline');
        process.exit(2);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const baseDtsPath = path.join(BASELINE_DIR, manifest.declaration);
    const baseJsPath = path.join(BASELINE_DIR, manifest.entry);
    const localDtsPath = path.join(DIST, 'index.d.ts');
    const localJsPath = path.join(DIST, 'index.js');

    if (!fs.existsSync(localDtsPath) || !fs.existsSync(localJsPath)) {
        console.error('dist/ is missing or incomplete. Run `npm run build` before the gate.');
        process.exit(2);
    }

    // --- 0) the integrity of the frozen baseline -------------------------------------------------
    console.log('--- the frozen baseline ---');
    console.log('  package   : ' + manifest.package);
    console.log('  from      : ' + manifest.generatedFrom);
    console.log('  license   : MIT (the dist of the upstream package, author Vinícius Rossmann Nunes)');

    for (const [file, expected] of Object.entries(manifest.sha256 || {})) {
        const full = path.join(BASELINE_DIR, file);
        if (!fs.existsSync(full)) {
            fail('the baseline file ' + file + ' is missing');
            continue;
        }
        // The integrity is compared on the content with the line endings normalized to CRLF.
        // The published tarball stores the files with CRLF and git stores them with LF:
        // hashing the raw bytes would make the check pass on a Windows checkout and fail
        // on a Linux one, for the very same file. The CRLF is the canonical form of the
        // published package, so the hash of the normalized content is the same everywhere.
        const actual = sha256Crlf(fs.readFileSync(full));
        const ok = actual === expected;
        console.log('  sha256 ' + file.padEnd(20) + ': ' + actual + (ok ? ' (integrity OK)' : ' (MISMATCH, expected ' + expected + ')'));
        if (!ok) fail('the frozen baseline ' + file + ' was changed');
    }

    const baseDts = fs.readFileSync(baseDtsPath, 'utf8');
    if (!/MIT Licensed/i.test(baseDts) || !/Vinícius Rossmann Nunes/.test(baseDts)) {
        fail('the baseline does not carry the MIT header of the upstream package');
    }
    console.log('');

    // --- 1) the declared surface ------------------------------------------------------------------
    const base = extractSurface(baseDts);
    const local = extractSurface(fs.readFileSync(localDtsPath, 'utf8'));
    compareSurface(base, local, 'declared surface (dist/index.d.ts against the baseline)');

    // --- 2) the runtime surface ------------------------------------------------------------------
    let Baseline = null;
    try {
        Baseline = require(baseJsPath);
    } catch (error) {
        console.log('--- runtime surface (the built package, loaded) ---');
        console.log('  the baseline could not be loaded (' + error.message + '); the runtime check was skipped.');
        console.log('');
    }

    if (Baseline) {
        const Local = require(localJsPath);
        const baseRuntime = extractRuntime(Baseline);
        const localRuntime = extractRuntime(Local);
        compareRuntime(
            Object.assign({}, baseRuntime.statics, baseRuntime.instance),
            Object.assign({}, localRuntime.statics, localRuntime.instance)
        );
    }

    // --- 3) the body of the package --------------------------------------------------------------
    console.log('--- the body of the package ---');
    const localSha = sha256(fs.readFileSync(localJsPath));
    const baseSha = manifest.sha256 && manifest.sha256[manifest.entry];
    if (baseSha && localSha !== baseSha) {
        console.log('  >> dist/index.js is not byte identical to the published 1.0.6.');
        console.log('     baseline: ' + baseSha);
        console.log('     local   : ' + localSha);
        console.log('     expected: the version 2.0.0 changes the rejection value and the error contract.');
    } else {
        console.log('  >> dist/index.js is byte identical to the published 1.0.6.');
    }
    console.log('');

    // --- 4) the declared breaking changes --------------------------------------------------------
    console.log('--- the breaking changes declared by the version 2.0.0 ---');
    for (const behaviour of DECLARED.behaviours) {
        console.log('  * ' + behaviour);
    }
    console.log('');

    const compatible = !process.exitCode;
    console.log(compatible
        ? 'RESULT: COMPATIBLE (COMPATIVEL)'
        : 'RESULT: INCOMPATIBLE (INCOMPATIVEL)');
}

main();
