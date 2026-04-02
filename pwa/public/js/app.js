// ── NYC Street Walker — Main App ──────────────────────────────────────────

let map         = null;
let currentUser = null;   // { id, firstName, lastName, homeNeighborhood, email }
let walkedStreets = {};   // { neighborhoodId: Set<streetId> }
let friendsData   = [];
let friendWalked  = {};   // { friendId: Set<streetId> }
let currentHood   = null;
let hoodStreets   = [];
let streetLayers  = {};
let streetFilter  = 'all';
let watchId       = null;
let gpsTrack      = [];   // GPS points for current session
let sessionNewStreets = 0;

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Populate neighborhood dropdown in sign-up
  const sel = document.getElementById('su-neighborhood');
  const grouped = {};
  for (const h of NYC_NEIGHBORHOODS) {
    if (!grouped[h.borough]) grouped[h.borough] = [];
    grouped[h.borough].push(h);
  }
  for (const borough of BOROUGH_ORDER) {
    if (!grouped[borough]) continue;
    const og = document.createElement('optgroup');
    og.label = borough;
    for (const h of grouped[borough]) {
      const opt = document.createElement('option');
      opt.value = h.id; opt.textContent = h.name;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }

  // Try restoring session from localStorage
  const token = localStorage.getItem('token');
  if (token) {
    apiMe().then(user => {
      currentUser = user;
      bootApp();
    }).catch(() => {
      localStorage.removeItem('token');
      showScreen('auth');
    });
  } else {
    showScreen('auth');
  }

  // Enter key on login/signup
  document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('su-password').addEventListener('keydown',   e => { if (e.key === 'Enter') doSignup(); });
});

// ── Auth tab toggle ───────────────────────────────────────────────────────
function showAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('login-panel').classList.toggle('hidden', !isLogin);
  document.getElementById('signup-panel').classList.toggle('hidden', isLogin);
  document.getElementById('tab-login-btn').classList.toggle('active', isLogin);
  document.getElementById('tab-signup-btn').classList.toggle('active', !isLogin);
}

function togglePw(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

// ── Login ─────────────────────────────────────────────────────────────────
async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.classList.add('hidden');

  if (!email || !password) { showFormError(errEl, 'Please enter email and password'); return; }

  try {
    const { token, user } = await apiLogin(email, password);
    localStorage.setItem('token', token);
    currentUser = user;
    bootApp();
  } catch(e) { showFormError(errEl, e.message); }
}

// ── Sign Up ───────────────────────────────────────────────────────────────
async function doSignup() {
  const firstName        = document.getElementById('su-first').value.trim();
  const lastName         = document.getElementById('su-last').value.trim();
  const email            = document.getElementById('su-email').value.trim();
  const password         = document.getElementById('su-password').value;
  const dateOfBirth      = document.getElementById('su-dob').value;
  const homeNeighborhood = document.getElementById('su-neighborhood').value;
  const errEl            = document.getElementById('signup-error');
  errEl.classList.add('hidden');

  if (!firstName || !lastName) { showFormError(errEl, 'First and last name required'); return; }
  if (!email)    { showFormError(errEl, 'Email required'); return; }
  if (!password) { showFormError(errEl, 'Password required'); return; }

  try {
    const { token, user } = await apiSignup(firstName, lastName, email, password, dateOfBirth, homeNeighborhood);
    localStorage.setItem('token', token);
    currentUser = user;
    bootApp();
  } catch(e) { showFormError(errEl, e.message); }
}

function showFormError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showForgotPassword(e) {
  e.preventDefault();
  ['login-panel','signup-panel','reset-panel'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('forgot-panel').classList.remove('hidden');
  document.getElementById('tab-login-btn').classList.remove('active');
  document.getElementById('tab-signup-btn').classList.remove('active');
}

async function doForgot() {
  const email  = document.getElementById('forgot-email').value.trim();
  const msgEl  = document.getElementById('forgot-msg');
  msgEl.classList.add('hidden');
  if (!email) return;
  try {
    const r    = await fetch('/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = await r.json();
    msgEl.textContent = data.message || 'Check your email.';
    msgEl.classList.remove('hidden');
    if (data.resetToken) {
      // Dev mode: show the token and transition to reset panel
      setTimeout(() => {
        document.getElementById('forgot-panel').classList.add('hidden');
        document.getElementById('reset-panel').classList.remove('hidden');
        document.getElementById('reset-token').value = data.resetToken;
      }, 1500);
    }
  } catch(e) { msgEl.textContent = 'Error. Try again.'; msgEl.classList.remove('hidden'); }
}

async function doReset() {
  const token    = document.getElementById('reset-token').value.trim();
  const password = document.getElementById('reset-password').value;
  const errEl    = document.getElementById('reset-error');
  errEl.classList.add('hidden');
  if (!token || !password) return;
  try {
    const r = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetToken: token, password }) });
    const data = await r.json();
    if (!r.ok) { showFormError(errEl, data.error); return; }
    showToast('Password updated! Please log in.');
    showAuthTab('login');
  } catch(e) { showFormError(errEl, 'Error. Try again.'); }
}

// Extend showAuthTab to also hide forgot/reset panels
const _origShowAuthTab = typeof showAuthTab !== 'undefined' ? showAuthTab : null;
function showAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('login-panel').classList.toggle('hidden', !isLogin);
  document.getElementById('signup-panel').classList.toggle('hidden', isLogin);
  document.getElementById('tab-login-btn').classList.toggle('active', isLogin);
  document.getElementById('tab-signup-btn').classList.toggle('active', !isLogin);
  const fp = document.getElementById('forgot-panel');
  const rp = document.getElementById('reset-panel');
  if (fp) fp.classList.add('hidden');
  if (rp) rp.classList.add('hidden');
}

function signOut() {
  localStorage.removeItem('token');
  location.reload();
}

function getCurrentUserId() { return currentUser ? currentUser.id : ''; }

// ── Boot app ──────────────────────────────────────────────────────────────
async function bootApp() {
  showScreen('app');

  // Load walked streets
  const raw = await apiGetWalkedStreets().catch(() => ({}));
  walkedStreets = {};
  for (const [hid, ids] of Object.entries(raw)) {
    walkedStreets[hid] = new Set(ids);
  }

  initMap();
  renderNeighborhoodList();
  renderProfile();
  loadFriends();
  loadStats();
  startAutoTracking();
  checkInviteInURL();
}

// ── Screen helper ─────────────────────────────────────────────────────────
function showScreen(name) {
  document.getElementById('auth-screen').classList.toggle('active', name === 'auth');
  document.getElementById('auth-screen').classList.toggle('hidden', name !== 'auth');
  document.getElementById('app').classList.toggle('active', name === 'app');
  document.getElementById('app').classList.toggle('hidden', name !== 'app');
}

// ── Auto tracking (no button) ─────────────────────────────────────────────
function startAutoTracking() {
  if (!navigator.geolocation) {
    setStatusBar('inactive', 'Location unavailable');
    return;
  }

  setStatusBar('inactive', 'Requesting location…');

  watchId = navigator.geolocation.watchPosition(
    onGpsPoint,
    onGpsError,
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
  );
}

// Refresh the requalifying countdown every second so the status bar ticks down
let _requalifyInterval = null;

function onGpsPoint(pos) {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  if (accuracy > 40) return; // skip inaccurate GPS fixes

  const ts        = Date.now();
  const canWalk   = movement.update(lat, lon, ts);
  const stateLabel = movement.statusLabel();

  // Always harvest GPS for data (even when in vehicle/subway)
  bufferGpsPoint(lat, lon, accuracy);

  // Status bar
  if (stateLabel) {
    setStatusBar(movement.state === 'vehicle' ? 'vehicle' : 'uncertain', stateLabel);
    // Tick the requalifying countdown every second
    if (movement.state === 'requalifying' && !_requalifyInterval) {
      _requalifyInterval = setInterval(() => {
        if (movement.state === 'requalifying') {
          setStatusBar('uncertain', movement.statusLabel());
        } else {
          clearInterval(_requalifyInterval);
          _requalifyInterval = null;
        }
      }, 1000);
    }
  } else {
    if (_requalifyInterval) { clearInterval(_requalifyInterval); _requalifyInterval = null; }
    setStatusBar('active', `${Math.round(accuracy)}m · ${(movement.lastSpeedMs * 3.6).toFixed(1)} km/h`);
  }

  // Only add to walk track when actually on foot
  if (canWalk) {
    const pt = [lat, lon];
    gpsTrack.push(pt);
    if (gpsTrack.length > 500) gpsTrack.shift();

    // Pan map
    if (document.getElementById('tab-map').classList.contains('active')) {
      if (map) map.setView(pt, Math.max(map.getZoom(), 16), { animate: true });
    }

    // Neighborhood + street matching
    const hood = hoodForCoords(lat, lon);
    if (hood) {
      const enteredNewHood = !currentHood || currentHood.id !== hood.id;
      currentHood = hood;
      updateMapHoodPanel(hood);
      if (enteredNewHood) {
        autoLoadHoodStreets(hood);
      } else if (hoodStreets.length && hoodStreets[0].neighborhoodId === hood.id) {
        matchAndSave(hood);
      }
    }
  } else {
    // Still pan map even when in vehicle so the user can see where they are
    if (document.getElementById('tab-map').classList.contains('active')) {
      if (map) map.panTo([lat, lon], { animate: true });
    }
  }
}

function onGpsError(err) {
  setStatusBar('inactive', err.code === 1 ? 'Location permission denied' : 'Location unavailable');
}

// Silently load streets when GPS enters a new neighborhood
let _autoLoadingHood = null;
async function autoLoadHoodStreets(hood) {
  if (_autoLoadingHood === hood.id) return;
  _autoLoadingHood = hood.id;

  const already = streetCache[hood.id] || loadStreetCache(hood.id);
  if (already) {
    hoodStreets = already;
    if (document.getElementById('tab-map').classList.contains('active')) renderStreetLayers(hood);
    matchAndSave(hood);
    return;
  }

  setStatusBar('active', `Loading ${hood.name}…`);
  try {
    hoodStreets = await fetchStreetsForNeighborhood(hood);
    setStatusBar('active', `${hood.name} — ${hoodStreets.length} streets`);
    if (document.getElementById('tab-map').classList.contains('active')) renderStreetLayers(hood);
    matchAndSave(hood);
  } catch(_) {
    setStatusBar('active', 'Streets unavailable offline');
  }
}

function setStatusBar(state, text) {
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  // state: 'active' (walking, green) | 'uncertain' (yellow) | 'vehicle' (red) | 'inactive' (gray)
  dot.className = 'status-dot ' + state;
  txt.textContent = text;
}

function updateStreetsBadge() {
  const el = document.getElementById('status-streets');
  const total = Object.values(walkedStreets).reduce((s, set) => s + set.size, 0);
  if (total > 0) {
    el.textContent = total + ' streets';
    el.classList.remove('hidden');
  }
}

// ── Street matching ───────────────────────────────────────────────────────
let _saveTimer = null;

function matchAndSave(hood) {
  const newlyMatched = matchStreetsToTrack(gpsTrack, hoodStreets);
  if (!walkedStreets[hood.id]) walkedStreets[hood.id] = new Set();

  let newCount = 0;
  for (const id of newlyMatched) {
    if (!walkedStreets[hood.id].has(id)) {
      walkedStreets[hood.id].add(id);
      refreshStreetLayer(id, hood.id);
      newCount++;
      sessionNewStreets++;
    }
  }

  if (newCount > 0) {
    showToast(`+${newCount} new street${newCount > 1 ? 's' : ''} in ${hood.name}! 🎉`);
    updateStreetsBadge();

    // Debounce saving to server (save after 5s of no new matches)
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      apiSaveWalkedStreets(walkedStreets[hood.id], hood.id).catch(() => {});
    }, 5000);
  }
}

// ── Map ───────────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', {
    center: [40.7128, -74.0060],
    zoom: 14,
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
  L.control.attribution({ position: 'bottomleft', prefix: false }).addAttribution('© OpenStreetMap · CartoDB').addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);

  map.on('moveend', () => {
    const c = map.getCenter();
    const hood = hoodForCoords(c.lat, c.lng);
    if (hood) { currentHood = hood; updateMapHoodPanel(hood); }
    else document.getElementById('map-hood-panel').classList.add('hidden');
  });
}

function updateMapHoodPanel(hood) {
  document.getElementById('map-hood-name').textContent = hood.name;
  document.getElementById('map-hood-panel').classList.remove('hidden');
}

function hoodForCoords(lat, lon) {
  return NYC_NEIGHBORHOODS.find(h => {
    const [minLat, minLon, maxLat, maxLon] = h.bounds;
    return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
  }) || null;
}

async function loadCurrentHoodOnMap() {
  if (!currentHood) return;
  const btn = document.getElementById('map-hood-load');
  btn.textContent = '…';
  try {
    hoodStreets = await fetchStreetsForNeighborhood(currentHood);
    renderStreetLayers(currentHood);
    btn.textContent = 'Reload';
    showToast(`${hoodStreets.length} streets loaded`);
  } catch(e) {
    showToast('Could not load streets — check connection');
    btn.textContent = 'Load Streets';
  }
}

function renderStreetLayers(hood) {
  Object.values(streetLayers).forEach(l => map.removeLayer(l));
  streetLayers = {};

  const myWalked = walkedStreets[hood.id] || new Set();

  for (const street of hoodStreets) {
    const walkedByMe = myWalked.has(street.id);

    let friendColorVal = null;
    friendsData.forEach((f, i) => {
      if (!friendColorVal && (friendWalked[f.id] || new Set()).has(street.id)) {
        friendColorVal = friendColor(i);
      }
    });

    const color   = walkedByMe ? '#22c55e' : (friendColorVal || '#475569');
    const weight  = walkedByMe || friendColorVal ? 5 : 2;
    const opacity = walkedByMe || friendColorVal ? 0.9 : 0.3;

    const popup = walkedByMe
      ? `<b>${street.name}</b><br>✅ You walked this`
      : friendColorVal
        ? `<b>${street.name}</b><br>👤 Friend walked this`
        : `<b>${street.name}</b>`;

    const line = L.polyline(street.coords, { color, weight, opacity })
      .bindPopup(popup)
      .addTo(map);

    streetLayers[street.id] = line;
  }
}

function refreshStreetLayer(streetId, hoodId) {
  if (!streetLayers[streetId]) return;
  const walked = (walkedStreets[hoodId] || new Set()).has(streetId);
  streetLayers[streetId].setStyle({
    color: walked ? '#22c55e' : '#475569',
    weight: walked ? 5 : 2,
    opacity: walked ? 0.9 : 0.3
  });
}

// ── Neighborhoods tab ─────────────────────────────────────────────────────
function renderNeighborhoodList() {
  const boroughFilter = document.getElementById('borough-filter').value;
  const container     = document.getElementById('neighborhood-list');
  const filtered      = boroughFilter
    ? NYC_NEIGHBORHOODS.filter(h => h.borough === boroughFilter)
    : NYC_NEIGHBORHOODS;

  const grouped = {};
  for (const h of filtered) {
    if (!grouped[h.borough]) grouped[h.borough] = [];
    grouped[h.borough].push(h);
  }

  let html = '';
  for (const borough of BOROUGH_ORDER) {
    if (!grouped[borough]) continue;
    if (!boroughFilter) html += `<div class="borough-header">${borough}</div>`;
    for (const h of grouped[borough]) {
      const walked  = (walkedStreets[h.id] || new Set()).size;
      const cached  = streetCache[h.id] || loadStreetCache(h.id);
      const total   = cached ? cached.length : '?';
      const pct     = (typeof total === 'number' && total > 0) ? Math.round(walked / total * 100) : 0;
      const r = 18, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;

      html += `
      <div class="hood-card" onclick="openNeighborhoodDetail('${h.id}')">
        <div class="hood-ring">
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="${r}" fill="none" stroke="#334155" stroke-width="4"/>
            <circle cx="24" cy="24" r="${r}" fill="none" stroke="#22c55e" stroke-width="4"
              stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round"/>
          </svg>
          <div class="hood-ring-pct">${pct}%</div>
        </div>
        <div class="hood-info">
          <div class="hood-name">${escHtml(h.name)}</div>
          <div class="hood-sub">${walked}${typeof total === 'number' ? '/' + total : ''} streets walked</div>
        </div>
        <div class="borough-badge">${h.borough.replace('The ','')}</div>
      </div>`;
    }
  }
  container.innerHTML = html || '<div class="empty-state"><div class="emoji">🏙️</div><h3>No neighborhoods</h3></div>';
}

async function openNeighborhoodDetail(hoodId) {
  const hood = NYC_NEIGHBORHOODS.find(h => h.id === hoodId);
  if (!hood) return;

  document.getElementById('tab-neighborhoods').style.display = 'none';
  document.getElementById('tab-neighborhoods').classList.remove('active');
  const detail = document.getElementById('tab-hood-detail');
  detail.classList.add('active');
  detail.style.display = 'flex';

  document.getElementById('detail-hood-name').textContent = hood.name;
  document.getElementById('street-list').innerHTML =
    '<div class="empty-state"><div class="emoji">⏳</div><h3>Loading streets…</h3></div>';
  streetFilter = 'all';
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));

  let streets = streetCache[hood.id] || loadStreetCache(hood.id);
  if (!streets) {
    try { streets = await fetchStreetsForNeighborhood(hood); }
    catch(e) {
      document.getElementById('street-list').innerHTML =
        '<div class="empty-state"><div class="emoji">❌</div><h3>Could not load streets</h3><p>Check your connection and try again</p></div>';
      return;
    }
  }
  renderNeighborhoodDetail(hood, streets);
}

function showNeighborhoods() {
  document.getElementById('tab-hood-detail').classList.remove('active');
  document.getElementById('tab-hood-detail').style.display = 'none';
  const n = document.getElementById('tab-neighborhoods');
  n.classList.add('active');
  n.style.display = 'flex';
  renderNeighborhoodList();
}

function renderNeighborhoodDetail(hood, streets) {
  const walked     = walkedStreets[hood.id] || new Set();
  const walkedCount = streets.filter(s => walked.has(s.id)).length;
  const pct        = streets.length ? Math.round(walkedCount / streets.length * 100) : 0;

  document.getElementById('detail-summary').innerHTML = `
    <div class="stat-pill"><div class="val">${pct}%</div><div class="lbl">Complete</div></div>
    <div class="stat-pill"><div class="val">${walkedCount}</div><div class="lbl">Walked</div></div>
    <div class="stat-pill"><div class="val">${streets.length - walkedCount}</div><div class="lbl">Remaining</div></div>
  `;
  renderStreetList(hood, streets);
}

function filterStreets(filter, btn) {
  streetFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const hoodName = document.getElementById('detail-hood-name').textContent;
  const hood = NYC_NEIGHBORHOODS.find(h => h.name === hoodName);
  if (!hood) return;
  const streets = streetCache[hood.id] || loadStreetCache(hood.id) || [];
  renderStreetList(hood, streets);
}

function renderStreetList(hood, streets) {
  const walked = walkedStreets[hood.id] || new Set();
  let list = streets;
  if (streetFilter === 'walked')   list = streets.filter(s => walked.has(s.id));
  if (streetFilter === 'unwalked') list = streets.filter(s => !walked.has(s.id));

  if (!list.length) {
    document.getElementById('street-list').innerHTML =
      '<div class="empty-state"><div class="emoji">🔍</div><h3>Nothing here</h3></div>';
    return;
  }

  document.getElementById('street-list').innerHTML = list.map(s => {
    const isWalked = walked.has(s.id);
    const lenM     = streetLengthM(s);
    const lenStr   = lenM > 999 ? (lenM/1000).toFixed(1)+'km' : Math.round(lenM)+'m';
    const friendDots = friendsData.map((f, i) => {
      const fw = friendWalked[f.id] || new Set();
      return fw.has(s.id) ? `<span style="color:${friendColor(i)};font-size:14px" title="${escHtml(f.name)}">●</span>` : '';
    }).join('');

    return `
    <div class="street-row">
      <div class="street-check ${isWalked ? 'walked' : 'unwalked'}">${isWalked ? '✓' : '○'}</div>
      <div class="street-name">${escHtml(s.name)}</div>
      ${friendDots}
      <div class="street-meta">
        <span class="street-len">${lenStr}</span>
      </div>
    </div>`;
  }).join('');
}

// ── Friends tab ───────────────────────────────────────────────────────────
async function loadFriends() {
  try {
    const friends = await apiGetFriends();
    friendsData = friends;
    for (const f of friends) {
      try {
        const raw    = await apiGetFriendWalkedStreets(f.id);
        const allIds = Object.values(raw).flat();
        friendWalked[f.id] = new Set(allIds);
        f.walked_ids   = allIds;
        f.total_walked = allIds.length;
      } catch(_) {}
    }
    const myFlat = Object.values(walkedStreets).flatMap(s => [...s]);
    renderFriendsList(friends, myFlat);
  } catch(e) {
    document.getElementById('friends-list').innerHTML =
      '<div class="empty-state"><div class="emoji">😕</div><h3>Could not load friends</h3></div>';
  }
}

// ── Stats cache ───────────────────────────────────────────────────────────
let _serverStats = { streak: 0, distKm: 0, totalStreets: 0 };

async function loadStats() {
  try {
    const r = await fetch('/api/stats', { headers: authHeaders() });
    if (r.ok) { _serverStats = await r.json(); renderProfile(); }
  } catch(_) {}
}

// ── Profile tab ───────────────────────────────────────────────────────────
function renderProfile() {
  if (!currentUser) return;
  const fullName = (currentUser.firstName || '') + ' ' + (currentUser.lastName || '');
  document.getElementById('profile-name').textContent = fullName.trim();
  document.getElementById('profile-user-id').textContent = currentUser.id;

  const hood = NYC_NEIGHBORHOODS.find(h => h.id === currentUser.homeNeighborhood);
  document.getElementById('profile-hood').textContent = hood ? '📍 ' + hood.name : '';

  // Avatar
  const colors = ['#22c55e','#3b82f6','#f97316','#a855f7','#ec4899'];
  const color  = colors[(currentUser.firstName || 'A').charCodeAt(0) % colors.length];
  const av = document.getElementById('profile-avatar');
  av.textContent = initials(fullName.trim());
  av.style.cssText = avatarStyle(color);

  // Local counts (from cached street data)
  let completedHoods = 0;
  const boroughCounts = {};
  for (const h of NYC_NEIGHBORHOODS) {
    const w      = walkedStreets[h.id] || new Set();
    const cached = streetCache[h.id] || loadStreetCache(h.id);
    const total  = cached ? cached.length : 0;
    if (w.size > 0) {
      if (total > 0 && w.size === total) completedHoods++;
      boroughCounts[h.borough] = (boroughCounts[h.borough] || 0) + w.size;
    }
  }

  const streakLabel = _serverStats.streak === 1 ? '1 day' : `${_serverStats.streak} days`;
  const distLabel   = _serverStats.distKm >= 1 ? _serverStats.distKm.toFixed(1) + ' km' : Math.round(_serverStats.distKm * 1000) + ' m';

  document.getElementById('profile-stats').innerHTML = `
    <div class="stat-card"><div class="icon">🏃</div><div class="num">${_serverStats.totalStreets}</div><div class="lbl">Streets Walked</div></div>
    <div class="stat-card"><div class="icon">🔥</div><div class="num">${_serverStats.streak}</div><div class="lbl">Day Streak</div></div>
    <div class="stat-card"><div class="icon">📏</div><div class="num">${distLabel}</div><div class="lbl">Est. Distance</div></div>
    <div class="stat-card"><div class="icon">🏙️</div><div class="num">${Object.keys(walkedStreets).filter(k => walkedStreets[k].size > 0).length}</div><div class="lbl">Neighborhoods</div></div>
  `;

  // Borough breakdown
  const maxCount = Math.max(...Object.values(boroughCounts), 1);
  let bars = '';
  for (const borough of BOROUGH_ORDER) {
    const count = boroughCounts[borough] || 0;
    const pct   = Math.round(count / maxCount * 100);
    bars += `
    <div class="bar-row">
      <div class="bar-label">${borough.replace('The ','')}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bar-count">${count}</div>
    </div>`;
  }
  document.getElementById('borough-breakdown').innerHTML = `<h3>By Borough</h3>${bars}`;

  updateStreetsBadge();
}

// ── Tab switching ─────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.remove('active'); t.style.display = 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  // Also hide friend detail if switching away
  const fd = document.getElementById('tab-friend-detail');
  if (fd) { fd.classList.remove('active'); fd.style.display = 'none'; }

  const target = document.getElementById('tab-' + name);
  target.classList.add('active'); target.style.display = 'flex';

  const idx = ['map','neighborhoods','friends','profile'].indexOf(name);
  if (idx >= 0) document.querySelectorAll('.nav-btn')[idx].classList.add('active');

  if (name === 'map' && map) setTimeout(() => map.invalidateSize(), 80);
  if (name === 'neighborhoods') renderNeighborhoodList();
  if (name === 'friends') loadFriends();
  if (name === 'profile') renderProfile();
}

// ── Toast ─────────────────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}
