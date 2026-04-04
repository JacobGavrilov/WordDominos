// ── Social + Auth API calls ───────────────────────────────────────────────

function getToken() { return localStorage.getItem('token') || ''; }
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}

// ── Auth ──────────────────────────────────────────────────────────────────

async function apiSignup(firstName, lastName, email, password, dateOfBirth, homeNeighborhood) {
  const r = await fetch('/api/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName, lastName, email, password, dateOfBirth, homeNeighborhood })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Signup failed');
  return data;
}

async function apiLogin(email, password) {
  const r = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ points })
  }).catch(() => {});
}

setInterval(flushGpsBuffer, 30000);

// ── Walks ─────────────────────────────────────────────────────────────────

async function apiSaveWalkedStreets(streetIds, neighborhoodId) {
  await fetch('/api/walks', {
    method: 'POST', headers: authHeaders(),
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

// ── Invite links ──────────────────────────────────────────────────────────

let _inviteToken   = null;  // generated token for sharing
let _pendingInvite = null;  // token from URL waiting to be accepted

async function generateInviteLink() {
  const r = await fetch('/api/invite/generate', { method: 'POST', headers: authHeaders() });
  const data = await r.json();
  _inviteToken = data.token;
  const url = window.location.origin + '/?invite=' + data.token;
  document.getElementById('invite-link-text').textContent = url;
  document.getElementById('invite-share-btn').dataset.url = url;
  return url;
}

async function shareInviteLink() {
  const url = document.getElementById('invite-share-btn').dataset.url
    || await generateInviteLink();
  if (navigator.share) {
    navigator.share({ title: 'Join me on NYC Street Walker', text: 'Walk NYC streets together!', url }).catch(() => {});
  } else {
    navigator.clipboard && navigator.clipboard.writeText(url).then(() => showToast('Invite link copied!'));
  }
}

// Check URL for incoming invite token on load
function checkInviteInURL() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('invite');
  if (!token) return;
  _pendingInvite = token;
  // Clean URL
  window.history.replaceState({}, '', '/');
  // Preview invite
  fetch('/api/invite/' + token)
    .then(r => r.json())
    .then(data => {
      if (data.name) {
        const banner = document.getElementById('invite-banner');
        document.getElementById('invite-banner-text').textContent = `${data.name} invited you to connect 🎉`;
        banner.classList.remove('hidden');
      }
    }).catch(() => {});
}

async function acceptPendingInvite() {
  if (!_pendingInvite) return;
  try {
    const r    = await fetch('/api/invite/' + _pendingInvite + '/accept', { method: 'POST', headers: authHeaders() });
    const data = await r.json();
    if (!r.ok) { showToast(data.error || 'Could not accept invite'); return; }
    showToast(`You and ${data.friend.name} are now friends! 🎉`);
    document.getElementById('invite-banner').classList.add('hidden');
    _pendingInvite = null;
    loadFriends();
  } catch(e) { showToast('Error accepting invite'); }
}

// ── Friends API ───────────────────────────────────────────────────────────

async function apiAddFriend(friendId) {
  const r = await fetch('/api/friends', {
    method: 'POST', headers: authHeaders(),
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

async function apiGetActivity() {
  const r = await fetch('/api/activity', { headers: authHeaders() });
  if (!r.ok) return [];
  return r.json();
}

// ── Color helpers ─────────────────────────────────────────────────────────

const FRIEND_COLORS = ['#3b82f6','#f97316','#a855f7','#ec4899','#06b6d4','#eab308','#f43f5e'];
function friendColor(i) { return FRIEND_COLORS[i % FRIEND_COLORS.length]; }
function initials(name) { return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function avatarStyle(color) { return `background:${color}22;color:${color};`; }

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - Number(ts);
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(Number(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Render friends list ───────────────────────────────────────────────────

function renderFriendsList(friends, myWalkedFlat) {
  const container = document.getElementById('friends-list');
  if (!friends.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">👥</div>
        <h3>No friends yet</h3>
        <p>Tap <strong>+ Invite</strong> to send a link to a friend</p>
      </div>`;
    return;
  }
  const mySet = new Set(myWalkedFlat);
  container.innerHTML = friends.map((f, i) => {
    const color  = friendColor(i);
    const total  = parseInt(f.total_walked) || 0;
    const mutual = (f.walked_ids || []).filter(id => mySet.has(id)).length;
    const ago    = timeAgo(f.last_active);
    return `
    <div class="friend-card" onclick="openFriendDetail('${f.id}', ${i})">
      <div class="avatar" style="${avatarStyle(color)}">${initials(f.name)}</div>
      <div class="friend-info">
        <div class="friend-name">${escHtml(f.name)}</div>
        <div class="friend-sub">${total} streets${ago ? ' · ' + ago : ''}</div>
      </div>
      ${mutual ? `<div class="mutual-badge">${mutual} mutual</div>` : ''}
    </div>`;
  }).join('');
}

// ── Activity feed ─────────────────────────────────────────────────────────

async function renderActivityFeed() {
  const container = document.getElementById('activity-feed');
  container.innerHTML = '<div class="empty-state"><div class="emoji">⏳</div><h3>Loading…</h3></div>';

  const items = await apiGetActivity().catch(() => []);
  if (!items.length) {
    container.innerHTML = '<div class="empty-state"><div class="emoji">🏃</div><h3>No activity yet</h3><p>Activity shows up when friends walk new streets</p></div>';
    return;
  }

  // Group by user + neighborhood + day
  const grouped = {};
  for (const item of items) {
    const day = new Date(Number(item.last_walked)).toDateString();
    const key = `${item.user_id}|${item.neighborhood_id}|${day}`;
    if (!grouped[key]) grouped[key] = { ...item, count: 0 };
    grouped[key].count++;
  }

  const friendIndexMap = {};
  friendsData.forEach((f, i) => { friendIndexMap[f.id] = i; });

  container.innerHTML = '<div style="padding:10px 16px 4px">' +
    Object.values(grouped).slice(0, 20).map(g => {
      const i     = friendIndexMap[g.user_id] ?? 0;
      const color = friendColor(i);
      const hood  = NYC_NEIGHBORHOODS.find(h => h.id === g.neighborhood_id);
      const hoodName = hood ? hood.name : g.neighborhood_id;
      return `
      <div class="activity-item">
        <div class="activity-dot" style="background:${color}"></div>
        <div class="activity-text">
          <strong>${escHtml(g.name)}</strong> walked ${g.count} street${g.count !== 1 ? 's' : ''} in ${escHtml(hoodName)}
        </div>
        <div class="activity-time">${timeAgo(g.last_walked)}</div>
      </div>`;
    }).join('') + '</div>';
}

// ── Add/invite friend panel ───────────────────────────────────────────────

function showAddFriend() {
  document.getElementById('your-user-id') && (document.getElementById('your-user-id').textContent = getCurrentUserId());
  const panel = document.getElementById('add-friend-panel');
  panel.classList.remove('hidden');
  // Generate invite link immediately
  generateInviteLink().catch(() => {
    document.getElementById('invite-link-text').textContent = 'Could not generate link';
  });
}

function hideAddFriend() {
  document.getElementById('add-friend-panel').classList.add('hidden');
  document.getElementById('friend-id-input').value = '';
}

async function addFriendByID() {
  const input    = document.getElementById('friend-id-input');
  const friendId = input.value.trim();
  if (!friendId) return;
  try {
    const data = await apiAddFriend(friendId);
    showToast(`${data.friend.name} added! 🎉`);
    hideAddFriend();
    loadFriends();
  } catch(e) { showToast(e.message); }
}

// ── Sub-tab toggle ────────────────────────────────────────────────────────

function showFriendsSubTab(tab, btn) {
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('friends-list').classList.toggle('hidden', tab !== 'friends');
  document.getElementById('activity-feed').classList.toggle('hidden', tab !== 'activity');
  const lb = document.getElementById('leaderboard-tab');
  if (lb) lb.classList.toggle('hidden', tab !== 'leaderboard');
  if (tab === 'activity') renderActivityFeed();
  if (tab === 'leaderboard') renderLeaderboard();
}

// ── Friend detail view ────────────────────────────────────────────────────

function openFriendDetail(friendId, colorIndex) {
  const friend = friendsData.find(f => f.id === friendId);
  if (!friend) return;

  // Hide profile tab, show detail
  document.getElementById('tab-profile').style.display = 'none';
  document.getElementById('tab-profile').classList.remove('active');
  const detail = document.getElementById('tab-friend-detail');
  detail.classList.add('active');
  detail.style.display = 'flex';

  const color = friendColor(colorIndex);
  const av    = document.getElementById('fd-avatar');
  av.textContent  = initials(friend.name);
  av.style.cssText = avatarStyle(color);
  document.getElementById('fd-name').textContent = escHtml(friend.name);

  // Stats
  const theirIds = friendWalked[friendId] || new Set();
  const myIds    = new Set(Object.values(walkedStreets).flatMap(s => [...s]));
  const mutual   = [...theirIds].filter(id => myIds.has(id)).length;
  const onlyThem = theirIds.size - mutual;
  const onlyMe   = myIds.size  - mutual;

  document.getElementById('fd-stats').innerHTML = `
    <div class="stat-pill"><div class="val">${theirIds.size}</div><div class="lbl">Walked</div></div>
    <div class="stat-pill"><div class="val">${mutual}</div><div class="lbl" style="color:var(--green)">Mutual</div></div>
    <div class="stat-pill"><div class="val">${timeAgo(friend.last_active) || '—'}</div><div class="lbl">Last Active</div></div>
  `;

  document.getElementById('fd-comparison').innerHTML = `
    <div class="fd-comp-card mutual"><div class="num">${mutual}</div><div class="lbl">Both walked</div></div>
    <div class="fd-comp-card only-them"><div class="num">${onlyThem}</div><div class="lbl">Only ${initials(friend.name)}</div></div>
    <div class="fd-comp-card only-me"><div class="num">${onlyMe}</div><div class="lbl">Only you</div></div>
  `;

  // Their recent streets (sorted by neighborhoodId grouping)
  const theirArr = [...theirIds].slice(0, 40);
  if (!theirArr.length) {
    document.getElementById('fd-streets').innerHTML =
      '<div class="empty-state" style="padding:20px"><div class="emoji">🚶</div><h3>No streets yet</h3></div>';
    return;
  }

  // Look up street names from cached data
  const streetNameMap = {};
  for (const hood of NYC_NEIGHBORHOODS) {
    const cached = streetCache[hood.id] || loadStreetCache(hood.id);
    if (cached) for (const s of cached) streetNameMap[s.id] = { name: s.name, hood: hood.name };
  }

  document.getElementById('fd-streets').innerHTML = theirArr.map(id => {
    const info = streetNameMap[id];
    const alsoMe = myIds.has(id);
    return `
    <div class="street-row">
      <div class="street-check ${alsoMe ? 'walked' : ''}" style="${alsoMe ? '' : `background:${color}22;color:${color}`}">${alsoMe ? '✓' : '●'}</div>
      <div class="street-name">${escHtml(info ? info.name : id)}</div>
      ${info ? `<div class="street-len">${escHtml(info.hood)}</div>` : ''}
    </div>`;
  }).join('');
}

function closeFriendDetail() {
  document.getElementById('tab-friend-detail').classList.remove('active');
  document.getElementById('tab-friend-detail').style.display = 'none';
  const t = document.getElementById('tab-profile');
  t.classList.add('active');
  t.style.display = 'flex';
  // Restore nav active state
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const idx = ['feed','map','goals','leaderboard','profile'].indexOf('profile');
  document.querySelectorAll('.nav-btn')[idx].classList.add('active');
}

// ── Copy ID fallback ──────────────────────────────────────────────────────

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
