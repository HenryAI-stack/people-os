/**
 * Returns a country flag emoji for a given location string.
 * Matches country names, major cities, and 2-letter ISO codes.
 */

// Convert ISO 3166-1 alpha-2 code → flag emoji
function isoToFlag(code) {
  return code.toUpperCase().split('').map(
    (c) => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  ).join('')
}

// city / region / country name  →  ISO code
const LOOKUP = {
  // Austria
  'austria': 'AT', 'wien': 'AT', 'vienna': 'AT', 'graz': 'AT',
  'salzburg': 'AT', 'linz': 'AT', 'innsbruck': 'AT',
  // Germany
  'germany': 'DE', 'deutschland': 'DE', 'berlin': 'DE', 'munich': 'DE',
  'münchen': 'DE', 'hamburg': 'DE', 'frankfurt': 'DE', 'cologne': 'DE',
  'köln': 'DE', 'düsseldorf': 'DE', 'stuttgart': 'DE', 'leipzig': 'DE',
  // UK
  'uk': 'GB', 'united kingdom': 'GB', 'england': 'GB', 'britain': 'GB',
  'london': 'GB', 'manchester': 'GB', 'birmingham': 'GB', 'edinburgh': 'GB',
  'glasgow': 'GB', 'bristol': 'GB', 'leeds': 'GB', 'liverpool': 'GB',
  // USA
  'usa': 'US', 'us': 'US', 'united states': 'US', 'america': 'US',
  'new york': 'US', 'nyc': 'US', 'san francisco': 'US', 'sf': 'US',
  'los angeles': 'US', 'la': 'US', 'chicago': 'US', 'boston': 'US',
  'seattle': 'US', 'austin': 'US', 'miami': 'US', 'denver': 'US',
  'atlanta': 'US', 'dallas': 'US', 'houston': 'US', 'washington': 'US',
  // France
  'france': 'FR', 'paris': 'FR', 'lyon': 'FR', 'marseille': 'FR', 'toulouse': 'FR',
  // Switzerland
  'switzerland': 'CH', 'swiss': 'CH', 'zurich': 'CH', 'zürich': 'CH',
  'geneva': 'CH', 'genf': 'CH', 'bern': 'CH', 'basel': 'CH',
  // Netherlands
  'netherlands': 'NL', 'holland': 'NL', 'amsterdam': 'NL',
  'rotterdam': 'NL', 'the hague': 'NL', 'utrecht': 'NL',
  // Spain
  'spain': 'ES', 'madrid': 'ES', 'barcelona': 'ES', 'seville': 'ES', 'valencia': 'ES',
  // Italy
  'italy': 'IT', 'rome': 'IT', 'milan': 'IT', 'milano': 'IT', 'rome': 'IT',
  'florence': 'IT', 'naples': 'IT', 'turin': 'IT', 'torino': 'IT',
  // Poland
  'poland': 'PL', 'warsaw': 'PL', 'warszawa': 'PL', 'krakow': 'PL', 'wroclaw': 'PL',
  // Sweden
  'sweden': 'SE', 'stockholm': 'SE', 'gothenburg': 'SE', 'malmö': 'SE',
  // Norway
  'norway': 'NO', 'oslo': 'NO', 'bergen': 'NO',
  // Denmark
  'denmark': 'DK', 'copenhagen': 'DK', 'københavn': 'DK',
  // Finland
  'finland': 'FI', 'helsinki': 'FI',
  // Belgium
  'belgium': 'BE', 'brussels': 'BE', 'bruxelles': 'BE', 'antwerp': 'BE',
  // Portugal
  'portugal': 'PT', 'lisbon': 'PT', 'lisboa': 'PT', 'porto': 'PT',
  // Czech Republic
  'czech': 'CZ', 'czechia': 'CZ', 'prague': 'CZ', 'praha': 'CZ',
  // Hungary
  'hungary': 'HU', 'budapest': 'HU',
  // Romania
  'romania': 'RO', 'bucharest': 'RO', 'bucurești': 'RO',
  // Greece
  'greece': 'GR', 'athens': 'GR', 'thessaloniki': 'GR',
  // Turkey
  'turkey': 'TR', 'istanbul': 'TR', 'ankara': 'TR',
  // India
  'india': 'IN', 'mumbai': 'IN', 'bangalore': 'IN', 'delhi': 'IN',
  'new delhi': 'IN', 'hyderabad': 'IN', 'chennai': 'IN', 'pune': 'IN',
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
  'uae': 'AE', 'dubai': 'AE', 'abu dhabi': 'AE',
  // Israel
  'israel': 'IL', 'tel aviv': 'IL',
  // Ireland
  'ireland': 'IE', 'dublin': 'IE',
  // Remote / global
  'remote': '🌐', 'global': '🌐', 'worldwide': '🌐',
}

export function getLocationFlag(location) {
  if (!location) return ''
  const lower = location.trim().toLowerCase()

  // Direct lookup
  if (LOOKUP[lower]) {
    const code = LOOKUP[lower]
    return code.length === 2 ? isoToFlag(code) : code  // '🌐' passthrough
  }

  // Try 2-letter ISO code entered directly (e.g. "AT", "DE")
  if (/^[a-z]{2}$/i.test(lower)) {
    return isoToFlag(lower)
  }

  // Try matching any key as a substring of the location string
  for (const [key, code] of Object.entries(LOOKUP)) {
    if (lower.includes(key)) {
      return code.length === 2 ? isoToFlag(code) : code
    }
  }

  return ''
}
