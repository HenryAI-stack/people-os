const LOOKUP = {
  'usa': 'US', 'united states': 'US', 'united states of america': 'US',
  'america': 'US', 'u.s.a.': 'US', 'u.s.': 'US',
  'new york': 'US', 'nyc': 'US', 'new york city': 'US', 'northbrook': 'US',
  'san francisco': 'US', 'los angeles': 'US', 'chicago': 'US',
  'boston': 'US', 'seattle': 'US', 'austin': 'US', 'miami': 'US',
  'denver': 'US', 'atlanta': 'US', 'dallas': 'US', 'houston': 'US',
  'washington': 'US', 'washington dc': 'US', 'portland': 'US',
  'nashville': 'US', 'minneapolis': 'US', 'phoenix': 'US', 'las vegas': 'US',
  'austria': 'AT', 'österreich': 'AT',
  'vienna': 'AT', 'wien': 'AT', 'graz': 'AT', 'salzburg': 'AT',
  'linz': 'AT', 'innsbruck': 'AT', 'klagenfurt': 'AT',
  'germany': 'DE', 'deutschland': 'DE',
  'berlin': 'DE', 'munich': 'DE', 'münchen': 'DE', 'hamburg': 'DE',
  'frankfurt': 'DE', 'cologne': 'DE', 'köln': 'DE', 'düsseldorf': 'DE',
  'stuttgart': 'DE', 'leipzig': 'DE', 'dortmund': 'DE',
  'uk': 'GB', 'united kingdom': 'GB', 'great britain': 'GB',
  'england': 'GB', 'britain': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'london': 'GB', 'manchester': 'GB', 'birmingham': 'GB', 'edinburgh': 'GB',
  'glasgow': 'GB', 'bristol': 'GB', 'leeds': 'GB', 'liverpool': 'GB',
  'france': 'FR', 'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR',
  'toulouse': 'FR', 'nice': 'FR', 'bordeaux': 'FR', 'lille': 'FR',
  'switzerland': 'CH', 'schweiz': 'CH', 'suisse': 'CH',
  'zurich': 'CH', 'zürich': 'CH', 'geneva': 'CH', 'bern': 'CH', 'basel': 'CH',
  'netherlands': 'NL', 'holland': 'NL', 'the netherlands': 'NL',
  'amsterdam': 'NL', 'rotterdam': 'NL', 'utrecht': 'NL', 'eindhoven': 'NL',
  'spain': 'ES', 'españa': 'ES',
  'madrid': 'ES', 'barcelona': 'ES', 'seville': 'ES', 'valencia': 'ES',
  'italy': 'IT', 'italia': 'IT',
  'rome': 'IT', 'milan': 'IT', 'milano': 'IT', 'florence': 'IT',
  'naples': 'IT', 'turin': 'IT', 'torino': 'IT', 'bologna': 'IT',
  'poland': 'PL', 'polska': 'PL',
  'warsaw': 'PL', 'warszawa': 'PL', 'krakow': 'PL', 'kraków': 'PL',
  'wroclaw': 'PL', 'gdansk': 'PL',
  'sweden': 'SE', 'sverige': 'SE',
  'stockholm': 'SE', 'gothenburg': 'SE', 'göteborg': 'SE', 'malmö': 'SE',
  'norway': 'NO', 'norge': 'NO', 'oslo': 'NO', 'bergen': 'NO',
  'denmark': 'DK', 'danmark': 'DK', 'copenhagen': 'DK', 'københavn': 'DK',
  'finland': 'FI', 'suomi': 'FI', 'helsinki': 'FI',
  'belgium': 'BE', 'belgique': 'BE', 'brussels': 'BE', 'bruxelles': 'BE',
  'portugal': 'PT', 'lisbon': 'PT', 'lisboa': 'PT', 'porto': 'PT',
  'czech republic': 'CZ', 'czechia': 'CZ', 'prague': 'CZ', 'praha': 'CZ',
  'hungary': 'HU', 'budapest': 'HU',
  'romania': 'RO', 'bucharest': 'RO',
  'greece': 'GR', 'athens': 'GR', 'thessaloniki': 'GR',
  'turkey': 'TR', 'istanbul': 'TR', 'ankara': 'TR',
  'india': 'IN', 'mumbai': 'IN', 'bangalore': 'IN', 'bengaluru': 'IN',
  'delhi': 'IN', 'new delhi': 'IN', 'hyderabad': 'IN', 'chennai': 'IN', 'pune': 'IN',
  'china': 'CN', 'beijing': 'CN', 'shanghai': 'CN', 'shenzhen': 'CN',
  'japan': 'JP', 'tokyo': 'JP', 'osaka': 'JP', 'kyoto': 'JP',
  'south korea': 'KR', 'korea': 'KR', 'seoul': 'KR',
  'singapore': 'SG',
  'australia': 'AU', 'sydney': 'AU', 'melbourne': 'AU', 'brisbane': 'AU',
  'canada': 'CA', 'toronto': 'CA', 'vancouver': 'CA', 'montreal': 'CA',
  'brazil': 'BR', 'são paulo': 'BR', 'sao paulo': 'BR', 'rio': 'BR',
  'uae': 'AE', 'united arab emirates': 'AE', 'dubai': 'AE', 'abu dhabi': 'AE',
  'israel': 'IL', 'tel aviv': 'IL',
  'ireland': 'IE', 'dublin': 'IE',
  'new zealand': 'NZ', 'auckland': 'NZ', 'wellington': 'NZ',
  'mexico': 'MX', 'mexico city': 'MX', 'guadalajara': 'MX',
  'ukraine': 'UA', 'kyiv': 'UA', 'kiev': 'UA',
  'russia': 'RU', 'moscow': 'RU',
  'remote': null, 'global': null, 'worldwide': null,
}

function lookupIn(table, str) {
  const s = str.trim().toLowerCase()
  if (!s) return null
  if (s in table) return table[s]
  if (table === LOOKUP && /^[a-z]{2}$/i.test(s)) return s.toUpperCase()
  const sortedKeys = Object.keys(table).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[\\s,./])${escaped}([\\s,./]|$)`, 'i')
    if (re.test(s)) return table[key]
  }
  return null
}

// Prefer the part after the last comma (usually country/city), fall back to
// the whole string. Shared by getCountryCode and getCoords so both agree on
// which token in a free-text location actually matched.
function lookup(table, location) {
  if (!location) return null
  const parts = location.split(',').map((p) => p.trim())
  if (parts.length > 1) {
    const hit = lookupIn(table, parts[parts.length - 1])
    if (hit) return hit
  }
  return lookupIn(table, location)
}

export function getCountryCode(location) {
  return lookup(LOOKUP, location)
}

export function flagUrl(code) {
  if (!code) return null
  // Use 2× size image (40x30) displayed at 20x15 for crisp rendering on all screens
  return `https://flagcdn.com/40x30/${code.toLowerCase()}.png`
}

// City-level [lat, lon] centroids for the same free-text locations, falling
// back to the country's capital/largest-metro when only a country is given.
// Keys mirror LOOKUP's city entries; countries without their own city entry
// map straight to their capital.
const COORDS = {
  'usa': [39.8283, -98.5795], 'united states': [39.8283, -98.5795],
  'united states of america': [39.8283, -98.5795], 'america': [39.8283, -98.5795],
  'u.s.a.': [39.8283, -98.5795], 'u.s.': [39.8283, -98.5795],
  'new york': [40.7128, -74.0060], 'nyc': [40.7128, -74.0060], 'new york city': [40.7128, -74.0060],
  'northbrook': [42.1275, -87.8289],
  'san francisco': [37.7749, -122.4194], 'los angeles': [34.0522, -118.2437],
  'chicago': [41.8781, -87.6298], 'boston': [42.3601, -71.0589], 'seattle': [47.6062, -122.3321],
  'austin': [30.2672, -97.7431], 'miami': [25.7617, -80.1918], 'denver': [39.7392, -104.9903],
  'atlanta': [33.7490, -84.3880], 'dallas': [32.7767, -96.7970], 'houston': [29.7604, -95.3698],
  'washington': [38.9072, -77.0369], 'washington dc': [38.9072, -77.0369],
  'portland': [45.5152, -122.6784], 'nashville': [36.1627, -86.7816], 'minneapolis': [44.9778, -93.2650],
  'phoenix': [33.4484, -112.0740], 'las vegas': [36.1699, -115.1398],
  'austria': [48.2082, 16.3738], 'österreich': [48.2082, 16.3738],
  'vienna': [48.2082, 16.3738], 'wien': [48.2082, 16.3738], 'graz': [47.0707, 15.4395],
  'salzburg': [47.8095, 13.0550], 'linz': [48.3069, 14.2858], 'innsbruck': [47.2692, 11.4041],
  'klagenfurt': [46.6247, 14.3055],
  'germany': [52.5200, 13.4050], 'deutschland': [52.5200, 13.4050],
  'berlin': [52.5200, 13.4050], 'munich': [48.1351, 11.5820], 'münchen': [48.1351, 11.5820],
  'hamburg': [53.5511, 9.9937], 'frankfurt': [50.1109, 8.6821], 'cologne': [50.9375, 6.9603],
  'köln': [50.9375, 6.9603], 'düsseldorf': [51.2277, 6.7735], 'stuttgart': [48.7758, 9.1829],
  'leipzig': [51.3397, 12.3731], 'dortmund': [51.5136, 7.4653],
  'uk': [51.5074, -0.1278], 'united kingdom': [51.5074, -0.1278], 'great britain': [51.5074, -0.1278],
  'england': [51.5074, -0.1278], 'britain': [51.5074, -0.1278],
  'scotland': [55.9533, -3.1883], 'wales': [51.4816, -3.1791],
  'london': [51.5074, -0.1278], 'manchester': [53.4808, -2.2426], 'birmingham': [52.4862, -1.8904],
  'edinburgh': [55.9533, -3.1883], 'glasgow': [55.8642, -4.2518], 'bristol': [51.4545, -2.5879],
  'leeds': [53.8008, -1.5491], 'liverpool': [53.4084, -2.9916],
  'france': [48.8566, 2.3522], 'paris': [48.8566, 2.3522], 'lyon': [45.7640, 4.8357],
  'marseille': [43.2965, 5.3698], 'toulouse': [43.6047, 1.4442], 'nice': [43.7102, 7.2620],
  'bordeaux': [44.8378, -0.5792], 'lille': [50.6292, 3.0573],
  'switzerland': [46.9480, 7.4474], 'schweiz': [46.9480, 7.4474], 'suisse': [46.9480, 7.4474],
  'zurich': [47.3769, 8.5417], 'zürich': [47.3769, 8.5417], 'geneva': [46.2044, 6.1432],
  'bern': [46.9480, 7.4474], 'basel': [47.5596, 7.5886],
  'netherlands': [52.3676, 4.9041], 'holland': [52.3676, 4.9041], 'the netherlands': [52.3676, 4.9041],
  'amsterdam': [52.3676, 4.9041], 'rotterdam': [51.9244, 4.4777], 'utrecht': [52.0907, 5.1214],
  'eindhoven': [51.4416, 5.4697],
  'spain': [40.4168, -3.7038], 'españa': [40.4168, -3.7038],
  'madrid': [40.4168, -3.7038], 'barcelona': [41.3851, 2.1734], 'seville': [37.3891, -5.9845],
  'valencia': [39.4699, -0.3763],
  'italy': [41.9028, 12.4964], 'italia': [41.9028, 12.4964],
  'rome': [41.9028, 12.4964], 'milan': [45.4642, 9.1900], 'milano': [45.4642, 9.1900],
  'florence': [43.7696, 11.2558], 'naples': [40.8518, 14.2681], 'turin': [45.0703, 7.6869],
  'torino': [45.0703, 7.6869], 'bologna': [44.4949, 11.3426],
  'poland': [52.2297, 21.0122], 'polska': [52.2297, 21.0122],
  'warsaw': [52.2297, 21.0122], 'warszawa': [52.2297, 21.0122], 'krakow': [50.0647, 19.9450],
  'kraków': [50.0647, 19.9450], 'wroclaw': [51.1079, 17.0385], 'gdansk': [54.3520, 18.6466],
  'sweden': [59.3293, 18.0686], 'sverige': [59.3293, 18.0686],
  'stockholm': [59.3293, 18.0686], 'gothenburg': [57.7089, 11.9746], 'göteborg': [57.7089, 11.9746],
  'malmö': [55.6050, 13.0038],
  'norway': [59.9139, 10.7522], 'norge': [59.9139, 10.7522],
  'oslo': [59.9139, 10.7522], 'bergen': [60.3913, 5.3221],
  'denmark': [55.6761, 12.5683], 'danmark': [55.6761, 12.5683],
  'copenhagen': [55.6761, 12.5683], 'københavn': [55.6761, 12.5683],
  'finland': [60.1699, 24.9384], 'suomi': [60.1699, 24.9384], 'helsinki': [60.1699, 24.9384],
  'belgium': [50.8503, 4.3517], 'belgique': [50.8503, 4.3517],
  'brussels': [50.8503, 4.3517], 'bruxelles': [50.8503, 4.3517],
  'portugal': [38.7223, -9.1393], 'lisbon': [38.7223, -9.1393], 'lisboa': [38.7223, -9.1393],
  'porto': [41.1579, -8.6291],
  'czech republic': [50.0755, 14.4378], 'czechia': [50.0755, 14.4378],
  'prague': [50.0755, 14.4378], 'praha': [50.0755, 14.4378],
  'hungary': [47.4979, 19.0402], 'budapest': [47.4979, 19.0402],
  'romania': [44.4268, 26.1025], 'bucharest': [44.4268, 26.1025],
  'greece': [37.9838, 23.7275], 'athens': [37.9838, 23.7275], 'thessaloniki': [40.6401, 22.9444],
  'turkey': [39.9334, 32.8597], 'istanbul': [41.0082, 28.9784], 'ankara': [39.9334, 32.8597],
  'india': [28.6139, 77.2090], 'mumbai': [19.0760, 72.8777], 'bangalore': [12.9716, 77.5946],
  'bengaluru': [12.9716, 77.5946], 'delhi': [28.6139, 77.2090], 'new delhi': [28.6139, 77.2090],
  'hyderabad': [17.3850, 78.4867], 'chennai': [13.0827, 80.2707], 'pune': [18.5204, 73.8567],
  'china': [39.9042, 116.4074], 'beijing': [39.9042, 116.4074], 'shanghai': [31.2304, 121.4737],
  'shenzhen': [22.5431, 114.0579],
  'japan': [35.6762, 139.6503], 'tokyo': [35.6762, 139.6503], 'osaka': [34.6937, 135.5023],
  'kyoto': [35.0116, 135.7681],
  'south korea': [37.5665, 126.9780], 'korea': [37.5665, 126.9780], 'seoul': [37.5665, 126.9780],
  'singapore': [1.3521, 103.8198],
  'australia': [-33.8688, 151.2093], 'sydney': [-33.8688, 151.2093],
  'melbourne': [-37.8136, 144.9631], 'brisbane': [-27.4698, 153.0251],
  'canada': [45.4215, -75.6972], 'toronto': [43.6532, -79.3832], 'vancouver': [49.2827, -123.1207],
  'montreal': [45.5017, -73.5673],
  'brazil': [-23.5505, -46.6333], 'são paulo': [-23.5505, -46.6333], 'sao paulo': [-23.5505, -46.6333],
  'rio': [-22.9068, -43.1729],
  'uae': [25.2048, 55.2708], 'united arab emirates': [25.2048, 55.2708],
  'dubai': [25.2048, 55.2708], 'abu dhabi': [24.4539, 54.3773],
  'israel': [32.0853, 34.7818], 'tel aviv': [32.0853, 34.7818],
  'ireland': [53.3498, -6.2603], 'dublin': [53.3498, -6.2603],
  'new zealand': [-36.8485, 174.7633], 'auckland': [-36.8485, 174.7633], 'wellington': [-41.2865, 174.7762],
  'mexico': [19.4326, -99.1332], 'mexico city': [19.4326, -99.1332], 'guadalajara': [20.6597, -103.3496],
  'ukraine': [50.4501, 30.5234], 'kyiv': [50.4501, 30.5234], 'kiev': [50.4501, 30.5234],
  'russia': [55.7558, 37.6173], 'moscow': [55.7558, 37.6173],
}

export function getCoords(location) {
  return lookup(COORDS, location)
}
