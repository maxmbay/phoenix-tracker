import type { PointerEvent } from "react"
import type { ConditionSample, VoyageEvent } from "../../shared/types.ts"
import { formatUtc } from "../format.ts"

interface Props {
  conditions: ConditionSample[]
  events: VoyageEvent[]
  t0: number
  t1: number
  time: number
  onSelectTime: (t: number) => void
}

const lanes: Array<{ topic: VoyageEvent["topic"]; label: string }> = [
  { topic: "equipment", label: "Equipment" },
  { topic: "sleep", label: "Sleep" },
  { topic: "conditions", label: "Reported sea" },
]

export function Instrument({ conditions, events, t0, t1, time, onSelectTime }: Props) {
  const wind = series(conditions, "wind_speed")
  const gust = series(conditions, "wind_gust")
  const wave = series(conditions, "wave_height")
  const windDomain = domain([...wind, ...gust], true)
  const waveDomain = domain(wave, true)
  const at = nearestSample(wind, time)
  const gustAt = nearestSample(gust, time)
  const waveAt = nearestSample(wave, time)
  const span = Math.max(1, t1 - t0)

  function seek(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    onSelectTime(t0 + Math.min(1, Math.max(0, ratio)) * span)
  }

  return (
    <section className="instrument" aria-label="Conditions and incidents">
      <div className="instrument-readout">
        <div>
          <p className="eyebrow">Selected time</p>
          <p className="readout-time">{formatUtc(time)}</p>
        </div>
        <dl className="readout-metrics">
          <div>
            <dt>Wind</dt>
            <dd>{metric(at, "kn")}</dd>
          </div>
          <div>
            <dt>Gust</dt>
            <dd>{metric(gustAt, "kn")}</dd>
          </div>
          <div>
            <dt>Waves</dt>
            <dd>{metric(waveAt, "m")}</dd>
          </div>
        </dl>
      </div>
      <label className="scrubber">
        <span className="sr">Scrub the passage</span>
        <input
          type="range"
          min={t0}
          max={t1}
          step={60}
          value={Math.min(t1, Math.max(t0, time))}
          onChange={(event) => onSelectTime(Number(event.target.value))}
        />
      </label>
      <div className="plots">
        <Plot label="Wind" unit="kn" samples={wind} t0={t0} t1={t1} time={time} min={windDomain[0]} max={windDomain[1]} color="#f2d48a" onSeek={seek} />
        <Plot label="Gust" unit="kn" samples={gust} t0={t0} t1={t1} time={time} min={windDomain[0]} max={windDomain[1]} color="#f0a07a" onSeek={seek} />
        <Plot label="Wave" unit="m" samples={wave} t0={t0} t1={t1} time={time} min={waveDomain[0]} max={waveDomain[1]} color="#8fd0c6" onSeek={seek} />
      </div>
      <div className="lanes" aria-label="Reviewed incidents">
        {lanes.map((lane) => (
          <Lane key={lane.topic} label={lane.label} events={events.filter((event) => event.topic === lane.topic)} t0={t0} t1={t1} onSelectTime={onSelectTime} />
        ))}
      </div>
      <p className="provenance">
        Wind, gusts, and significant wave height are Open-Meteo hindcasts at the tracker position for that hour. They are model estimates, not instruments on the boat. A blank adversity lane means no editor-reviewed report in this stretch, not that the passage was easy or that he slept.
      </p>
    </section>
  )
}

function Plot({
  label,
  unit,
  samples,
  t0,
  t1,
  time,
  min,
  max,
  color,
  onSeek,
}: {
  label: string
  unit: string
  samples: Sample[]
  t0: number
  t1: number
  time: number
  min: number
  max: number
  color: string
  onSeek: (event: PointerEvent<SVGSVGElement>) => void
}) {
  const d = pathFor(samples, t0, t1, min, max)
  const x = ((time - t0) / Math.max(1, t1 - t0)) * 100
  return (
    <div className="plot">
      <div className="plot-label">
        {label}
        <span>{unit}</span>
      </div>
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" onPointerDown={onSeek} role="presentation">
        <path d={d} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        <line x1={x} x2={x} y1="0" y2="36" stroke="rgba(247,243,234,0.55)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

function Lane({
  label,
  events,
  t0,
  t1,
  onSelectTime,
}: {
  label: string
  events: VoyageEvent[]
  t0: number
  t1: number
  onSelectTime: (t: number) => void
}) {
  const span = Math.max(1, t1 - t0)
  const visible = events.filter((event) => {
    const start = Date.parse(event.start) / 1000
    const end = Date.parse(event.end) / 1000
    return event.status === "published" && end >= t0 && start <= t1 && event.timeBasis !== "report-only"
  })
  return (
    <div className="lane">
      <div className="plot-label">{label}</div>
      <div className="lane-track">
        {visible.map((event) => {
          const start = Date.parse(event.start) / 1000
          const end = Date.parse(event.end) / 1000
          const left = ((Math.max(start, t0) - t0) / span) * 100
          const width = Math.max(0.8, ((Math.min(end, t1) - Math.max(start, t0)) / span) * 100)
          const interval = end - start > 3600
          return (
            <button
              key={event.id}
              className={interval ? "lane-bar" : "lane-mark"}
              style={interval ? { left: `${left}%`, width: `${width}%` } : { left: `${left}%` }}
              title={event.title}
              onClick={() => onSelectTime(start)}
            />
          )
        })}
      </div>
    </div>
  )
}

interface Sample {
  t: number
  value: number | null
}

function series(conditions: ConditionSample[], variable: ConditionSample["variable"]): Sample[] {
  return conditions
    .filter((row) => row.variable === variable)
    .map((row) => ({ t: row.t, value: row.value }))
    .sort((a, b) => a.t - b.t)
}

function domain(samples: Sample[], includeZero: boolean): [number, number] {
  const values = samples.map((sample) => sample.value).filter((value): value is number => value != null)
  if (!values.length) return [0, 1]
  const min = includeZero ? 0 : Math.min(...values)
  const max = Math.max(...values, min + 1)
  return [min, max]
}

function nearestSample(samples: Sample[], time: number): Sample | null {
  let best: Sample | null = null
  for (const sample of samples) {
    if (sample.value == null) continue
    if (!best || Math.abs(sample.t - time) < Math.abs(best.t - time)) best = sample
  }
  if (!best || Math.abs(best.t - time) > 90 * 60) return null
  return best
}

function metric(sample: Sample | null, unit: string): string {
  if (!sample || sample.value == null) return "Unknown"
  return `${sample.value} ${unit}`
}

function pathFor(samples: Sample[], t0: number, t1: number, min: number, max: number): string {
  let d = ""
  let drawing = false
  let previous: number | null = null
  const span = Math.max(1, t1 - t0)
  const height = max - min || 1
  for (const sample of samples) {
    const broken = previous != null && sample.t - previous > 4 * 3600
    previous = sample.t
    if (sample.value == null || broken) {
      drawing = false
      if (sample.value == null) continue
    }
    const x = ((sample.t - t0) / span) * 100
    const y = 34 - ((sample.value - min) / height) * 30
    d += `${drawing ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `
    drawing = true
  }
  return d
}
