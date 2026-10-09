import {
  clearSessionCookie,
  createSessionCookie,
  isAuthenticated,
  requireAdmin,
  timingSafeEqual,
  type Env,
} from './auth';
import { applyChecked, type PatchOp } from '../src/app/services/patch';

interface RegisterBody {
  teamName?: string;
  players?: string[];
  contactName?: string;
  contactEmail?: string;
  phone?: string;
  note?: string;
  website?: string; // honeypot — must stay empty
}

interface StatusBody {
  status?: string;
}

interface SettingsBody {
  recipientName?: string;
  bankName?: string;
  iban?: string;
  referenceNote?: string;
  amount?: string;
  currency?: string;
  deadline?: string;
  message?: string;
}

const MAX_TOURNAMENT_BODY_BYTES = 1_000_000; // 1MB — generous headroom over a real tournament's JSON size

const STATUSES = new Set(['pending', 'contacted', 'paid', 'cancelled']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: RegisterBody;
  try {
    body = await request.json();
  } catch {
    return badRequest('Ungültige Anfrage.');
  }

  if (body.website) return json({ ok: true }); // honeypot tripped — pretend success, do nothing

  const teamName = body.teamName?.trim();
  const contactName = body.contactName?.trim();
  const contactEmail = body.contactEmail?.trim();
  const players = Array.isArray(body.players) ? body.players.map((p) => String(p).trim()).filter(Boolean) : [];

  if (!teamName) return badRequest('Teamname fehlt.');
  if (!contactName) return badRequest('Kontaktname fehlt.');
  if (!contactEmail || !EMAIL_RE.test(contactEmail)) return badRequest('Gültige Kontakt-E-Mail fehlt.');

  await env.DB.prepare(
    `INSERT INTO registrations (team_name, players, contact_name, contact_email, phone, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(teamName, JSON.stringify(players), contactName, contactEmail, body.phone?.trim() || null, body.note?.trim() || null)
    .run();

  return json({ ok: true });
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Ungültige Anfrage.');
  }
  if (!body.password || !timingSafeEqual(body.password, env.ADMIN_PASSWORD)) {
    return json({ error: 'Falsches Passwort.' }, { status: 401 });
  }
  const cookie = await createSessionCookie(env);
  return json({ ok: true }, { headers: { 'Set-Cookie': cookie } });
}

function handleLogout(): Response {
  return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}

async function handleListRegistrations(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT * FROM registrations ORDER BY created_at DESC').all();
  const registrations = results.map((row) => ({
    id: row['id'],
    teamName: row['team_name'],
    players: JSON.parse((row['players'] as string) ?? '[]'),
    contactName: row['contact_name'],
    contactEmail: row['contact_email'],
    phone: row['phone'],
    note: row['note'],
    status: row['status'],
    createdAt: row['created_at'],
  }));
  return json({ registrations });
}

async function handleUpdateStatus(request: Request, env: Env, id: string): Promise<Response> {
  let body: StatusBody;
  try {
    body = await request.json();
  } catch {
    return badRequest('Ungültige Anfrage.');
  }
  if (!body.status || !STATUSES.has(body.status)) return badRequest('Ungültiger Status.');
  await env.DB.prepare('UPDATE registrations SET status = ? WHERE id = ?').bind(body.status, id).run();
  return json({ ok: true });
}

async function handleDeleteRegistration(env: Env, id: string): Promise<Response> {
  await env.DB.prepare('DELETE FROM registrations WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handleGetSettings(env: Env): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM settings WHERE id = 1').first();
  return json({
    settings: row
      ? {
          recipientName: row['recipient_name'],
          bankName: row['bank_name'],
          iban: row['iban'],
          referenceNote: row['reference_note'],
          amount: row['amount'],
          currency: row['currency'],
          deadline: row['deadline'],
          message: row['message'],
        }
      : null,
  });
}

async function handleSaveSettings(request: Request, env: Env): Promise<Response> {
  let body: SettingsBody;
  try {
    body = await request.json();
  } catch {
    return badRequest('Ungültige Anfrage.');
  }
  await env.DB.prepare(
    `INSERT INTO settings (id, recipient_name, bank_name, iban, reference_note, amount, currency, deadline, message, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (id) DO UPDATE SET
       recipient_name = excluded.recipient_name,
       bank_name = excluded.bank_name,
       iban = excluded.iban,
       reference_note = excluded.reference_note,
       amount = excluded.amount,
       currency = excluded.currency,
       deadline = excluded.deadline,
       message = excluded.message,
       updated_at = excluded.updated_at`,
  )
    .bind(
      body.recipientName?.trim() || null,
      body.bankName?.trim() || null,
      body.iban?.trim() || null,
      body.referenceNote?.trim() || null,
      body.amount?.trim() || null,
      body.currency?.trim() || 'CHF',
      body.deadline?.trim() || null,
      body.message?.trim() || null,
    )
    .run();
  return json({ ok: true });
}

/** Current tournament + version; version 0 with null data when nothing was saved yet. */
async function readTournament(env: Env): Promise<{ tournament: unknown; version: number; exists: boolean }> {
  const row = await env.DB.prepare('SELECT data, version FROM tournament WHERE id = 1').first();
  if (!row) return { tournament: null, version: 0, exists: false };
  let tournament: unknown = null;
  try {
    tournament = JSON.parse(row['data'] as string);
  } catch {
    // Corrupt row: treat as empty, the next patch rewrites it.
  }
  return { tournament, version: row['version'] as number, exists: true };
}

async function handleGetTournament(env: Env): Promise<Response> {
  const { tournament, version } = await readTournament(env);
  return json({ tournament, version });
}

const MAX_PATCH_ATTEMPTS = 5;

/**
 * Applies only the changes a device made (see src/app/services/patch.ts).
 * Ops whose `prev` no longer matches — another admin changed that value in
 * the meantime — are returned as conflicts instead of overwriting it. The
 * write is a compare-and-set on `version`, retried if another patch won the race.
 */
async function handlePatchTournament(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_TOURNAMENT_BODY_BYTES) return badRequest('Turnierdaten zu gross.');
  let ops: PatchOp[];
  try {
    const body = JSON.parse(raw) as { ops?: unknown };
    if (!Array.isArray(body.ops) || !body.ops.every((op) => op && Array.isArray(op.path))) throw new Error();
    ops = body.ops as PatchOp[];
  } catch {
    return badRequest('Ungültige Anfrage.');
  }

  for (let attempt = 0; attempt < MAX_PATCH_ATTEMPTS; attempt++) {
    const current = await readTournament(env);
    const { result, conflicts } = applyChecked(current.tournament, ops);
    if (result === current.tournament) return json({ tournament: current.tournament, version: current.version, conflicts });

    const data = JSON.stringify(result);
    const write = current.exists
      ? env.DB.prepare(
          `UPDATE tournament SET data = ?, version = version + 1, updated_at = datetime('now')
           WHERE id = 1 AND version = ?`,
        ).bind(data, current.version)
      : env.DB.prepare(
          `INSERT INTO tournament (id, data, version, updated_at) VALUES (1, ?, 1, datetime('now'))
           ON CONFLICT (id) DO NOTHING`,
        ).bind(data);
    const { meta } = await write.run();
    if (meta.changes === 1) return json({ tournament: result, version: current.version + 1, conflicts });
  }
  return json({ error: 'Zu viele gleichzeitige Änderungen, bitte nochmals versuchen.' }, { status: 503 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === '/api/register' && method === 'POST') return handleRegister(request, env);
    if (path === '/api/admin/login' && method === 'POST') return handleLogin(request, env);
    if (path === '/api/admin/logout' && method === 'POST') return handleLogout();
    if (path === '/api/admin/session' && method === 'GET') {
      return json({ authenticated: await isAuthenticated(request, env) });
    }

    if (path === '/api/admin/registrations' && method === 'GET') {
      const unauthorized = await requireAdmin(request, env);
      if (unauthorized) return unauthorized;
      return handleListRegistrations(env);
    }

    const statusMatch = path.match(/^\/api\/admin\/registrations\/(\d+)$/);
    if (statusMatch && method === 'PATCH') {
      const unauthorized = await requireAdmin(request, env);
      if (unauthorized) return unauthorized;
      return handleUpdateStatus(request, env, statusMatch[1]);
    }
    if (statusMatch && method === 'DELETE') {
      const unauthorized = await requireAdmin(request, env);
      if (unauthorized) return unauthorized;
      return handleDeleteRegistration(env, statusMatch[1]);
    }

    if (path === '/api/admin/settings' && method === 'GET') {
      const unauthorized = await requireAdmin(request, env);
      if (unauthorized) return unauthorized;
      return handleGetSettings(env);
    }

    if (path === '/api/admin/settings' && method === 'PUT') {
      const unauthorized = await requireAdmin(request, env);
      if (unauthorized) return unauthorized;
      return handleSaveSettings(request, env);
    }

    if (path === '/api/tournament' && method === 'GET') return handleGetTournament(env);

    if (path === '/api/admin/tournament' && method === 'PATCH') {
      const unauthorized = await requireAdmin(request, env);
      if (unauthorized) return unauthorized;
      return handlePatchTournament(request, env);
    }

    // Whole-blob saves silently overwrote other admins' entries. Refuse them so
    // a tab still running the old app can't clobber anything until reloaded.
    if (path === '/api/admin/tournament' && method === 'PUT') {
      return json({ error: 'Die App wurde aktualisiert — bitte Seite neu laden.' }, { status: 410 });
    }

    if (path.startsWith('/api/')) return json({ error: 'not found' }, { status: 404 });

    return env.ASSETS.fetch(request);
  },
};
