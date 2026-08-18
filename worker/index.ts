import { clearSessionCookie, createSessionCookie, requireAdmin, timingSafeEqual, type Env } from './auth';

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

const STATUSES = new Set(['pending', 'contacted', 'paid']);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === '/api/register' && method === 'POST') return handleRegister(request, env);
    if (path === '/api/admin/login' && method === 'POST') return handleLogin(request, env);
    if (path === '/api/admin/logout' && method === 'POST') return handleLogout();

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

    if (path.startsWith('/api/')) return json({ error: 'not found' }, { status: 404 });

    return env.ASSETS.fetch(request);
  },
};
