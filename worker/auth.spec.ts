import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSessionCookie, createSessionCookie, isAuthenticated, requireAdmin, timingSafeEqual } from './auth';

function withCookie(cookie: string | null): Request {
  return new Request('https://example.com/', cookie === null ? {} : { headers: { Cookie: cookie } });
}

/** `admin_session=<token>` out of a Set-Cookie header. */
function sessionPair(setCookie: string): string {
  return setCookie.split(';')[0];
}

describe('timingSafeEqual', () => {
  it('is true only for identical strings', () => {
    expect(timingSafeEqual('geheim', 'geheim')).toBe(true);
    expect(timingSafeEqual('geheim', 'geheiM')).toBe(false);
    expect(timingSafeEqual('geheim', 'geheim!')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('compares bytes, not UTF-16 units', () => {
    expect(timingSafeEqual('ä', 'ä')).toBe(true);
    expect(timingSafeEqual('ä', 'a')).toBe(false);
  });
});

describe('session cookie', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a signed, HttpOnly cookie valid for 12 hours', async () => {
    const cookie = await createSessionCookie(env);
    expect(cookie).toMatch(/^admin_session=[\w-]+\.[\w-]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200$/);
  });

  it('clears the cookie', () => {
    expect(clearSessionCookie()).toBe('admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  });

  it('accepts its own cookie, also among other cookies', async () => {
    const pair = sessionPair(await createSessionCookie(env));
    expect(await isAuthenticated(withCookie(pair), env)).toBe(true);
    expect(await isAuthenticated(withCookie(`theme=dark; ${pair}; other=1`), env)).toBe(true);
  });

  it('rejects requests without the cookie', async () => {
    expect(await isAuthenticated(withCookie(null), env)).toBe(false);
    expect(await isAuthenticated(withCookie('theme=dark'), env)).toBe(false);
    expect(await isAuthenticated(withCookie('admin_session='), env)).toBe(false);
  });

  it('rejects tokens without a signature part', async () => {
    expect(await isAuthenticated(withCookie('admin_session=abc'), env)).toBe(false);
    expect(await isAuthenticated(withCookie('admin_session=abc.'), env)).toBe(false);
  });

  it('rejects a tampered payload', async () => {
    const [, token] = sessionPair(await createSessionCookie(env)).split('=');
    const [, signature] = token.split('.');
    const forged = btoa(JSON.stringify({ exp: Date.now() + 1e12 })).replace(/=+$/, '');
    expect(await isAuthenticated(withCookie(`admin_session=${forged}.${signature}`), env)).toBe(false);
  });

  it('rejects cookies signed with another secret', async () => {
    const pair = sessionPair(await createSessionCookie({ ...env, SESSION_SECRET: 'other' }));
    expect(await isAuthenticated(withCookie(pair), env)).toBe(false);
  });

  it('rejects expired sessions', async () => {
    const pair = sessionPair(await createSessionCookie(env));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 12 * 60 * 60 * 1000 + 1);
    expect(await isAuthenticated(withCookie(pair), env)).toBe(false);
  });

  it('rejects undecodable tokens instead of throwing', async () => {
    expect(await isAuthenticated(withCookie('admin_session=%%%.%%%'), env)).toBe(false);
  });

  it('requireAdmin answers 401 only when not authenticated', async () => {
    const denied = await requireAdmin(withCookie(null), env);
    expect(denied?.status).toBe(401);
    expect(await denied?.json()).toEqual({ error: 'unauthorized' });

    const pair = sessionPair(await createSessionCookie(env));
    expect(await requireAdmin(withCookie(pair), env)).toBeNull();
  });
});
