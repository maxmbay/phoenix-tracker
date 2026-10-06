# Sailing With Phoenix — Voyage companion

Unofficial log beside [Oliver Widger’s public PredictWind tracker](https://forecast.predictwind.com/tracking/display/SY_Phoenix/). It is not affiliated with him, Sailing With Phoenix, or PredictWind.

The map, the story list, and the condition charts share one selected time. Posts are editor-curated links. Wind, gusts, and significant wave height are Open-Meteo hindcasts at the reported position, drawn separately from anything he said. An empty adversity lane means there is no reviewed report, not that the day was easy.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. The API listens on port 8787.

`npm test` checks the gap and date-line rules. `npm run build && npm start` serves the built interface and the API together.

## What is seeded

The seed is a snapshot of the public tracking page, plus 21 YouTube posts with sources and a departure note from the Port Townsend Sailing Association. Pins on posts use the tracker fix nearest the publication time, unless the card says otherwise. The September sea trial is a route segment because the video does not name the days. Several refit videos have no pin, because the tracker has no trustworthy fix then. Rebuild the snapshot with `npm run seed` (Python 3). That script calls PredictWind’s public page and Open-Meteo.

The running server copies new tracker positions about every 30 minutes. If the page layout changes, the previous positions are kept and the failure is recorded. Weather for new hours is refreshed from the editor, not on a timer.

## Editor

Set `ADMIN_TOKEN` in `.env`, open **Editor**, and paste the token. You can add a link, correct a date, retag an event, attach a pin, and publish it without changing code. Drafts stay off the map.

Twitch live status is checked with [Get Streams](https://dev.twitch.tv/docs/api/reference/#get-streams) only when `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are set. Otherwise the page says the status is unavailable. It does not call the channel offline. YouTube is checked from the channel’s live URL. The stream and the GPS report are not treated as the same clock.

## Not in this version

Replay of a recording along the track, chapter markers, transcript ingestion, and automatic event proposals. Those need a durable recording, reviewed time anchors, and permission to use his media.

Weather data is from [Open-Meteo](https://open-meteo.com/). Their free endpoint is for non-commercial use; a public commercial deployment needs their commercial plan, with attribution kept. Map tiles are [OpenFreeMap](https://openfreemap.org/) and OpenStreetMap.
