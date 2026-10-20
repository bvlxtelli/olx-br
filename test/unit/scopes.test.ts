import { describe, it, expect } from 'vitest';
import Olx from '../../src/index';

describe('OAuth scopes', () => {
    const olx = new Olx('client-id', 'client-secret', 'https://example.com/callback');

    const scopeOf = (request?: boolean | string | string[]) =>
        new URL(olx.getAuthUrl(request as boolean)).searchParams.get('scope');

    const scopesOf = (scope: string | null) => (scope || '').split(' ').filter(Boolean).sort();

    it('keeps the original behaviour with the boolean parameter', () => {
        expect(scopeOf(true)).toBe('basic_user_info autoupload');
        expect(scopeOf(false)).toBe('basic_user_info');
        expect(scopeOf()).toBe('basic_user_info autoupload');
    });

    it('accepts a scope as a string', () => {
        expect(scopeOf('chat')).toBe('basic_user_info chat');
        expect(scopeOf('autoservice')).toBe('basic_user_info autoservice');
    });

    it('accepts several scopes separated by a space', () => {
        expect(scopeOf('chat autoservice')).toBe('basic_user_info chat autoservice');
    });

    it('accepts an array of scopes', () => {
        expect(scopeOf(['chat', 'autoservice'])).toBe('basic_user_info chat autoservice');
    });

    it('does not repeat a scope', () => {
        expect(scopeOf('chat chat')).toBe('basic_user_info chat');
        expect(scopeOf(['chat', 'chat', 'autoservice'])).toBe('basic_user_info chat autoservice');
    });

    it('ignores extra spaces between the scopes', () => {
        expect(scopeOf('chat   autoservice')).toBe('basic_user_info chat autoservice');
    });

    it('always requests the basic user info scope', () => {
        expect(scopeOf('chat')).toContain('basic_user_info');
        expect(scopeOf(['autoservice'])).toContain('basic_user_info');
    });

    it('does not change the case of the requested scopes', () => {
        expect(scopeOf('CHAT')).toBe('basic_user_info CHAT');
    });

    it('does not depend on the order of the scopes', () => {
        const first = scopesOf(scopeOf('chat autoservice'));
        const second = scopesOf(scopeOf('autoservice chat'));

        expect(first).toEqual(second);
    });

    it('exposes the known scopes', () => {
        expect(Olx.SCOPES.basicUserInfo).toBe('basic_user_info');
        expect(Olx.SCOPES.autoupload).toBe('autoupload');
        expect(Olx.SCOPES.chat).toBe('chat');
        expect(Olx.SCOPES.autoservice).toBe('autoservice');
    });

    it('keeps the state parameter working with a scope string', () => {
        const params = new URL(olx.getAuthUrl('chat', 'my-state')).searchParams;

        expect(params.get('state')).toBe('my-state');
        expect(params.get('scope')).toBe('basic_user_info chat');
    });
});
