CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name TEXT NOT NULL,
  players TEXT NOT NULL DEFAULT '[]',
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  recipient_name TEXT,
  bank_name TEXT,
  iban TEXT,
  reference_note TEXT,
  amount TEXT,
  currency TEXT NOT NULL DEFAULT 'CHF',
  deadline TEXT,
  message TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
