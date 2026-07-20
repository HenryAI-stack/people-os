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

function lookupCode(str) {
  const s = str.trim().toLowerCase()
  if (!s) return null
  if (s in LOOKUP) return LOOKUP[s]
  if (/^[a-z]{2}$/i.test(s)) return s.toUpperCase()
  const sortedKeys = Object.keys(LOOKUP).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(^|[\\s,./])${escaped}([\\s,./]|$)`, 'i')
    if (re.test(s)) return LOOKUP[key]
  }
  return null
}

export function getCountryCode(location) {
  if (!location) return null
  const parts = location.split(',').map((p) => p.trim())
  if (parts.length > 1) {
    const code = lookupCode(parts[parts.length - 1])
    if (code) return code
  }
  return lookupCode(location)
}

export function flagUrl(code) {
  if (!code) return null
  return `https://flagcdn.com/20x15/${code.toLowerCase()}.png`
}
