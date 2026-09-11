import { useEffect, useMemo, useState } from 'react'
import { directReportsStore } from '../lib/dataStore.js'
import { getCoords } from '../lib/locationFlag.js'
import { getSubsolarPoint, terminatorLat } from '../lib/sunPosition.js'
import { Avatar } from '../pages/DirectReports.jsx'

// Plain equirectangular (2:1) world map, same projection the pin/terminator
// math below assumes — swap image only for another 2:1 equirectangular map.
const MAP_IMG = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Equirectangular_projection_SW.jpg/1000px-Equirectangular_projection_SW.jpg'

function toPercent(lat, lon) {
  return { left: ((lon + 180) / 360) * 100, top: ((90 - lat) / 180) * 100 }
}

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
        <div className="world-map-canvas">
          <img src={MAP_IMG} alt="World map" className="world-map-img" draggable={false} />
          <svg className="world-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <filter id="terminator-soften" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.4" />
              </filter>
            </defs>
            <path d={nightPath} fill="rgba(6,10,25,0.55)" filter="url(#terminator-soften)" />
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
                        <Avatar photo={p.photo} name={p.name} size={30} />
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
        <div className="world-map-legend">
          <span><span className="swatch swatch-night" /> Night</span>
          <span><span className="swatch swatch-sun" /> Sun position</span>
          <span>{pins.reduce((n, p) => n + p.people.length, 0)} of {people.filter((p) => p.status === 'active').length} active reports mapped</span>
        </div>
      </div>
    </div>
  )
}
