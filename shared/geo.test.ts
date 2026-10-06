import assert from "node:assert/strict"
import { positionAt, trackLines } from "./geo.ts"
import type { Position } from "./types.ts"

function point(t: number, lat: number, lon: number): Position {
  return {
    t,
    lat,
    lon,
    sog: 5,
    cog: 180,
    source: "test",
    receivedAt: "2026-10-06T00:00:00Z",
    voyageId: "test",
  }
}

const close = [point(0, 48, -125), point(3600, 48.1, -125.1)]
const mid = positionAt(close, 1800)
assert.ok(mid)
assert.equal(mid.interpolated, true)
assert.equal(mid.gap, false)
assert.ok(Math.abs(mid.lat - 48.05) < 0.001)
assert.equal(mid.sog, null)

const gap = [point(0, 48, -125), point(8 * 3600, 47, -126)]
const across = positionAt(gap, 4 * 3600)
assert.ok(across)
assert.equal(across.interpolated, false)
assert.equal(across.gap, true)
assert.equal(across.lat, 48)

const dateLine = [
  point(0, 10, 179.9),
  point(600, 10, 179.95),
  point(1200, 10, -179.95),
  point(1800, 10, -179.9),
]
const lines = trackLines(dateLine)
assert.equal(lines.length, 2)
const jumped = positionAt(dateLine, 900)
assert.ok(jumped)
assert.equal(jumped.interpolated, false)
assert.equal(jumped.gap, true)

const before = positionAt(close, -10 * 3600)
assert.ok(before)
assert.equal(before.gap, true)
assert.equal(before.lat, 48)

console.log("geo tests passed")
