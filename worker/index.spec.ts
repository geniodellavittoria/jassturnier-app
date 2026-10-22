import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionCookie, type Env } from './auth';
import worker from './index';

let adminCookie: string;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM registrations'),
    env.DB.prepare('DELETE FROM settings'),
    env.DB.prepare('DELETE FROM tournament'),
  ]);
  adminCookie = (await createSessionCookie(env)).split(';')[0];
});

interface CallOptions {
  body?: unknown;
  /** Sent as-is instead of JSON-encoding `body`. */
  raw?: string;
  admin?: boolean;
  env?: Env;
}

function call(method: string, path: string, options: CallOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.admin) headers['Cookie'] = adminCookie;
  const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  return worker.fetch(new Request(`https://example.com${path}`, { method, headers, body }), options.env ?? env);
}

async function registrationRows(): Promise<Record<string, unknown>[]> {
  return (await env.DB.prepare('SELECT * FROM registrations ORDER BY id').all()).results;
}

const validRegistration = {
  teamName: '  Bock-Stars ',
  players: [' Anna ', '', 'Beat'],
  contactName: ' Anna Muster ',
  contactEmail: ' anna@example.com ',
  phone: ' 079 123 45 67 ',
  note: '  ',
};

describe('POST /api/register', () => {
  it('stores a trimmed registration', async () => {
    const res = await call('POST', '/api/register', { body: validRegistration });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [row] = await registrationRows();
    expect(row).toEqual(
      expect.objectContaining({
        team_name: 'Bock-Stars',
        players: '["Anna","Beat"]',
        contact_name: 'Anna Muster',
        contact_email: 'anna@example.com',
        phone: '079 123 45 67',
        note: null,
        status: 'pending',
      }),
    );
  });

  it('keeps only non-empty string player names', async () => {
    await call('POST', '/api/register', { body: { ...validRegistration, players: ['Anna', 7, null, ' '] } });
    expect((await registrationRows())[0]['players']).toBe('["Anna"]');
  });

  it('stores an empty player list when players is not an array', async () => {
    await call('POST', '/api/register', { body: { ...validRegistration, players: 'Anna', phone: undefined } });
    const [row] = await registrationRows();
    expect(row['players']).toBe('[]');
    expect(row['phone']).toBeNull();
  });

  it('pretends success but stores nothing when the honeypot is filled', async () => {
    const res = await call('POST', '/api/register', { body: { ...validRegistration, website: 'spam.example' } });
    expect(await res.json()).toEqual({ ok: true });
    expect(await registrationRows()).toEqual([]);
  });

  it.each([
    [{ ...validRegistration, teamName: '   ' }, 'Teamname fehlt.'],
    [{ ...validRegistration, contactName: undefined }, 'Kontaktname fehlt.'],
    [{ ...validRegistration, contactEmail: undefined }, 'Gültige Kontakt-E-Mail fehlt.'],
    [{ ...validRegistration, contactEmail: 'anna@example' }, 'Gültige Kontakt-E-Mail fehlt.'],
    [{ ...validRegistration, teamName: 42 }, 'Teamname fehlt.'],
    [{ ...validRegistration, contactEmail: ['anna@example.com'] }, 'Gültige Kontakt-E-Mail fehlt.'],
  ])('rejects invalid input %#', async (body, error) => {
    const res = await call('POST', '/api/register', { body });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(await registrationRows()).toEqual([]);
  });

  it('ignores non-string phone and note values', async () => {
    await call('POST', '/api/register', { body: { ...validRegistration, phone: 791234567, note: { x: 1 } } });
    const [row] = await registrationRows();
    expect([row['phone'], row['note']]).toEqual([null, null]);
  });

  it.each(['{nope', 'null', '[]', '"text"'])('rejects a body that is not a JSON object: %s', async (raw) => {
    const res = await call('POST', '/api/register', { raw });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Ungültige Anfrage.' });
  });
});

describe('admin session endpoints', () => {
  it('logs in with the right password and sets the session cookie', async () => {
    const res = await call('POST', '/api/admin/login', { body: { password: 'test-password' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toMatch(/^admin_session=[\w-]+\.[\w-]+;/);
  });

  it.each([{ password: 'wrong' }, {}, { password: '' }, { password: 123 }])('refuses a wrong or missing password %#', async (body) => {
    const res = await call('POST', '/api/admin/login', { body });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Falsches Passwort.' });
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it.each(['x', 'null'])('rejects a malformed login request: %s', async (raw) => {
    expect((await call('POST', '/api/admin/login', { raw })).status).toBe(400);
  });

  it('logs out by clearing the cookie', async () => {
    const res = await call('POST', '/api/admin/logout');
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('reports whether the request carries a valid session', async () => {
    expect(await (await call('GET', '/api/admin/session')).json()).toEqual({ authenticated: false });
    expect(await (await call('GET', '/api/admin/session', { admin: true })).json()).toEqual({ authenticated: true });
  });
});

describe('admin routes require a session', () => {
  it.each([
    ['GET', '/api/admin/registrations'],
    ['PATCH', '/api/admin/registrations/1'],
    ['PUT', '/api/admin/registrations/1'],
    ['DELETE', '/api/admin/registrations/1'],
    ['GET', '/api/admin/settings'],
    ['PUT', '/api/admin/settings'],
    ['PATCH', '/api/admin/tournament'],
  ])('%s %s', async (method, path) => {
    const res = await call(method, path, method === 'GET' ? {} : { body: {} });
    expect(res.status).toBe(401);
  });
});

describe('registrations (admin)', () => {
  async function seed(): Promise<number> {
    await call('POST', '/api/register', { body: validRegistration });
    const [row] = await registrationRows();
    return row['id'] as number;
  }

  it('lists registrations newest first, mapped to camelCase', async () => {
    await env.DB.prepare(
      `INSERT INTO registrations (team_name, players, contact_name, contact_email, created_at)
       VALUES ('Alt', '["X"]', 'A', 'a@b.ch', '2026-01-01 10:00:00'), ('Neu', '[]', 'B', 'b@b.ch', '2026-02-01 10:00:00')`,
    ).run();
    const res = await call('GET', '/api/admin/registrations', { admin: true });
    const { registrations } = (await res.json()) as { registrations: Record<string, unknown>[] };
    expect(registrations.map((r) => r['teamName'])).toEqual(['Neu', 'Alt']);
    expect(registrations[1]).toEqual({
      id: expect.any(Number),
      teamName: 'Alt',
      players: ['X'],
      contactName: 'A',
      contactEmail: 'a@b.ch',
      phone: null,
      note: null,
      status: 'pending',
      createdAt: '2026-01-01 10:00:00',
    });
  });

  it('updates the status', async () => {
    const id = await seed();
    const res = await call('PATCH', `/api/admin/registrations/${id}`, { admin: true, body: { status: 'paid' } });
    expect(await res.json()).toEqual({ ok: true });
    expect((await registrationRows())[0]['status']).toBe('paid');
  });

  it.each([{ status: 'lost' }, {}, { status: 1 }])('rejects an unknown status %#', async (body) => {
    const id = await seed();
    const res = await call('PATCH', `/api/admin/registrations/${id}`, { admin: true, body });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Ungültiger Status.' });
  });

  it.each(['', 'null'])('rejects a malformed status update: %j', async (raw) => {
    expect((await call('PATCH', '/api/admin/registrations/1', { admin: true, raw })).status).toBe(400);
  });

  it.each([
    ['PATCH', { status: 'paid' }],
    ['PUT', validRegistration],
    ['DELETE', undefined],
  ])('answers %s on an unknown id with 404', async (method, body) => {
    const res = await call(method, '/api/admin/registrations/999', { admin: true, body });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('edits a registration', async () => {
    const id = await seed();
    const res = await call('PUT', `/api/admin/registrations/${id}`, {
      admin: true,
      body: { ...validRegistration, teamName: 'Umbenannt', note: 'vegetarisch' },
    });
    expect(await res.json()).toEqual({ ok: true });
    const [row] = await registrationRows();
    expect(row['team_name']).toBe('Umbenannt');
    expect(row['note']).toBe('vegetarisch');
  });

  it('rejects invalid or malformed edits', async () => {
    const id = await seed();
    const invalid = await call('PUT', `/api/admin/registrations/${id}`, {
      admin: true,
      body: { ...validRegistration, contactEmail: 'kaputt' },
    });
    expect(invalid.status).toBe(400);
    expect((await call('PUT', `/api/admin/registrations/${id}`, { admin: true, raw: '[' })).status).toBe(400);
    expect((await call('PUT', `/api/admin/registrations/${id}`, { admin: true, raw: 'null' })).status).toBe(400);
    expect((await registrationRows())[0]['contact_email']).toBe('anna@example.com');
  });

  it('deletes a registration', async () => {
    const id = await seed();
    expect(await (await call('DELETE', `/api/admin/registrations/${id}`, { admin: true })).json()).toEqual({ ok: true });
    expect(await registrationRows()).toEqual([]);
  });

  it('only matches numeric ids', async () => {
    expect((await call('DELETE', '/api/admin/registrations/abc', { admin: true })).status).toBe(404);
  });
});

describe('payment settings (admin)', () => {
  it('returns null before anything was saved', async () => {
    expect(await (await call('GET', '/api/admin/settings', { admin: true })).json()).toEqual({ settings: null });
  });

  it('saves trimmed settings and reads them back', async () => {
    const res = await call('PUT', '/api/admin/settings', {
      admin: true,
      body: {
        recipientName: ' Jassclub ',
        bankName: 'Bank',
        iban: 'CH00 0000',
        referenceNote: 'Teamname',
        amount: '40',
        currency: 'EUR',
        deadline: '15.09.2026',
        message: 'Bis bald',
      },
    });
    expect(await res.json()).toEqual({ ok: true });
    expect(await (await call('GET', '/api/admin/settings', { admin: true })).json()).toEqual({
      settings: {
        recipientName: 'Jassclub',
        bankName: 'Bank',
        iban: 'CH00 0000',
        referenceNote: 'Teamname',
        amount: '40',
        currency: 'EUR',
        deadline: '15.09.2026',
        message: 'Bis bald',
      },
    });
  });

  it('overwrites earlier settings and falls back to empty values and CHF', async () => {
    await call('PUT', '/api/admin/settings', { admin: true, body: { iban: 'CH11', currency: 'EUR' } });
    await call('PUT', '/api/admin/settings', { admin: true, body: { iban: ' ', currency: '' } });
    const { settings } = (await (await call('GET', '/api/admin/settings', { admin: true })).json()) as {
      settings: Record<string, unknown>;
    };
    expect(settings['iban']).toBeNull();
    expect(settings['currency']).toBe('CHF');
  });

  it('treats non-string settings as empty', async () => {
    await call('PUT', '/api/admin/settings', { admin: true, body: { iban: 123, currency: false } });
    const { settings } = (await (await call('GET', '/api/admin/settings', { admin: true })).json()) as {
      settings: Record<string, unknown>;
    };
    expect([settings['iban'], settings['currency']]).toEqual([null, 'CHF']);
  });

  it.each(['{', 'null', '[1]'])('rejects a malformed settings request: %s', async (raw) => {
    expect((await call('PUT', '/api/admin/settings', { admin: true, raw })).status).toBe(400);
  });
});

describe('tournament sync', () => {
  const patch = (ops: unknown, options: CallOptions = {}) =>
    call('PATCH', '/api/admin/tournament', { admin: true, body: { ops }, ...options });

  it('starts out empty at version 0', async () => {
    expect(await (await call('GET', '/api/tournament')).json()).toEqual({ tournament: null, version: 0 });
  });

  it('creates the tournament on the first patch, then applies further patches', async () => {
    const created = await patch([{ path: [], prev: null, value: { name: 'Turnier', scores: [null, null] } }]);
    expect(await created.json()).toEqual({ tournament: { name: 'Turnier', scores: [null, null] }, version: 1, conflicts: [] });

    const updated = await patch([{ path: ['scores', 1], prev: null, value: 900 }]);
    expect(await updated.json()).toEqual({ tournament: { name: 'Turnier', scores: [null, 900] }, version: 2, conflicts: [] });

    expect(await (await call('GET', '/api/tournament')).json()).toEqual({
      tournament: { name: 'Turnier', scores: [null, 900] },
      version: 2,
    });
  });

  it('reports conflicts and leaves the other value in place', async () => {
    await patch([{ path: [], prev: null, value: { score: 700 } }]);
    const res = await patch([
      { path: ['score'], prev: 600, value: 650 },
      { path: ['name'], prev: undefined, value: 'Neu' },
    ]);
    expect(await res.json()).toEqual({
      tournament: { score: 700, name: 'Neu' },
      version: 2,
      conflicts: [{ path: ['score'], mine: 650, theirs: 700 }],
    });
  });

  it('does not write when nothing changes', async () => {
    await patch([{ path: [], prev: null, value: { score: 700 } }]);
    const res = await patch([{ path: ['score'], prev: 600, value: 700 }]);
    expect(await res.json()).toEqual({ tournament: { score: 700 }, version: 1, conflicts: [] });
  });

  it('treats a corrupt stored tournament as empty and overwrites it', async () => {
    await env.DB.prepare(`INSERT INTO tournament (id, data, version) VALUES (1, '{broken', 4)`).run();
    expect(await (await call('GET', '/api/tournament')).json()).toEqual({ tournament: null, version: 4 });
    const res = await patch([{ path: [], prev: null, value: { ok: true } }]);
    expect(await res.json()).toEqual({ tournament: { ok: true }, version: 5, conflicts: [] });
  });

  it.each([
    ['not JSON', '{'],
    ['no ops', '{}'],
    ['op without path', '{"ops":[{"prev":null}]}'],
    ['null op', '{"ops":[null]}'],
  ])('rejects a malformed patch (%s)', async (_, raw) => {
    const res = await call('PATCH', '/api/admin/tournament', { admin: true, raw });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Ungültige Anfrage.' });
  });

  it('rejects oversized patches', async () => {
    const res = await patch([{ path: ['x'], prev: null, value: 'x'.repeat(1_000_001) }]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Turnierdaten zu gross.' });
  });

  it('retries when another write won the race', async () => {
    const realPrepare = env.DB.prepare.bind(env.DB);
    let lost = false;
    const db = {
      prepare: (sql: string) => {
        const stmt = realPrepare(sql);
        if (!sql.startsWith('UPDATE') || lost) return stmt;
        // Another device commits between our read and our write.
        lost = true;
        return {
          bind: () => ({
            run: async () => {
              await realPrepare(`UPDATE tournament SET data = '{"score":1}', version = version + 1`).run();
              return { meta: { changes: 0 } };
            },
          }),
        };
      },
    } as unknown as D1Database;
    await patch([{ path: [], prev: null, value: { score: 0 } }]);
    const res = await patch([{ path: ['name'], prev: null, value: 'X' }], { env: { ...env, DB: db } });
    expect(await res.json()).toEqual({ tournament: { score: 1, name: 'X' }, version: 3, conflicts: [] });
  });

  it('gives up with 503 after repeatedly losing the race', async () => {
    const realPrepare = env.DB.prepare.bind(env.DB);
    const run = vi.fn(async () => ({ meta: { changes: 0 } }));
    const db = {
      prepare: (sql: string) => (sql.startsWith('SELECT') ? realPrepare(sql) : { bind: () => ({ run }) }),
    } as unknown as D1Database;
    const res = await patch([{ path: [], prev: null, value: {} }], { env: { ...env, DB: db } });
    expect(res.status).toBe(503);
    expect(run).toHaveBeenCalledTimes(5);
  });

  it('refuses whole-blob saves from outdated clients', async () => {
    const res = await call('PUT', '/api/admin/tournament', { admin: true, body: { tournament: {} } });
    expect(res.status).toBe(410);
  });
});

describe('routing', () => {
  it('answers unknown API paths with 404', async () => {
    const res = await call('GET', '/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('serves everything else from the static assets', async () => {
    const assets = { fetch: vi.fn(async () => new Response('<html>')) } as unknown as Fetcher;
    const res = await call('GET', '/praesentation', { env: { ...env, ASSETS: assets } });
    expect(await res.text()).toBe('<html>');
    expect(assets.fetch).toHaveBeenCalled();
  });
});

