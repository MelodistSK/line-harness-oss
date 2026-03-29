import { jstNow } from './utils.js';

export interface QrCodeRow {
  id: string;
  name: string;
  ref_code: string;
  scan_count: number;
  friend_count: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export async function getQrCodes(db: D1Database): Promise<QrCodeRow[]> {
  const result = await db.prepare('SELECT * FROM qr_codes ORDER BY created_at DESC').all<QrCodeRow>();
  return result.results;
}

export async function getQrCodeById(db: D1Database, id: string): Promise<QrCodeRow | null> {
  return db.prepare('SELECT * FROM qr_codes WHERE id = ?').bind(id).first<QrCodeRow>();
}

export async function getQrCodeByRef(db: D1Database, refCode: string): Promise<QrCodeRow | null> {
  return db.prepare('SELECT * FROM qr_codes WHERE ref_code = ?').bind(refCode).first<QrCodeRow>();
}

export async function createQrCode(
  db: D1Database,
  input: { name: string; refCode: string },
): Promise<QrCodeRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare('INSERT INTO qr_codes (id, name, ref_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, input.name, input.refCode, now, now)
    .run();
  return (await getQrCodeById(db, id))!;
}

export async function deleteQrCode(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM qr_codes WHERE id = ?').bind(id).run();
}

export async function incrementQrCodeScan(db: D1Database, refCode: string): Promise<void> {
  await db
    .prepare('UPDATE qr_codes SET scan_count = scan_count + 1, updated_at = ? WHERE ref_code = ?')
    .bind(jstNow(), refCode)
    .run();
}

export async function incrementQrCodeFriend(db: D1Database, refCode: string): Promise<void> {
  await db
    .prepare('UPDATE qr_codes SET friend_count = friend_count + 1, updated_at = ? WHERE ref_code = ?')
    .bind(jstNow(), refCode)
    .run();
}

// --- Analytics queries ---

export interface SourceStat {
  ref_code: string;
  friend_count: number;
}

/** Get friend counts grouped by ref_code */
export async function getSourceStats(db: D1Database, from?: string, to?: string): Promise<SourceStat[]> {
  let sql = `SELECT ref_code, COUNT(*) as friend_count FROM friends WHERE ref_code IS NOT NULL AND ref_code != ''`;
  const params: unknown[] = [];
  if (from) { sql += ` AND created_at >= ?`; params.push(from); }
  if (to) { sql += ` AND created_at <= ?`; params.push(to); }
  sql += ` GROUP BY ref_code ORDER BY friend_count DESC`;
  const result = await db.prepare(sql).bind(...params).all<SourceStat>();
  return result.results;
}

export interface DailyStat {
  date: string;
  ref_code: string;
  count: number;
}

/** Get daily friend additions by ref_code */
export async function getDailySourceStats(db: D1Database, from?: string, to?: string): Promise<DailyStat[]> {
  let sql = `SELECT substr(created_at, 1, 10) as date, ref_code, COUNT(*) as count
             FROM friends WHERE ref_code IS NOT NULL AND ref_code != ''`;
  const params: unknown[] = [];
  if (from) { sql += ` AND created_at >= ?`; params.push(from); }
  if (to) { sql += ` AND created_at <= ?`; params.push(to); }
  sql += ` GROUP BY date, ref_code ORDER BY date ASC`;
  const result = await db.prepare(sql).bind(...params).all<DailyStat>();
  return result.results;
}

export interface AnalyticsSummary {
  totalFriends: number;
  thisMonthAdded: number;
  topSource: string | null;
  topSourceCount: number;
  sourcesCount: number;
}

/** Get analytics summary */
export async function getAnalyticsSummary(db: D1Database): Promise<AnalyticsSummary> {
  const totalRow = await db.prepare('SELECT COUNT(*) as c FROM friends').first<{ c: number }>();
  const total = totalRow?.c ?? 0;

  // This month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthRow = await db
    .prepare('SELECT COUNT(*) as c FROM friends WHERE created_at >= ?')
    .bind(monthStart)
    .first<{ c: number }>();
  const thisMonth = monthRow?.c ?? 0;

  // Top source
  const topRow = await db
    .prepare(`SELECT ref_code, COUNT(*) as c FROM friends WHERE ref_code IS NOT NULL AND ref_code != '' GROUP BY ref_code ORDER BY c DESC LIMIT 1`)
    .first<{ ref_code: string; c: number }>();

  // Sources count
  const srcRow = await db
    .prepare(`SELECT COUNT(DISTINCT ref_code) as c FROM friends WHERE ref_code IS NOT NULL AND ref_code != ''`)
    .first<{ c: number }>();

  return {
    totalFriends: total,
    thisMonthAdded: thisMonth,
    topSource: topRow?.ref_code ?? null,
    topSourceCount: topRow?.c ?? 0,
    sourcesCount: srcRow?.c ?? 0,
  };
}

// --- Ref Scans (QR scan → friend-add matching) ---

export async function recordRefScan(
  db: D1Database,
  refCode: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db
    .prepare('INSERT INTO ref_scans (id, ref_code, ip_address, user_agent, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, refCode, ipAddress, userAgent, now)
    .run();
}

/** Find the most recent unmatched ref scan from the same IP (within 30 minutes) */
export async function matchRefScan(
  db: D1Database,
  ipAddress: string | null,
  friendId: string,
): Promise<string | null> {
  if (!ipAddress) return null;
  // Find most recent unmatched scan from this IP within 30 min
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().replace('Z', '+09:00');
  const row = await db
    .prepare(
      `SELECT id, ref_code FROM ref_scans
       WHERE ip_address = ? AND friend_id IS NULL AND created_at > ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(ipAddress, cutoffStr)
    .first<{ id: string; ref_code: string }>();
  if (!row) return null;
  // Mark as matched
  await db
    .prepare('UPDATE ref_scans SET friend_id = ? WHERE id = ?')
    .bind(friendId, row.id)
    .run();
  return row.ref_code;
}
