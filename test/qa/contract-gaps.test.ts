import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import Olx from '../../src/index';
import { appApi } from '../../src/services/api';
import { mockAdapter } from '../helpers/axios-mock';

/**
 * The three rules of the contract that no gate of the package was checking.
 *
 * They were found by mutating the source of the branch and watching every gate pass:
 * a version that is not 2.0.0, a README without the sections of the error object and
 * of the migration, and the `response` of axios exposed again on the error all went
 * through the whole pipeline of the tests without a single failure.
 *
 * They live in `test/qa/` so that `npm test` runs them: `npm test` is the main gate of
 * the package and it covers everything under `test/`.
 */

const repoRoot = path.resolve(__dirname, '..', '..');

const originalAdapter = appApi.defaults.adapter;

afterEach(() => {
    appApi.defaults.adapter = originalAdapter;
});

/** Removes the accents, so that a heading matches with or without them. */
function withoutAccents(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** The headings of the README, as they are written. */
function readmeHeadings(): string[] {
    const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

    return readme
        .split(/\r?\n/)
        .filter((line) => /^#{1,6}\s/.test(line))
        .map((line) => withoutAccents(line));
}

describe('the rules of the contract that had no gate', () => {
    it('declares the version 2.0.0 of the contract', () => {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
        ) as { version: string };

        expect(
            manifest.version,
            'the version of the package has to be 2.0.0: the rejection value changed, ' +
                'so 1.x consumers break on purpose'
        ).toBe('2.0.0');
    });

    it('documents the error object and the migration from 1.x to 2.x', () => {
        const required = ['O objeto de erro', 'Migrando da versão 1.x para a 2.x'];
        const headings = readmeHeadings();

        for (const section of required) {
            const wanted = withoutAccents(section);

            expect(
                headings.some((heading) => heading.includes(wanted)),
                `the README has no section "${section}": the contract (section 7) requires it`
            ).toBe(true);
        }
    });

    it('never exposes the response of axios on the error', async () => {
        const mock = mockAdapter({
            status: 400,
            statusText: 'Bad Request',
            data: { message: 'invalid request' }
        });

        appApi.defaults.adapter = mock.adapter;

        const error: any = await Olx.getAnuncios('fake-token').catch((err: unknown) => err);

        expect(error).toBeInstanceOf(Olx.OlxApiError);

        // The contract (section 3.2) says the response is NOT exposed: the consumer that
        // needs it reads it in the cause.
        expect('response' in error, 'the error exposes the response of axios').toBe(false);
        expect(error.response).toBeUndefined();
        expect(Object.keys(error)).not.toContain('response');

        // The information is not lost: it is in the cause.
        expect(error.cause).toBeDefined();
        expect(error.cause?.response?.status).toBe(400);
    });
});
