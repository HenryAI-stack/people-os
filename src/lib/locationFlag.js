/**
 * Returns a country flag emoji for a given location string.
 * Handles "City, Country" format by checking the country part first.
 */

function isoToFlag(code) {
  return code.toUpperCase().split('').map(
    (c) => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  ).join('')
}

// Maps lowercase country/city names → ISO 3166-1 alpha-2 code
const LOOKUP = {
  // United States
  'usa': 'US', 'united states': 'US', 'united states of america': 'US',
  'america': 'US', 'u.s.a.': 'US', 'u.s.': 'US',
  'new york': 'US', 'nyc': 'US', 'new york city': 'US',
  'san francisco': 'US', 'los angeles': 'US', 'chicago': 'US',
  'boston': 'US', 'seattle': 'US', 'austin': 'US', 'miami': 'US',
  'denver': 'US', 'atlanta': 'US', 'dallas': 'US', 'houston': 'US',
  'washington': 'US', 'washington dc': 'US', 'dc': 'US',
  'portland': 'US', 'nashville': 'US', 'minneapolis': 'US',
  'phoenix': 'US', 'las vegas': 'US', 'detroit': 'US',
  // Austria
  'austria': 'AT', 'österreich': 'AT',
  'vienna': 'AT', 'wien': 'AT', 'graz': 'AT',
  'salzburg': 'AT', 'linz': 'AT', 'innsbruck': 'AT', 'klagenfurt': 'AT',
  // Germany
  'germany': 'DE', 'deutschland': 'DE',
  'berlin': 'DE', 'munich': 'DE', 'münchen': 'DE', 'hamburg': 'DE',
  'frankfurt': 'DE', 'cologne': 'DE', 'köln': 'DE', 'düsseldorf': 'DE',
  'stuttgart': 'DE', 'leipzig': 'DE', 'dortmund': 'DE', 'essen': 'DE',
  // UK
  'uk': 'GB', 'united kingdom': 'GB', 'great britain': 'GB',
  'england': 'GB', 'britain': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'london': 'GB', 'manchester': 'GB', 'birmingham': 'GB', 'edinburgh': 'GB',
  'glasgow': 'GB', 'bristol': 'GB', 'leeds': 'GB', 'liverpool': 'GB',
  'sheffield': 'GB', 'cambridge': 'GB', 'oxford': 'GB',
  // France
  'france': 'FR', 'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR',
  'toulouse': 'FR', 'nice': 'FR', 'bordeaux': 'FR', 'lille': 'FR',
  // Switzerland
  'switzerland': 'CH', 'schweiz': 'CH', 'suisse': 'CH',
  'zurich': 'CH', 'zürich': 'CH', 'geneva': 'CH', 'genf': 'CH',
  'bern': 'CH', 'basel': 'CH', 'lausanne': 'CH',
  // Netherlands
  'netherlands': 'NL', 'holland': 'NL', 'the netherlands': 'NL',
  'amsterdam': 'NL', 'rotterdam': 'NL', 'the hague': 'NL',
  'utrecht': 'NL', 'eindhoven': 'NL',
  // Spain
  'spain': 'ES', 'españa': 'ES',
  'madrid': 'ES', 'barcelona': 'ES', 'seville': 'ES',
  'valencia': 'ES', 'bilbao': 'ES',
  // Italy
  'italy': 'IT', 'italia': 'IT',
  'rome': 'IT', 'milan': 'IT', 'milano': 'IT', 'florence': 'IT',
  'naples': 'IT', 'turin': 'IT', 'torino': 'IT', 'bologna': 'IT',
  // Poland
  'poland': 'PL', 'polska': 'PL',
  'warsaw': 'PL', 'warszawa': 'PL', 'krakow': 'PL', 'kraków': 'PL',
  'wroclaw': 'PL', 'wrocław': 'PL', 'gdansk': 'PL', 'gdańsk': 'PL',
  // Sweden
  'sweden': 'SE', 'sverige': 'SE',
  'stockholm': 'SE', 'gothenburg': 'SE', 'göteborg': 'SE', 'malmö': 'SE',
  // Norway
  'norway': 'NO', 'norge': 'NO', 'oslo': 'NO', 'bergen': 'NO',
  // Denmark
  'denmark': 'DK', 'danmark': 'DK',
  'copenhagen': 'DK', 'københavn': 'DK', 'aarhus': 'DK',
  // Finland
  'finland': 'FI', 'suomi': 'FI', 'helsinki': 'FI', 'tampere': 'FI',
  // Belgium
  'belgium': 'BE', 'belgique': 'BE',
  'brussels': 'BE', 'bruxelles': 'BE', 'antwerp': 'BE', 'ghent': 'BE',
  // Portugal
  'portugal': 'PT', 'lisbon': 'PT', 'lisboa': 'PT', 'porto': 'PT',
  // Czech Republic
  'czech republic': 'CZ', 'czechia': 'CZ', 'česká republika': 'CZ',
  'prague': 'CZ', 'praha': 'CZ', 'brno': 'CZ',
  // Hungary
  'hungary': 'HU', 'magyarország': 'HU', 'budapest': 'HU',
  // Romania
  'romania': 'RO', 'bucharest': 'RO', 'bucurești': 'RO', 'cluj': 'RO',
  // Greece
  'greece': 'GR', 'hellas': 'GR', 'athens': 'GR', 'thessaloniki': 'GR',
  // Turkey
  'turkey': 'TR', 'türkiye': 'TR', 'istanbul': 'TR', 'ankara': 'TR',
  // India
  'india': 'IN', 'mumbai': 'IN', 'bangalore': 'IN', 'bengaluru': 'IN',
  'delhi': 'IN', 'new delhi': 'IN', 'hyderabad': 'IN',
  'chennai': 'IN', 'pune': 'IN', 'kolkata': 'IN',
  // China
  'china': 'CN', 'beijing': 'CN', 'shanghai': 'CN',
  'shenzhen': 'CN', 'guangzhou': 'CN', 'hangzhou': 'CN',
  // Japan
  'japan': 'JP', 'tokyo': 'JP', 'osaka': 'JP', 'kyoto': 'JP', 'yokohama': 'JP',
  // South Korea
  'south korea': 'KR', 'korea': 'KR', 'seoul': 'KR', 'busan': 'KR',
  // Singapore
  'singapore': 'SG',
  // Australia
  'australia': 'AU', 'sydney': 'AU', 'melbourne': 'AU',
  'brisbane': 'AU', 'perth': 'AU', 'adelaide': 'AU',
  // Canada
  'canada': 'CA', 'toronto': 'CA', 'vancouver': 'CA',
  'montreal': 'CA', 'calgary': 'CA', 'ottawa': 'CA',
  // Brazil
  'brazil': 'BR', 'brasil': 'BR',
  'são paulo': 'BR', 'sao paulo': 'BR', 'rio de janeiro': 'BR', 'rio': 'BR',
  // UAE
  'uae': 'AE', 'united arab emirates': 'AE', 'dubai': 'AE', 'abu dhabi': 'AE',
  // Israel
  'israel': 'IL', 'tel aviv': 'IL',
  // Ireland
  'ireland': 'IE', 'éire': 'IE', 'dublin': 'IE',
  // New Zealand
  'new zealand': 'NZ', 'auckland': 'NZ', 'wellington': 'NZ',
  // Mexico
  'mexico': 'MX', 'méxico': 'MX', 'mexico city': 'MX', 'guadalajara': 'MX',
  // Remote / global
  'remote': '🌐', 'global': '🌐', 'worldwide': '🌐', 'distributed': '🌐',
}

function lookup(str) {
  const s = str.trim().toLowerCase()
  if (!s) return ''

  // 1. Exact match
  if (LOOKUP[s]) {
    const v = LOOKUP[s]
    return v.length === 2 ? isoToFlag(v) : v
  }

  // 2. 2-letter ISO code entered directly (e.g. "US", "AT", "DE")
  if (/^[a-z]{2}$/i.test(s)) {
    return isoToFlag(s)
  }

  // 3. Substring match — longer keys first to avoid "us" matching before "usa"
  const sortedKeys = Object.keys(LOOKUP).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    // Use word-boundary-aware check: key must appear as whole word(s)
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[\\s,./])${escaped}([\\s,./]|$)`, 'i')
    if (re.test(s)) {
      const v = LOOKUP[key]
      return v.length === 2 ? isoToFlag(v) : v
    }
  }

  return ''
}

export function getLocationFlag(location) {
  if (!location) return ''

  // For "City, Country" format — check the country part (after last comma) first
  const parts = location.split(',').map((p) => p.trim())
  if (parts.length > 1) {
    const countryPart = parts[parts.length - 1]
    const flag = lookup(countryPart)
    if (flag) return flag
  }

  // Fall back to checking the full string
  return lookup(location)
}
