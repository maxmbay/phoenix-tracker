import type { Position } from "./types.ts"

export interface Fix {
  lat: number
  lon: number
  t: number
  sog: number | null
  cog: number | null
  interpolated: boolean
  gap: boolean
  gapHours: number | null
}

const GAP_SECONDS = 6 * 3600
const MAX_INTERP_KNOTS = 20

export function haversineNm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const radius = 3440.065
  const p1 = (aLat * Math.PI) / 180
  const p2 = (bLat * Math.PI) / 180
  const dp = ((bLat - aLat) * Math.PI) / 180
  const dl = ((bLon - aLon) * Math.PI) / 180
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function impliedKnots(a: Pick<Position, "t" | "lat" | "lon">, b: Pick<Position, "t" | "lat" | "lon">): number {
  const dt = b.t - a.t
  if (dt <= 0) return Number.POSITIVE_INFINITY
  return haversineNm(a.lat, a.lon, b.lat, b.lon) / (dt / 3600)
}

function crossesDateLine(aLon: number, bLon: number): boolean {
  return Math.abs(bLon - aLon) > 180
}

/** Break the line across long silences, impossible speeds, and the date line. */
export function trackLines(points: Position[]): [number, number][][] {
  const sorted = [...points].sort((a, b) => a.t - b.t)
  const lines: [number, number][][] = []
  let current: [number, number][] = []
  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i]
    if (i > 0) {
      const prev = sorted[i - 1]
      const broken =
        point.t - prev.t > GAP_SECONDS ||
        impliedKnots(prev, point) > 30 ||
        crossesDateLine(prev.lon, point.lon)
      if (broken) {
        if (current.length > 1) lines.push(current)
        current = []
      }
    }
    current.push([point.lon, point.lat])
  }
  if (current.length > 1) lines.push(current)
  return lines
}

export function positionAt(points: Position[], t: number): Fix | null {
  const sorted = [...points].sort((a, b) => a.t - b.t)
  if (!sorted.length) return null
  if (t <= sorted[0].t) {
    const gapHours = (sorted[0].t - t) / 3600
    return report(sorted[0], false, gapHours > 6, gapHours > 6 ? gapHours : null)
  }
  const last = sorted[sorted.length - 1]
  if (t >= last.t) {
    const gapHours = (t - last.t) / 3600
    return report(last, false, gapHours > 6, gapHours > 6 ? gapHours : null)
  }
  let lo = 0
  let hi = sorted.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = sorted[lo]
  const b = sorted[hi]
  const gapHours = (b.t - a.t) / 3600
  const tooLong = b.t - a.t > GAP_SECONDS
  const tooFast = impliedKnots(a, b) > MAX_INTERP_KNOTS
  const dateLine = crossesDateLine(a.lon, b.lon)
  if (tooLong || tooFast || dateLine) {
    const nearer = t - a.t <= b.t - t ? a : b
    return report(nearer, false, true, gapHours)
  }
  const f = (t - a.t) / (b.t - a.t)
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
    t,
    sog: null,
    cog: null,
    interpolated: true,
    gap: false,
    gapHours: null,
  }
}

function report(point: Position, interpolated: boolean, gap: boolean, gapHours: number | null): Fix {
  return {
    lat: point.lat,
    lon: point.lon,
    t: point.t,
    sog: point.sog,
    cog: point.cog,
    interpolated,
    gap,
    gapHours,
  }
}

export function nearestPosition(points: Position[], lat: number, lon: number, maxNm = 40): Position | null {
  let best: Position | null = null
  let bestNm = maxNm
  for (const point of points) {
    const dist = haversineNm(lat, lon, point.lat, point.lon)
    if (dist <= bestNm) {
      best = point
      bestNm = dist
    }
  }
  return best
}

export function positionsBetween(points: Position[], startIso: string, endIso: string): Position[] {
  const start = Date.parse(startIso) / 1000
  const end = Date.parse(endIso) / 1000
  return points.filter((point) => point.t >= start && point.t <= end).sort((a, b) => a.t - b.t)
}
