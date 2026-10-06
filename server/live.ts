import type { LivePlatformStatus, LiveStatus } from "../shared/types.ts"

const CHANNEL = "UCAub01nC6godaiC7iI9kasw"
const TWITCH_LOGIN = "sailing_with_phoenix"
const YOUTUBE_URL = "https://www.youtube.com/@Sailing_With_Phoenix/live"
const TWITCH_URL = "https://www.twitch.tv/sailing_with_phoenix"

let cache: LiveStatus | null = null
let checkedAt = 0
let inflight: Promise<LiveStatus> | null = null
let twitchToken: { value: string; expires: number } | null = null

export function getCachedLive(): LiveStatus | null {
  return cache
}

export function refreshLive(force = false): Promise<LiveStatus> {
  if (!force && cache && Date.now() - checkedAt < 90_000) return Promise.resolve(cache)
  if (inflight) return inflight
  inflight = compute()
    .then((status) => {
      cache = status
      checkedAt = Date.now()
      return status
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

async function compute(): Promise<LiveStatus> {
  const [youtube, twitch] = await Promise.all([checkYouTube(), checkTwitch()])
  return {
    checkedAt: new Date().toISOString(),
    youtube,
    twitch,
    headline: headline(youtube, twitch),
  }
}

function headline(youtube: LivePlatformStatus, twitch: LivePlatformStatus): string {
  if (youtube.state === "live" && twitch.state === "live") return "Live on YouTube and Twitch"
  if (youtube.state === "live") return "Live on YouTube"
  if (twitch.state === "live") return "Live on Twitch"
  if (youtube.state === "offline" && twitch.state === "offline") return "Not live right now"
  if (youtube.state === "offline" && twitch.state === "unavailable") return "YouTube is not live. Twitch status unavailable."
  if (youtube.state === "unavailable" && twitch.state === "offline") return "Twitch is not live. YouTube status unavailable."
  return "Live status unavailable"
}

async function checkYouTube(): Promise<LivePlatformStatus> {
  const checked = new Date().toISOString()
  try {
    const redirect = await fetch(`https://www.youtube.com/channel/${CHANNEL}/live`, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    })
    const html = await redirect.text()
    const videoId = redirect.url.match(/[?&]v=([\w-]{6,})/)?.[1] ?? html.match(/"videoId":"([\w-]{11})"/)?.[1] ?? null
    if (!videoId) {
      return {
        platform: "youtube",
        state: "unavailable",
        checkedAt: checked,
        detail: "YouTube did not point at a broadcast, so this page will not call the channel offline.",
        url: YOUTUBE_URL,
        videoId: null,
      }
    }
    const player = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "sailing-with-phoenix-companion/0.1" },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion: "2.20251001.00.00", hl: "en" } },
        videoId,
      }),
    })
    if (!player.ok) throw new Error(`player ${player.status}`)
    const data = (await player.json()) as {
      videoDetails?: { title?: string }
      microformat?: { playerMicroformatRenderer?: { liveBroadcastDetails?: { isLiveNow?: boolean; startTimestamp?: string; endTimestamp?: string } } }
    }
    const details = data.microformat?.playerMicroformatRenderer?.liveBroadcastDetails
    if (!details || typeof details.isLiveNow !== "boolean") {
      return {
        platform: "youtube",
        state: "unavailable",
        checkedAt: checked,
        detail: "YouTube did not return a live flag.",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        videoId,
        title: data.videoDetails?.title ?? null,
      }
    }
    return {
      platform: "youtube",
      state: details.isLiveNow ? "live" : "offline",
      checkedAt: checked,
      detail: details.isLiveNow
        ? "YouTube reports a broadcast in progress."
        : details.endTimestamp
          ? `The latest broadcast ended ${details.endTimestamp}.`
          : "YouTube reports no broadcast in progress.",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      title: data.videoDetails?.title ?? null,
      startedAt: details.startTimestamp ?? null,
    }
  } catch {
    return {
      platform: "youtube",
      state: "unavailable",
      checkedAt: checked,
      detail: "YouTube live status could not be checked.",
      url: YOUTUBE_URL,
      videoId: null,
    }
  }
}

async function checkTwitch(): Promise<LivePlatformStatus> {
  const checked = new Date().toISOString()
  const clientId = process.env.TWITCH_CLIENT_ID
  const secret = process.env.TWITCH_CLIENT_SECRET
  if (!clientId || !secret) {
    return {
      platform: "twitch",
      state: "unavailable",
      checkedAt: checked,
      detail: "Twitch status needs a server app token. The channel link is still his.",
      url: TWITCH_URL,
    }
  }
  try {
    const token = await getTwitchToken(clientId, secret)
    const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${TWITCH_LOGIN}`, {
      headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
    })
    if (!response.ok) throw new Error(`helix ${response.status}`)
    const body = (await response.json()) as { data?: Array<{ id: string; title: string; started_at: string }> }
    const stream = body.data?.[0]
    if (!stream) {
      return {
        platform: "twitch",
        state: "offline",
        checkedAt: checked,
        detail: "Twitch’s Get Streams call returned no live stream.",
        url: TWITCH_URL,
      }
    }
    return {
      platform: "twitch",
      state: "live",
      checkedAt: checked,
      detail: "Twitch reports the channel is live.",
      url: TWITCH_URL,
      videoId: stream.id,
      title: stream.title,
      startedAt: stream.started_at,
    }
  } catch {
    return {
      platform: "twitch",
      state: "unavailable",
      checkedAt: checked,
      detail: "Twitch live status could not be checked.",
      url: TWITCH_URL,
    }
  }
}

async function getTwitchToken(clientId: string, secret: string): Promise<string> {
  if (twitchToken && twitchToken.expires > Date.now() + 60_000) return twitchToken.value
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: secret,
    grant_type: "client_credentials",
  })
  const response = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", body })
  if (!response.ok) throw new Error("twitch token")
  const json = (await response.json()) as { access_token: string; expires_in: number }
  twitchToken = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 }
  return json.access_token
}
