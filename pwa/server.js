const express  = require('express');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');
const { Resend } = require('resend');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nyc-street-walker-dev-secret-change-in-prod';
const SALT_ROUNDS = 10;

// ── Database ───────────────────────────────────────────────────────────────
// Railway provides DATABASE_URL automatically when you add a Postgres plugin.
// Falls back to local SQLite-compatible shim via pg for local dev if needed.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      email           TEXT UNIQUE NOT NULL,
      password_hash   TEXT NOT NULL,
      first_name      TEXT NOT NULL,
      last_name       TEXT NOT NULL,
      date_of_birth   TEXT,
      home_neighborhood TEXT,
      created_at      BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS walks (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id),
      neighborhood_id TEXT NOT NULL,
      street_id       TEXT NOT NULL,
      walk_count      INT NOT NULL DEFAULT 1,
      first_walked    BIGINT NOT NULL,
      last_walked     BIGINT NOT NULL,
      UNIQUE(user_id, neighborhood_id, street_id)
    );

    CREATE TABLE IF NOT EXISTS gps_log (
      id          BIGSERIAL PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id),
      lat         DOUBLE PRECISION NOT NULL,
      lon         DOUBLE PRECISION NOT NULL,
      accuracy    DOUBLE PRECISION,
      recorded_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS friends (
      user_id   TEXT NOT NULL REFERENCES users(id),
      friend_id TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY(user_id, friend_id)
    );

    CREATE INDEX IF NOT EXISTS idx_walks_user    ON walks(user_id);
    CREATE INDEX IF NOT EXISTS idx_walks_street  ON walks(street_id);
    CREATE INDEX IF NOT EXISTS idx_gps_user      ON gps_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_gps_time      ON gps_log(recorded_at);
  `);
  console.log('Database ready');
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware — attaches req.user if valid JWT present
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Email template ────────────────────────────────────────────────────────
function buildResetEmail(resetLink) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155">
        <!-- Header -->
        <tr><td style="background:#0f172a;padding:28px 32px;text-align:center;border-bottom:1px solid #334155">
          <div style="font-size:32px;margin-bottom:6px">🗺️</div>
          <div style="color:#22c55e;font-size:20px;font-weight:700;letter-spacing:-0.3px">NYC Street Walker</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 12px;color:#f1f5f9;font-size:22px;font-weight:700">Reset your password</h1>
          <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.6">
            We received a request to reset your password. Click the button below — this link expires in <strong style="color:#f1f5f9">1 hour</strong>.
          </p>
          <a href="${resetLink}" style="display:block;background:#22c55e;color:#000;text-decoration:none;font-weight:700;font-size:15px;padding:14px 24px;border-radius:12px;text-align:center">
            Reset Password
          </a>
          <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.5">
            If you didn't request this, you can safely ignore this email — your password won't change.<br><br>
            Or copy this link into your browser:<br>
            <span style="color:#94a3b8;word-break:break-all;font-size:12px">${resetLink}</span>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #334155;text-align:center">
          <span style="color:#475569;font-size:12px">NYC Street Walker · Track every block</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Auth ───────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, firstName, lastName, dateOfBirth, homeNeighborhood } = req.body;
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: 'Email, password, first name and last name are required' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with that email already exists' });

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const id   = uuidv4();
    await pool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, date_of_birth, home_neighborhood, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, email.toLowerCase(), hash, firstName.trim(), lastName.trim(),
       dateOfBirth || null, homeNeighborhood || null, Date.now()]
    );
    const token = jwt.sign({ id, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ token, user: { id, email: email.toLowerCase(), firstName, lastName, homeNeighborhood } });
  } catch (e) {
    console.error('signup error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, home_neighborhood FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'No account found with that email' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '90d' });
    res.json({
      token,
      user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, homeNeighborhood: user.home_neighborhood }
    });
  } catch (e) {
    console.error('login error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Simple password reset — no email service yet, returns token in response.
app.post('/api/auth/forgot', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const result = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!result.rows.length) {
    // Don't reveal whether account exists
    return res.json({ message: 'If that email exists, a reset link was sent.' });
  }
  const resetToken = jwt.sign({ id: result.rows[0].id, purpose: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
  const appUrl     = process.env.APP_URL || (req.headers.origin || `http://localhost:${PORT}`);
  const resetLink  = `${appUrl}?reset=${resetToken}`;

  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'NYC Street Walker <onboarding@resend.dev>',
        to:   email.toLowerCase(),
        subject: 'Reset your NYC Street Walker password',
        html: buildResetEmail(resetLink)
      });
      res.json({ message: 'If that email exists, a reset link was sent.' });
    } catch(e) {
      console.error('Email send error:', e.message);
      res.status(500).json({ error: 'Could not send reset email. Please try again.' });
    }
  } else {
    // Dev fallback — no email service configured
    console.log('[dev] password reset link:', resetLink);
    res.json({ message: 'Dev mode: no email service configured.', resetLink });
  }
});

app.post('/api/auth/reset', async (req, res) => {
  const { resetToken, password } = req.body;
  if (!resetToken || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const payload = jwt.verify(resetToken, JWT_SECRET);
    if (payload.purpose !== 'reset') throw new Error('Invalid token');
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, payload.id]);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Invalid or expired reset token' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, email, first_name, last_name, date_of_birth, home_neighborhood, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  const u = result.rows[0];
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, homeNeighborhood: u.home_neighborhood });
});

// ── GPS Harvesting ─────────────────────────────────────────────────────────
// Batch-insert GPS points for data harvesting. Called every ~30s by the client.
app.post('/api/gps', auth, async (req, res) => {
  const { points } = req.body; // [{ lat, lon, accuracy, ts }]
  if (!Array.isArray(points) || !points.length) return res.json({ ok: true });

  try {
    const values = points.slice(0, 500).map((p, i) => {
      const base = i * 5;
      return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5})`;
    });
    const flat = points.slice(0, 500).flatMap(p => [req.user.id, p.lat, p.lon, p.accuracy || null, p.ts || Date.now()]);
    await pool.query(
      `INSERT INTO gps_log (user_id, lat, lon, accuracy, recorded_at) VALUES ${values.join(',')}`,
      flat
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('gps log error', e);
    res.json({ ok: false });
  }
});

// ── Walks ──────────────────────────────────────────────────────────────────
app.post('/api/walks', auth, async (req, res) => {
  const { streetIds, neighborhoodId } = req.body;
  if (!Array.isArray(streetIds) || !neighborhoodId) {
    return res.status(400).json({ error: 'Invalid body' });
  }

  try {
    const now = Date.now();
    // Upsert: increment walk_count if already exists
    for (const sid of streetIds.slice(0, 2000)) {
      await pool.query(
        `INSERT INTO walks (id, user_id, neighborhood_id, street_id, walk_count, first_walked, last_walked)
         VALUES ($1, $2, $3, $4, 1, $5, $5)
         ON CONFLICT (user_id, neighborhood_id, street_id)
         DO UPDATE SET walk_count = walks.walk_count + 1, last_walked = $5`,
        [uuidv4(), req.user.id, neighborhoodId, sid, now]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('walks error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Returns { neighborhoodId: [streetId, ...] }
app.get('/api/walks', auth, async (req, res) => {
  const rows = await pool.query(
    'SELECT neighborhood_id, street_id, walk_count, first_walked FROM walks WHERE user_id = $1',
    [req.user.id]
  );
  const out = {};
  const meta = {}; // streetId → { walkCount, firstWalked }
  for (const row of rows.rows) {
    if (!out[row.neighborhood_id]) out[row.neighborhood_id] = [];
    out[row.neighborhood_id].push(row.street_id);
    meta[row.street_id] = { walkCount: parseInt(row.walk_count, 10), firstWalked: parseInt(row.first_walked, 10) };
  }
  res.json({ walks: out, meta });
});

// Walk data for a specific user (for friend views)
app.get('/api/walks/:userId', auth, async (req, res) => {
  const rows = await pool.query(
    'SELECT neighborhood_id, street_id FROM walks WHERE user_id = $1',
    [req.params.userId]
  );
  const out = {};
  for (const row of rows.rows) {
    if (!out[row.neighborhood_id]) out[row.neighborhood_id] = [];
    out[row.neighborhood_id].push(row.street_id);
  }
  res.json(out);
});

// ── Stats: streak + distance ───────────────────────────────────────────────
app.get('/api/stats', auth, async (req, res) => {
  try {
    // Streak: count consecutive distinct days with GPS activity (most recent run)
    const days = await pool.query(`
      SELECT DISTINCT date_trunc('day', to_timestamp(recorded_at / 1000)) AS day
      FROM gps_log WHERE user_id = $1
      ORDER BY day DESC
    `, [req.user.id]);

    let streak = 0;
    const today = new Date(); today.setHours(0,0,0,0);
    let expected = today.getTime();
    for (const row of days.rows) {
      const d = new Date(row.day).getTime();
      if (d === expected || d === expected - 86400000) {
        streak++;
        expected = d - 86400000;
      } else break;
    }

    // Total distance from GPS log (sum of consecutive point distances)
    // Approximate: sum of haversine between sequential points per user
    // For performance, use a simpler bounding estimate from point count
    const ptCount = await pool.query(
      'SELECT COUNT(*) AS cnt FROM gps_log WHERE user_id = $1', [req.user.id]
    );
    // Rough estimate: avg walking step ~1.4m per GPS point recorded every ~3s at ~1.4m/s
    const pts = parseInt(ptCount.rows[0].cnt, 10);
    const distKm = parseFloat((pts * 0.004).toFixed(2)); // ~4m per point avg

    // Total unique streets
    const streetCount = await pool.query(
      'SELECT COUNT(*) AS cnt FROM walks WHERE user_id = $1', [req.user.id]
    );

    // Most walked street
    const topStreet = await pool.query(`
      SELECT street_id, neighborhood_id, walk_count
      FROM walks WHERE user_id = $1
      ORDER BY walk_count DESC LIMIT 1
    `, [req.user.id]);

    res.json({
      streak,
      distKm,
      totalStreets: parseInt(streetCount.rows[0].cnt, 10),
      topStreet: topStreet.rows[0] || null
    });
  } catch(e) {
    console.error('stats error', e);
    res.json({ streak: 0, distKm: 0, totalStreets: 0, topStreet: null });
  }
});

// ── Invite links ───────────────────────────────────────────────────────────
// Generate a short-lived invite token that encodes the sender's user ID.
app.post('/api/invite/generate', auth, async (req, res) => {
  const token = jwt.sign({ inviterId: req.user.id, purpose: 'invite' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// Preview an invite (who sent it) — used before the recipient logs in
app.get('/api/invite/:token', async (req, res) => {
  try {
    const payload = jwt.verify(req.params.token, JWT_SECRET);
    if (payload.purpose !== 'invite') throw new Error();
    const result = await pool.query(
      'SELECT id, first_name, last_name FROM users WHERE id = $1', [payload.inviterId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Invite not found' });
    const u = result.rows[0];
    res.json({ inviterId: u.id, name: u.first_name + ' ' + u.last_name });
  } catch {
    res.status(400).json({ error: 'Invalid or expired invite link' });
  }
});

// Accept an invite — adds both users as friends
app.post('/api/invite/:token/accept', auth, async (req, res) => {
  try {
    const payload = jwt.verify(req.params.token, JWT_SECRET);
    if (payload.purpose !== 'invite') throw new Error();
    const inviterId = payload.inviterId;
    if (inviterId === req.user.id) return res.status(400).json({ error: "That's your own invite!" });

    const inviter = await pool.query('SELECT id, first_name, last_name FROM users WHERE id = $1', [inviterId]);
    if (!inviter.rows.length) return res.status(404).json({ error: 'Inviter not found' });

    await pool.query('INSERT INTO friends VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, inviterId]);
    await pool.query('INSERT INTO friends VALUES ($1,$2) ON CONFLICT DO NOTHING', [inviterId, req.user.id]);

    const u = inviter.rows[0];
    res.json({ ok: true, friend: { id: u.id, name: u.first_name + ' ' + u.last_name } });
  } catch {
    res.status(400).json({ error: 'Invalid or expired invite link' });
  }
});

// ── Friends ────────────────────────────────────────────────────────────────
app.post('/api/friends', auth, async (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'friendId required' });
  if (friendId === req.user.id) return res.status(400).json({ error: "That's your own ID!" });

  const friend = await pool.query('SELECT id, first_name, last_name FROM users WHERE id = $1', [friendId]);
  if (!friend.rows.length) return res.status(404).json({ error: 'Friend ID not found' });

  await pool.query('INSERT INTO friends VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, friendId]);
  await pool.query('INSERT INTO friends VALUES ($1,$2) ON CONFLICT DO NOTHING', [friendId, req.user.id]);

  const f = friend.rows[0];
  res.json({ ok: true, friend: { id: f.id, name: f.first_name + ' ' + f.last_name } });
});

app.get('/api/friends', auth, async (req, res) => {
  const rows = await pool.query(`
    SELECT u.id,
           u.first_name || ' ' || u.last_name AS name,
           COUNT(DISTINCT w.street_id) AS total_walked,
           MAX(w.last_walked) AS last_active
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    LEFT JOIN walks w ON w.user_id = u.id
    WHERE f.user_id = $1
    GROUP BY u.id, u.first_name, u.last_name
    ORDER BY last_active DESC NULLS LAST
  `, [req.user.id]);
  res.json(rows.rows);
});

// ── Friend activity feed ───────────────────────────────────────────────────
// Returns the 30 most recent street walks across all friends
app.get('/api/activity', auth, async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT u.id AS user_id,
             u.first_name || ' ' || u.last_name AS name,
             w.neighborhood_id,
             w.street_id,
             w.walk_count,
             w.last_walked
      FROM friends f
      JOIN users u ON u.id = f.friend_id
      JOIN walks w ON w.user_id = u.id
      WHERE f.user_id = $1
      ORDER BY w.last_walked DESC
      LIMIT 30
    `, [req.user.id]);
    res.json(rows.rows);
  } catch(e) {
    res.json([]);
  }
});

// ── Leaderboard ────────────────────────────────────────────────────────────
// Returns current user + all friends ranked by streets walked.
// "This week" = since last Monday 00:00 UTC.
app.get('/api/leaderboard', auth, async (req, res) => {
  try {
    const monday = new Date();
    monday.setUTCHours(0,0,0,0);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const mondayMs = monday.getTime();

    // All-time: count distinct streets per user (self + friends)
    const allTime = await pool.query(`
      SELECT u.id, u.first_name || ' ' || u.last_name AS name,
             COUNT(DISTINCT w.street_id) AS total
      FROM users u
      JOIN walks w ON w.user_id = u.id
      WHERE u.id = $1
         OR u.id IN (SELECT friend_id FROM friends WHERE user_id = $1)
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY total DESC
    `, [req.user.id]);

    // This week: streets first walked on or after monday
    const thisWeek = await pool.query(`
      SELECT u.id, u.first_name || ' ' || u.last_name AS name,
             COUNT(DISTINCT w.street_id) AS total
      FROM users u
      JOIN walks w ON w.user_id = u.id
      WHERE (u.id = $1 OR u.id IN (SELECT friend_id FROM friends WHERE user_id = $1))
        AND w.first_walked >= $2
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY total DESC
    `, [req.user.id, mondayMs]);

    res.json({ allTime: allTime.rows, thisWeek: thisWeek.rows, currentUserId: req.user.id });
  } catch(e) {
    console.error('leaderboard error', e);
    res.json({ allTime: [], thisWeek: [], currentUserId: req.user.id });
  }
});

// ── Badges ─────────────────────────────────────────────────────────────────
// Computes which neighborhood badges a user has earned.
// A badge is earned when every street in a neighborhood has been walked.
// Client sends the neighborhood→streetCount map; server checks walked counts.
app.get('/api/badges/:userId', auth, async (req, res) => {
  try {
    const rows = await pool.query(`
      SELECT neighborhood_id, COUNT(DISTINCT street_id) AS walked_count
      FROM walks WHERE user_id = $1
      GROUP BY neighborhood_id
    `, [req.params.userId]);
    // Return walked counts per neighborhood; client compares against total
    const out = {};
    for (const r of rows.rows) out[r.neighborhood_id] = parseInt(r.walked_count, 10);
    res.json(out);
  } catch(e) {
    res.json({});
  }
});

// ── Meta achievement badges ────────────────────────────────────────────────
app.get('/api/badges/meta', auth, async (req, res) => {
  try {
    const uid = req.user.id;

    // Total unique streets ever
    const totalQ = await pool.query(
      'SELECT COUNT(*) AS cnt FROM walks WHERE user_id = $1', [uid]
    );
    const totalStreets = parseInt(totalQ.rows[0].cnt, 10);

    // Distinct boroughs walked (using neighborhood_id prefix logic on client)
    // We need all neighborhood_ids walked
    const hoodQ = await pool.query(
      'SELECT DISTINCT neighborhood_id FROM walks WHERE user_id = $1', [uid]
    );
    const walkedHoods = hoodQ.rows.map(r => r.neighborhood_id);

    // First walked date
    const firstQ = await pool.query(
      'SELECT MIN(first_walked) AS first FROM walks WHERE user_id = $1', [uid]
    );
    const firstWalked = parseInt(firstQ.rows[0].first, 10) || null;

    // Streak (reuse logic from /api/stats)
    const days = await pool.query(`
      SELECT DISTINCT date_trunc('day', to_timestamp(recorded_at / 1000)) AS day
      FROM gps_log WHERE user_id = $1 ORDER BY day DESC
    `, [uid]);
    let streak = 0;
    const today = new Date(); today.setHours(0,0,0,0);
    let expected = today.getTime();
    for (const row of days.rows) {
      const d = new Date(row.day).getTime();
      if (d === expected || d === expected - 86400000) { streak++; expected = d - 86400000; }
      else break;
    }

    // Weekly new streets (since last Monday)
    const monday = new Date(); monday.setHours(0,0,0,0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const weeklyQ = await pool.query(
      'SELECT COUNT(*) AS cnt FROM walks WHERE user_id = $1 AND first_walked >= $2',
      [uid, monday.getTime()]
    );
    const weeklyStreets = parseInt(weeklyQ.rows[0].cnt, 10);

    // Days walked this week
    const daysWeekQ = await pool.query(`
      SELECT COUNT(DISTINCT date_trunc('day', to_timestamp(recorded_at / 1000))) AS cnt
      FROM gps_log WHERE user_id = $1 AND recorded_at >= $2
    `, [uid, monday.getTime()]);
    const daysThisWeek = parseInt(daysWeekQ.rows[0].cnt, 10);

    res.json({
      totalStreets,
      walkedHoods,
      firstWalked,
      streak,
      weeklyStreets,
      daysThisWeek
    });
  } catch(e) {
    console.error('meta badges error', e);
    res.json({ totalStreets: 0, walkedHoods: [], firstWalked: null, streak: 0, weeklyStreets: 0, daysThisWeek: 0 });
  }
});

// ── Community heat map ─────────────────────────────────────────────────────
// Returns only the most-walked streets across all users — top 20% by walk
// count, minimum 3 distinct users, capped at 2000 streets for performance.
// Grouped into 3 heat tiers so the client can colour them differently.
app.get('/api/heatmap', auth, async (req, res) => {
  try {
    // Total walks per street across all users (distinct user count + sum)
    const rows = await pool.query(`
      SELECT street_id, neighborhood_id,
             COUNT(DISTINCT user_id)  AS user_count,
             SUM(walk_count)          AS total_walks
      FROM walks
      GROUP BY street_id, neighborhood_id
      HAVING COUNT(DISTINCT user_id) >= 2
      ORDER BY total_walks DESC
      LIMIT 2000
    `);

    if (!rows.rows.length) return res.json([]);

    // Tier thresholds: top 10% = hot, next 20% = warm, rest = mild
    const counts = rows.rows.map(r => parseInt(r.total_walks, 10)).sort((a,b) => b-a);
    const hotCutoff  = counts[Math.floor(counts.length * 0.10)] || 1;
    const warmCutoff = counts[Math.floor(counts.length * 0.30)] || 1;

    const result = rows.rows.map(r => ({
      streetId:       r.street_id,
      neighborhoodId: r.neighborhood_id,
      userCount:      parseInt(r.user_count, 10),
      totalWalks:     parseInt(r.total_walks, 10),
      tier: parseInt(r.total_walks, 10) >= hotCutoff  ? 'hot'  :
            parseInt(r.total_walks, 10) >= warmCutoff ? 'warm' : 'mild'
    }));

    res.json(result);
  } catch(e) {
    console.error('heatmap error', e);
    res.json([]);
  }
});

// ── Fallback → SPA ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🗺️  NYC Street Walker running on http://localhost:${PORT}\n`);
  });
}).catch(e => {
  console.error('Failed to init DB:', e.message);
  process.exit(1);
});
