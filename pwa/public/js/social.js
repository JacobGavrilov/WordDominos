// ── Social + Auth API calls ───────────────────────────────────────────────

function getToken() { return localStorage.getItem('token') || ''; }

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}

// ── Auth ──────────────────────────────────────────────────────────────────

async function apiSignup(firstName, lastName, email, password, dateOfBirth, homeNeighborhood) {
  const r = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName, lastName, email, password, dateOfBirth, homeNeighborhood })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Signup failed');
  return data;
}

async function apiLogin(email, password) {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Login failed');
  return data;
}

async function apiMe() {
  const r = await fetch('/api/auth/me', { headers: authHeaders() });
  if (!r.ok) throw new Error('Not authenticated');
  return r.json();
}

// ── GPS Harvesting ────────────────────────────────────────────────────────

let _gpsBuffer = [];

function bufferGpsPoint(lat, lon, accuracy) {
  _gpsBuffer.push({ lat, lon, accuracy, ts: Date.now() });
  if (_gpsBuffer.length >= 20) flushGpsBuffer();
}

async function flushGpsBuffer() {
  if (!_gpsBuffer.length) return;
  const points = _gpsBuffer.splice(0);
  fetch('/api/gps', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ points })
  }).catch(() => {});
}

// Flush every 30s regardless
setInterval(flushGpsBuffer, 30000);

// ── Walks ─────────────────────────────────────────────────────────────────

async function apiSaveWalkedStreets(streetIds, neighborhoodId) {
  await fetch('/api/walks', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ streetIds: [...streetIds], neighborhoodId })
  });
}

async function apiGetWalkedStreets() {
  const r = await fetch('/api/walks', { headers: authHeaders() });
  if (!r.ok) return {};
  return r.json();
}

async function apiGetFriendWalkedStreets(friendId) {
  const r = await fetch('/api/walks/' + friendId, { headers: authHeaders() });
  if (!r.ok) return {};
  return r.json();
}

// ── Friends ───────────────────────────────────────────────────────────────

async function apiAddFriend(friendId) {
  const r = await fetch('/api/friends', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ friendId })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Could not add friend');
  return data;
}

async function apiGetFriends() {
  const r = await fetch('/api/friends', { headers: authHeaders() });
  if (!r.ok) return [];
  return r.json();
}

// ── Render helpers ────────────────────────────────────────────────────────

const FRIEND_COLORS = ['#3b82f6','#f97316','#a855f7','#ec4899','#06b6d4','#eab308','#f43f5e'];

function friendColor(i) { return FRIEND_COLORS[i % FRIEND_COLORS.length]; }

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function avatarStyle(color) {
  return `background:${color}22;color:${color};`;
}

function renderFriendsList(friends, myWalkedFlat) {
  const container = document.getElementById('friends-list');
  if (!friends.length) {
    container.innerHTML = `<div class="empty-state"><div class="emoji">👥</div><h3>No friends yet</h3><p>Tap + Add to connect using your User ID</p></div>`;
    return;
  }
  const mySet = new Set(myWalkedFlat);
  container.innerHTML = friends.map((f, i) => {
    const color   = friendColor(i);
    const total   = f.total_walked || 0;
    const mutual  = (f.walked_ids || []).filter(id => mySet.has(id)).length;
    return `
    <div class="friend-card">
      <div class="avatar" style="${avatarStyle(color)}">${initials(f.name)}</div>
      <div class="friend-info">
        <div class="friend-name">${escHtml(f.name)}</div>
        <div class="friend-sub">${total} street${total !== 1 ? 's' : ''} walked</div>
      </div>
      ${mutual ? `<div class="mutual-badge">${mutual} mutual</div>` : ''}
    </div>`;
  }).join('');
}

function showAddFriend() {
  document.getElementById('your-user-id').textContent = getCurrentUserId();
  document.getElementById('add-friend-panel').classList.remove('hidden');
}

function hideAddFriend() {
  document.getElementById('add-friend-panel').classList.add('hidden');
  document.getElementById('friend-id-input').value = '';
}

async function addFriendByID() {
  const input = document.getElementById('friend-id-input');
  const friendId = input.value.trim();
  if (!friendId) return;
  try {
    await apiAddFriend(friendId);
    showToast('Friend added! 🎉');
    hideAddFriend();
    loadFriends();
  } catch(e) { showToast(e.message); }
}

function copyMyID() {
  const id = getCurrentUserId();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(id).then(() => showToast('ID copied!'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = id; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showToast('ID copied!');
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
