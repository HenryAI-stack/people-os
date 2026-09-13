// Approximate solar position for the World Map's day/night shading.
// Not precision astronomy — accurate to well under a degree, which is
// plenty for a UI overlay that recomputes every minute.

const RAD = Math.PI / 180

// The point on Earth directly under the sun right now.
export function getSubsolarPoint(date = new Date()) {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000)
  const declination = -23.44 * Math.cos(RAD * (360 / 365) * (dayOfYear + 10))

  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  // The sun sits over 0° longitude at 12:00 UTC and moves 15°/hour.
  const lon = (((12 - utcHours) * 15 + 540) % 360) - 180

  return { lat: declination, lon }
}

// Latitude of the day/night terminator at a given longitude:
// solar elevation = 0 when sin(lat)sin(dec) + cos(lat)cos(dec)cos(H) = 0,
// i.e. tan(lat) = -cos(H) / tan(dec). Division by ~0 near equinox resolves
// to lat = ±90° via JS's Infinity handling, which is the correct limit.
export function terminatorLat(lon, subsolar) {
  const dec = (Math.abs(subsolar.lat) < 1e-6 ? 1e-6 : subsolar.lat) * RAD
  const H = (lon - subsolar.lon) * RAD
  return Math.atan(-Math.cos(H) / Math.tan(dec)) / RAD
}
