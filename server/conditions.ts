import type { ConditionSample, Position } from "../shared/types.ts"
import { loadDb, updateDb } from "./store.ts"

const UA = "sailing-with-phoenix-companion/0.1 (unofficial)"
let running = false

export async function refreshRecentConditions(hours = 36): Promise<{ ok: boolean; added: number; error: string | null }> {
  if (running) return { ok: false, added: 0, error: "A weather refresh is already running." }
  running = true
  try {
    const db = loadDb()
    const positions = db.positions
      .filter((point) => point.voyageId === "circumnavigation-2026")
      .sort((a, b) => a.t - b.t)
    if (!positions.length) return { ok: false, added: 0, error: "No positions to sample." }
    const end = positions[positions.length - 1].t
    const start = end - hours * 3600
    const existing = new Set(
      db.conditions.filter((row) => row.variable === "wind_speed").map((row) => row.t),
    )
    const samples: Position[] = []
    for (let t = Math.ceil(start / 10800) * 10800; t <= end; t += 10800) {
      if (existing.has(t)) continue
      const hit = nearest(positions, t)
      if (Math.abs(hit.t - t) <= 3 * 3600) samples.push({ ...hit, t })
    }
    const retrievedAt = new Date().toISOString()
    const rows: ConditionSample[] = []
    for (const sample of samples) {
      rows.push(...(await fetchSample(sample, retrievedAt)))
    }
    updateDb((draft) => {
      const keys = new Set(draft.conditions.map((row) => `${row.t}:${row.variable}`))
      for (const row of rows) {
        const key = `${row.t}:${row.variable}`
        if (!keys.has(key)) draft.conditions.push(row)
      }
      draft.conditions.sort((a, b) => a.t - b.t || a.variable.localeCompare(b.variable))
    })
    return { ok: true, added: rows.length, error: null }
  } catch (error) {
    return { ok: false, added: 0, error: error instanceof Error ? error.message : "Weather refresh failed." }
  } finally {
    running = false
  }
}

function nearest(points: Position[], t: number): Position {
  return points.reduce((best, point) => (Math.abs(point.t - t) < Math.abs(best.t - t) ? point : best))
}

async function fetchSample(sample: Position, retrievedAt: string): Promise<ConditionSample[]> {
  const day = new Date(sample.t * 1000).toISOString().slice(0, 10)
  const weather = await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${sample.lat}&longitude=${sample.lon}&hourly=wind_speed_10m,wind_gusts_10m&start_date=${day}&end_date=${day}&timezone=UTC&wind_speed_unit=kn`,
  )
  const marine = await getJson(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${sample.lat}&longitude=${sample.lon}&hourly=wave_height&start_date=${day}&end_date=${day}&timezone=UTC`,
  )
  const stamp = new Date(sample.t * 1000).toISOString().slice(0, 13) + ":00"
  const specs = [
    ["wind_speed", valueAt(weather, "wind_speed_10m", stamp), "kn", "open-meteo-forecast"],
    ["wind_gust", valueAt(weather, "wind_gusts_10m", stamp), "kn", "open-meteo-forecast"],
    ["wave_height", valueAt(marine, "wave_height", stamp), "m", "open-meteo-marine"],
  ] as const
  return specs.map(([variable, value, unit, dataset]) => ({
    t: sample.t,
    lat: sample.lat,
    lon: sample.lon,
    variable,
    value,
    unit,
    provider: "open-meteo",
    model: "best_match",
    dataset,
    kind: "hindcast" as const,
    validTime: new Date(sample.t * 1000).toISOString().replace(".000Z", "Z"),
    forecastIssuedAt: null,
    retrievedAt,
    voyageId: "circumnavigation-2026",
  }))
}

function valueAt(payload: { hourly?: Record<string, Array<string | number | null>> }, key: string, stamp: string): number | null {
  const times = payload.hourly?.time ?? []
  const values = payload.hourly?.[key] ?? []
  const index = times.indexOf(stamp)
  if (index < 0) return null
  const value = values[index]
  return typeof value === "number" ? Math.round(value * 100) / 100 : null
}

async function getJson(url: string): Promise<{ hourly?: Record<string, Array<string | number | null>> }> {
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } })
  if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`)
  return (await response.json()) as { hourly?: Record<string, Array<string | number | null>> }
}
