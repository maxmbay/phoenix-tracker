import { useEffect, useState, type FormEvent } from "react"
import type { Database, VoyageEvent } from "../../shared/types.ts"

function asUtc(value: string): string {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value)) return new Date(value).toISOString()
  return new Date(`${value}:00Z`).toISOString()
}

const blank = {
  title: "",
  summary: "",
  topic: "story",
  start: new Date().toISOString().slice(0, 16),
  end: new Date().toISOString().slice(0, 16),
  timeBasis: "publication",
  timingConfidence: "medium",
  locationConfidence: "unknown",
  locationMode: "none",
  lat: "",
  lon: "",
  segmentStart: "",
  segmentEnd: "",
  status: "draft",
  sourceUrl: "https://",
  sourceLabel: "Editor",
  storylineId: "",
  voyageId: "circumnavigation-2026",
}

export function AdminView({ onSaved }: { onSaved: () => void }) {
  const [token, setToken] = useState(() => sessionStorage.getItem("phoenix-editor") || "")
  const [events, setEvents] = useState<VoyageEvent[]>([])
  const [draft, setDraft] = useState({ ...blank })
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState("")

  useEffect(() => {
    sessionStorage.setItem("phoenix-editor", token)
  }, [token])

  async function load() {
    const response = await fetch("/api/voyage")
    const body = (await response.json()) as Database
    setEvents(body.events)
  }

  useEffect(() => {
    void load()
  }, [])

  async function call(path: string, method: string, payload?: unknown) {
    const response = await fetch(path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "The editor request failed.")
    return body
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setMessage("")
    try {
      const payload = {
        ...draft,
        lat: draft.lat === "" ? null : Number(draft.lat),
        lon: draft.lon === "" ? null : Number(draft.lon),
        start: asUtc(draft.start),
        end: asUtc(draft.end),
        segmentStart: draft.segmentStart ? asUtc(draft.segmentStart) : null,
        segmentEnd: draft.segmentEnd ? asUtc(draft.segmentEnd) : null,
        storylineId: draft.storylineId || null,
      }
      if (editing) await call(`/api/admin/events/${encodeURIComponent(editing)}`, "PATCH", payload)
      else await call("/api/admin/events", "POST", payload)
      setDraft({ ...blank })
      setEditing(null)
      await load()
      onSaved()
      setMessage("Saved.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.")
    }
  }

  async function refresh(path: string) {
    setMessage("")
    try {
      const body = await call(path, "POST")
      setMessage(body.error && !body.ok ? body.error : "Refresh finished.")
      await load()
      onSaved()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Refresh failed.")
    }
  }

  function edit(event: VoyageEvent) {
    setEditing(event.id)
    setDraft({
      title: event.title,
      summary: event.summary,
      topic: event.topic,
      start: event.start.slice(0, 16),
      end: event.end.slice(0, 16),
      timeBasis: event.timeBasis,
      timingConfidence: event.timingConfidence,
      locationConfidence: event.locationConfidence,
      locationMode: event.locationMode,
      lat: event.lat?.toString() ?? "",
      lon: event.lon?.toString() ?? "",
      segmentStart: event.segmentStart?.slice(0, 16) ?? "",
      segmentEnd: event.segmentEnd?.slice(0, 16) ?? "",
      status: event.status,
      sourceUrl: event.sourceUrl,
      sourceLabel: event.sourceLabel,
      storylineId: event.storylineId ?? "",
      voyageId: event.voyageId,
    })
  }

  return (
    <div className="admin">
      <div className="admin-head">
        <div>
          <p className="eyebrow">Editor</p>
          <h2>Correct the log</h2>
        </div>
        <label>
          Token
          <input value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="current-password" />
        </label>
      </div>
      <div className="card-actions">
        <button onClick={() => void refresh("/api/admin/ingest")}>Refresh tracker</button>
        <button onClick={() => void refresh("/api/admin/conditions")}>Refresh recent weather</button>
      </div>
      {message && <p className="status-line">{message}</p>}
      <form className="editor" onSubmit={(event) => void save(event)}>
        <h3>{editing ? "Edit event" : "Add a link"}</h3>
        <label>
          Title
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required />
        </label>
        <label>
          Summary
          <textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} required rows={4} />
        </label>
        <label>
          Source link
          <input value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} required />
        </label>
        <div className="editor-grid">
          <label>
            Topic
            <select value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })}>
              <option value="story">Story</option>
              <option value="departure">Departure</option>
              <option value="equipment">Equipment</option>
              <option value="sleep">Sleep</option>
              <option value="conditions">Reported conditions</option>
              <option value="community">Community</option>
            </select>
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label>
            Start, UTC
            <input type="datetime-local" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} required />
          </label>
          <label>
            End, UTC
            <input type="datetime-local" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} required />
          </label>
          <label>
            Time basis
            <select value={draft.timeBasis} onChange={(event) => setDraft({ ...draft, timeBasis: event.target.value })}>
              <option value="occurrence">Occurrence</option>
              <option value="publication">Publication</option>
              <option value="report-only">Report only, occurrence unknown</option>
            </select>
          </label>
          <label>
            Place
            <select value={draft.locationMode} onChange={(event) => setDraft({ ...draft, locationMode: event.target.value })}>
              <option value="none">No position</option>
              <option value="pin">Pin</option>
              <option value="segment">Route segment</option>
            </select>
          </label>
          <label>
            Latitude
            <input value={draft.lat} onChange={(event) => setDraft({ ...draft, lat: event.target.value })} />
          </label>
          <label>
            Longitude
            <input value={draft.lon} onChange={(event) => setDraft({ ...draft, lon: event.target.value })} />
          </label>
          <label>
            Timing confidence
            <select value={draft.timingConfidence} onChange={(event) => setDraft({ ...draft, timingConfidence: event.target.value })}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            Location confidence
            <select value={draft.locationConfidence} onChange={(event) => setDraft({ ...draft, locationConfidence: event.target.value })}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label>
            Storyline id
            <input value={draft.storylineId} onChange={(event) => setDraft({ ...draft, storylineId: event.target.value })} />
          </label>
          <label>
            Source label
            <input value={draft.sourceLabel} onChange={(event) => setDraft({ ...draft, sourceLabel: event.target.value })} />
          </label>
        </div>
        <div className="card-actions">
          <button type="submit">{editing ? "Update" : "Add"}</button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setDraft({ ...blank })
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      <ul className="admin-list">
        {events.map((event) => (
          <li key={event.id}>
            <button onClick={() => edit(event)}>
              <strong>{event.title}</strong>
              <span>
                {event.status} · {event.topic} · {event.start.slice(0, 10)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
