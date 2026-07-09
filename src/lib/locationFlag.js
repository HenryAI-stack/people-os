/**
 * Returns an ISO 3166-1 alpha-2 country code for a given location string.
 * Use the <CountryFlag code={...} /> component to render the actual flag image.
 */

const LOOKUP = {
  // United States
  'usa': 'US', 'united states': 'US', 'united states of america': 'US',
  'america': 'US', 'u.s.a.': 'US', 'u.s.': 'US',
  'new york': 'US', 'nyc': 'US', 'new york city': 'US', 'northbrook': 'US',
  'san francisco': 'US', 'los angeles': 'US', 'chicago': 'US',
  'boston': 'US', 'seattle': 'US', 'austin': 'US', 'miami': 'US',
  'denver': 'US', 'atlanta': 'US', 'dallas': 'US', 'houston': 'US',
  'washington': 'US', 'washington dc': 'US', 'portland': 'US',
  'nashville': 'US', 'minneapolis': 'US', 'phoenix': 'US', 'las vegas': 'US',
  // Austria
  'austria': 'AT', 'österreich': 'AT',
  'vienna': 'AT', 'wien': 'AT', 'graz': 'AT', 'salzburg': 'AT',
  'linz': 'AT', 'innsbruck': 'AT', 'klagenfurt': 'AT',
  // Germany
  'germany': 'DE', 'deutschland': 'DE',
  'berlin': 'DE', 'munich': 'DE', 'münchen': 'DE', 'hamburg': 'DE',
  'frankfurt': 'DE', 'cologne': 'DE', 'köln': 'DE', 'düsseldorf': 'DE',
  'stuttgart': 'DE', 'leipzig': 'DE', 'dortmund': 'DE',
  // UK
  'uk': 'GB', 'united kingdom': 'GB', 'great britain': 'GB',
  'england': 'GB', 'britain': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'london': 'GB', 'manchester': 'GB', 'birmingham': 'GB', 'edinburgh': 'GB',
  'glasgow': 'GB', 'bristol': 'GB', 'leeds': 'GB', 'liverpool': 'GB',
  // France
  'france': 'FR', 'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR',
  'toulouse': 'FR', 'nice': 'FR', 'bordeaux': 'FR', 'lille': 'FR',
  // Switzerland
  'switzerland': 'CH', 'schweiz': 'CH', 'suisse': 'CH',
  'zurich': 'CH', 'zürich': 'CH', 'geneva': 'CH', 'bern': 'CH', 'basel': 'CH',
  // Netherlands
  'netherlands': 'NL', 'holland': 'NL', 'the netherlands': 'NL',
  'amsterdam': 'NL', 'rotterdam': 'NL', 'utrecht': 'NL', 'eindhoven': 'NL',
  // Spain
  'spain': 'ES', 'españa': 'ES',
  'madrid': 'ES', 'barcelona': 'ES', 'seville': 'ES', 'valencia': 'ES',
  // Italy
  'italy': 'IT', 'italia': 'IT',
  'rome': 'IT', 'milan': 'IT', 'milano': 'IT', 'florence': 'IT',
  'naples': 'IT', 'turin': 'IT', 'torino': 'IT', 'bologna': 'IT',
  // Poland
  'poland': 'PL', 'polska': 'PL',
  'warsaw': 'PL', 'warszawa': 'PL', 'krakow': 'PL', 'kraków': 'PL',
  'wroclaw': 'PL', 'gdansk': 'PL',
  // Sweden
  'sweden': 'SE', 'sverige': 'SE',
  'stockholm': 'SE', 'gothenburg': 'SE', 'göteborg': 'SE', 'malmö': 'SE',
  // Norway
  'norway': 'NO', 'norge': 'NO', 'oslo': 'NO', 'bergen': 'NO',
  // Denmark
  'denmark': 'DK', 'danmark': 'DK', 'copenhagen': 'DK', 'københavn': 'DK',
  // Finland
  'finland': 'FI', 'suomi': 'FI', 'helsinki': 'FI',
  // Belgium
  'belgium': 'BE', 'belgique': 'BE', 'brussels': 'BE', 'bruxelles': 'BE',
  // Portugal
  'portugal': 'PT', 'lisbon': 'PT', 'lisboa': 'PT', 'porto': 'PT',
  // Czech Republic
  'czech republic': 'CZ', 'czechia': 'CZ', 'prague': 'CZ', 'praha': 'CZ',
  // Hungary
  'hungary': 'HU', 'budapest': 'HU',
  // Romania
  'romania': 'RO', 'bucharest': 'RO',
  // Greece
  'greece': 'GR', 'athens': 'GR', 'thessaloniki': 'GR',
  // Turkey
  'turkey': 'TR', 'istanbul': 'TR', 'ankara': 'TR',
  // India
  'india': 'IN', 'mumbai': 'IN', 'bangalore': 'IN', 'bengaluru': 'IN',
  'delhi': 'IN', 'new delhi': 'IN', 'hyderabad': 'IN', 'chennai': 'IN', 'pune': 'IN',
  // China
  'china': 'CN', 'beijing': 'CN', 'shanghai': 'CN', 'shenzhen': 'CN',
  // Japan
  'japan': 'JP', 'tokyo': 'JP', 'osaka': 'JP', 'kyoto': 'JP',
  // South Korea
  'south korea': 'KR', 'korea': 'KR', 'seoul': 'KR',
  // Singapore
  'singapore': 'SG',
  // Australia
  'australia': 'AU', 'sydney': 'AU', 'melbourne': 'AU', 'brisbane': 'AU',
  // Canada
  'canada': 'CA', 'toronto': 'CA', 'vancouver': 'CA', 'montreal': 'CA',
  // Brazil
  'brazil': 'BR', 'são paulo': 'BR', 'sao paulo': 'BR', 'rio': 'BR',
  // UAE
  'uae': 'AE', 'united arab emirates': 'AE', 'dubai': 'AE', 'abu dhabi': 'AE',
  // Israel
  'israel': 'IL', 'tel aviv': 'IL',
  // Ireland
  'ireland': 'IE', 'dublin': 'IE',
  // New Zealand
  'new zealand': 'NZ', 'auckland': 'NZ', 'wellington': 'NZ',
  // Mexico
  'mexico': 'MX', 'mexico city': 'MX', 'guadalajara': 'MX',
  // Ukraine
  'ukraine': 'UA', 'kyiv': 'UA', 'kiev': 'UA',
  // Russia
  'russia': 'RU', 'moscow': 'RU', 'saint petersburg': 'RU',
}

function lookupCode(str) {
  const s = str.trim().toLowerCase()
  if (!s) return null

  // Exact match
  if (LOOKUP[s]) return LOOKUP[s]

  // 2-letter ISO code entered directly (e.g. "US", "AT")
  if (/^[a-z]{2}$/i.test(s)) return s.toUpperCase()

  // Substring match — longer keys first to avoid short keys winning
  const sortedKeys = Object.keys(LOOKUP).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[\\s,./])${escaped}([\\s,./]|$)`, 'i')
    if (re.test(s)) return LOOKUP[key]
  }

  return null
}

/** Returns ISO country code (e.g. "US", "PL") or null if not found. */
export function getCountryCode(location) {
  if (!location) return null
  const parts = location.split(',').map((p) => p.trim())
  // Check country part (after last comma) first
  if (parts.length > 1) {
    const code = lookupCode(parts[parts.length - 1])
    if (code) return code
  }
  return lookupCode(location)
}

/** Returns flagcdn.com image URL for a given ISO code. */
export function flagUrl(code) {
  if (!code) return null
  return `https://flagcdn.com/20x15/${code.toLowerCase()}.png`
}
