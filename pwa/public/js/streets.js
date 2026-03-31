// ── Streets: Overpass API + GPS street matching ──────────────────────────

const MATCH_THRESHOLD_M = 18; // meters from street to count as walked
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Cache streets in memory by neighborhood id
const streetCache = {};

async function fetchStreetsForNeighborhood(hood) {
  if (streetCache[hood.id]) return streetCache[hood.id];

  // Try localStorage cache first
  const cached = loadStreetCache(hood.id);
  if (cached) { streetCache[hood.id] = cached; return cached; }

  const [minLat, minLon, maxLat, maxLon] = hood.bounds;
  const query = `[out:json][timeout:25];
way["highway"~"^(residential|primary|secondary|tertiary|unclassified|living_street|pedestrian|footway|path|service)$"]["name"](${minLat},${minLon},${maxLat},${maxLon});
out geom;`;

  const resp = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (!resp.ok) throw new Error('Overpass request failed');
  const data = await resp.json();
  const streets = parseOverpassWays(data, hood.id);
  streetCache[hood.id] = streets;
  saveStreetCache(hood.id, streets);
  return streets;
}

function parseOverpassWays(data, neighborhoodId) {
  const seen = new Set();
  return (data.elements || [])
    .filter(el => el.type === 'way' && el.tags && el.tags.name && el.geometry)
    .map(el => ({
      id: String(el.id),
      name: el.tags.name,
      neighborhoodId,
      coords: el.geometry.map(p => [p.lat, p.lon]),
      highway: el.tags.highway
    }))
    .filter(s => {
      // Dedupe by name within same neighborhood (keep longest)
      const key = neighborhoodId + '|' + s.name;
      if (!seen.has(key)) { seen.add(key); return true; }
      return false;
    });
}

// ── Street matching ───────────────────────────────────────────────────────

function matchStreetsToTrack(gpsPoints, streets) {
  if (!gpsPoints.length || !streets.length) return new Set();
  const matched = new Set();
  for (const street of streets) {
    if (isStreetWalked(gpsPoints, street)) matched.add(street.id);
  }
  return matched;
}

function isStreetWalked(gpsPoints, street) {
  if (street.coords.length < 2) return false;
  let coveredSegments = 0;
  const total = street.coords.length - 1;

  for (let i = 0; i < total; i++) {
    const segStart = street.coords[i];
    const segEnd   = street.coords[i + 1];
    // Does any GPS point fall within threshold of this segment?
    const hit = gpsPoints.some(pt =>
      distToSegment(pt[0], pt[1], segStart[0], segStart[1], segEnd[0], segEnd[1]) <= MATCH_THRESHOLD_M
    );
    if (hit) coveredSegments++;
  }
  return (coveredSegments / total) >= 0.55;
}

function distToSegment(px, py, ax, ay, bx, by) {
  // All in degrees → convert to meters via haversine for end‑points, then use
  // dot‑product ratio in a flat approximation (accurate enough for short segments)
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;

  // Midpoint for flat-earth approx
  const midLat = toRad((ax + bx) / 2);
  const cosLat = Math.cos(midLat);

  // Convert to local metres
  const _px = px * R * toRad(1);
  const _py = py * cosLat * R * toRad(1);
  const _ax = ax * R * toRad(1);
  const _ay = ay * cosLat * R * toRad(1);
  const _bx = bx * R * toRad(1);
  const _by = by * cosLat * R * toRad(1);

  const dx = _bx - _ax, dy = _by - _ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversine(px, py, ax, ay);

  let t = ((_px - _ax) * dx + (_py - _ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = _ax + t * dx, cy = _ay + t * dy;
  const ex = _px - cx, ey = _py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function trackDistanceKm(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversine(points[i-1][0], points[i-1][1], points[i][0], points[i][1]);
  }
  return d / 1000;
}

// ── Cache helpers ─────────────────────────────────────────────────────────

function saveStreetCache(id, streets) {
  try { localStorage.setItem('streets:' + id, JSON.stringify(streets)); } catch(_) {}
}

function loadStreetCache(id) {
  try {
    const raw = localStorage.getItem('streets:' + id);
    return raw ? JSON.parse(raw) : null;
  } catch(_) { return null; }
}

function clearStreetCache(id) {
  delete streetCache[id];
  try { localStorage.removeItem('streets:' + id); } catch(_) {}
}

// Street length estimate in metres
function streetLengthM(street) {
  let d = 0;
  for (let i = 1; i < street.coords.length; i++) {
    d += haversine(street.coords[i-1][0], street.coords[i-1][1], street.coords[i][0], street.coords[i][1]);
  }
  return d;
}
