// ── NYC Street Walker — Main App ──────────────────────────────────────────

// ── State ─────────────────────────────────────────────────────────────────
let map = null;
let currentUserId = null;
let currentUserName = '';
let isTracking = false;
let gpsTrack = [];        // [[lat,lon], ...]
let watchId = null;
let walkStartTime = null;
let walkTimer = null;
let walkedStreets = {};   // { neighborhoodId: Set<streetId> }
let friendsData = [];
let currentHood = null;   // currently loaded neighborhood
let hoodStreets = [];     // Street[] for current hood
let streetLayers = {};    // { streetId: polyline }
let friendWalked = {};    // { friendId: Set<streetId> }
let currentFriendIndex = 0;
let streetFilter = 'all';

// ── Boot ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  const saved = localStorage.getItem('userId');
  if (saved) {
    currentUserId = saved;
    currentUserName = localStorage.getItem('userName') || 'You';
    bootApp();
  } else {
    document.getElementById('signin-screen').classList.add('active');
  }

  // Sign-in wiring
  document.getElementById('signin-btn').addEventListener('click', doSignIn);
  document.getElementById('signin-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSignIn();
  });
  document.getElementById('show-login').addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('login-form').classList.toggle('hidden');
  });
  document.getElementById('login-btn').addEventListener('click', doLogin);
  document.getElementById('login-id').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  // Walk button
  document.getElementById('walk-btn').addEventListener('click', toggleWalk);

  // Borough filter
  document.getElementById('borough-filter').addEventListener('change', renderNeighborhoodList);

  // Map hood load button
  document.getElementById('map-hood-load').addEventListener('click', () => {
    if (currentHood) loadHoodOnMap(currentHood);
  });
});

// ── Sign In ───────────────────────────────────────────────────────────────
async function doSignIn() {
  const name = document.getElementById('signin-name').value.trim();
  if (!name) { showToast('Enter your name'); return; }
  try {
    const user = await apiCreateUser(name);
    currentUserId = user.id;
    currentUserName = user.name;
    localStorage.setItem('userId', user.id);
    localStorage.setItem('userName', user.name);
    bootApp();
  } catch(e) { showToast('Error: ' + e.message); }
}

async function doLogin() {
  const id = document.getElementById('login-id').value.trim();
  if (!id) return;
  try {
    const user = await apiGetUser(id);
    currentUserId = user.id;
    currentUserName = user.name;
    localStorage.setItem('userId', user.id);
    localStorage.setItem('userName', user.name);
    bootApp();
  } catch(e) { showToast('ID not found'); }
}

function getCurrentUserId() { return currentUserId; }

function signOut() {
  localStorage.removeItem('userId');
  localStorage.removeItem('userName');
  location.reload();
}

// ── Boot app ──────────────────────────────────────────────────────────────
async function bootApp() {
  document.getElementById('signin-screen').classList.remove('active');
  document.getElementById('signin-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('app').classList.add('active');

  // Load walked streets from server
  const raw = await apiGetWalkedStreets(currentUserId).catch(() => ({}));
  walkedStreets = {};
  for (const [hid, ids] of Object.entries(raw)) {
    walkedStreets[hid] = new Set(ids);
  }

  initMap();
  renderNeighborhoodList();
  renderProfile();
  loadFriends();
}

// ── Map ───────────────────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', {
    center: [40.7128, -74.0060],
    zoom: 14,
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  L.control.attribution({ position: 'bottomleft', prefix: false })
    .addAttribution('© OpenStreetMap · CartoDB')
    .addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Detect which neighborhood the user is looking at when they pan
  map.on('moveend', onMapMoved);
  onMapMoved();
}

function onMapMoved() {
  const center = map.getCenter();
  const hood = hoodForCoords(center.lat, center.lng);
  if (hood) {
    currentHood = hood;
    const panel = document.getElementById('map-hood-panel');
    document.getElementById('map-hood-name').textContent = hood.name;
    panel.classList.remove('hidden');
  } else {
    document.getElementById('map-hood-panel').classList.add('hidden');
  }
}

function hoodForCoords(lat, lon) {
  return NYC_NEIGHBORHOODS.find(h => {
    const [minLat, minLon, maxLat, maxLon] = h.bounds;
    return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
  }) || null;
}

async function loadHoodOnMap(hood) {
  showToast('Loading streets for ' + hood.name + '…');
  document.getElementById('map-hood-load').textContent = '…';

  try {
    hoodStreets = await fetchStreetsForNeighborhood(hood);
    renderStreetLayers(hood);
    document.getElementById('map-hood-load').textContent = 'Reload';
    showToast(`${hoodStreets.length} streets loaded`);
  } catch(e) {
    showToast('Could not load streets (try again)');
    document.getElementById('map-hood-load').textContent = 'Load Streets';
  }
}

function renderStreetLayers(hood) {
  // Remove old layers
  Object.values(streetLayers).forEach(l => map.removeLayer(l));
  streetLayers = {};

  const myWalked = walkedStreets[hood.id] || new Set();

  for (const street of hoodStreets) {
    const walkedByMe = myWalked.has(street.id);

    // Check friends
    let friendColorVal = null;
    let fi = 0;
    for (const friend of friendsData) {
      const fw = friendWalked[friend.id] || new Set();
      if (fw.has(street.id)) { friendColorVal = friendColor(fi); break; }
      fi++;
    }

    const color = walkedByMe ? '#22c55e' : (friendColorVal || '#64748b');
    const weight = walkedByMe || friendColorVal ? 5 : 2;
    const opacity = walkedByMe || friendColorVal ? 0.9 : 0.35;

    const line = L.polyline(street.coords, { color, weight, opacity })
      .bindPopup(`<b>${street.name}</b><br>${walkedByMe ? '✅ You walked this' : (friendColorVal ? '👤 Friend walked this' : '⬜ Not walked')}`, { className: 'map-popup' })
      .addTo(map);

    streetLayers[street.id] = line;
  }
}

// Update a single street's appearance after walking
function refreshStreetLayer(streetId, hoodId) {
  const street = hoodStreets.find(s => s.id === streetId);
  if (!street || !streetLayers[streetId]) return;
  const myWalked = walkedStreets[hoodId] || new Set();
  const walkedByMe = myWalked.has(streetId);
  const layer = streetLayers[streetId];
  layer.setStyle({ color: walkedByMe ? '#22c55e' : '#64748b', weight: walkedByMe ? 5 : 2, opacity: walkedByMe ? 0.9 : 0.35 });
}

// ── Walk tracking ─────────────────────────────────────────────────────────
function toggleWalk() {
  if (isTracking) stopWalk();
  else startWalk();
}

function startWalk() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported');
    return;
  }

  isTracking = true;
  gpsTrack = [];
  walkStartTime = Date.now();

  const btn = document.getElementById('walk-btn');
  btn.classList.add('stopping');
  document.getElementById('walk-icon').textContent = '⏹';
  document.getElementById('walk-label').textContent = 'Stop Walk';
  document.getElementById('tracking-bar').classList.remove('hidden');

  walkTimer = setInterval(updateTrackingBar, 1000);

  watchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      if (accuracy > 35) return; // ignore inaccurate fixes
      const pt = [lat, lon];
      gpsTrack.push(pt);
      map.setView(pt, Math.max(map.getZoom(), 16), { animate: true });
      tryMatchStreets();
    },
    err => showToast('Location error: ' + err.message),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
}

async function stopWalk() {
  isTracking = false;
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  clearInterval(walkTimer);

  const btn = document.getElementById('walk-btn');
  btn.classList.remove('stopping');
  document.getElementById('walk-icon').textContent = '🚶';
  document.getElementById('walk-label').textContent = 'Start Walk';
  document.getElementById('tracking-bar').classList.add('hidden');

  if (gpsTrack.length < 5) { showToast('Walk too short to save'); return; }

  // Final match across all loaded hoods
  await finalizeWalk();
}

function updateTrackingBar() {
  const elapsed = Math.floor((Date.now() - walkStartTime) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = String(elapsed % 60).padStart(2, '0');
  document.getElementById('track-duration').textContent = `${m}:${s}`;
  document.getElementById('track-distance').textContent = trackDistanceKm(gpsTrack).toFixed(2) + ' km';

  let count = 0;
  for (const set of Object.values(walkedStreets)) count += set.size;
  // Just count today's new streets: tracked via a session set
  document.getElementById('track-streets').textContent = (window._sessionNewStreets || 0) + ' new';
}

function tryMatchStreets() {
  // Match against currently loaded hood streets
  if (!hoodStreets.length || !currentHood) return;
  const hood = currentHood;
  const newlyMatched = matchStreetsToTrack(gpsTrack, hoodStreets);
  if (!walkedStreets[hood.id]) walkedStreets[hood.id] = new Set();

  let newCount = 0;
  for (const id of newlyMatched) {
    if (!walkedStreets[hood.id].has(id)) {
      walkedStreets[hood.id].add(id);
      refreshStreetLayer(id, hood.id);
      newCount++;
    }
  }
  if (newCount > 0) {
    window._sessionNewStreets = (window._sessionNewStreets || 0) + newCount;
    showToast(`+${newCount} street${newCount > 1 ? 's' : ''} walked! 🎉`);
  }
}

async function finalizeWalk() {
  // For each neighborhood with walked streets, save to server
  const promises = [];
  for (const [hoodId, ids] of Object.entries(walkedStreets)) {
    if (ids.size) {
      promises.push(apiSaveWalkedStreets(currentUserId, ids, hoodId).catch(() => {}));
    }
  }
  await Promise.all(promises);
  window._sessionNewStreets = 0;
  renderProfile();
  showToast('Walk saved! ✅');
}

// ── Neighborhoods tab ─────────────────────────────────────────────────────
function renderNeighborhoodList() {
  const boroughFilter = document.getElementById('borough-filter').value;
  const container = document.getElementById('neighborhood-list');

  const filtered = boroughFilter
    ? NYC_NEIGHBORHOODS.filter(h => h.borough === boroughFilter)
    : NYC_NEIGHBORHOODS;

  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><div class="emoji">🏙️</div><h3>No neighborhoods</h3></div>';
    return;
  }

  // Group by borough
  const grouped = {};
  for (const h of filtered) {
    if (!grouped[h.borough]) grouped[h.borough] = [];
    grouped[h.borough].push(h);
  }

  let html = '';
  for (const borough of BOROUGH_ORDER) {
    if (!grouped[borough]) continue;
    if (!boroughFilter) html += `<div style="padding:10px 0 4px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em">${borough}</div>`;
    for (const h of grouped[borough]) {
      const walked = (walkedStreets[h.id] || new Set()).size;
      // We don't know total until loaded; use cached if available
      const cached = streetCache[h.id] || loadStreetCache(h.id);
      const total = cached ? cached.length : '?';
      const pct = (typeof total === 'number' && total > 0) ? Math.round(walked / total * 100) : 0;
      const r = 18, circ = 2 * Math.PI * r;
      const dash = (pct / 100) * circ;

      html += `
      <div class="hood-card" onclick="openNeighborhoodDetail('${h.id}')">
        <div class="hood-ring">
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="${r}" fill="none" stroke="#334155" stroke-width="4"/>
            <circle cx="24" cy="24" r="${r}" fill="none" stroke="#22c55e" stroke-width="4"
              stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
          </svg>
          <div class="hood-ring-pct">${pct}%</div>
        </div>
        <div class="hood-info">
          <div class="hood-name">${escHtml(h.name)}</div>
          <div class="hood-sub">${walked}${typeof total === 'number' ? '/' + total : ''} streets</div>
        </div>
        <div class="borough-badge">${h.borough.replace('The ','')}</div>
      </div>`;
    }
  }
  container.innerHTML = html;
}

async function openNeighborhoodDetail(hoodId) {
  const hood = NYC_NEIGHBORHOODS.find(h => h.id === hoodId);
  if (!hood) return;

  // Switch to detail view
  document.getElementById('tab-neighborhoods').classList.remove('active');
  document.getElementById('tab-neighborhoods').style.display = 'none';
  const detail = document.getElementById('tab-hood-detail');
  detail.classList.add('active');
  detail.style.display = 'flex';

  document.getElementById('detail-hood-name').textContent = hood.name;
  document.getElementById('street-list').innerHTML = '<div class="empty-state"><div class="emoji">⏳</div><h3>Loading streets…</h3></div>';
  streetFilter = 'all';
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));

  let streets = streetCache[hood.id] || loadStreetCache(hood.id);
  if (!streets) {
    try {
      streets = await fetchStreetsForNeighborhood(hood);
    } catch(e) {
      document.getElementById('street-list').innerHTML = '<div class="empty-state"><div class="emoji">❌</div><h3>Could not load streets</h3><p>Check your connection</p></div>';
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
  const walked = walkedStreets[hood.id] || new Set();
  const walkedCount = streets.filter(s => walked.has(s.id)).length;
  const pct = streets.length ? Math.round(walkedCount / streets.length * 100) : 0;

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

  const hood = NYC_NEIGHBORHOODS.find(h =>
    document.getElementById('detail-hood-name').textContent === h.name
  );
  if (!hood) return;
  const streets = streetCache[hood.id] || loadStreetCache(hood.id) || [];
  renderStreetList(hood, streets);
}

function renderStreetList(hood, streets) {
  const walked = walkedStreets[hood.id] || new Set();
  let list = streets;
  if (streetFilter === 'walked') list = streets.filter(s => walked.has(s.id));
  if (streetFilter === 'unwalked') list = streets.filter(s => !walked.has(s.id));

  if (!list.length) {
    document.getElementById('street-list').innerHTML =
      '<div class="empty-state"><div class="emoji">🔍</div><h3>Nothing here</h3></div>';
    return;
  }

  document.getElementById('street-list').innerHTML = list.map(s => {
    const isWalked = walked.has(s.id);
    const lenM = streetLengthM(s);
    const lenStr = lenM > 999 ? (lenM/1000).toFixed(1)+'km' : Math.round(lenM)+'m';

    // Which friends walked this?
    const friendBadges = friendsData.map((f, i) => {
      const fw = friendWalked[f.id] || new Set();
      return fw.has(s.id) ? `<span style="color:${friendColor(i)};font-size:12px" title="${escHtml(f.name)}">●</span>` : '';
    }).join('');

    return `
    <div class="street-row">
      <div class="street-check ${isWalked ? 'walked' : 'unwalked'}">${isWalked ? '✅' : '○'}</div>
      <div class="street-name">${escHtml(s.name)}</div>
      ${friendBadges}
      <div class="street-len">${lenStr}</div>
    </div>`;
  }).join('');
}

// ── Friends tab ───────────────────────────────────────────────────────────
async function loadFriends() {
  try {
    const friends = await apiGetFriends(currentUserId);
    friendsData = friends;

    // Load walked streets for each friend
    for (const f of friends) {
      try {
        const raw = await apiGetWalkedStreets(f.id);
        const allIds = Object.values(raw).flat();
        friendWalked[f.id] = new Set(allIds);
        f.walked_ids = allIds;
        f.total_walked = allIds.length;
      } catch(_) {}
    }

    renderFriendsList(friends, walkedStreets);
  } catch(e) {
    document.getElementById('friends-list').innerHTML =
      '<div class="empty-state"><div class="emoji">😕</div><h3>Could not load friends</h3></div>';
  }
}

function showFriendDetail(friendId, colorIndex) {
  const friend = friendsData.find(f => f.id === friendId);
  if (!friend) return;
  // Simple: switch to map tab and show their streets
  switchTab('map', document.querySelector('.nav-btn'));
  showToast(`Showing ${friend.name}'s streets in green on the map`);
  // Re-render map layers highlighting this friend
  currentFriendIndex = colorIndex;
  if (currentHood && hoodStreets.length) renderStreetLayers(currentHood);
}

// ── Profile tab ───────────────────────────────────────────────────────────
function renderProfile() {
  document.getElementById('profile-name').textContent = currentUserName;
  document.getElementById('your-user-id').textContent = currentUserId;
  document.getElementById('profile-user-id').textContent = currentUserId;
  document.getElementById('profile-joined').textContent = 'Member since ' + new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Count totals
  let totalStreets = 0, totalHoods = 0;
  const boroughCounts = {};
  for (const hood of NYC_NEIGHBORHOODS) {
    const walked = walkedStreets[hood.id] || new Set();
    const cached = streetCache[hood.id] || loadStreetCache(hood.id);
    const total = cached ? cached.length : 0;
    const count = walked.size;
    if (count > 0) {
      totalStreets += count;
      if (total > 0 && count === total) totalHoods++;
      boroughCounts[hood.borough] = (boroughCounts[hood.borough] || 0) + count;
    }
  }

  // Avatar
  const colors = ['#22c55e','#3b82f6','#f97316','#a855f7','#ec4899'];
  const color = colors[currentUserName.charCodeAt(0) % colors.length];
  const av = document.getElementById('profile-avatar');
  av.textContent = initials(currentUserName);
  av.style.cssText = avatarStyle(color);

  document.getElementById('profile-stats').innerHTML = `
    <div class="stat-card"><div class="icon">🏃</div><div class="num">${totalStreets}</div><div class="lbl">Streets Walked</div></div>
    <div class="stat-card"><div class="icon">🏙️</div><div class="num">${totalHoods}</div><div class="lbl">Hoods Completed</div></div>
    <div class="stat-card"><div class="icon">👥</div><div class="num">${friendsData.length}</div><div class="lbl">Friends</div></div>
    <div class="stat-card"><div class="icon">🗺️</div><div class="num">${Object.keys(walkedStreets).length}</div><div class="lbl">Neighborhoods</div></div>
  `;

  // Borough breakdown
  const maxCount = Math.max(...Object.values(boroughCounts), 1);
  let bars = '';
  for (const borough of BOROUGH_ORDER) {
    const count = boroughCounts[borough] || 0;
    const pct = Math.round(count / maxCount * 100);
    bars += `
    <div class="bar-row">
      <div class="bar-label">${borough.replace('The ','')}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <div class="bar-count">${count}</div>
    </div>`;
  }
  document.getElementById('borough-breakdown').innerHTML = `<h3>By Borough</h3>${bars}`;
}

// ── Tab switching ─────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(t => {
    t.classList.remove('active');
    t.style.display = 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const target = document.getElementById('tab-' + name);
  target.classList.add('active');
  target.style.display = 'flex';

  // Highlight the tapped nav button
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabOrder = ['map','neighborhoods','friends','profile'];
  const idx = tabOrder.indexOf(name);
  if (idx >= 0) navBtns[idx].classList.add('active');

  if (name === 'map' && map) setTimeout(() => map.invalidateSize(), 100);
  if (name === 'neighborhoods') renderNeighborhoodList();
  if (name === 'friends') loadFriends();
  if (name === 'profile') renderProfile();
}

// ── Toast ─────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}
