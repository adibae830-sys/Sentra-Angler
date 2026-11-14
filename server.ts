import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Use Node 22 built-in node:sqlite DatabaseSync
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => {
    exec: (sql: string) => void;
    prepare: (sql: string) => {
      run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
      get: (...params: unknown[]) => Record<string, unknown> | undefined;
      all: (...params: unknown[]) => Array<Record<string, unknown>>;
    };
  };
};

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'sentra_angler.db');
const db = new DatabaseSync(DB_PATH);

const SESSION_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'change-this-to-a-secure-random-string'
    ? process.env.SESSION_SECRET
    : crypto.createHash('sha256').update(`sentra-angler-${DB_PATH}`).digest('hex');

// ============================================================================
// INISIALISASI SKEMA DATABASE SQLITE (CERMIN 7 TABEL SUPABASE)
// ============================================================================
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'anggota' CHECK (role IN ('bendahara', 'anggota')),
    whatsapp TEXT,
    avatar_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    member_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    avatar_url TEXT,
    join_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    profile_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('pemasukan', 'pengeluaran')),
    is_default INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE (name, type)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    transaction_code TEXT NOT NULL UNIQUE,
    transaction_date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('pemasukan', 'pengeluaran')),
    category_id TEXT NOT NULL,
    category_name TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    member_id TEXT,
    related_party TEXT NOT NULL DEFAULT '-',
    description TEXT NOT NULL DEFAULT '',
    created_by TEXT,
    created_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by TEXT,
    deleted_by_name TEXT,
    delete_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    storage_path TEXT,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    file_size INTEGER NOT NULL DEFAULT 0,
    uploaded_by TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id TEXT,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    before_data TEXT,
    after_data TEXT,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY DEFAULT 'community_cash',
    community_name TEXT NOT NULL DEFAULT 'SENTRA ANGLER',
    tagline TEXT NOT NULL DEFAULT 'Transparansi Kas, Solidaritas Anggota',
    max_members INTEGER NOT NULL DEFAULT 30,
    initial_balance REAL NOT NULL DEFAULT 0,
    initial_balance_set INTEGER NOT NULL DEFAULT 0,
    initial_balance_note TEXT,
    initial_balance_set_at TEXT,
    initial_balance_set_by TEXT,
    updated_at TEXT NOT NULL
  );
`);

// Seed settings & default categories (idempotent)
const nowIso = () => new Date().toISOString();
db.prepare(
  `INSERT OR IGNORE INTO settings (id, community_name, tagline, max_members, initial_balance, initial_balance_set, updated_at)
   VALUES ('community_cash', 'SENTRA ANGLER', 'Transparansi Kas, Solidaritas Anggota', 30, 0, 0, ?)`
).run(nowIso());

const defaultCategories: Array<[string, 'pemasukan' | 'pengeluaran', number]> = [
  ['Iuran anggota', 'pemasukan', 1],
  ['Donasi', 'pemasukan', 2],
  ['Sponsor', 'pemasukan', 3],
  ['Kontribusi anggota', 'pemasukan', 4],
  ['Hasil kegiatan', 'pemasukan', 5],
  ['Penjualan', 'pemasukan', 6],
  ['Pemasukan lainnya', 'pemasukan', 7],
  ['Kegiatan mancing', 'pengeluaran', 1],
  ['Konsumsi', 'pengeluaran', 2],
  ['Transportasi', 'pengeluaran', 3],
  ['Sewa tempat', 'pengeluaran', 4],
  ['Peralatan mancing', 'pengeluaran', 5],
  ['Hadiah', 'pengeluaran', 6],
  ['Dokumentasi', 'pengeluaran', 7],
  ['Operasional', 'pengeluaran', 8],
  ['Pengeluaran lainnya', 'pengeluaran', 9],
];

const insertCat = db.prepare(
  `INSERT OR IGNORE INTO categories (id, name, type, is_default, is_active, sort_order, created_at)
   VALUES (?, ?, ?, 1, 1, ?, ?)`
);
for (const [name, type, order] of defaultCategories) {
  insertCat.run(crypto.randomUUID(), name, type, order, nowIso());
}

// ============================================================================
// HELPER AUTENTIKASI & PASSWORD HASHING
// ============================================================================
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, original] = stored.split(':');
  if (!salt || !original) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(original, 'hex'));
}

function signToken(userId: string): string {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): string | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid: string;
      exp: number;
    };
    if (decoded.exp < Date.now()) return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: 'bendahara' | 'anggota';
  whatsapp: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

function sanitizeUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    email: String(row.email),
    full_name: String(row.full_name),
    role: row.role as 'bendahara' | 'anggota',
    whatsapp: row.whatsapp ? String(row.whatsapp) : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieToken = req.headers.cookie
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('sa_token='))
    ?.split('=')[1];
  const token = bearer || cookieToken;
  if (!token) {
    res.status(401).json({ error: 'Sesi login tidak ditemukan. Silakan masuk terlebih dahulu.' });
    return;
  }
  const uid = verifyToken(token);
  if (!uid) {
    res.status(401).json({ error: 'Sesi login telah berakhir. Silakan masuk kembali.' });
    return;
  }
  const userRow = db.prepare(`SELECT * FROM profiles WHERE id = ? AND is_active = 1`).get(uid);
  if (!userRow) {
    res.status(401).json({ error: 'Akun tidak aktif atau tidak ditemukan.' });
    return;
  }
  req.user = sanitizeUser(userRow);
  next();
}

function requireBendahara(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'bendahara') {
    res.status(403).json({
      error: 'Akses ditolak. Hanya Bendahara yang memiliki izin mengelola data ini.',
    });
    return;
  }
  next();
}

function writeAuditLog(params: {
  table_name: string;
  record_id: string;
  action: string;
  actor: AuthUser;
  before_data?: unknown;
  after_data?: unknown;
  summary: string;
}) {
  db.prepare(
    `INSERT INTO audit_logs (id, table_name, record_id, action, actor_id, actor_name, actor_role, before_data, after_data, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    params.table_name,
    params.record_id,
    params.action,
    params.actor.id,
    params.actor.full_name,
    params.actor.role,
    params.before_data ? JSON.stringify(params.before_data) : null,
    params.after_data ? JSON.stringify(params.after_data) : null,
    params.summary,
    nowIso()
  );
}

function computeCashSummary() {
  const settings = db.prepare(`SELECT * FROM settings WHERE id = 'community_cash'`).get() as Record<
    string,
    unknown
  >;
  const sums = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'pemasukan' AND deleted_at IS NULL THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'pengeluaran' AND deleted_at IS NULL THEN amount ELSE 0 END), 0) AS total_expense
       FROM transactions`
    )
    .get() as { total_income: number; total_expense: number };

  const initialBalance = Number(settings?.initial_balance ?? 0);
  const totalIncome = Number(sums?.total_income ?? 0);
  const totalExpense = Number(sums?.total_expense ?? 0);
  return {
    initial_balance: initialBalance,
    initial_balance_set: Boolean(settings?.initial_balance_set),
    total_income: totalIncome,
    total_expense: totalExpense,
    current_balance: initialBalance + totalIncome - totalExpense,
  };
}

function generateTransactionCode(dateStr: string): string {
  const ym = dateStr.slice(0, 7).replace('-', '');
  const prefix = `TRX-${ym}-`;
  const row = db
    .prepare(`SELECT COUNT(*) AS cnt FROM transactions WHERE transaction_code LIKE ?`)
    .get(`${prefix}%`) as { cnt: number };
  const next = Number(row?.cnt ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

function generateMemberCode(): string {
  const rows = db.prepare(`SELECT member_code FROM members`).all() as Array<{ member_code: string }>;
  let maxNum = 0;
  for (const r of rows) {
    const num = parseInt(r.member_code.replace(/\D/g, ''), 10);
    if (!Number.isNaN(num) && num > maxNum) maxNum = num;
  }
  return `ANG-${String(maxNum + 1).padStart(3, '0')}`;
}

// ============================================================================
// EXPRESS + WEBSOCKET SERVER
// ============================================================================
async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  function broadcastRealtime(payload: Record<string, unknown>) {
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ event_type: 'CONNECTED', timestamp: nowIso() }));
  });

  // --------------------------------------------------------------------------
  // AUTH ROUTES
  // --------------------------------------------------------------------------
  app.get('/api/auth/bootstrap-status', (_req, res) => {
    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM profiles`).get() as { cnt: number };
    res.json({ hasUsers: Number(countRow.cnt) > 0 });
  });

  app.post('/api/auth/register', (req, res) => {
    const { email, password, full_name, whatsapp } = req.body as {
      email?: string;
      password?: string;
      full_name?: string;
      whatsapp?: string;
    };
    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'Nama lengkap, email, dan kata sandi wajib diisi.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare(`SELECT id FROM profiles WHERE email = ?`).get(cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'Email sudah terdaftar.' });
      return;
    }
    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM profiles`).get() as { cnt: number };
    const role: 'bendahara' | 'anggota' = Number(countRow.cnt) === 0 ? 'bendahara' : 'anggota';
    const id = crypto.randomUUID();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, full_name, role, whatsapp, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(id, cleanEmail, hashPassword(password), full_name.trim(), role, whatsapp?.trim() || null, ts, ts);

    const user = sanitizeUser(db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(id)!);
    const token = signToken(user.id);
    res.cookie('sa_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400 * 1000 });
    res.status(201).json({ user, token });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const row = db.prepare(`SELECT * FROM profiles WHERE email = ?`).get(cleanEmail);
    if (!row || !verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'Email atau kata sandi salah.' });
      return;
    }
    if (!row.is_active) {
      res.status(403).json({ error: 'Akun Anda dinonaktifkan oleh Bendahara.' });
      return;
    }
    const user = sanitizeUser(row);
    const token = signToken(user.id);
    res.cookie('sa_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400 * 1000 });
    res.json({ user, token });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('sa_token');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  // --------------------------------------------------------------------------
  // SETTINGS & SALDO AWAL
  // --------------------------------------------------------------------------
  app.get('/api/settings', requireAuth, (_req, res) => {
    const row = db.prepare(`SELECT * FROM settings WHERE id = 'community_cash'`).get() as Record<
      string,
      unknown
    >;
    res.json({
      ...row,
      initial_balance: Number(row.initial_balance ?? 0),
      initial_balance_set: Boolean(row.initial_balance_set),
      summary: computeCashSummary(),
    });
  });

  app.post('/api/settings/initial-balance', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { initial_balance, note } = req.body as { initial_balance?: number; note?: string };
    const amount = Number(initial_balance);
    if (Number.isNaN(amount) || amount < 0) {
      res.status(400).json({ error: 'Saldo awal harus berupa angka >= 0.' });
      return;
    }
    const current = db.prepare(`SELECT * FROM settings WHERE id = 'community_cash'`).get() as Record<
      string,
      unknown
    >;
    if (Boolean(current.initial_balance_set)) {
      res.status(400).json({
        error:
          'Saldo awal sudah pernah ditetapkan. Untuk penyesuaian saldo selanjutnya, catat melalui transaksi resmi.',
      });
      return;
    }
    const ts = nowIso();
    db.prepare(
      `UPDATE settings SET initial_balance = ?, initial_balance_set = 1, initial_balance_note = ?, initial_balance_set_at = ?, initial_balance_set_by = ?, updated_at = ?
       WHERE id = 'community_cash'`
    ).run(amount, note?.trim() || 'Saldo awal kas komunitas', ts, req.user!.id, ts);

    const updated = db.prepare(`SELECT * FROM settings WHERE id = 'community_cash'`).get()!;
    writeAuditLog({
      table_name: 'settings',
      record_id: 'community_cash',
      action: 'INITIAL_BALANCE',
      actor: req.user!,
      before_data: { initial_balance: current.initial_balance, initial_balance_set: false },
      after_data: { initial_balance: amount, initial_balance_set: true, note: note || '' },
      summary: `Menetapkan saldo awal kas sebesar Rp ${amount.toLocaleString('id-ID')}`,
    });

    broadcastRealtime({
      id: crypto.randomUUID(),
      event_type: 'BALANCE_INITIALIZED',
      title: 'Saldo Awal Ditetapkan',
      message: `${req.user!.full_name} menetapkan saldo awal kas sebesar Rp ${amount.toLocaleString('id-ID')}`,
      amount,
      actor_name: req.user!.full_name,
      created_at: ts,
    });

    res.json({
      ...updated,
      initial_balance: Number(updated.initial_balance),
      initial_balance_set: Boolean(updated.initial_balance_set),
      summary: computeCashSummary(),
    });
  });

  // --------------------------------------------------------------------------
  // PROFILES / USER ROLE MANAGEMENT (BENDAHARA ONLY FOR MUTATIONS)
  // --------------------------------------------------------------------------
  app.get('/api/users', requireAuth, (_req, res) => {
    const rows = db
      .prepare(`SELECT id, email, full_name, role, whatsapp, avatar_url, is_active, created_at FROM profiles ORDER BY created_at ASC`)
      .all();
    res.json(rows.map((r) => sanitizeUser(r)));
  });

  app.post('/api/users', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { email, password, full_name, role, whatsapp } = req.body as {
      email?: string;
      password?: string;
      full_name?: string;
      role?: 'bendahara' | 'anggota';
      whatsapp?: string;
    };
    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'Email, kata sandi, dan nama lengkap wajib diisi.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare(`SELECT id FROM profiles WHERE email = ?`).get(cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'Email pengguna sudah terdaftar.' });
      return;
    }
    const id = crypto.randomUUID();
    const ts = nowIso();
    const validRole = role === 'bendahara' ? 'bendahara' : 'anggota';
    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, full_name, role, whatsapp, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(id, cleanEmail, hashPassword(password), full_name.trim(), validRole, whatsapp?.trim() || null, ts, ts);

    const created = sanitizeUser(db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(id)!);
    writeAuditLog({
      table_name: 'profiles',
      record_id: id,
      action: 'ROLE_CHANGE',
      actor: req.user!,
      after_data: created,
      summary: `Menambahkan akun pengguna ${created.full_name} (${created.role})`,
    });
    res.status(201).json(created);
  });

  app.patch('/api/users/:id', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { role, is_active, full_name, whatsapp } = req.body as {
      role?: 'bendahara' | 'anggota';
      is_active?: boolean;
      full_name?: string;
      whatsapp?: string;
    };
    const existingRow = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(id);
    if (!existingRow) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }
    const before = sanitizeUser(existingRow);
    // Prevent self-demotion if last active bendahara
    if (id === req.user!.id && (role === 'anggota' || is_active === false)) {
      const bendaharaCount = db
        .prepare(`SELECT COUNT(*) AS cnt FROM profiles WHERE role = 'bendahara' AND is_active = 1`)
        .get() as { cnt: number };
      if (Number(bendaharaCount.cnt) <= 1) {
        res.status(400).json({ error: 'Minimal harus ada 1 Bendahara aktif dalam sistem.' });
        return;
      }
    }
    const nextRole = role ?? before.role;
    const nextActive = is_active !== undefined ? (is_active ? 1 : 0) : before.is_active ? 1 : 0;
    const nextName = full_name?.trim() || before.full_name;
    const nextWa = whatsapp !== undefined ? whatsapp : before.whatsapp;
    db.prepare(
      `UPDATE profiles SET role = ?, is_active = ?, full_name = ?, whatsapp = ?, updated_at = ? WHERE id = ?`
    ).run(nextRole, nextActive, nextName, nextWa, nowIso(), id);

    const after = sanitizeUser(db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(id)!);
    writeAuditLog({
      table_name: 'profiles',
      record_id: id,
      action: 'ROLE_CHANGE',
      actor: req.user!,
      before_data: before,
      after_data: after,
      summary: `Memperbarui akses pengguna ${after.full_name} (${after.role}, ${after.is_active ? 'Aktif' : 'Nonaktif'})`,
    });
    res.json(after);
  });

  // --------------------------------------------------------------------------
  // MEMBERS (MAX 30 ANGGOTA)
  // --------------------------------------------------------------------------
  app.get('/api/members', requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT m.*,
          COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.member_id = m.id AND t.type = 'pemasukan' AND t.deleted_at IS NULL), 0) AS total_contribution,
          COALESCE((SELECT COUNT(*) FROM transactions t WHERE t.member_id = m.id AND t.deleted_at IS NULL), 0) AS transaction_count
         FROM members m
         ORDER BY m.member_code ASC`
      )
      .all();
    res.json(rows);
  });

  app.post('/api/members', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM members`).get() as { cnt: number };
    if (Number(countRow.cnt) >= 30) {
      res.status(400).json({ error: 'Batas maksimal 30 anggota komunitas SENTRA ANGLER telah tercapai.' });
      return;
    }
    const { full_name, whatsapp, avatar_url, join_date, status, notes } = req.body as {
      full_name?: string;
      whatsapp?: string;
      avatar_url?: string;
      join_date?: string;
      status?: 'active' | 'inactive';
      notes?: string;
    };
    if (!full_name || !whatsapp) {
      res.status(400).json({ error: 'Nama lengkap dan nomor WhatsApp anggota wajib diisi.' });
      return;
    }
    const id = crypto.randomUUID();
    const memberCode = generateMemberCode();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO members (id, member_code, full_name, whatsapp, avatar_url, join_date, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      memberCode,
      full_name.trim(),
      whatsapp.trim(),
      avatar_url || null,
      join_date || ts.slice(0, 10),
      status === 'inactive' ? 'inactive' : 'active',
      notes?.trim() || null,
      ts,
      ts
    );

    const created = db.prepare(`SELECT * FROM members WHERE id = ?`).get(id)!;
    writeAuditLog({
      table_name: 'members',
      record_id: id,
      action: 'MEMBER_CHANGE',
      actor: req.user!,
      after_data: created,
      summary: `Menambahkan anggota baru ${full_name.trim()} (${memberCode})`,
    });
    res.status(201).json({ ...created, total_contribution: 0, transaction_count: 0 });
  });

  app.put('/api/members/:id', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { id } = req.params;
    const before = db.prepare(`SELECT * FROM members WHERE id = ?`).get(id);
    if (!before) {
      res.status(404).json({ error: 'Data anggota tidak ditemukan.' });
      return;
    }
    const { full_name, whatsapp, avatar_url, join_date, status, notes } = req.body as {
      full_name?: string;
      whatsapp?: string;
      avatar_url?: string | null;
      join_date?: string;
      status?: 'active' | 'inactive';
      notes?: string;
    };
    db.prepare(
      `UPDATE members SET full_name = ?, whatsapp = ?, avatar_url = ?, join_date = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?`
    ).run(
      full_name?.trim() || before.full_name,
      whatsapp?.trim() || before.whatsapp,
      avatar_url !== undefined ? avatar_url : before.avatar_url,
      join_date || before.join_date,
      status || before.status,
      notes !== undefined ? notes : before.notes,
      nowIso(),
      id
    );

    const after = db.prepare(`SELECT * FROM members WHERE id = ?`).get(id)!;
    writeAuditLog({
      table_name: 'members',
      record_id: id,
      action: 'MEMBER_CHANGE',
      actor: req.user!,
      before_data: before,
      after_data: after,
      summary: `Memperbarui data anggota ${after.full_name} (${after.member_code})`,
    });
    res.json(after);
  });

  // --------------------------------------------------------------------------
  // CATEGORIES
  // --------------------------------------------------------------------------
  app.get('/api/categories', requireAuth, (_req, res) => {
    const rows = db
      .prepare(`SELECT * FROM categories ORDER BY type ASC, sort_order ASC, name ASC`)
      .all()
      .map((r) => ({ ...r, is_default: Boolean(r.is_default), is_active: Boolean(r.is_active) }));
    res.json(rows);
  });

  app.post('/api/categories', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { name, type } = req.body as { name?: string; type?: 'pemasukan' | 'pengeluaran' };
    if (!name || (type !== 'pemasukan' && type !== 'pengeluaran')) {
      res.status(400).json({ error: 'Nama kategori dan jenis (pemasukan/pengeluaran) wajib diisi.' });
      return;
    }
    const existing = db
      .prepare(`SELECT id FROM categories WHERE lower(name) = lower(?) AND type = ?`)
      .get(name.trim(), type);
    if (existing) {
      res.status(409).json({ error: 'Kategori sudah ada pada jenis transaksi tersebut.' });
      return;
    }
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO categories (id, name, type, is_default, is_active, sort_order, created_at)
       VALUES (?, ?, ?, 0, 1, 99, ?)`
    ).run(id, name.trim(), type, nowIso());
    const created = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id)!;
    writeAuditLog({
      table_name: 'categories',
      record_id: id,
      action: 'CATEGORY_CHANGE',
      actor: req.user!,
      after_data: created,
      summary: `Menambahkan kategori ${type}: ${name.trim()}`,
    });
    res.status(201).json({ ...created, is_default: false, is_active: true });
  });

  app.patch('/api/categories/:id', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { id } = req.params;
    const before = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id);
    if (!before) {
      res.status(404).json({ error: 'Kategori tidak ditemukan.' });
      return;
    }
    const { name, is_active } = req.body as { name?: string; is_active?: boolean };
    db.prepare(`UPDATE categories SET name = ?, is_active = ? WHERE id = ?`).run(
      name?.trim() || before.name,
      is_active !== undefined ? (is_active ? 1 : 0) : before.is_active,
      id
    );
    const after = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(id)!;
    writeAuditLog({
      table_name: 'categories',
      record_id: id,
      action: 'CATEGORY_CHANGE',
      actor: req.user!,
      before_data: before,
      after_data: after,
      summary: `Mengubah kategori ${after.name} (${after.is_active ? 'Aktif' : 'Nonaktif'})`,
    });
    res.json({ ...after, is_default: Boolean(after.is_default), is_active: Boolean(after.is_active) });
  });

  // --------------------------------------------------------------------------
  // FILE UPLOAD (BUKTI TRANSAKSI & AVATAR)
  // --------------------------------------------------------------------------
  app.post('/api/uploads', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { file_name, mime_type, base64_data } = req.body as {
      file_name?: string;
      mime_type?: string;
      base64_data?: string;
    };
    if (!file_name || !base64_data) {
      res.status(400).json({ error: 'Data file tidak valid.' });
      return;
    }
    const cleanBase64 = base64_data.includes(',') ? base64_data.split(',')[1] : base64_data;
    const buf = Buffer.from(cleanBase64, 'base64');
    if (buf.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Ukuran file maksimal 5 MB.' });
      return;
    }
    const safeExt = path.extname(file_name).replace(/[^a-zA-Z0-9.]/g, '') || '.jpg';
    const storedName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${safeExt}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, storedName), buf);
    res.status(201).json({
      file_name,
      file_url: `/uploads/${storedName}`,
      storage_path: storedName,
      mime_type: mime_type || 'image/jpeg',
      file_size: buf.length,
    });
  });

  // --------------------------------------------------------------------------
  // TRANSACTIONS (CRUD + SOFT DELETE + AUDIT LOG + REALTIME)
  // --------------------------------------------------------------------------
  app.get('/api/transactions', requireAuth, (req, res) => {
    const includeDeleted = req.query.includeDeleted === 'true';
    const whereClause = includeDeleted ? '' : 'WHERE t.deleted_at IS NULL';
    const rows = db
      .prepare(
        `SELECT t.* FROM transactions t ${whereClause} ORDER BY t.transaction_date DESC, t.created_at DESC`
      )
      .all();
    const attachments = db.prepare(`SELECT * FROM attachments`).all();
    const attByTx = new Map<string, Array<Record<string, unknown>>>();
    for (const a of attachments) {
      const txId = String(a.transaction_id);
      if (!attByTx.has(txId)) attByTx.set(txId, []);
      attByTx.get(txId)!.push(a);
    }
    const enriched = rows.map((t) => ({
      ...t,
      amount: Number(t.amount),
      attachments: attByTx.get(String(t.id)) ?? [],
    }));
    res.json({ transactions: enriched, summary: computeCashSummary() });
  });

  app.post('/api/transactions', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const {
      transaction_date,
      type,
      category_id,
      amount,
      member_id,
      related_party,
      description,
      attachment,
    } = req.body as {
      transaction_date?: string;
      type?: 'pemasukan' | 'pengeluaran';
      category_id?: string;
      amount?: number;
      member_id?: string | null;
      related_party?: string;
      description?: string;
      attachment?: {
        file_name: string;
        file_url: string;
        storage_path?: string;
        mime_type: string;
        file_size: number;
      } | null;
    };

    const numAmount = Number(amount);
    if (!transaction_date || (type !== 'pemasukan' && type !== 'pengeluaran') || !category_id) {
      res.status(400).json({ error: 'Tanggal, jenis transaksi, dan kategori wajib diisi.' });
      return;
    }
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'Nominal transaksi harus lebih dari 0.' });
      return;
    }
    const cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(category_id);
    if (!cat) {
      res.status(400).json({ error: 'Kategori tidak valid.' });
      return;
    }

    let partyName = related_party?.trim() || '-';
    if (member_id) {
      const member = db.prepare(`SELECT full_name FROM members WHERE id = ?`).get(member_id);
      if (member) partyName = String(member.full_name);
    }

    const id = crypto.randomUUID();
    const txCode = generateTransactionCode(transaction_date);
    const ts = nowIso();
    db.prepare(
      `INSERT INTO transactions (id, transaction_code, transaction_date, type, category_id, category_name, amount, member_id, related_party, description, created_by, created_by_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      txCode,
      transaction_date,
      type,
      category_id,
      String(cat.name),
      numAmount,
      member_id || null,
      partyName,
      description?.trim() || '',
      req.user!.id,
      req.user!.full_name,
      ts,
      ts
    );

    if (attachment?.file_url) {
      db.prepare(
        `INSERT INTO attachments (id, transaction_id, file_name, file_url, storage_path, mime_type, file_size, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        id,
        attachment.file_name,
        attachment.file_url,
        attachment.storage_path || null,
        attachment.mime_type,
        attachment.file_size,
        req.user!.id,
        ts
      );
    }

    const created = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id)!;
    const atts = db.prepare(`SELECT * FROM attachments WHERE transaction_id = ?`).all(id);
    const resultTx = { ...created, amount: Number(created.amount), attachments: atts };

    writeAuditLog({
      table_name: 'transactions',
      record_id: id,
      action: 'CREATE',
      actor: req.user!,
      after_data: resultTx,
      summary: `Mencatat ${type} ${txCode} (${cat.name}) sebesar Rp ${numAmount.toLocaleString('id-ID')}`,
    });

    broadcastRealtime({
      id: crypto.randomUUID(),
      event_type: 'TRANSACTION_CREATED',
      title: type === 'pemasukan' ? 'Kas Masuk Baru' : 'Pengeluaran Baru',
      message: `${cat.name} · ${partyName} — Rp ${numAmount.toLocaleString('id-ID')}`,
      transaction_type: type,
      amount: numAmount,
      actor_name: req.user!.full_name,
      created_at: ts,
    });

    res.status(201).json({ transaction: resultTx, summary: computeCashSummary() });
  });

  app.put('/api/transactions/:id', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { id } = req.params;
    const before = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id);
    if (!before) {
      res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
      return;
    }
    if (before.deleted_at) {
      res.status(400).json({ error: 'Transaksi yang sudah diarsipkan tidak dapat diedit.' });
      return;
    }

    const {
      transaction_date,
      type,
      category_id,
      amount,
      member_id,
      related_party,
      description,
      attachment,
    } = req.body as {
      transaction_date?: string;
      type?: 'pemasukan' | 'pengeluaran';
      category_id?: string;
      amount?: number;
      member_id?: string | null;
      related_party?: string;
      description?: string;
      attachment?: {
        file_name: string;
        file_url: string;
        storage_path?: string;
        mime_type: string;
        file_size: number;
      } | null;
    };

    const nextType = type ?? (before.type as 'pemasukan' | 'pengeluaran');
    const nextCatId = category_id ?? String(before.category_id);
    const cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(nextCatId);
    if (!cat) {
      res.status(400).json({ error: 'Kategori tidak valid.' });
      return;
    }
    const nextAmount = amount !== undefined ? Number(amount) : Number(before.amount);
    if (Number.isNaN(nextAmount) || nextAmount <= 0) {
      res.status(400).json({ error: 'Nominal harus lebih dari 0.' });
      return;
    }

    let partyName = related_party !== undefined ? related_party.trim() || '-' : String(before.related_party);
    const nextMemberId = member_id !== undefined ? member_id : (before.member_id as string | null);
    if (nextMemberId) {
      const m = db.prepare(`SELECT full_name FROM members WHERE id = ?`).get(nextMemberId);
      if (m) partyName = String(m.full_name);
    }

    const ts = nowIso();
    db.prepare(
      `UPDATE transactions SET transaction_date = ?, type = ?, category_id = ?, category_name = ?, amount = ?, member_id = ?, related_party = ?, description = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      transaction_date || before.transaction_date,
      nextType,
      nextCatId,
      String(cat.name),
      nextAmount,
      nextMemberId || null,
      partyName,
      description !== undefined ? description.trim() : before.description,
      ts,
      id
    );

    if (attachment?.file_url) {
      db.prepare(`DELETE FROM attachments WHERE transaction_id = ?`).run(id);
      db.prepare(
        `INSERT INTO attachments (id, transaction_id, file_name, file_url, storage_path, mime_type, file_size, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        id,
        attachment.file_name,
        attachment.file_url,
        attachment.storage_path || null,
        attachment.mime_type,
        attachment.file_size,
        req.user!.id,
        ts
      );
    }

    const after = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id)!;
    const atts = db.prepare(`SELECT * FROM attachments WHERE transaction_id = ?`).all(id);
    const resultTx = { ...after, amount: Number(after.amount), attachments: atts };

    writeAuditLog({
      table_name: 'transactions',
      record_id: id,
      action: 'UPDATE',
      actor: req.user!,
      before_data: { ...before, amount: Number(before.amount) },
      after_data: resultTx,
      summary: `Mengubah transaksi ${before.transaction_code} (${cat.name}) menjadi Rp ${nextAmount.toLocaleString('id-ID')}`,
    });

    broadcastRealtime({
      id: crypto.randomUUID(),
      event_type: 'TRANSACTION_UPDATED',
      title: 'Transaksi Diperbarui',
      message: `${before.transaction_code} · ${cat.name} diperbarui ke Rp ${nextAmount.toLocaleString('id-ID')}`,
      transaction_type: nextType,
      amount: nextAmount,
      actor_name: req.user!.full_name,
      created_at: ts,
    });

    res.json({ transaction: resultTx, summary: computeCashSummary() });
  });

  // Soft delete (moves to archive)
  app.delete('/api/transactions/:id', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { id } = req.params;
    const { reason } = req.body as { reason?: string };
    const before = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id);
    if (!before) {
      res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
      return;
    }
    if (before.deleted_at) {
      res.status(400).json({ error: 'Transaksi sudah berada di arsip.' });
      return;
    }
    const ts = nowIso();
    const deleteReason = reason?.trim() || 'Dihapus oleh Bendahara';
    db.prepare(
      `UPDATE transactions SET deleted_at = ?, deleted_by = ?, deleted_by_name = ?, delete_reason = ?, updated_at = ? WHERE id = ?`
    ).run(ts, req.user!.id, req.user!.full_name, deleteReason, ts, id);

    const after = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id)!;
    writeAuditLog({
      table_name: 'transactions',
      record_id: id,
      action: 'SOFT_DELETE',
      actor: req.user!,
      before_data: { ...before, amount: Number(before.amount) },
      after_data: { ...after, amount: Number(after.amount) },
      summary: `Mengarsipkan transaksi ${before.transaction_code} (${before.category_name}) — Alasan: ${deleteReason}`,
    });

    broadcastRealtime({
      id: crypto.randomUUID(),
      event_type: 'TRANSACTION_DELETED',
      title: 'Transaksi Diarsipkan',
      message: `${before.transaction_code} · ${before.category_name} dipindahkan ke arsip`,
      transaction_type: before.type as 'pemasukan' | 'pengeluaran',
      amount: Number(before.amount),
      actor_name: req.user!.full_name,
      created_at: ts,
    });

    res.json({ ok: true, summary: computeCashSummary() });
  });

  // Restore soft-deleted transaction
  app.post('/api/transactions/:id/restore', requireAuth, requireBendahara, (req: AuthedRequest, res) => {
    const { id } = req.params;
    const before = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id);
    if (!before || !before.deleted_at) {
      res.status(404).json({ error: 'Transaksi arsip tidak ditemukan.' });
      return;
    }
    const ts = nowIso();
    db.prepare(
      `UPDATE transactions SET deleted_at = NULL, deleted_by = NULL, deleted_by_name = NULL, delete_reason = NULL, updated_at = ? WHERE id = ?`
    ).run(ts, id);

    const after = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id)!;
    writeAuditLog({
      table_name: 'transactions',
      record_id: id,
      action: 'RESTORE',
      actor: req.user!,
      before_data: { ...before, amount: Number(before.amount) },
      after_data: { ...after, amount: Number(after.amount) },
      summary: `Memulihkan transaksi ${before.transaction_code} dari arsip`,
    });

    broadcastRealtime({
      id: crypto.randomUUID(),
      event_type: 'TRANSACTION_RESTORED',
      title: 'Transaksi Dipulihkan',
      message: `${before.transaction_code} · ${before.category_name} dipulihkan ke buku kas`,
      transaction_type: before.type as 'pemasukan' | 'pengeluaran',
      amount: Number(before.amount),
      actor_name: req.user!.full_name,
      created_at: ts,
    });

    res.json({ ok: true, summary: computeCashSummary() });
  });

  // --------------------------------------------------------------------------
  // AUDIT LOGS
  // --------------------------------------------------------------------------
  app.get('/api/audit-logs', requireAuth, (_req, res) => {
    const rows = db.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 300`).all();
    const parsed = rows.map((r) => ({
      ...r,
      before_data: r.before_data ? JSON.parse(String(r.before_data)) : null,
      after_data: r.after_data ? JSON.parse(String(r.after_data)) : null,
    }));
    res.json(parsed);
  });

  // --------------------------------------------------------------------------
  // VITE / STATIC FRONTEND MOUNT
  // --------------------------------------------------------------------------
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SENTRA ANGLER server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
