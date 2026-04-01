// NYC neighborhoods — curated ~55 culturally recognized areas
// Bounding boxes: [minLat, minLon, maxLat, maxLon]
// Modeled after the NYT neighborhood map / commonly recognized NYC areas

const NYC_NEIGHBORHOODS = [
  // ── Manhattan ─────────────────────────────────────────────────────────
  { id: 'financial-district',  name: 'Financial District',  borough: 'Manhattan',     bounds: [40.6990, -74.0200, 40.7095, -74.0050] },
  { id: 'battery-park-city',   name: 'Battery Park City',   borough: 'Manhattan',     bounds: [40.7040, -74.0200, 40.7140, -74.0130] },
  { id: 'tribeca',             name: 'Tribeca',             borough: 'Manhattan',     bounds: [40.7150, -74.0130, 40.7230, -74.0030] },
  { id: 'chinatown',           name: 'Chinatown',           borough: 'Manhattan',     bounds: [40.7130, -74.0040, 40.7185, -73.9960] },
  { id: 'little-italy',        name: 'Little Italy',        borough: 'Manhattan',     bounds: [40.7185, -74.0010, 40.7230, -73.9960] },
  { id: 'soho',                name: 'SoHo',                borough: 'Manhattan',     bounds: [40.7215, -74.0060, 40.7285, -73.9980] },
  { id: 'nolita',              name: 'Nolita',              borough: 'Manhattan',     bounds: [40.7225, -73.9980, 40.7265, -73.9930] },
  { id: 'lower-east-side',     name: 'Lower East Side',     borough: 'Manhattan',     bounds: [40.7130, -73.9950, 40.7230, -73.9780] },
  { id: 'east-village',        name: 'East Village',        borough: 'Manhattan',     bounds: [40.7230, -73.9960, 40.7310, -73.9770] },
  { id: 'west-village',        name: 'West Village',        borough: 'Manhattan',     bounds: [40.7310, -74.0100, 40.7390, -74.0010] },
  { id: 'greenwich-village',   name: 'Greenwich Village',   borough: 'Manhattan',     bounds: [40.7280, -74.0040, 40.7360, -73.9950] },
  { id: 'noho',                name: 'NoHo',                borough: 'Manhattan',     bounds: [40.7265, -73.9980, 40.7300, -73.9920] },
  { id: 'chelsea',             name: 'Chelsea',             borough: 'Manhattan',     bounds: [40.7400, -74.0070, 40.7540, -73.9960] },
  { id: 'hells-kitchen',       name: "Hell's Kitchen",      borough: 'Manhattan',     bounds: [40.7540, -74.0060, 40.7690, -73.9930] },
  { id: 'flatiron',            name: 'Flatiron District',   borough: 'Manhattan',     bounds: [40.7380, -73.9960, 40.7440, -73.9880] },
  { id: 'gramercy',            name: 'Gramercy Park',       borough: 'Manhattan',     bounds: [40.7360, -73.9900, 40.7430, -73.9820] },
  { id: 'murray-hill',         name: 'Murray Hill',         borough: 'Manhattan',     bounds: [40.7460, -73.9880, 40.7540, -73.9740] },
  { id: 'kips-bay',            name: 'Kips Bay',            borough: 'Manhattan',     bounds: [40.7380, -73.9820, 40.7460, -73.9750] },
  { id: 'midtown',             name: 'Midtown',             borough: 'Manhattan',     bounds: [40.7480, -73.9990, 40.7630, -73.9700] },
  { id: 'upper-east-side',     name: 'Upper East Side',     borough: 'Manhattan',     bounds: [40.7630, -73.9690, 40.7960, -73.9440] },
  { id: 'upper-west-side',     name: 'Upper West Side',     borough: 'Manhattan',     bounds: [40.7720, -73.9940, 40.8010, -73.9650] },
  { id: 'harlem',              name: 'Harlem',              borough: 'Manhattan',     bounds: [40.8030, -73.9660, 40.8250, -73.9270] },
  { id: 'spanish-harlem',      name: 'Spanish Harlem',      borough: 'Manhattan',     bounds: [40.7920, -73.9510, 40.8060, -73.9300] },
  { id: 'morningside-heights', name: 'Morningside Heights', borough: 'Manhattan',     bounds: [40.8040, -73.9710, 40.8140, -73.9580] },
  { id: 'washington-heights',  name: 'Washington Heights',  borough: 'Manhattan',     bounds: [40.8380, -73.9480, 40.8680, -73.9170] },
  { id: 'inwood',              name: 'Inwood',              borough: 'Manhattan',     bounds: [40.8670, -73.9360, 40.8800, -73.9130] },

  // ── Brooklyn ──────────────────────────────────────────────────────────
  { id: 'dumbo',               name: 'DUMBO',               borough: 'Brooklyn',      bounds: [40.7010, -73.9930, 40.7060, -73.9830] },
  { id: 'brooklyn-heights',    name: 'Brooklyn Heights',    borough: 'Brooklyn',      bounds: [40.6940, -74.0010, 40.7020, -73.9920] },
  { id: 'cobble-hill',         name: 'Cobble Hill',         borough: 'Brooklyn',      bounds: [40.6850, -73.9990, 40.6930, -73.9930] },
  { id: 'carroll-gardens',     name: 'Carroll Gardens',     borough: 'Brooklyn',      bounds: [40.6760, -74.0010, 40.6860, -73.9940] },
  { id: 'red-hook',            name: 'Red Hook',            borough: 'Brooklyn',      bounds: [40.6700, -74.0150, 40.6810, -74.0010] },
  { id: 'gowanus',             name: 'Gowanus',             borough: 'Brooklyn',      bounds: [40.6720, -73.9920, 40.6820, -73.9830] },
  { id: 'park-slope',          name: 'Park Slope',          borough: 'Brooklyn',      bounds: [40.6620, -73.9920, 40.6840, -73.9760] },
  { id: 'boerum-hill',         name: 'Boerum Hill',         borough: 'Brooklyn',      bounds: [40.6840, -73.9930, 40.6910, -73.9840] },
  { id: 'fort-greene',         name: 'Fort Greene',         borough: 'Brooklyn',      bounds: [40.6860, -73.9820, 40.6950, -73.9720] },
  { id: 'clinton-hill',        name: 'Clinton Hill',        borough: 'Brooklyn',      bounds: [40.6840, -73.9730, 40.6960, -73.9610] },
  { id: 'prospect-heights',    name: 'Prospect Heights',    borough: 'Brooklyn',      bounds: [40.6740, -73.9720, 40.6840, -73.9610] },
  { id: 'crown-heights',       name: 'Crown Heights',       borough: 'Brooklyn',      bounds: [40.6590, -73.9590, 40.6780, -73.9340] },
  { id: 'bed-stuy',            name: 'Bedford-Stuyvesant',  borough: 'Brooklyn',      bounds: [40.6770, -73.9580, 40.6980, -73.9230] },
  { id: 'bushwick',            name: 'Bushwick',            borough: 'Brooklyn',      bounds: [40.6920, -73.9310, 40.7090, -73.9040] },
  { id: 'williamsburg',        name: 'Williamsburg',        borough: 'Brooklyn',      bounds: [40.7010, -73.9740, 40.7180, -73.9380] },
  { id: 'greenpoint',          name: 'Greenpoint',          borough: 'Brooklyn',      bounds: [40.7200, -73.9600, 40.7360, -73.9420] },
  { id: 'sunset-park',         name: 'Sunset Park',         borough: 'Brooklyn',      bounds: [40.6390, -74.0150, 40.6580, -73.9890] },
  { id: 'bay-ridge',           name: 'Bay Ridge',           borough: 'Brooklyn',      bounds: [40.6110, -74.0360, 40.6380, -74.0100] },
  { id: 'flatbush',            name: 'Flatbush',            borough: 'Brooklyn',      bounds: [40.6350, -73.9770, 40.6580, -73.9480] },
  { id: 'coney-island',        name: 'Coney Island',        borough: 'Brooklyn',      bounds: [40.5730, -74.0100, 40.5900, -73.9870] },

  // ── Queens ────────────────────────────────────────────────────────────
  { id: 'long-island-city',    name: 'Long Island City',    borough: 'Queens',        bounds: [40.7390, -73.9570, 40.7570, -73.9290] },
  { id: 'astoria',             name: 'Astoria',             borough: 'Queens',        bounds: [40.7640, -73.9430, 40.7840, -73.9060] },
  { id: 'sunnyside',           name: 'Sunnyside',           borough: 'Queens',        bounds: [40.7400, -73.9250, 40.7490, -73.9100] },
  { id: 'jackson-heights',     name: 'Jackson Heights',     borough: 'Queens',        bounds: [40.7460, -73.9050, 40.7580, -73.8790] },
  { id: 'flushing',            name: 'Flushing',            borough: 'Queens',        bounds: [40.7570, -73.8390, 40.7730, -73.8150] },
  { id: 'forest-hills',        name: 'Forest Hills',        borough: 'Queens',        bounds: [40.7100, -73.8620, 40.7260, -73.8370] },
  { id: 'jamaica',             name: 'Jamaica',             borough: 'Queens',        bounds: [40.6920, -73.8200, 40.7100, -73.7840] },
  { id: 'rockaway',            name: 'Rockaway Beach',      borough: 'Queens',        bounds: [40.5770, -73.9120, 40.6010, -73.7710] },

  // ── The Bronx ─────────────────────────────────────────────────────────
  { id: 'mott-haven',          name: 'Mott Haven',          borough: 'The Bronx',     bounds: [40.8020, -73.9300, 40.8130, -73.9100] },
  { id: 'south-bronx',         name: 'South Bronx',         borough: 'The Bronx',     bounds: [40.8130, -73.9240, 40.8290, -73.9020] },
  { id: 'fordham',             name: 'Fordham',             borough: 'The Bronx',     bounds: [40.8550, -73.9060, 40.8700, -73.8850] },
  { id: 'riverdale',           name: 'Riverdale',           borough: 'The Bronx',     bounds: [40.8820, -73.9340, 40.9030, -73.9060] },
  { id: 'pelham-bay',          name: 'Pelham Bay',          borough: 'The Bronx',     bounds: [40.8530, -73.8290, 40.8730, -73.7980] },

  // ── Staten Island ─────────────────────────────────────────────────────
  { id: 'st-george',           name: 'St. George',          borough: 'Staten Island', bounds: [40.6380, -74.0800, 40.6520, -74.0650] },
  { id: 'stapleton',           name: 'Stapleton',           borough: 'Staten Island', bounds: [40.6230, -74.0760, 40.6380, -74.0640] },
];

const BOROUGH_ORDER = ['Manhattan', 'Brooklyn', 'Queens', 'The Bronx', 'Staten Island'];
