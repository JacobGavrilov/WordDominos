const express = require('express');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database ───────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS walks (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    neighborhood_id TEXT NOT NULL,
    street_id       TEXT NOT NULL,
    walked_at       INTEGER NOT NULL,
    UNIQUE(user_id, neighborhood_id, street_id)
  );

  CREATE TABLE IF NOT EXISTS friends (
    user_id   TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    PRIMARY KEY(user_id, friend_id)
  );
`);

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Users ──────────────────────────────────────────────────────────────────
app.post('/api/users', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)').run(id, name.trim().slice(0,50), Date.now());
  res.json({ id, name: name.trim() });
});

app.get('/api/users/:id', (req, res) => {
  const user = db.prepare('SELECT id, name, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(user);
});

// ── Walks ──────────────────────────────────────────────────────────────────
app.post('/api/walks', (req, res) => {
  const { userId, streetIds, neighborhoodId } = req.body;
  if (!userId || !Array.isArray(streetIds) || !neighborhoodId) {
    return res.status(400).json({ error: 'Invalid body' });
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO walks (id, user_id, neighborhood_id, street_id, walked_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction(ids => {
    for (const sid of ids) {
      insert.run(uuidv4(), userId, neighborhoodId, sid, Date.now());
    }
  });
  insertMany(streetIds.slice(0, 2000)); // safety cap
  res.json({ ok: true, saved: streetIds.length });
});

// Returns { neighborhoodId: [streetId, ...] }
app.get('/api/walks/:userId', (req, res) => {
  const rows = db.prepare(
    'SELECT neighborhood_id, street_id FROM walks WHERE user_id = ?'
  ).all(req.params.userId);

  const out = {};
  for (const row of rows) {
    if (!out[row.neighborhood_id]) out[row.neighborhood_id] = [];
    out[row.neighborhood_id].push(row.street_id);
  }
  res.json(out);
});

// ── Friends ────────────────────────────────────────────────────────────────
app.post('/api/friends', (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId) return res.status(400).json({ error: 'userId and friendId required' });

  const friend = db.prepare('SELECT id, name FROM users WHERE id = ?').get(friendId);
  if (!friend) return res.status(404).json({ error: 'Friend ID not found. Make sure they have the app and shared their ID.' });

  db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)').run(userId, friendId);
  db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)').run(friendId, userId);

  res.json({ ok: true, friend });
});

app.get('/api/friends/:userId', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name,
           COUNT(w.street_id) AS total_walked
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    LEFT JOIN walks w ON w.user_id = u.id
    WHERE f.user_id = ?
    GROUP BY u.id
  `).all(req.params.userId);
  res.json(rows);
});

// ── Fallback → SPA ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🗺️  NYC Street Walker running on http://localhost:${PORT}\n`);
});
