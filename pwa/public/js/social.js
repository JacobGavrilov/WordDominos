// ── Social: friends, user profile, API calls ─────────────────────────────

const API = ''; // relative – same origin

// ── User ─────────────────────────────────────────────────────────────────

async function apiCreateUser(name) {
  const r = await fetch(`${API}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!r.ok) throw new Error('Failed to create user');
  return r.json();
}

async function apiGetUser(id) {
  const r = await fetch(`${API}/api/users/${id}`);
  if (!r.ok) throw new Error('User not found');
  return r.json();
}

// ── Walked streets ────────────────────────────────────────────────────────

async function apiSaveWalkedStreets(userId, streetIds, neighborhoodId) {
  await fetch(`${API}/api/walks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, streetIds: [...streetIds], neighborhoodId })
  });
}

async function apiGetWalkedStreets(userId) {
  const r = await fetch(`${API}/api/walks/${userId}`);
  if (!r.ok) return {};
  return r.json(); // { neighborhoodId: [streetId, ...], ... }
}

// ── Friends ───────────────────────────────────────────────────────────────

async function apiAddFriend(userId, friendId) {
  const r = await fetch(`${API}/api/friends`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, friendId })
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || 'Could not add friend');
  }
  return r.json();
}

async function apiGetFriends(userId) {
  const r = await fetch(`${API}/api/friends/${userId}`);
  if (!r.ok) return [];
  return r.json();
}

// ── Color helpers ─────────────────────────────────────────────────────────

const FRIEND_COLORS = [
  '#3b82f6', // blue
  '#f97316', // orange
  '#a855f7', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#eab308', // yellow
  '#f43f5e', // rose
];

function friendColor(index) {
  return FRIEND_COLORS[index % FRIEND_COLORS.length];
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function avatarStyle(color) {
  return `background:${color}22;color:${color};`;
}

// ── Render friends list ───────────────────────────────────────────────────

function renderFriendsList(friends, currentUserWalked) {
  const container = document.getElementById('friends-list');
  if (!friends.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">👥</div>
        <h3>No friends yet</h3>
        <p>Tap + Add to invite a friend using your User ID</p>
      </div>`;
    return;
  }

  container.innerHTML = friends.map((f, i) => {
    const color = friendColor(i);
    const total = f.total_walked || 0;
    // Count streets in common
    const mySet = new Set(Object.values(currentUserWalked || {}).flat());
    const friendSet = new Set(f.walked_ids || []);
    const mutual = [...mySet].filter(id => friendSet.has(id)).length;

    return `
    <div class="friend-card" onclick="showFriendDetail('${f.id}', ${i})">
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
  const userId = getCurrentUserId();
  if (friendId === userId) { showToast('That\'s your own ID!'); return; }

  try {
    await apiAddFriend(userId, friendId);
    showToast('Friend added! 🎉');
    hideAddFriend();
    loadFriends();
  } catch(e) {
    showToast(e.message);
  }
}

function copyMyID() {
  const id = getCurrentUserId();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(id).then(() => showToast('ID copied!'));
  } else {
    // iOS fallback
    const ta = document.createElement('textarea');
    ta.value = id;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('ID copied!');
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
