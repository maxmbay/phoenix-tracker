export type VoyageId = "circumnavigation-2026" | "oregon-hawaii-2025" | string

export type Topic = "story" | "departure" | "equipment" | "sleep" | "conditions" | "community"

export type Confidence = "high" | "medium" | "low" | "unknown"

export type LocationMode = "pin" | "segment" | "none"

export type TimeBasis = "occurrence" | "publication" | "report-only"

export type EditorialStatus = "published" | "draft"

export interface Position {
  t: number
  lat: number
  lon: number
  sog: number | null
  cog: number | null
  source: string
  receivedAt: string
  voyageId: VoyageId
}

export interface MediaItem {
  id: string
  platform: string
  platformId: string
  url: string
  publishedAt: string
  title: string
  kind: "short" | "video" | "live" | "link"
  availability: "public" | "unavailable" | "unknown"
  thumbnail: string | null
  transcript: string | null
}

export interface VoyageEvent {
  id: string
  voyageId: VoyageId
  storylineId: string | null
  mediaId: string | null
  title: string
  summary: string
  topic: Topic
  start: string
  end: string
  timeBasis: TimeBasis
  timingConfidence: Confidence
  locationConfidence: Confidence
  locationMode: LocationMode
  lat: number | null
  lon: number | null
  segmentStart: string | null
  segmentEnd: string | null
  status: EditorialStatus
  sourceUrl: string
  sourceLabel: string
}

export interface ConditionSample {
  t: number
  lat: number
  lon: number
  variable: "wind_speed" | "wind_gust" | "wave_height"
  value: number | null
  unit: string
  provider: string
  model: string
  dataset: string
  kind: "hindcast" | "forecast"
  validTime: string
  forecastIssuedAt: string | null
  retrievedAt: string
  voyageId: VoyageId
}

export interface Storyline {
  id: string
  title: string
  summary: string
  status: EditorialStatus
}

export interface Broadcast {
  id: string
  platform: "youtube" | "twitch"
  channel: string
  videoId: string | null
  title: string
  start: string | null
  end: string | null
  isLiveNow: boolean | null
  url: string
  recordingUrl: string | null
  anchorsReviewed: boolean
  note: string
}

export interface VoyageRecord {
  id: string
  name: string
  start: string
  departure: string
  summary: string
}

export interface SourceLink {
  label: string
  url: string
}

export interface Database {
  generatedAt: string
  trackerUpdatedAt: string
  disclaimer: string
  boat: {
    name: string
    trackerId: string
    trackerUrl: string
    youtube: string
    twitch: string
  }
  voyages: VoyageRecord[]
  positions: Position[]
  media: MediaItem[]
  events: VoyageEvent[]
  conditions: ConditionSample[]
  storylines: Storyline[]
  broadcasts: Broadcast[]
  sources: SourceLink[]
}

export interface LivePlatformStatus {
  platform: "youtube" | "twitch"
  state: "live" | "offline" | "unavailable"
  checkedAt: string | null
  detail: string
  videoId?: string | null
  url: string
  title?: string | null
  startedAt?: string | null
}

export interface LiveStatus {
  checkedAt: string
  youtube: LivePlatformStatus
  twitch: LivePlatformStatus
  headline: string
}

export interface Health {
  positionCount: number
  latestPositionAt: string | null
  trackerUpdatedAt: string | null
  lastIngestAt: string | null
  lastIngestError: string | null
  conditionCount: number
  latestConditionAt: string | null
}
