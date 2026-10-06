import { useState } from "react"
import type { ConditionSample, LiveStatus, Position } from "../../shared/types.ts"
import { formatAge, formatLatLon, formatUtc } from "../format.ts"
import { VoyageMap } from "./VoyageMap.tsx"

interface Props {
  positions: Position[]
  focus: Position[]
  conditions: ConditionSample[]
  live: LiveStatus | null
  latest: Position | null
  onExplore: () => void
}

export function LiveView({ positions, focus, conditions, live, latest, onExplore }: Props) {
  const [mapOpen, setMapOpen] = useState(false)
  const [twitchOpen, setTwitchOpen] = useState(false)
  const parent = typeof window === "undefined" ? "localhost" : window.location.hostname
  const youtube = live?.youtube
  const twitch = live?.twitch
  const showYouTube = youtube?.state === "live" || (youtube?.state === "offline" && youtube.videoId)
  const weather = latest ? conditionsNear(conditions, latest.t) : null
  const age = latest ? formatAge(latest.t) : null
  const stale = latest ? Date.now() / 1000 - latest.t > 6 * 3600 : false

  return (
    <div className="live-layout">
      <section className="live-video">
        <p className={youtube?.state === "live" || twitch?.state === "live" ? "live-flag on" : "live-flag"}>
          {live?.headline ?? "Checking live status"}
        </p>
        <h2>Live from Phoenix</h2>
        <p className="lede">
          The broadcast and the tracker are different feeds. A position on the map is not proof of what the camera is showing at that moment.
        </p>
        {youtube && <p className="status-line">{youtube.detail}</p>}
        {twitch && <p className="status-line">{twitch.detail}</p>}
        {showYouTube && youtube?.videoId ? (
          <>
            {youtube.state === "offline" && <p className="status-line">The player below is the latest broadcast. YouTube says it has ended.</p>}
            <div className="frame large">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${youtube.videoId}`}
                title={youtube.title || "YouTube broadcast"}
                allow="autoplay; encrypted-media; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </>
        ) : (
          <p className="empty">No YouTube player is embedded while the live check is unavailable. Use the channel link.</p>
        )}
        <div className="card-actions">
          <a href={youtube?.url || "https://www.youtube.com/@Sailing_With_Phoenix/live"} target="_blank" rel="noreferrer">
            Open YouTube
          </a>
          <a href="https://www.twitch.tv/sailing_with_phoenix" target="_blank" rel="noreferrer">
            Open Twitch
          </a>
          <button onClick={() => setTwitchOpen((value) => !value)}>{twitchOpen ? "Hide Twitch player" : "Show Twitch player"}</button>
        </div>
        {twitch?.state === "live" || twitchOpen ? (
          <div className="frame large">
            <iframe
              src={`https://player.twitch.tv/?channel=sailing_with_phoenix&parent=${encodeURIComponent(parent)}`}
              title="Twitch player"
              allowFullScreen
            />
          </div>
        ) : null}
        {twitch?.state === "live" && (
          <div className="frame chat">
            <iframe
              src={`https://www.twitch.tv/embed/sailing_with_phoenix/chat?parent=${encodeURIComponent(parent)}&darkpopout`}
              title="Twitch chat"
            />
          </div>
        )}
      </section>
      <section className="live-context">
        <div className="context-card">
          <p className="eyebrow">Latest tracker report</p>
          {latest ? (
            <>
              <h3>{formatLatLon(latest.lat, latest.lon)}</h3>
              <p>
                {formatUtc(latest.t)} · {age} ago{stale ? " · Stale" : ""}
              </p>
              <p>
                {latest.sog != null ? `${latest.sog} kt` : "Speed not in this report"}
                {latest.cog != null ? ` · ${latest.cog.toFixed(0)}°` : ""}
              </p>
            </>
          ) : (
            <p>No position is stored.</p>
          )}
          <p className="summary">
            Wind {weather?.wind ?? "unknown"} · gust {weather?.gust ?? "unknown"} · waves {weather?.wave ?? "unknown"}. Estimates from Open-Meteo at the reported position, not from the boat.
          </p>
          <div className="card-actions">
            <button onClick={onExplore}>Explore this moment</button>
            <a href="https://forecast.predictwind.com/tracking/display/SY_Phoenix/" target="_blank" rel="noreferrer">
              His PredictWind page
            </a>
          </div>
        </div>
        <button className="map-toggle" onClick={() => setMapOpen((value) => !value)}>
          {mapOpen ? "Hide map" : "Show map"}
        </button>
        <div className={mapOpen ? "live-map open" : "live-map"}>
          <VoyageMap
            positions={positions}
            events={[]}
            focus={focus}
            boat={latest ? { lat: latest.lat, lon: latest.lon, cog: latest.cog } : null}
            selectedEvent={null}
            onSelectTime={() => undefined}
            onSelectEvent={() => undefined}
          />
        </div>
      </section>
    </div>
  )
}

function conditionsNear(conditions: ConditionSample[], t: number) {
  const pick = (variable: ConditionSample["variable"]) => {
    const rows = conditions.filter((row) => row.variable === variable && row.value != null)
    const best = rows.reduce<ConditionSample | null>((winner, row) => {
      if (!winner || Math.abs(row.t - t) < Math.abs(winner.t - t)) return row
      return winner
    }, null)
    if (!best || best.value == null || Math.abs(best.t - t) > 90 * 60) return "unknown"
    return `${best.value} ${best.unit}`
  }
  return { wind: pick("wind_speed"), gust: pick("wind_gust"), wave: pick("wave_height") }
}
