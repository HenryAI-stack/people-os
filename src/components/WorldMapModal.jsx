import { useEffect, useMemo, useState } from 'react'
import { directReportsStore } from '../lib/dataStore.js'
import { getCoords, flagUrl } from '../lib/locationFlag.js'
import { getSubsolarPoint, terminatorLat } from '../lib/sunPosition.js'
import { LAND_POLYGONS } from '../lib/worldContinents.js'
import { CLOCKS, fmtTime, fmtDate, fmtTzAbbr, fmtTzFull } from '../lib/worldClock.js'
import { Avatar } from '../pages/DirectReports.jsx'

// Plain equirectangular (2:1) projection — lon/lat map straight to x%/y%.
function toPercent(lat, lon) {
  return { left: ((lon + 180) / 360) * 100, top: ((90 - lat) / 180) * 100 }
}

// Builds one <path> `d` per polygon covering all of its rings (outer boundary +
// any holes) — paired with fill-rule="evenodd" so holes (e.g. the Caspian/Aral
// Sea inside Asia) render as open water instead of solid land.
function polygonPath(rings) {
  return rings.map((ring) => {
    const pts = ring.map(([lon, lat]) => {
      const { left, top } = toPercent(lat, lon)
      return `${left},${top}`
    })
    return `M ${pts.join(' L ')} Z`
  }).join(' ')
}

const GRATICULE_LONS = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180]
const GRATICULE_LATS = [-60, -30, 0, 30, 60]

// Groups people onto the same pin when they resolve to (roughly) the same
// city, so a support-center location shows one pin instead of a stack.
function groupByLocation(people) {
  const groups = new Map()
  for (const p of people) {
    if (p.status !== 'active') continue
    const coords = getCoords(p.location)
    if (!coords) continue
    const key = `${coords[0].toFixed(1)},${coords[1].toFixed(1)}`
    if (!groups.has(key)) groups.set(key, { lat: coords[0], lon: coords[1], people: [] })
    groups.get(key).people.push(p)
  }
  return [...groups.values()]
}

function nightPolygonPath(subsolar) {
  const northSide = subsolar.lat < 0 // night hugs the pole opposite the sun
  const points = []
  for (let lon = -180; lon <= 180; lon += 4) {
    const lat = terminatorLat(lon, subsolar)
    const { left, top } = toPercent(lat, lon)
    points.push(`${left},${top}`)
  }
  const edgeY = northSide ? 0 : 100
  points.push(`100,${edgeY}`, `0,${edgeY}`)
  return `M ${points.join(' L ')} Z`
}

export default function WorldMapModal({ onClose }) {
  const [people, setPeople] = useState([])
  const [now, setNow] = useState(new Date())
  const [hoverKey, setHoverKey] = useState(null)

  useEffect(() => {
    directReportsStore.list().then(setPeople).catch(() => setPeople([]))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const subsolar = useMemo(() => getSubsolarPoint(now), [now])
  const nightPath = useMemo(() => nightPolygonPath(subsolar), [subsolar])
  const pins = useMemo(() => groupByLocation(people), [people])
  const sunPos = useMemo(() => toPercent(subsolar.lat, subsolar.lon), [subsolar])

  return (
    <div className="overlay world-map-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="world-map-modal">
        <div className="world-map-header">
          <h2>🌍 World Map</h2>
          <button className="world-map-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="world-map-body">
          <div className="world-map-canvas">
            <svg className="world-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <filter id="terminator-soften" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.4" />
                </filter>
                <radialGradient id="ocean-gradient" cx="50%" cy="45%" r="75%">
                  <stop offset="0%" stopColor="#122436" />
                  <stop offset="100%" stopColor="#060d16" />
                </radialGradient>
              </defs>
              {/* Self-drawn base map — no external image, so it never depends on a
                  network request succeeding (see CLAUDE.md: an earlier hotlinked
                  image broke on restrictive corporate networks). */}
              <rect x="0" y="0" width="100" height="100" fill="url(#ocean-gradient)" />
              <g stroke="rgba(255,255,255,0.08)" strokeWidth="0.15">
                {GRATICULE_LONS.map((lon) => {
                  const x = ((lon + 180) / 360) * 100
                  return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={100} />
                })}
                {GRATICULE_LATS.map((lat) => {
                  const y = ((90 - lat) / 180) * 100
                  return <line key={`lat${lat}`} x1={0} y1={y} x2={100} y2={y} stroke={lat === 0 ? 'rgba(255,255,255,0.16)' : undefined} />
                })}
              </g>
              <g fill="#3a5548" stroke="#557066" strokeWidth="0.1">
                {LAND_POLYGONS.map((rings, i) => <path key={i} fillRule="evenodd" d={polygonPath(rings)} />)}
              </g>
              <path d={nightPath} fill="rgba(6,10,25,0.55)" filter="url(#terminator-soften)" />
              {/* Solar noon meridian — the longitude directly under the sun right now. */}
              <line x1={sunPos.left} y1={0} x2={sunPos.left} y2={100} stroke="rgba(255,210,92,0.55)" strokeWidth="0.3" strokeDasharray="1.2,1" />
            </svg>
            <div className="sun-marker" style={{ left: `${sunPos.left}%`, top: `${sunPos.top}%` }} title="Sun position" />

            {pins.map((pin) => {
              const key = `${pin.lat},${pin.lon}`
              const { left, top } = toPercent(pin.lat, pin.lon)
              const isHover = hoverKey === key
              return (
                <div
                  key={key}
                  className={`world-map-pin${isHover ? ' hover' : ''}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  onMouseEnter={() => setHoverKey(key)}
                  onMouseLeave={() => setHoverKey(null)}
                >
                  <span className="world-map-pin-dot">{pin.people.length > 1 ? pin.people.length : ''}</span>
                  {isHover && (
                    <div className={`world-map-tooltip${top > 60 ? ' flip-up' : ''}${left > 70 ? ' flip-left' : ''}`}>
                      {pin.people.map((p) => (
                        <div key={p.id} className="world-map-tooltip-row">
                          <Avatar photo={p.photo} name={p.name} size={22} />
                          <div className="world-map-tooltip-text">
                            <div className="name">{p.name}</div>
                            <div className="loc">{p.location}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="world-map-clocks">
            <div className="world-map-clocks-title">🕐 World Clock</div>
            <table>
              <thead>
                <tr><th>City</th><th>Local time</th><th>Timezone</th></tr>
              </thead>
              <tbody>
                {CLOCKS.map((c) => (
                  <tr key={c.city}>
                    <td>
                      <img src={flagUrl(c.country)} alt={c.country} className="world-map-clocks-flag" />
                      {c.city}
                    </td>
                    <td className="world-map-clocks-time">
                      {fmtTime(now, c.tz)}
                      <div className="world-map-clocks-date">{fmtDate(now, c.tz)}</div>
                    </td>
                    <td title={fmtTzFull(now, c.tz)} className="world-map-clocks-tz">{fmtTzAbbr(now, c.tz)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="world-map-legend">
          <span><span className="swatch swatch-night" /> Night</span>
          <span><span className="swatch swatch-sun" /> Sun position / solar noon</span>
          <span>{pins.reduce((n, p) => n + p.people.length, 0)} of {people.filter((p) => p.status === 'active').length} active reports mapped</span>
        </div>
      </div>
    </div>
  )
}
