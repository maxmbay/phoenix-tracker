import { impliedKnots } from "../shared/geo.ts"
import type { Position } from "../shared/types.ts"
import { loadDb, updateDb } from "./store.ts"

const TRACK_URL = "https://forecast.predictwind.com/tracking/display/SY_Phoenix"
const UA = "sailing-with-phoenix-companion/0.1 (unofficial)"

let running = false

interface RawFix {
  t: number
  lat: number
  lon: number
  sog: number | null
  cog: number | null
}

export async function ingestTracker(): Promise<{ ok: boolean; count: number; error: string | null }> {
  if (running) return { ok: false, count: loadDb().positions.length, error: "A tracker refresh is already running." }
  running = true
  try {
    const response = await fetch(TRACK_URL, { headers: { "User-Agent": UA, Accept: "text/html" } })
    if (!response.ok) throw new Error(`Tracker page returned ${response.status}`)
    const html = await response.text()
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/)
    if (!match) throw new Error("The public tracker page did not include a route.")
    const boat = JSON.parse(match[1]).props.pageProps.boatData
    const receivedAt = new Date().toISOString().replace(".000Z", "Z")
    const raw: RawFix[] = []
    for (const row of boat.route ?? []) {
      const lat = row?.p?.lat
      const lon = row?.p?.lon
      if (typeof lat !== "number" || typeof lon !== "number") continue
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue
      raw.push({
        t: Number(row.t),
        lat: Math.round(lat * 1e5) / 1e5,
        lon: Math.round(lon * 1e5) / 1e5,
        sog: typeof row.bsp === "number" ? row.bsp : null,
        cog: typeof row.bearing === "number" ? row.bearing : null,
      })
    }
    raw.sort((a, b) => a.t - b.t)
    const kept = raw.filter((point, index) => {
      if (index === 0 || index === raw.length - 1) return true
      const prev = raw[index - 1]
      const next = raw[index + 1]
      const spikePrev = impliedKnots(prev, point) > 40 && point.t - prev.t < 6 * 3600
      const spikeNext = impliedKnots(point, next) > 40 && next.t - point.t < 6 * 3600
      return !(spikePrev && spikeNext)
    })
    const positions = downsample(kept.map((point) => ({ ...point, source: "predictwind-public-page", receivedAt })))
    const updated = Number(boat.updated) || positions.at(-1)?.t
    updateDb((db) => {
      db.positions = positions
      db.trackerUpdatedAt = updated ? new Date(updated * 1000).toISOString().replace(".000Z", "Z") : db.trackerUpdatedAt
      db.meta.lastIngestAt = receivedAt
      db.meta.lastIngestError = null
    })
    return { ok: true, count: positions.length, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tracker refresh failed."
    updateDb((db) => {
      db.meta.lastIngestError = message
    })
    return { ok: false, count: loadDb().positions.length, error: message }
  } finally {
    running = false
  }
}

function downsample(points: Array<Omit<Position, "voyageId">>): Position[] {
  const ptEra = Date.parse("2026-06-28T00:00:00Z") / 1000
  const hawaiiEnd = Date.parse("2025-10-03T00:00:00Z") / 1000
  const kept: Position[] = []
  const last = new Map<string, Position>()
  for (const point of points) {
    const voyageId = point.t < hawaiiEnd ? "oregon-hawaii-2025" : point.t >= ptEra ? "circumnavigation-2026" : null
    if (!voyageId) continue
    const next: Position = { ...point, voyageId }
    const prev = last.get(voyageId)
    if (!prev) {
      kept.push(next)
      last.set(voyageId, next)
      continue
    }
    const dt = next.t - prev.t
    const minDt = voyageId === "circumnavigation-2026" ? 0 : 3600
    const dist = impliedKnots(prev, next) * (dt / 3600)
    if (dt >= minDt || dist >= 8 || dt >= 6 * 3600) {
      kept.push(next)
      last.set(voyageId, next)
    }
  }
  return kept
}
