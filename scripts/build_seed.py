#!/usr/bin/env python3
"""Build data/seed.json from the public PredictWind page, YouTube posts, and Open-Meteo.

Unofficial. Positions are read from the public tracking page's embedded data,
not from a documented PredictWind API. Weather values are model estimates at
the reported position, retrieved after the fact.
"""

from __future__ import annotations

import json
import math
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

TRACK_URL = "https://forecast.predictwind.com/tracking/display/SY_Phoenix"
UA = "sailing-with-phoenix-companion/0.1 (unofficial; educational)"
POINT_HUDSON = (48.1173, -122.7536)

# Curated from the public channel. Summaries are editorial paraphrases, not transcripts.
POSTS = [
    {
        "id": "5Dgug-XpErI",
        "kind": "short",
        "title": "Day 3 sailing around the world without stopping",
        "publishedAt": "2026-10-06T18:45:09Z",
        "summary": "A short published on 6 October titled as day 3 of the nonstop circumnavigation. No transcript is stored. The map uses the tracker report nearest the publication time, which may not be the moment he filmed.",
        "topic": "story",
        "storyline": "departure-2026",
    },
    {
        "id": "iDuXuiW07AI",
        "kind": "live",
        "title": "LIVE - Sailing Alone Around The World Without Stopping",
        "publishedAt": "2026-10-06T02:00:12Z",
        "summary": "His YouTube broadcast from the first days at sea. Playback time and the GPS tracker are separate feeds and are not synchronized here. A later replay would need a reviewed recording and time anchors.",
        "topic": "story",
        "storyline": "departure-2026",
    },
    {
        "id": "yEQkAO4jN-Y",
        "kind": "short",
        "title": "Day 2 sailing around the world without stopping.",
        "publishedAt": "2026-10-05T19:00:27Z",
        "summary": "A short published on 5 October titled as day 2. The pin is aligned to publication time, not a verified filming clock.",
        "topic": "story",
        "storyline": "departure-2026",
    },
    {
        "id": "dWzrmnpNxcs",
        "kind": "short",
        "title": "doing something everyone’s done to something less then 200 people in human existence have ever done.",
        "publishedAt": "2026-10-04T18:32:55Z",
        "summary": "A short posted on 4 October. The public title is the text we have; there is no transcript, so nothing here is treated as a report of conditions, sleep, or a repair.",
        "topic": "story",
        "storyline": "departure-2026",
    },
    {
        "id": "CqpH9NevmGU",
        "kind": "short",
        "title": "October 2, 2026",
        "publishedAt": "2026-10-02T16:16:07Z",
        "summary": "A short published the morning of the departure, a couple of hours after the announced 07:00 send-off. Placed on the tracker report nearest that publication time.",
        "topic": "story",
        "storyline": "departure-2026",
    },
    {
        "id": "MUyZOxuFdwo",
        "kind": "video",
        "title": "1 Day Until I Set Sail Around The World Without Stopping",
        "publishedAt": "2026-10-01T20:00:01Z",
        "summary": "A 29-minute video published the day before leaving. He describes the planned solo nonstop circumnavigation from Port Townsend aboard Phoenix do Mar. The boat’s tracker was still at the marina.",
        "topic": "story",
        "storyline": "departure-2026",
    },
    {
        "id": "81-Ni_iJKiA",
        "kind": "short",
        "title": "1 day until I sail around the world without stopping. Thank you @PurinaFriskies for everything.",
        "publishedAt": "2026-09-30T19:12:16Z",
        "summary": "A countdown short the day before departure. The title thanks Purina Friskies. The boat was still alongside in Port Townsend.",
        "topic": "story",
        "storyline": "departure-2026",
    },
    {
        "id": "b91CD3EQZOA",
        "kind": "short",
        "title": "Regardless of what happens, I have already won. Because I have found the courage to try.",
        "publishedAt": "2026-09-21T22:46:20Z",
        "summary": "A short published on 21 September, while the boat was still in Port Townsend. The title is the public text; it is not read here as a report of conditions at sea.",
        "topic": "story",
        "storyline": "countdown",
    },
    {
        "id": "-FoFsk-8e18",
        "kind": "short",
        "title": "13 days until I sail around the world without stopping. Shout out @ring for supporting the trip! #ad",
        "publishedAt": "2026-09-18T18:23:15Z",
        "summary": "A countdown short. The title is marked as an advertisement and shouts out Ring. Included as a published post, not as a condition or equipment report.",
        "topic": "story",
        "storyline": "countdown",
    },
    {
        "id": "1GDLDLeaZ-U",
        "kind": "video",
        "title": "Am I Ready To Sail Nonstop Around The World?",
        "publishedAt": "2026-09-10T19:00:00Z",
        "summary": "Published 10 September. He describes it as part of a five-day sea trial in the Pacific to test a new sail inventory. The video does not name the calendar days, so the highlight is the offshore track from 2–8 September, which is the matching movement on the public tracker. That association is approximate.",
        "topic": "story",
        "storyline": "sea-trial",
        "segment": ("2026-09-02T00:00:00Z", "2026-09-08T23:00:00Z"),
        "timing": "low",
        "locationMode": "segment",
    },
    {
        "id": "rJ1-mzt9Wl4",
        "kind": "short",
        "title": "25 days until I attempt to sail around the world without stopping.",
        "publishedAt": "2026-09-06T22:43:27Z",
        "summary": "A countdown short published while the September sea trial was underway. Publication time is not the same thing as a filmed position, so the pin is only the nearest tracker report.",
        "topic": "story",
        "storyline": "countdown",
    },
    {
        "id": "PljthKurkOY",
        "kind": "short",
        "title": "26 days until I sail around the world without stopping.",
        "publishedAt": "2026-09-05T23:44:35Z",
        "summary": "A countdown short published during the September offshore trip. Aligned to the nearest tracker report around publication.",
        "topic": "story",
        "storyline": "countdown",
    },
    {
        "id": "ZLXofBwa0xQ",
        "kind": "video",
        "title": "38 days until I sail around the world without stopping",
        "publishedAt": "2026-08-24T22:38:25Z",
        "summary": "A countdown video in late August. He restates the plan to leave Port Townsend in October aboard Phoenix do Mar. Placed only if the tracker has a nearby report.",
        "topic": "story",
        "storyline": "countdown",
    },
    {
        "id": "yc5uLROYE08",
        "kind": "short",
        "title": "Thanks Ben! @liferaftprofessionals",
        "publishedAt": "2026-08-08T23:46:47Z",
        "summary": "A short thanking a life-raft supplier during final preparation. It is not a report that the raft was used.",
        "topic": "story",
        "storyline": "countdown",
    },
    {
        "id": "krLuU2Wyouw",
        "kind": "video",
        "title": "First Sail Alone Since Sailing To Hawai'i",
        "publishedAt": "2026-08-05T19:00:00Z",
        "summary": "He frames this as the first sail alone since the Hawaiʻi passage, on the Pacific Seacraft 40 he was preparing for the circumnavigation. The pin follows the public tracker around the publication time.",
        "topic": "story",
        "storyline": "countdown",
    },
    {
        "id": "3CPmI764YoY",
        "kind": "video",
        "title": "64 Days Until I Sail Nonstop Around The World",
        "publishedAt": "2026-07-29T19:00:16Z",
        "summary": "A July countdown video. Included so the early Port Townsend preparation has a source on the map when the tracker has a report that day.",
        "topic": "story",
        "storyline": "countdown",
    },
    {
        "id": "L1fzbsL4qAo",
        "kind": "video",
        "title": "Phoenix Do Mar Is Born",
        "publishedAt": "2026-03-25T20:00:29Z",
        "summary": "The renaming video for the Pacific Seacraft 40. The public tracker has no reliable position that week, so this card has no pin.",
        "topic": "story",
        "storyline": "refit",
    },
    {
        "id": "dL7ZLXtu4Eg",
        "kind": "video",
        "title": "My Rudder FAILED in the Pacific… So I Tore it Apart",
        "publishedAt": "2026-03-11T19:00:41Z",
        "summary": "Published during the refit. He describes a rudder failure from the earlier Pacific passage and a later teardown. The clock time and position of the failure are not established here, so this is filed as a report with unknown occurrence time — not a pin on the October voyage, and not a continuous equipment score.",
        "topic": "equipment",
        "storyline": "rudder",
        "timeBasis": "report-only",
        "timing": "low",
        "locationMode": "none",
    },
    {
        "id": "fASS2iAo5FU",
        "kind": "video",
        "title": "Installing a Watermaker So I Don’t Die of Thirst Mid-Ocean",
        "publishedAt": "2026-03-04T20:00:29Z",
        "summary": "A refit video about installing a watermaker. The title is blunt; it is preparation footage, not a report that he ran out of water. No tracker position is available for this week.",
        "topic": "story",
        "storyline": "refit",
    },
    {
        "id": "k-b_1r17udQ",
        "kind": "video",
        "title": "Route Planning My Solo Nonstop Circumnavigation",
        "publishedAt": "2026-02-11T20:00:40Z",
        "summary": "A route-planning video published in February 2026. No position is attached: the public tracker does not have a trustworthy fix that day.",
        "topic": "story",
        "storyline": "refit",
    },
    {
        "id": "X7DiejdMUuk",
        "kind": "video",
        "title": "Sailing My New Boat to Port Townsend",
        "publishedAt": "2026-02-04T20:00:24Z",
        "summary": "He published this about bringing the new boat to Port Townsend. The public SY_Phoenix track does not cover that delivery, so the card stays unpinned rather than guessing a route.",
        "topic": "story",
        "storyline": "refit",
    },
]


def http_json(url: str, method: str = "GET", body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=40) as res:
        return json.loads(res.read().decode())


def haversine_nm(a_lat, a_lon, b_lat, b_lon) -> float:
    r_nm = 3440.065
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r_nm * math.asin(min(1, math.sqrt(h)))


def parse_iso(value: str) -> int:
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_route() -> tuple[list[dict], int]:
    html = urllib.request.urlopen(
        urllib.request.Request(TRACK_URL, headers={"User-Agent": UA})
    ).read().decode("utf-8", "replace")
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
    if not match:
        raise SystemExit("PredictWind page did not include route data")
    boat = json.loads(match.group(1))["props"]["pageProps"]["boatData"]
    received = int(time.time())
    points = []
    for row in boat["route"]:
        lat = row["p"]["lat"]
        lon = row["p"]["lon"]
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        points.append(
            {
                "t": int(row["t"]),
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "sog": row.get("bsp"),
                "cog": row.get("bearing"),
                "source": "predictwind-public-page",
                "receivedAt": iso(received),
            }
        )
    points.sort(key=lambda p: p["t"])
    # Drop isolated spikes. A fix that implies more than 40 knots from both
    # neighbors is not connected and not kept. Long gaps stay, so the map
    # can show them instead of inventing a line.
    kept = []
    for i, point in enumerate(points):
        if i == 0 or i == len(points) - 1:
            kept.append(point)
            continue
        prev, nxt = points[i - 1], points[i + 1]
        spike_prev = implied_knots(prev, point) > 40 and (point["t"] - prev["t"]) < 6 * 3600
        spike_next = implied_knots(point, nxt) > 40 and (nxt["t"] - point["t"]) < 6 * 3600
        if spike_prev and spike_next:
            continue
        kept.append(point)
    updated = int(boat.get("updated") or kept[-1]["t"])
    return kept, updated


def implied_knots(a: dict, b: dict) -> float:
    dt = b["t"] - a["t"]
    if dt <= 0:
        return 999
    return haversine_nm(a["lat"], a["lon"], b["lat"], b["lon"]) / (dt / 3600)


def assign_voyages(points: list[dict]) -> list[dict]:
    """Split the public page into the 2025 passage and the 2026 boat.

    June 2026 is the first month the tracker sits continuously at Port Townsend
    on Phoenix do Mar. April 2026 contains a transcontinental spike and is not
    used as a voyage.
    """
    pt_era = parse_iso("2026-06-28T00:00:00Z")
    hawaii_end = parse_iso("2025-10-03T00:00:00Z")
    out = []
    for point in points:
        if point["t"] < hawaii_end:
            voyage = "oregon-hawaii-2025"
        elif point["t"] >= pt_era:
            voyage = "circumnavigation-2026"
        else:
            continue
        out.append({**point, "voyageId": voyage})
    return downsample(out)


def downsample(points: list[dict]) -> list[dict]:
    kept: list[dict] = []
    last_by_voyage: dict[str, dict] = {}
    for point in points:
        prev = last_by_voyage.get(point["voyageId"])
        if prev is None:
            kept.append(point)
            last_by_voyage[point["voyageId"]] = point
            continue
        dt = point["t"] - prev["t"]
        dist = haversine_nm(prev["lat"], prev["lon"], point["lat"], point["lon"])
        # Keep the 2026 departure at native resolution. Thin the 2025 ocean
        # crossing to about an hour, and always keep a fix after a long gap.
        min_dt = 0 if point["voyageId"] == "circumnavigation-2026" else 3600
        if dt >= min_dt or dist >= 8 or dt >= 6 * 3600:
            kept.append(point)
            last_by_voyage[point["voyageId"]] = point
    if points:
        last = points[-1]
        if kept[-1]["t"] != last["t"]:
            kept.append(last)
    return kept


def nearest(points: list[dict], ts: int, voyage_id: str | None = None) -> dict | None:
    pool = [p for p in points if voyage_id is None or p["voyageId"] == voyage_id]
    if not pool:
        pool = points
    return min(pool, key=lambda p: abs(p["t"] - ts))


def place_post(points: list[dict], post: dict) -> dict:
    published = parse_iso(post["publishedAt"])
    mode = post.get("locationMode", "pin")
    if mode == "none" or post.get("timeBasis") == "report-only":
        return {
            "locationMode": "none",
            "timingConfidence": post.get("timing", "low"),
            "locationConfidence": "unknown",
            "lat": None,
            "lon": None,
            "timeBasis": post.get("timeBasis", "publication"),
        }
    if mode == "segment":
        return {
            "locationMode": "segment",
            "timingConfidence": post.get("timing", "low"),
            "locationConfidence": "low",
            "lat": None,
            "lon": None,
            "segmentStart": post["segment"][0],
            "segmentEnd": post["segment"][1],
            "timeBasis": "occurrence",
        }
    hit = nearest(points, published, "circumnavigation-2026")
    gap = abs(hit["t"] - published)
    dist_port = haversine_nm(hit["lat"], hit["lon"], *POINT_HUDSON)
    if gap > 12 * 3600:
        return {
            "locationMode": "none",
            "timingConfidence": "medium",
            "locationConfidence": "unknown",
            "lat": None,
            "lon": None,
            "timeBasis": "publication",
        }
    if dist_port < 2 and gap <= 6 * 3600:
        loc = "high"
    elif gap <= 3 * 3600:
        loc = "medium"
    else:
        loc = "low"
    return {
        "locationMode": "pin",
        "timingConfidence": post.get("timing", "medium"),
        "locationConfidence": loc,
        "lat": hit["lat"],
        "lon": hit["lon"],
        "timeBasis": "publication",
    }


def sample_positions(points: list[dict], start: str, end: str, step_h: int) -> list[dict]:
    start_ts, end_ts = parse_iso(start), parse_iso(end)
    pool = [p for p in points if p["voyageId"] == "circumnavigation-2026"]
    samples = []
    t = start_ts
    while t <= end_ts:
        hit = min(pool, key=lambda p: abs(p["t"] - t))
        if abs(hit["t"] - t) <= 3 * 3600:
            samples.append({"t": t, "lat": hit["lat"], "lon": hit["lon"]})
        t += step_h * 3600
    return samples


def fetch_sample(sample: dict, retrieved: str) -> list[dict]:
    lat, lon = sample["lat"], sample["lon"]
    day = iso(sample["t"])[:10]
    weather = http_json(
        "https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        "&hourly=wind_speed_10m,wind_gusts_10m"
        f"&start_date={day}&end_date={day}&timezone=UTC&wind_speed_unit=kn"
    )
    marine = http_json(
        "https://marine-api.open-meteo.com/v1/marine?"
        f"latitude={lat}&longitude={lon}"
        "&hourly=wave_height"
        f"&start_date={day}&end_date={day}&timezone=UTC"
    )
    stamp = iso(sample["t"])[:13] + ":00"
    rows = []

    def value_at(payload: dict, key: str):
        hours = payload.get("hourly", {})
        times = hours.get("time") or []
        values = hours.get(key) or []
        if stamp not in times:
            return None
        value = values[times.index(stamp)]
        return None if value is None else round(float(value), 2)

    specs = [
        ("wind_speed", value_at(weather, "wind_speed_10m"), "kn", "open-meteo-forecast"),
        ("wind_gust", value_at(weather, "wind_gusts_10m"), "kn", "open-meteo-forecast"),
        ("wave_height", value_at(marine, "wave_height"), "m", "open-meteo-marine"),
    ]
    for variable, value, unit, dataset in specs:
        rows.append(
            {
                "t": sample["t"],
                "lat": lat,
                "lon": lon,
                "variable": variable,
                "value": value,
                "unit": unit,
                "provider": "open-meteo",
                "model": "best_match",
                "dataset": dataset,
                "kind": "hindcast",
                "validTime": iso(sample["t"]),
                "forecastIssuedAt": None,
                "retrievedAt": retrieved,
                "voyageId": "circumnavigation-2026",
            }
        )
    return rows


def youtube_broadcast(video_id: str) -> dict | None:
    try:
        data = http_json(
            "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
            method="POST",
            body={
                "context": {"client": {"clientName": "WEB", "clientVersion": "2.20251001.00.00"}},
                "videoId": video_id,
            },
        )
    except Exception as exc:  # noqa: BLE001 — seed should still build
        print("broadcast lookup failed", exc)
        return None
    details = (
        data.get("microformat", {})
        .get("playerMicroformatRenderer", {})
        .get("liveBroadcastDetails")
    )
    return details


def main() -> None:
    print("fetching track")
    raw, updated = fetch_route()
    positions = assign_voyages(raw)
    print(f"positions {len(raw)} -> {len(positions)} updated {iso(updated)}")
    retrieved = iso(int(time.time()))
    samples = sample_positions(positions, "2026-09-02T00:00:00Z", "2026-09-08T18:00:00Z", 6)
    samples += sample_positions(positions, "2026-10-02T15:00:00Z", iso(updated), 3)
    # unique hours
    dedup = {s["t"]: s for s in samples}
    samples = [dedup[k] for k in sorted(dedup)]
    print(f"weather samples {len(samples)}")
    conditions: list[dict] = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fetch_sample, sample, retrieved) for sample in samples]
        for i, future in enumerate(as_completed(futures), 1):
            conditions.extend(future.result())
            if i % 10 == 0:
                print(f"  {i}/{len(samples)}")
    conditions.sort(key=lambda row: (row["t"], row["variable"]))

    broadcast = youtube_broadcast("iDuXuiW07AI") or {}
    media = []
    events = []
    for post in POSTS:
        url = (
            f"https://www.youtube.com/shorts/{post['id']}"
            if post["kind"] == "short"
            else f"https://www.youtube.com/watch?v={post['id']}"
        )
        media.append(
            {
                "id": post["id"],
                "platform": "youtube",
                "platformId": post["id"],
                "url": url,
                "publishedAt": post["publishedAt"],
                "title": post["title"],
                "kind": post["kind"],
                "availability": "public",
                "thumbnail": f"https://i.ytimg.com/vi/{post['id']}/hqdefault.jpg",
                "transcript": None,
            }
        )
        placed = place_post(positions, post)
        events.append(
            {
                "id": f"post-{post['id']}",
                "voyageId": "circumnavigation-2026",
                "storylineId": post["storyline"],
                "mediaId": post["id"],
                "title": post["title"],
                "summary": post["summary"],
                "topic": post["topic"],
                "start": post.get("segment", (post["publishedAt"],))[0] if placed["locationMode"] == "segment" else post["publishedAt"],
                "end": post["segment"][1] if placed["locationMode"] == "segment" else post["publishedAt"],
                "timeBasis": placed["timeBasis"],
                "timingConfidence": placed["timingConfidence"],
                "locationConfidence": placed["locationConfidence"],
                "locationMode": placed["locationMode"],
                "lat": placed.get("lat"),
                "lon": placed.get("lon"),
                "segmentStart": placed.get("segmentStart"),
                "segmentEnd": placed.get("segmentEnd"),
                "status": "published",
                "sourceUrl": url,
                "sourceLabel": "Sailing With Phoenix on YouTube",
            }
        )

    events.append(
        {
            "id": "departure-point-hudson",
            "voyageId": "circumnavigation-2026",
            "storylineId": "departure-2026",
            "mediaId": "CqpH9NevmGU",
            "title": "Leaves Point Hudson",
            "summary": "The Port Townsend Sailing Association announced a flotilla send-off for 07:00 on Friday, 2 October 2026, from Point Hudson. Peninsula Daily News reported Phoenix do Mar leaving the marina that morning. The pin is the marina, not a tracker coordinate.",
            "topic": "departure",
            "start": "2026-10-02T14:00:00Z",
            "end": "2026-10-02T16:30:00Z",
            "timeBasis": "occurrence",
            "timingConfidence": "high",
            "locationConfidence": "high",
            "locationMode": "pin",
            "lat": POINT_HUDSON[0],
            "lon": POINT_HUDSON[1],
            "segmentStart": None,
            "segmentEnd": None,
            "status": "published",
            "sourceUrl": "https://ptsail.org/2026/09/29/oliver-widger-circumnavigation-sendoff-friday-at-0700-10-2-2026/",
            "sourceLabel": "Port Townsend Sailing Association",
        }
    )

    seed = {
        "generatedAt": retrieved,
        "trackerUpdatedAt": iso(updated),
        "disclaimer": "Unofficial companion. Not affiliated with Oliver Widger, Sailing With Phoenix, or PredictWind.",
        "boat": {
            "name": "Phoenix do Mar",
            "trackerId": "SY_Phoenix",
            "trackerUrl": "https://forecast.predictwind.com/tracking/display/SY_Phoenix/",
            "youtube": "https://www.youtube.com/@Sailing_With_Phoenix",
            "twitch": "https://www.twitch.tv/sailing_with_phoenix",
        },
        "voyages": [
            {
                "id": "circumnavigation-2026",
                "name": "Nonstop circumnavigation",
                "start": "2026-06-28T00:00:00Z",
                "departure": "2026-10-02T14:00:00Z",
                "summary": "Public tracker positions from late June 2026, when the page shows the boat in Port Townsend, through the 2 October departure and the fixes retrieved for this seed.",
            },
            {
                "id": "oregon-hawaii-2025",
                "name": "Oregon to Hawaiʻi, 2025",
                "start": "2025-04-13T23:28:41Z",
                "departure": "2025-04-13T23:28:41Z",
                "summary": "Earlier positions on the same public tracking page, from the Columbia River in April 2025 to Hawaiʻi. This passage used the previous boat. It is context, not the curated story set.",
            },
        ],
        "positions": positions,
        "media": media,
        "events": events,
        "conditions": conditions,
        "storylines": [
            {
                "id": "departure-2026",
                "title": "Leaving Port Townsend",
                "summary": "The send-off and the first posts after Phoenix do Mar left Point Hudson on 2 October 2026.",
                "status": "published",
            },
            {
                "id": "sea-trial",
                "title": "September sea trial",
                "summary": "An offshore stretch in early September that matches his description of a five-day sail trial. The dates are inferred from the tracker, not named in the video.",
                "status": "published",
            },
            {
                "id": "countdown",
                "title": "Countdown",
                "summary": "Public countdown posts from the Port Townsend preparation. Several are ashore. Sponsored titles are labeled from the post itself.",
                "status": "published",
            },
            {
                "id": "refit",
                "title": "Refit notes",
                "summary": "Preparation videos from before the tracker is trustworthy again. Most have no position.",
                "status": "published",
            },
            {
                "id": "rudder",
                "title": "Rudder, reported later",
                "summary": "A failure he has described from the earlier passage, published as a teardown during the refit. Occurrence time and place are unresolved.",
                "status": "published",
            },
        ],
        "broadcasts": [
            {
                "id": "yt-iDuXuiW07AI",
                "platform": "youtube",
                "channel": "UCAub01nC6godaiC7iI9kasw",
                "videoId": "iDuXuiW07AI",
                "title": "LIVE - Sailing Alone Around The World Without Stopping",
                "start": broadcast.get("startTimestamp"),
                "end": broadcast.get("endTimestamp"),
                "isLiveNow": broadcast.get("isLiveNow"),
                "url": "https://www.youtube.com/watch?v=iDuXuiW07AI",
                "recordingUrl": None,
                "anchorsReviewed": False,
                "note": "Start and end come from YouTube's broadcast metadata when the seed was built. They are not a reviewed map of playback time to UTC, and they do not describe Twitch.",
            },
            {
                "id": "twitch-sailing-with-phoenix",
                "platform": "twitch",
                "channel": "sailing_with_phoenix",
                "videoId": None,
                "title": "sailing_with_phoenix",
                "start": None,
                "end": None,
                "isLiveNow": None,
                "url": "https://www.twitch.tv/sailing_with_phoenix",
                "recordingUrl": None,
                "anchorsReviewed": False,
                "note": "He links this channel. Live status is only asserted when a Twitch app token is configured.",
            },
        ],
        "sources": [
            {
                "label": "PredictWind tracking page",
                "url": "https://forecast.predictwind.com/tracking/display/SY_Phoenix/",
            },
            {
                "label": "Port Townsend Sailing Association send-off",
                "url": "https://ptsail.org/2026/09/29/oliver-widger-circumnavigation-sendoff-friday-at-0700-10-2-2026/",
            },
            {
                "label": "Peninsula Daily News",
                "url": "https://www.peninsuladailynews.com/2026/10/03/solo-adventure/",
            },
            {
                "label": "YouTube channel",
                "url": "https://www.youtube.com/@Sailing_With_Phoenix",
            },
            {
                "label": "Open-Meteo",
                "url": "https://open-meteo.com/",
            },
        ],
    }
    path = "data/seed.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(seed, handle, indent=2)
        handle.write("\n")
    print(
        f"wrote {path} positions={len(positions)} media={len(media)} events={len(events)} conditions={len(conditions)}"
    )
    pinned = sum(1 for e in events if e["locationMode"] == "pin")
    print(f"pinned events {pinned} unpinned {len(events) - pinned}")


if __name__ == "__main__":
    main()
