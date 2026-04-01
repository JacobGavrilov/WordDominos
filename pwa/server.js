const express  = require('express');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');

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
// In production wire SENDGRID_API_KEY / similar to email the token instead.
app.post('/api/auth/forgot', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const result = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!result.rows.length) {
    // Don't reveal whether account exists
    return res.json({ message: 'If that email exists, a reset token was sent.' });
  }
  const resetToken = jwt.sign({ id: result.rows[0].id, purpose: 'reset' }, JWT_SECRET, { expiresIn: '1h' });
  // TODO: send resetToken via email. For now return it directly (dev only).
  const isDev = !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost');
  res.json({
    message: 'Reset token generated.',
    ...(isDev ? { resetToken } : {})
  });
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
    'SELECT neighborhood_id, street_id FROM walks WHERE user_id = $1',
    [req.user.id]
  );
  const out = {};
  for (const row of rows.rows) {
    if (!out[row.neighborhood_id]) out[row.neighborhood_id] = [];
    out[row.neighborhood_id].push(row.street_id);
  }
  res.json(out);
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
    SELECT u.id, u.first_name || ' ' || u.last_name AS name,
           COUNT(w.street_id) AS total_walked
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    LEFT JOIN walks w ON w.user_id = u.id
    WHERE f.user_id = $1
    GROUP BY u.id, u.first_name, u.last_name
  `, [req.user.id]);
  res.json(rows.rows);
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
