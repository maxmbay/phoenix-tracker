import { useEffect, useMemo, useState } from "react"
import { positionAt } from "../shared/geo.ts"
import type { Database, LiveStatus, Position, VoyageEvent } from "../shared/types.ts"
import { AdminView } from "./components/AdminView.tsx"
import { Instrument } from "./components/Instrument.tsx"
import { LiveView } from "./components/LiveView.tsx"
import { Stories } from "./components/Stories.tsx"
import { VoyageMap } from "./components/VoyageMap.tsx"
import { formatAge, formatLatLon, formatUtc } from "./format.ts"

type Payload = Database & {
  health: {
    positionCount: number
    latestPositionAt: string | null
    trackerUpdatedAt: string | null
    lastIngestAt: string | null
    lastIngestError: string | null
    conditionCount: number
    latestConditionAt: string | null
  }
  live: LiveStatus | null
}

export function App() {
  const [path, setPath] = useState(window.location.pathname)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState("")
  const [live, setLive] = useState<LiveStatus | null>(null)
  const [voyageId, setVoyageId] = useState("circumnavigation-2026")
  const [time, setTime] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scope, setScope] = useState<"stretch" | "passage">("stretch")
  const [mobile, setMobile] = useState<"map" | "stories">("map")
  const [about, setAbout] = useState(false)
  const [now, setNow] = useState(Date.now())

  async function load() {
    const response = await fetch("/api/voyage")
    if (!response.ok) throw new Error("The voyage API did not answer.")
    const body = (await response.json()) as Payload
    setData(body)
    if (body.live) setLive(body.live)
    setError("")
  }

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "The voyage API did not answer.")
    })
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener("popstate", onPop)
    const clock = window.setInterval(() => setNow(Date.now()), 30_000)
    const poll = window.setInterval(() => {
      void fetch("/api/live")
        .then((response) => response.json())
        .then((body: LiveStatus) => setLive(body))
        .catch(() => setLive(null))
    }, 60_000)
    return () => {
      window.removeEventListener("popstate", onPop)
      window.clearInterval(clock)
      window.clearInterval(poll)
    }
  }, [])

  const voyage = data?.voyages.find((item) => item.id === voyageId) ?? data?.voyages[0]
  const positions = useMemo(
    () => (data && voyage ? data.positions.filter((point) => point.voyageId === voyage.id).sort((a, b) => a.t - b.t) : []),
    [data, voyage],
  )
  const latest = positions.at(-1) ?? null
  const focus = useMemo(() => {
    if (!voyage) return positions
    const departure = Date.parse(voyage.departure) / 1000
    const subset = positions.filter((point) => point.t >= departure)
    return subset.length ? subset : positions
  }, [positions, voyage])

  useEffect(() => {
    if (!data || time != null) return
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get("t")
    const parsed = fromUrl ? Date.parse(fromUrl) / 1000 : NaN
    setVoyageId(params.get("voyage") || "circumnavigation-2026")
    setSelectedId(params.get("event"))
    setTime(Number.isFinite(parsed) ? parsed : (latest?.t ?? Date.now() / 1000))
  }, [data, latest, time])

  useEffect(() => {
    if (time == null) return
    const url = new URL(window.location.href)
    url.searchParams.set("t", new Date(time * 1000).toISOString())
    url.searchParams.set("voyage", voyageId)
    if (selectedId) url.searchParams.set("event", selectedId)
    else url.searchParams.delete("event")
    window.history.replaceState(null, "", `${path}${url.search}`)
  }, [time, voyageId, selectedId, path])

  function go(next: string) {
    const search = window.location.search
    window.history.pushState(null, "", `${next}${search}`)
    setPath(next)
  }

  if (error) {
    return (
      <main className="boot">
        <h1>Sailing With Phoenix</h1>
        <p>{error}</p>
        <p>Start the API with npm run dev, then reload.</p>
      </main>
    )
  }
  if (!data || !voyage || time == null) {
    return (
      <main className="boot">
        <p className="eyebrow">Unofficial</p>
        <h1>Sailing With Phoenix</h1>
        <p>Loading the passage…</p>
      </main>
    )
  }

  const published = data.events.filter((event) => event.status === "published" && event.voyageId === voyage.id)
  const placed = published.filter((event) => event.locationMode !== "none")
  const unplaced = published.filter((event) => event.locationMode === "none")
  const stretch = placed.filter((event) => overlaps(event, time - 36 * 3600, time + 36 * 3600))
  const visible = scope === "stretch" ? [...stretch].sort((a, b) => Date.parse(b.start) - Date.parse(a.start)) : [...placed].sort((a, b) => Date.parse(b.start) - Date.parse(a.start))
  const selected = data.events.find((event) => event.id === selectedId) ?? null
  const fix = positionAt(positions, time)
  const departure = Date.parse(voyage.departure) / 1000
  const underway = latest != null && latest.t >= departure
  const age = latest ? formatAge(latest.t, now) : null
  const stale = latest ? now / 1000 - latest.t > 6 * 3600 : false
  const conditions = data.conditions.filter((row) => row.voyageId === voyage.id)
  const passageOpening = voyage.id === "circumnavigation-2026" ? Date.parse("2026-09-01T00:00:00Z") / 1000 : positions[0]?.t ?? time
  let t0 = Math.max(positions[0]?.t ?? passageOpening, passageOpening)
  let t1 = latest?.t ?? time
  if (time < t0) t0 = time
  if (time > t1) t1 = time
  const seaStart = Date.parse("2026-10-02T00:00:00Z") / 1000
  const seaCount = latest ? Math.floor((latest.t - seaStart) / 86400) + 1 : 0
  const seaDays = voyage.id === "circumnavigation-2026" && seaCount > 0
    ? Array.from({ length: seaCount }, (_, index) => seaStart + index * 86400)
    : []
  const liveClass = live?.youtube.state === "live" || live?.twitch.state === "live" ? "live-pill on" : "live-pill"

  function selectEvent(event: VoyageEvent) {
    setSelectedId(event.id)
    if (event.locationMode === "none") return
    if (event.locationMode === "segment" && event.segmentStart && event.segmentEnd) {
      setTime((Date.parse(event.segmentStart) + Date.parse(event.segmentEnd)) / 2000)
      setMobile("map")
      return
    }
    setTime(Date.parse(event.start) / 1000)
    setMobile("map")
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <p className="eyebrow">Unofficial companion</p>
          <h1>Sailing With Phoenix</h1>
        </div>
        <p className="where">
          {data.boat.name}
          {voyage.id === "circumnavigation-2026" ? (underway ? " · Under way since 2 Oct" : " · Still in port in this view") : ""}
          {age ? ` · Tracker ${age} ago` : ""}
          {stale ? " · Stale" : ""}
        </p>
        <nav>
          <button className={path === "/" ? "on" : ""} onClick={() => go("/")}>
            Map
          </button>
          <button className={liveClass} onClick={() => go("/live")}>
            {live?.headline ?? "Live status"}
          </button>
          <button className={path === "/admin" ? "on" : ""} onClick={() => go("/admin")}>
            Editor
          </button>
          <button onClick={() => setAbout(true)}>Notes</button>
        </nav>
      </header>

      {path === "/admin" ? (
        <AdminView onSaved={() => void load()} />
      ) : path === "/live" ? (
        <LiveView
          positions={positions}
          focus={focus.length ? focus : positions}
          conditions={conditions}
          live={live}
          latest={latest}
          onExplore={() => {
            if (latest) setTime(latest.t)
            go("/")
          }}
        />
      ) : (
        <>
          <div className="mobile-tabs">
            <button className={mobile === "map" ? "on" : ""} onClick={() => setMobile("map")}>
              Map
            </button>
            <button className={mobile === "stories" ? "on" : ""} onClick={() => setMobile("stories")}>
              Stories
            </button>
          </div>
          <div className="workspace">
            <div className={mobile === "map" ? "map-wrap" : "map-wrap hide-mobile"}>
              <VoyageMap
                positions={positions}
                events={placed}
                focus={focus.length ? focus : positions}
                boat={fix ? { lat: fix.lat, lon: fix.lon, cog: fix.interpolated ? null : fix.cog } : null}
                selectedEvent={selected}
                onSelectTime={setTime}
                onSelectEvent={(id) => {
                  const event = data.events.find((item) => item.id === id)
                  if (event) selectEvent(event)
                }}
              />
              <div className="legend">
                <span><i className="swatch track" /> Track</span>
                <span><i className="swatch pin" /> Story</span>
                <span><i className="swatch boat" /> Selected time</span>
              </div>
              <p className="map-note">
                {fix
                  ? `${formatLatLon(fix.lat, fix.lon)} · ${formatUtc(fix.t)}${fix.interpolated ? " · interpolated across a short gap" : ""}${fix.gap ? " · gap, not interpolated" : ""}${!fix.interpolated && fix.sog != null ? ` · ${fix.sog} kt` : ""}`
                  : "No tracker report for this voyage."}
              </p>
            </div>
            <div className={mobile === "stories" ? "stories-wrap" : "stories-wrap hide-mobile"}>
              <div className="voyage-switch">
                <label>
                  Track
                  <select
                    value={voyage.id}
                    onChange={(event) => {
                      const next = event.target.value
                      setVoyageId(next)
                      setSelectedId(null)
                      const nextPositions = data.positions.filter((point) => point.voyageId === next).sort((a, b) => a.t - b.t)
                      const last = nextPositions.at(-1)
                      if (last) setTime(last.t)
                    }}
                  >
                    {data.voyages.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => {
                    const when = Date.parse(voyage.departure) / 1000
                    setTime(when)
                    setSelectedId("departure-point-hudson")
                  }}
                >
                  Departure
                </button>
                <button onClick={() => latest && setTime(latest.t)}>Latest</button>
                {seaDays.map((dayStart) => (
                  <button key={dayStart} className={time >= dayStart && time < dayStart + 86400 ? "on" : ""} onClick={() => setTime(dayStart + 18 * 3600)}>
                    {new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(dayStart * 1000)}
                  </button>
                ))}
              </div>
              {voyage.id !== "circumnavigation-2026" && (
                <p className="banner">This earlier line is on the same public tracker. The curated stories belong to the 2026 departure, not this passage.</p>
              )}
              <Stories
                events={visible}
                unplaced={scope === "passage" ? unplaced : []}
                media={data.media}
                storylines={data.storylines}
                selectedId={selectedId}
                scope={scope}
                onScope={setScope}
                onSelect={selectEvent}
                stretchCount={stretch.length}
                passageCount={placed.length + unplaced.length}
              />
            </div>
          </div>
          <Instrument conditions={conditions} events={published} t0={t0} t1={t1} time={time} onSelectTime={setTime} />
        </>
      )}

      {about && (
        <div className="about-back" onClick={() => setAbout(false)}>
          <div className="about" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="How to read this">
            <p className="eyebrow">How to read this</p>
            <h2>A log beside the track</h2>
            <p>{data.disclaimer} Positions are copied from his public PredictWind page for SY_Phoenix. They are not a documented API, and a refresh can fail if that page changes.</p>
            <p>{voyage.summary}</p>
            <p>Publication time is not occurrence time. Pins on posts use the tracker report nearest the upload, and the card says so. A route segment means the time was too vague for a pin. Missing reports stay blank. Weather is an Open-Meteo hindcast at the boat’s reported position, kept separate from anything he said.</p>
            <p>
              Tracker copy: {data.health.trackerUpdatedAt ? formatUtc(data.health.trackerUpdatedAt) : "unknown"}. Positions stored: {data.health.positionCount}. Weather samples: {data.health.conditionCount}.
              {data.health.lastIngestError ? ` Last refresh failed: ${data.health.lastIngestError}` : ""}
            </p>
            <ul>
              {data.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.label}
                  </a>
                </li>
              ))}
            </ul>
            <button onClick={() => setAbout(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function overlaps(event: VoyageEvent, start: number, end: number): boolean {
  const a = Date.parse(event.segmentStart || event.start) / 1000
  const b = Date.parse(event.segmentEnd || event.end) / 1000
  return a <= end && b >= start
}
