// ── NYC Street Walker — Main App ──────────────────────────────────────────

let map         = null;
let currentUser = null;   // { id, firstName, lastName, homeNeighborhood, email }
let walkedStreets = {};   // { neighborhoodId: Set<streetId> }
let streetMeta    = {};   // { streetId: { walkCount, firstWalked } }
let friendsData   = [];
let friendWalked  = {};   // { friendId: Set<streetId> }
let currentHood   = null;
let hoodStreets   = [];
let streetLayers  = {};
let streetFilter  = 'all';
let watchId       = null;
let gpsTrack      = [];   // GPS points for current session
let sessionNewStreets = 0;
let _metaBadges   = null; // cached meta badge data

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

  // Handle ?reset=TOKEN from password-reset email link
  const urlParams  = new URLSearchParams(window.location.search);
  const resetParam = urlParams.get('reset');
  if (resetParam) {
    document.getElementById('reset-token').value = resetParam;
    history.replaceState({}, '', window.location.pathname); // strip token from URL bar
    showScreen('auth');
    showResetPanel();
    return; // skip session restore — user needs to set password first
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

function showResetPanel() {
  ['login-panel','signup-panel','forgot-panel'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('reset-panel').classList.remove('hidden');
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

    if (data.resetLink) {
      // Dev mode (no email service): show the link directly so dev can test
      msgEl.textContent = '🔧 Dev mode — copy this link to reset:';
      msgEl.classList.remove('hidden');
      const linkEl = document.createElement('a');
      linkEl.href  = data.resetLink;
      linkEl.style.cssText = 'display:block;word-break:break-all;font-size:11px;color:var(--green);margin-top:6px';
      linkEl.textContent   = data.resetLink;
      msgEl.appendChild(linkEl);
    } else {
      msgEl.textContent = data.message || 'If that email exists, a reset link was sent.';
      msgEl.classList.remove('hidden');
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
  const rawData = await apiGetWalkedStreets().catch(() => ({}));
  walkedStreets = {};
  streetMeta = {};
  const rawWalks = rawData.walks || rawData; // handle old flat format
  for (const [hid, ids] of Object.entries(rawWalks)) {
    walkedStreets[hid] = new Set(ids);
  }
  if (rawData.meta) Object.assign(streetMeta, rawData.meta);

  initMap();
  renderProfile();
  loadFriends();
  loadStats();
  loadBadges();
  startAutoTracking();
  checkInviteInURL();

  // Show onboarding for first-time users
  if (!localStorage.getItem('onboarded')) {
    setTimeout(showOnboarding, 800);
  }
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
    loadBadges(); // refresh badges in case a neighborhood just completed

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

    let popup;
    if (walkedByMe) {
      const sm = streetMeta[street.id];
      const dateStr = sm && sm.firstWalked ? new Date(sm.firstWalked).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : null;
      const countStr = sm && sm.walkCount > 1 ? `${sm.walkCount}×` : null;
      popup = `<b>${street.name}</b><br>✅ You walked this` +
        (dateStr ? `<br>First: ${dateStr}` : '') +
        (countStr ? `<br>Times: ${countStr}` : '');
    } else if (friendColorVal) {
      popup = `<b>${street.name}</b><br>👤 Friend walked this`;
    } else {
      popup = `<b>${street.name}</b>`;
    }

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
  const searchEl      = document.getElementById('hood-search');
  const searchTerm    = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const container     = document.getElementById('neighborhood-list');
  let filtered        = boroughFilter
    ? NYC_NEIGHBORHOODS.filter(h => h.borough === boroughFilter)
    : NYC_NEIGHBORHOODS;
  if (searchTerm) filtered = filtered.filter(h => h.name.toLowerCase().includes(searchTerm));

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

  document.getElementById('tab-goals').style.display = 'none';
  document.getElementById('tab-goals').classList.remove('active');
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

function showGoals() {
  document.getElementById('tab-hood-detail').classList.remove('active');
  document.getElementById('tab-hood-detail').style.display = 'none';
  const n = document.getElementById('tab-goals');
  n.classList.add('active');
  n.style.display = 'flex';
  // Update nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const idx = ['feed','map','goals','leaderboard','profile'].indexOf('goals');
  document.querySelectorAll('.nav-btn')[idx].classList.add('active');
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
    if (r.ok) { _serverStats = await r.json(); renderProfile(); renderFeedWeeklyCard(); }
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

  const fd = document.getElementById('tab-friend-detail');
  if (fd) { fd.classList.remove('active'); fd.style.display = 'none'; }

  const target = document.getElementById('tab-' + name);
  if (target) { target.classList.add('active'); target.style.display = 'flex'; }

  if (btn) {
    btn.classList.add('active');
  } else {
    const idx = ['feed','map','goals','leaderboard','profile'].indexOf(name);
    if (idx >= 0) document.querySelectorAll('.nav-btn')[idx].classList.add('active');
  }

  if (name === 'map')         setTimeout(() => map && map.invalidateSize(), 80);
  if (name === 'goals')       { renderNeighborhoodList(); renderBadges(); renderMetaBadges(); }
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'feed')        renderFeed();
  if (name === 'profile')     { renderProfile(); loadFriends(); }
}

// ── Feed tab ──────────────────────────────────────────────────────────────
async function renderFeed() {
  if (!currentUser) return;

  // Time-of-day greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl  = document.getElementById('feed-greeting');
  const subEl    = document.getElementById('feed-sub');
  if (greetEl) greetEl.textContent = `${greeting}, ${currentUser.firstName} 👋`;
  if (subEl)   subEl.textContent   = `${_serverStats.totalStreets || 0} streets walked across NYC`;

  // Weekly recap card
  renderFeedWeeklyCard();

  // Invite CTA — show only when user has no friends
  const cta = document.getElementById('feed-invite-cta');
  if (cta) cta.classList.toggle('hidden', friendsData.length > 0);

  // Activity feed
  renderActivityFeed();
}

function renderFeedWeeklyCard() {
  const el = document.getElementById('feed-weekly-card');
  if (!el) return;
  const m = _metaBadges || {};
  const weekly  = m.weeklyStreets  || 0;
  const days    = m.daysThisWeek   || 0;
  const streak  = m.streak         || 0;
  const total   = _serverStats.totalStreets || 0;

  // Progress toward nearest milestone
  const milestones = [50, 200, 500, 1000, 2500, 5000];
  const next = milestones.find(n => n > total) || milestones[milestones.length - 1];
  const pct  = Math.min(100, Math.round(total / next * 100));

  el.innerHTML = `
    <div class="feed-recap-card">
      <div class="feed-recap-row">
        <div class="feed-recap-stat">
          <div class="feed-recap-num">${weekly}</div>
          <div class="feed-recap-lbl">This week</div>
        </div>
        <div class="feed-recap-stat">
          <div class="feed-recap-num">${days}</div>
          <div class="feed-recap-lbl">Days out</div>
        </div>
        <div class="feed-recap-stat">
          <div class="feed-recap-num">${streak}🔥</div>
          <div class="feed-recap-lbl">Streak</div>
        </div>
      </div>
      <div class="feed-progress-wrap">
        <div class="feed-progress-label">
          <span>${total} streets</span><span>${next} goal</span>
        </div>
        <div class="feed-progress-bar"><div class="feed-progress-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;
}

// ── Leaderboard ───────────────────────────────────────────────────────────
let _lbMode = 'week'; // 'week' | 'alltime'

async function renderLeaderboard() {
  const container = document.getElementById('leaderboard-tab');
  container.innerHTML = `
    <div class="leaderboard-toggle">
      <button class="lb-toggle-btn ${_lbMode==='week'?'active':''}" onclick="setLbMode('week',this)">This Week</button>
      <button class="lb-toggle-btn ${_lbMode==='alltime'?'active':''}" onclick="setLbMode('alltime',this)">All Time</button>
    </div>
    <div id="lb-rows" class="list-container" style="padding-top:4px">
      <div class="empty-state"><div class="emoji">⏳</div><h3>Loading…</h3></div>
    </div>`;

  try {
    const data = await fetch('/api/leaderboard', { headers: authHeaders() }).then(r => r.json());
    renderLbRows(data);
  } catch { document.getElementById('lb-rows').innerHTML = '<div class="empty-state"><div class="emoji">😕</div><h3>Could not load</h3></div>'; }
}

function setLbMode(mode, btn) {
  _lbMode = mode;
  document.querySelectorAll('.lb-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Re-render with current data (refetch)
  renderLeaderboard();
}

function renderLbRows(data) {
  const rows = _lbMode === 'week' ? data.thisWeek : data.allTime;
  const me   = data.currentUserId;
  const container = document.getElementById('lb-rows');

  if (!rows.length) {
    container.innerHTML = '<div class="empty-state"><div class="emoji">🏃</div><h3>No data yet</h3><p>Start walking to appear here</p></div>';
    return;
  }

  const rankEmoji = ['🥇','🥈','🥉'];
  const rankClass = ['gold','silver','bronze'];
  container.innerHTML = rows.map((r, i) => {
    const isMe = r.id === me;
    const rank = i < 3 ? `<span class="lb-rank ${rankClass[i]}">${rankEmoji[i]}</span>`
                       : `<span class="lb-rank">${i+1}</span>`;
    return `
    <div class="lb-row${isMe ? ' me' : ''}">
      ${rank}
      <div class="lb-info">
        <div class="lb-name">${escHtml(r.name)}${isMe ? ' (you)' : ''}</div>
        <div class="lb-sub">${_lbMode === 'week' ? 'this week' : 'all time'}</div>
      </div>
      <div class="lb-count">${r.total}</div>
    </div>`;
  }).join('');
}

// ── Badges ────────────────────────────────────────────────────────────────
let _earnedBadges = {}; // { neighborhoodId: walkedCount }

async function loadBadges() {
  try {
    [_earnedBadges, _metaBadges] = await Promise.all([
      fetch(`/api/badges/${getCurrentUserId()}`, { headers: authHeaders() }).then(r => r.json()),
      fetch('/api/badges/meta', { headers: authHeaders() }).then(r => r.json())
    ]);
    renderBadges();
    renderMetaBadges();
    renderFeedWeeklyCard();
  } catch { renderBadges(); }
}

function renderBadges() {
  const grid = document.getElementById('badges-grid');
  if (!grid) return;

  const badges = NYC_NEIGHBORHOODS.map(h => {
    const cached   = streetCache[h.id] || loadStreetCache(h.id);
    const total    = cached ? cached.length : 0;
    const walked   = _earnedBadges[h.id] || 0;
    const earned   = total > 0 && walked >= total;
    const pct      = total > 0 ? Math.round(walked / total * 100) : 0;
    return { hood: h, earned, pct, walked, total };
  });

  const earnedCount = badges.filter(b => b.earned).length;
  const countEl = document.getElementById('badges-count');
  if (countEl) countEl.textContent = `${earnedCount} / ${badges.length}`;

  // Show earned first, then by completion %
  badges.sort((a, b) => (b.earned - a.earned) || (b.pct - a.pct));

  grid.innerHTML = badges.map(({ hood, earned, pct }) => `
    <div class="badge-item ${earned ? 'earned' : 'locked'}" title="${hood.name}${earned ? ' — Complete!' : ` — ${pct}%`}">
      <div class="badge-emoji">${earned ? '🏅' : '⬜'}</div>
      <div class="badge-name">${hood.name.length > 12 ? hood.name.slice(0,11)+'…' : hood.name}</div>
    </div>`).join('');

  // Badge for neighborhood detail header
  const detailName = document.getElementById('detail-hood-name');
  if (detailName) {
    const hood  = NYC_NEIGHBORHOODS.find(h => h.name === detailName.textContent);
    const badge = document.getElementById('hood-badge');
    if (hood && badge) {
      const cached = streetCache[hood.id] || loadStreetCache(hood.id);
      const total  = cached ? cached.length : 0;
      const walked = _earnedBadges[hood.id] || 0;
      badge.classList.toggle('hidden', !(total > 0 && walked >= total));
    }
  }
}

// ── Meta achievement badges ───────────────────────────────────────────────

const META_BADGES = [
  { id: 'first_steps',   emoji: '👣', name: 'First Steps',       desc: 'Walk your first street',        check: m => m.totalStreets >= 1 },
  { id: 'explorer_50',   emoji: '🗺️', name: 'Explorer',           desc: '50 streets walked',             check: m => m.totalStreets >= 50 },
  { id: 'wanderer_200',  emoji: '🧭', name: 'City Wanderer',      desc: '200 streets walked',            check: m => m.totalStreets >= 200 },
  { id: 'veteran_500',   emoji: '🏆', name: 'Street Veteran',     desc: '500 streets walked',            check: m => m.totalStreets >= 500 },
  { id: 'master_1000',   emoji: '👑', name: 'NYC Master',         desc: '1,000 streets walked',          check: m => m.totalStreets >= 1000 },
  { id: 'streak_3',      emoji: '🔥', name: 'On a Roll',          desc: '3-day walking streak',          check: m => m.streak >= 3 },
  { id: 'streak_7',      emoji: '⚡', name: 'Week Warrior',       desc: '7-day walking streak',          check: m => m.streak >= 7 },
  { id: 'streak_30',     emoji: '💎', name: 'Unstoppable',        desc: '30-day walking streak',         check: m => m.streak >= 30 },
  { id: 'all_boroughs',  emoji: '🗽', name: 'Five Boroughs',      desc: 'Walk in all 5 boroughs',        check: m => {
    const boroughs = new Set(NYC_NEIGHBORHOODS.filter(h => (m.walkedHoods||[]).includes(h.id)).map(h=>h.borough));
    return boroughs.size >= 5;
  }},
  { id: 'hoods_5',       emoji: '🏙️', name: 'Neighborhood Hopper', desc: 'Walk in 5 neighborhoods',     check: m => (m.walkedHoods||[]).length >= 5 },
  { id: 'hoods_15',      emoji: '🌆', name: 'District Dweller',   desc: 'Walk in 15 neighborhoods',     check: m => (m.walkedHoods||[]).length >= 15 },
  { id: 'hoods_30',      emoji: '🌇', name: 'City Native',        desc: 'Walk in 30 neighborhoods',     check: m => (m.walkedHoods||[]).length >= 30 },
];

function renderMetaBadges() {
  const grid = document.getElementById('meta-badges-grid');
  if (!grid || !_metaBadges) return;

  const earnedCount = META_BADGES.filter(b => b.check(_metaBadges)).length;
  const countEl = document.getElementById('meta-badges-count');
  if (countEl) countEl.textContent = `${earnedCount} / ${META_BADGES.length}`;

  grid.innerHTML = META_BADGES.map(b => {
    const earned = b.check(_metaBadges);
    return `
    <div class="badge-item meta-badge ${earned ? 'earned' : 'locked'}" title="${b.name}: ${b.desc}">
      <div class="badge-emoji">${earned ? b.emoji : '🔒'}</div>
      <div class="badge-name">${b.name}</div>
      <div class="badge-desc">${b.desc}</div>
    </div>`;
  }).join('');
}

function renderWeeklyStats() {
  const el = document.getElementById('weekly-stats');
  if (!el || !_metaBadges) return;
  const { weeklyStreets, daysThisWeek, streak } = _metaBadges;
  el.innerHTML = `
    <div class="weekly-header">This Week</div>
    <div class="weekly-grid">
      <div class="weekly-item"><div class="weekly-num">${weeklyStreets || 0}</div><div class="weekly-lbl">New Streets</div></div>
      <div class="weekly-item"><div class="weekly-num">${daysThisWeek || 0}</div><div class="weekly-lbl">Days Active</div></div>
      <div class="weekly-item"><div class="weekly-num">${streak || 0}</div><div class="weekly-lbl">Day Streak 🔥</div></div>
    </div>`;
}

// ── Incomplete streets map mode ───────────────────────────────────────────
let _incompleteModeHood    = null;
let _incompleteLayers      = {};

function showIncompleteOnMap() {
  const hoodName = document.getElementById('detail-hood-name').textContent;
  const hood     = NYC_NEIGHBORHOODS.find(h => h.name === hoodName);
  if (!hood) return;

  const streets = streetCache[hood.id] || loadStreetCache(hood.id);
  if (!streets) { showToast('Load streets first'); return; }

  const walked   = walkedStreets[hood.id] || new Set();
  const unwalked = streets.filter(s => !walked.has(s.id));
  if (!unwalked.length) { showToast('You\'ve walked every street here! 🏅'); return; }

  // Switch to map tab
  switchTab('map', document.querySelectorAll('.nav-btn')[0]);

  // Zoom to neighborhood bounds
  const [minLat, minLon, maxLat, maxLon] = hood.bounds;
  map.fitBounds([[minLat, minLon], [maxLat, maxLon]], { padding: [20, 20] });

  // Clear old incomplete layers
  exitIncompleteMode(true);

  _incompleteModeHood = hood;

  // Draw unwalked streets in orange
  for (const s of unwalked) {
    const layer = L.polyline(s.coords, { color: '#f97316', weight: 4, opacity: 0.85 })
      .bindPopup(`<b>${s.name}</b><br>🟠 Not walked yet`)
      .addTo(map);
    _incompleteLayers[s.id] = layer;
  }

  // Show banner + exit button
  document.getElementById('incomplete-banner').classList.remove('hidden');
  document.getElementById('incomplete-banner-text').textContent =
    `${unwalked.length} unwalked streets in ${hood.name}`;
  document.getElementById('incomplete-exit-btn').classList.remove('hidden');
}

function exitIncompleteMode(silent = false) {
  Object.values(_incompleteLayers).forEach(l => map.removeLayer(l));
  _incompleteLayers = {};
  _incompleteModeHood = null;
  document.getElementById('incomplete-banner').classList.add('hidden');
  document.getElementById('incomplete-exit-btn').classList.add('hidden');
  if (!silent) {
    // Restore normal street layers if a hood is loaded
    if (currentHood && hoodStreets.length) renderStreetLayers(currentHood);
  }
}

// ── Community heat map ────────────────────────────────────────────────────
let _heatmapActive  = false;
let _heatmapLayers  = {};
let _heatmapLoaded  = false;

const HEAT_COLORS = { hot: '#ef4444', warm: '#f97316', mild: '#eab308' };

async function toggleHeatmap() {
  const btn = document.getElementById('heatmap-btn');
  if (_heatmapActive) {
    // Turn off
    Object.values(_heatmapLayers).forEach(l => map.removeLayer(l));
    _heatmapLayers = {};
    _heatmapActive = false;
    btn.classList.remove('active');
    showToast('Heat map off');
    return;
  }

  _heatmapActive = true;
  btn.classList.add('active');
  showToast('Loading heat map…');

  try {
    const data = await fetch('/api/heatmap', { headers: authHeaders() }).then(r => r.json());
    if (!data.length) { showToast('No community data yet'); _heatmapActive = false; btn.classList.remove('active'); return; }

    // We only have street IDs — need to cross-reference with cached street geometry
    const streetGeoMap = {};
    for (const hood of NYC_NEIGHBORHOODS) {
      const cached = streetCache[hood.id] || loadStreetCache(hood.id);
      if (cached) for (const s of cached) streetGeoMap[s.id] = s.coords;
    }

    let drawn = 0;
    for (const item of data) {
      const coords = streetGeoMap[item.streetId];
      if (!coords) continue;
      const color  = HEAT_COLORS[item.tier] || HEAT_COLORS.mild;
      const weight = item.tier === 'hot' ? 7 : item.tier === 'warm' ? 5 : 3;
      const layer  = L.polyline(coords, { color, weight, opacity: 0.75 })
        .bindPopup(`<b>Popular street</b><br>🔥 Walked by ${item.userCount} people, ${item.totalWalks} times`)
        .addTo(map);
      _heatmapLayers[item.streetId] = layer;
      drawn++;
    }

    showToast(`Heat map: ${drawn} popular streets`);
  } catch(e) {
    showToast('Could not load heat map');
    _heatmapActive = false;
    btn.classList.remove('active');
  }
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

// ── Onboarding overlay ────────────────────────────────────────────────────

const ONBOARDING_STEPS = [
  {
    emoji: '🗺️',
    title: 'Welcome to NYC Street Walker',
    body:  'Track every street you walk across New York City. Your progress is saved automatically — no buttons needed.'
  },
  {
    emoji: '📍',
    title: 'Always-On Tracking',
    body:  'The app tracks your walk automatically using GPS. The green dot means you\'re being tracked. Red means you\'re moving too fast (vehicle). Yellow means uncertain.'
  },
  {
    emoji: '🏙️',
    title: 'Neighborhoods',
    body:  'Explore 55 NYC neighborhoods. Tap any neighborhood to see which streets you\'ve walked and which ones are left.'
  },
  {
    emoji: '🔥',
    title: 'Community Heat Map',
    body:  'Tap the 🔥 button on the map to see the most-walked streets across all users. Hot streets glow orange.'
  },
  {
    emoji: '👥',
    title: 'Walk with Friends',
    body:  'Tap Friends → + Invite to share a link. When a friend opens it, you\'re automatically connected and can see each other\'s streets.'
  }
];

let _obStep = 0;

function showOnboarding() {
  _obStep = 0;
  renderOnboardingStep();
  document.getElementById('onboarding-overlay').classList.remove('hidden');
}

function closeOnboarding() {
  document.getElementById('onboarding-overlay').classList.add('hidden');
  localStorage.setItem('onboarded', '1');
}

function onboardingNext() {
  if (_obStep < ONBOARDING_STEPS.length - 1) {
    _obStep++;
    renderOnboardingStep();
  } else {
    closeOnboarding();
  }
}

function renderOnboardingStep() {
  const step  = ONBOARDING_STEPS[_obStep];
  const total = ONBOARDING_STEPS.length;

  document.getElementById('onboarding-steps').innerHTML = `
    <div class="ob-step">
      <div class="ob-emoji">${step.emoji}</div>
      <h2 class="ob-title">${step.title}</h2>
      <p class="ob-body">${step.body}</p>
    </div>`;

  document.getElementById('onboarding-dots').innerHTML =
    Array.from({length: total}, (_, i) =>
      `<span class="ob-dot ${i === _obStep ? 'active' : ''}"></span>`
    ).join('');

  document.getElementById('ob-next').textContent =
    _obStep === total - 1 ? 'Get Started 🚶' : 'Next →';
  document.getElementById('ob-skip').style.display =
    _obStep === total - 1 ? 'none' : '';
}
