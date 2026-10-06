import { useState } from "react"
import type { MediaItem, Storyline, VoyageEvent } from "../../shared/types.ts"
import { confidenceLabel, formatUtc } from "../format.ts"

interface Props {
  events: VoyageEvent[]
  unplaced: VoyageEvent[]
  media: MediaItem[]
  storylines: Storyline[]
  selectedId: string | null
  scope: "stretch" | "passage"
  onScope: (scope: "stretch" | "passage") => void
  onSelect: (event: VoyageEvent) => void
  stretchCount: number
  passageCount: number
}

export function Stories({ events, unplaced, media, storylines, selectedId, scope, onScope, onSelect, stretchCount, passageCount }: Props) {
  return (
    <aside className="stories">
      <div className="stories-head">
        <div>
          <p className="eyebrow">Log</p>
          <h2>Stories</h2>
        </div>
        <div className="scope">
          <button className={scope === "stretch" ? "on" : ""} onClick={() => onScope("stretch")}>
            This stretch
            <span>{stretchCount}</span>
          </button>
          <button className={scope === "passage" ? "on" : ""} onClick={() => onScope("passage")}>
            Whole log
            <span>{passageCount}</span>
          </button>
        </div>
      </div>
      <div className="story-list">
        {events.length === 0 && <p className="empty">No reviewed story falls in this stretch. That is a gap in the log, not a quiet day.</p>}
        {events.map((event) => (
          <StoryCard
            key={event.id}
            event={event}
            media={media.find((item) => item.id === event.mediaId) ?? null}
            storyline={storylines.find((line) => line.id === event.storylineId) ?? null}
            selected={event.id === selectedId}
            onSelect={() => onSelect(event)}
          />
        ))}
        {scope === "passage" && unplaced.length > 0 && (
          <div className="unplaced">
            <h3>No position on this track</h3>
            <p>These posts are real. The public tracker has no trustworthy fix at their time, so they are not pinned.</p>
            {unplaced.map((event) => (
              <StoryCard
                key={event.id}
                event={event}
                media={media.find((item) => item.id === event.mediaId) ?? null}
                storyline={storylines.find((line) => line.id === event.storylineId) ?? null}
                selected={event.id === selectedId}
                onSelect={() => onSelect(event)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

function StoryCard({
  event,
  media,
  storyline,
  selected,
  onSelect,
}: {
  event: VoyageEvent
  media: MediaItem | null
  storyline: Storyline | null
  selected: boolean
  onSelect: () => void
}) {
  const [open, setOpen] = useState(false)
  const showFrame = open && media?.platform === "youtube" && media.availability !== "unavailable"
  return (
    <article className={selected ? "card selected" : "card"}>
      <button className="card-hit" onClick={onSelect}>
        {media?.thumbnail && <img src={media.thumbnail} alt="" />}
        <div>
          <p className="card-kicker">
            {storyline?.title ?? "Note"} · {formatUtc(event.start)}
          </p>
          <h3>{event.title}</h3>
        </div>
      </button>
      <p className="summary">{event.summary}</p>
      <ul className="chips">
        <li>{event.timeBasis === "report-only" ? "Occurrence time unknown" : event.timeBasis === "publication" ? "Placed by publication time" : "Occurrence time"}</li>
        <li>Timing {confidenceLabel(event.timingConfidence).toLowerCase()}</li>
        <li>Place {confidenceLabel(event.locationConfidence).toLowerCase()}</li>
        {media?.kind === "short" && <li>YouTube short</li>}
        {event.topic === "equipment" && <li>Equipment</li>}
      </ul>
      <div className="card-actions">
        {media?.platform === "youtube" && media.availability !== "unavailable" && (
          <button onClick={() => setOpen((value) => !value)}>{open ? "Hide video" : "Play here"}</button>
        )}
        <a href={event.sourceUrl} target="_blank" rel="noreferrer">
          {event.sourceLabel}
        </a>
      </div>
      {showFrame && media && (
        <div className="frame">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${media.platformId}`}
            title={event.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      )}
    </article>
  )
}
