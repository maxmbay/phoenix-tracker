import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import zlib from "node:zlib"
import type { EditorialStatus, LocationMode, TimeBasis, Topic, VoyageEvent } from "../shared/types.ts"
import { refreshRecentConditions } from "./conditions.ts"
import { ingestTracker } from "./ingest.ts"
import { getCachedLive, refreshLive } from "./live.ts"
import { flushDb, loadDb, updateDb } from "./store.ts"

loadEnv()

const port = Number(process.env.PORT || 8787)
const root = process.cwd()
const dist = path.join(root, "dist")

const topics = new Set<Topic>(["story", "departure", "equipment", "sleep", "conditions", "community"])
const modes = new Set<LocationMode>(["pin", "segment", "none"])
const bases = new Set<TimeBasis>(["occurrence", "publication", "report-only"])
const statuses = new Set<EditorialStatus>(["published", "draft"])
const confidences = new Set(["high", "medium", "low", "unknown"])

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors())
    res.end()
    return
  }
  try {
    if (url.pathname === "/api/voyage" && req.method === "GET") {
      sendJson(req, res, 200, voyagePayload())
      return
    }
    if (url.pathname === "/api/live" && req.method === "GET") {
      sendJson(req, res, 200, await refreshLive())
      return
    }
    if (url.pathname === "/api/health" && req.method === "GET") {
      sendJson(req, res, 200, health())
      return
    }
    if (url.pathname.startsWith("/api/admin")) {
      if (!authorized(req)) {
        const missing = !process.env.ADMIN_TOKEN
        sendJson(req, res, missing ? 503 : 401, {
          error: missing ? "Set ADMIN_TOKEN before editing." : "Editor token was not accepted.",
        })
        return
      }
      if (url.pathname === "/api/admin/ingest" && req.method === "POST") {
        sendJson(req, res, 200, await ingestTracker())
        return
      }
      if (url.pathname === "/api/admin/conditions" && req.method === "POST") {
        sendJson(req, res, 200, await refreshRecentConditions())
        return
      }
      if (url.pathname === "/api/admin/events" && req.method === "POST") {
        const body = (await readBody(req)) as Record<string, unknown>
        const event = normalizeEvent(body, true)
        updateDb((db) => {
          db.events.push(event)
          if (event.mediaId && !db.media.some((item) => item.id === event.mediaId)) {
            db.media.push(mediaFromEvent(event))
          }
          ensureStoryline(db.storylines, event.storylineId)
        })
        sendJson(req, res, 201, event)
        return
      }
      const match = url.pathname.match(/^\/api\/admin\/events\/([^/]+)$/)
      if (match && req.method === "PATCH") {
        const id = decodeURIComponent(match[1])
        const body = (await readBody(req)) as Record<string, unknown>
        let updated: VoyageEvent | null = null
        updateDb((db) => {
          const index = db.events.findIndex((event) => event.id === id)
          if (index < 0) return
          updated = normalizeEvent({ ...db.events[index], ...body, id }, false)
          db.events[index] = updated
          ensureStoryline(db.storylines, updated.storylineId)
        })
        if (!updated) {
          sendJson(req, res, 404, { error: "No event with that id." })
          return
        }
        sendJson(req, res, 200, updated)
        return
      }
      sendJson(req, res, 404, { error: "Unknown editor route." })
      return
    }
    if (req.method === "GET") {
      serveStatic(url.pathname, res)
      return
    }
    sendJson(req, res, 405, { error: "Method not allowed." })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed."
    sendJson(req, res, 400, { error: message })
  }
})

server.listen(port, () => {
  console.log(`Voyage API on http://localhost:${port}`)
})

void refreshLive()
setInterval(() => void refreshLive(true), 90_000)
setInterval(() => void ingestTracker(), 30 * 60_000)

function voyagePayload() {
  const db = loadDb()
  return { ...db, health: health(), live: getCachedLive() }
}

function health() {
  const db = loadDb()
  const latest = [...db.positions].sort((a, b) => a.t - b.t).at(-1)
  const latestCondition = [...db.conditions].sort((a, b) => a.t - b.t).at(-1)
  return {
    positionCount: db.positions.length,
    latestPositionAt: latest ? new Date(latest.t * 1000).toISOString() : null,
    trackerUpdatedAt: db.trackerUpdatedAt,
    lastIngestAt: db.meta.lastIngestAt,
    lastIngestError: db.meta.lastIngestError,
    conditionCount: db.conditions.length,
    latestConditionAt: latestCondition ? new Date(latestCondition.t * 1000).toISOString() : null,
  }
}

function authorized(req: http.IncomingMessage): boolean {
  const token = process.env.ADMIN_TOKEN
  if (!token) return false
  return req.headers.authorization === `Bearer ${token}`
}

function normalizeEvent(body: Record<string, unknown>, creating: boolean): VoyageEvent {
  const title = text(body.title, "Title")
  const summary = text(body.summary, "Summary")
  const topic = oneOf(body.topic, topics, "topic") as Topic
  const locationMode = oneOf(body.locationMode ?? "none", modes, "locationMode") as LocationMode
  const timeBasis = oneOf(body.timeBasis ?? "publication", bases, "timeBasis") as TimeBasis
  const status = oneOf(body.status ?? "draft", statuses, "status") as EditorialStatus
  const start = iso(body.start, "start")
  const end = iso(body.end ?? body.start, "end")
  if (Date.parse(end) < Date.parse(start)) throw new Error("End is before start.")
  const lat = locationMode === "pin" ? number(body.lat, "latitude") : optionalNumber(body.lat)
  const lon = locationMode === "pin" ? number(body.lon, "longitude") : optionalNumber(body.lon)
  if (lat != null && (lat < -90 || lat > 90)) throw new Error("Latitude is out of range.")
  if (lon != null && (lon < -180 || lon > 180)) throw new Error("Longitude is out of range.")
  const sourceUrl = https(body.sourceUrl)
  const id = creating ? `evt-${Date.now().toString(36)}` : text(body.id, "id")
  const mediaId = optionalText(body.mediaId) || youtubeId(sourceUrl)
  return {
    id,
    voyageId: optionalText(body.voyageId) || "circumnavigation-2026",
    storylineId: optionalText(body.storylineId),
    mediaId,
    title,
    summary,
    topic,
    start,
    end,
    timeBasis,
    timingConfidence: oneOf(body.timingConfidence ?? "medium", confidences, "timingConfidence") as VoyageEvent["timingConfidence"],
    locationConfidence: oneOf(body.locationConfidence ?? "unknown", confidences, "locationConfidence") as VoyageEvent["locationConfidence"],
    locationMode,
    lat,
    lon,
    segmentStart: locationMode === "segment" ? iso(body.segmentStart, "segmentStart") : null,
    segmentEnd: locationMode === "segment" ? iso(body.segmentEnd, "segmentEnd") : null,
    status,
    sourceUrl,
    sourceLabel: optionalText(body.sourceLabel) || "Editor",
  }
}

function mediaFromEvent(event: VoyageEvent) {
  const id = event.mediaId || event.id
  const video = youtubeId(event.sourceUrl)
  return {
    id,
    platform: video ? "youtube" : "link",
    platformId: video || id,
    url: event.sourceUrl,
    publishedAt: event.start,
    title: event.title,
    kind: video ? ("video" as const) : ("link" as const),
    availability: "public" as const,
    thumbnail: video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : null,
    transcript: null,
  }
}

function ensureStoryline(storylines: { id: string; title: string; summary: string; status: "published" | "draft" }[], id: string | null) {
  if (!id || storylines.some((line) => line.id === id)) return
  storylines.push({
    id,
    title: id,
    summary: "Added from the editor.",
    status: "published",
  })
}

function youtubeId(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] || null
    if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] || null
    return parsed.searchParams.get("v")
  } catch {
    return null
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`)
  return value.trim()
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  return value.trim()
}

function oneOf(value: unknown, allowed: Set<string>, label: string): string {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(`${label} is not a known value.`)
  return value
}

function iso(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${label} needs a time.`)
  return new Date(value).toISOString()
}

function number(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  if (!Number.isFinite(parsed)) throw new Error(`${label} needs a number.`)
  return parsed
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null
  return number(value, "coordinate")
}

function https(value: unknown): string {
  const raw = text(value, "Source link")
  const parsed = new URL(raw)
  if (parsed.protocol !== "https:") throw new Error("Source links need to be https.")
  return parsed.toString()
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on("data", (chunk: Buffer) => {
      size += chunk.length
      if (size > 100_000) {
        reject(new Error("That edit is too large."))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on("end", () => {
      if (!chunks.length) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))
      } catch {
        reject(new Error("The editor sent invalid JSON."))
      }
    })
    req.on("error", reject)
  })
}

function sendJson(req: http.IncomingMessage, res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body)
  const headers: Record<string, string> = {
    ...cors(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  }
  const accept = req.headers["accept-encoding"]
  if (typeof accept === "string" && accept.includes("gzip") && json.length > 2048) {
    zlib.gzip(json, (error, zipped) => {
      if (error) {
        res.writeHead(status, headers)
        res.end(json)
        return
      }
      res.writeHead(status, { ...headers, "content-encoding": "gzip" })
      res.end(zipped)
    })
    return
  }
  res.writeHead(status, headers)
  res.end(json)
}

function cors(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
  }
}

function serveStatic(pathname: string, res: http.ServerResponse) {
  const file = pathname === "/" ? "/index.html" : pathname
  const target = path.normalize(path.join(dist, file))
  if (!target.startsWith(dist)) {
    res.writeHead(403)
    res.end()
    return
  }
  const chosen = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(dist, "index.html")
  if (!fs.existsSync(chosen)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    res.end("The interface has not been built. Run npm run dev, or npm run build && npm start.")
    return
  }
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".json": "application/json",
  }
  res.writeHead(200, { "content-type": types[path.extname(chosen)] || "application/octet-stream" })
  fs.createReadStream(chosen).pipe(res)
}

function loadEnv() {
  const file = path.join(process.cwd(), ".env")
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "")
  }
}

process.on("SIGINT", async () => {
  await flushDb()
  process.exit(0)
})
