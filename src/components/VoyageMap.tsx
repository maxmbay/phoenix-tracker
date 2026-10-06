import maplibregl from "maplibre-gl"
import { useEffect, useRef } from "react"
import { nearestPosition, positionsBetween, trackLines } from "../../shared/geo.ts"
import type { Position, VoyageEvent } from "../../shared/types.ts"

interface Props {
  positions: Position[]
  events: VoyageEvent[]
  focus: Position[]
  boat: { lat: number; lon: number; cog: number | null } | null
  selectedEvent: VoyageEvent | null
  onSelectTime: (t: number) => void
  onSelectEvent: (id: string) => void
}

export function VoyageMap({ positions, events, focus, boat, selectedEvent, onSelectTime, onSelectEvent }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const handlers = useRef({ onSelectTime, onSelectEvent, positions })
  handlers.current = { onSelectTime, onSelectEvent, positions }

  useEffect(() => {
    if (!host.current) return
    const map = new maplibregl.Map({
      container: host.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: [-124.5, 45],
      zoom: 4,
      cooperativeGestures: window.matchMedia("(max-width: 860px)").matches,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(new maplibregl.ScaleControl({ unit: "nautical" }), "bottom-left")
    const element = document.createElement("div")
    element.className = "boat-marker"
    element.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 2.2 20.2 20.5 12 16.2 3.8 20.5Z" fill="#f6f1e6" stroke="#1b140c" stroke-width="1.4"/></svg>'
    const marker = new maplibregl.Marker({ element, rotationAlignment: "map" })
    markerRef.current = marker
    map.on("load", () => {
      map.addSource("track", { type: "geojson", data: emptyCollection() })
      map.addSource("segment", { type: "geojson", data: emptyCollection() })
      map.addSource("pins", { type: "geojson", data: emptyCollection() })
      map.addLayer({
        id: "track",
        type: "line",
        source: "track",
        paint: { "line-color": "#e7c98a", "line-width": 2.2, "line-opacity": 0.85 },
      })
      map.addLayer({
        id: "segment",
        type: "line",
        source: "segment",
        paint: { "line-color": "#e36a45", "line-width": 5, "line-opacity": 0.85 },
      })
      map.addLayer({
        id: "pins",
        type: "circle",
        source: "pins",
        paint: {
          "circle-radius": ["case", ["==", ["get", "selected"], 1], 7, 4.5],
          "circle-color": ["match", ["get", "confidence"], "high", "#f7f3ea", "medium", "#e7c98a", "#f0a07a"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#1b140c",
        },
      })
      map.on("click", (event) => {
        const features = map.queryRenderedFeatures(event.point, { layers: ["pins"] })
        const id = features[0]?.properties?.id
        if (typeof id === "string") {
          handlers.current.onSelectEvent(id)
          return
        }
        const hit = nearestPosition(handlers.current.positions, event.lngLat.lat, event.lngLat.lng, 35)
        if (hit) handlers.current.onSelectTime(hit.t)
      })
      map.on("mouseenter", "pins", () => {
        map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", "pins", () => {
        map.getCanvas().style.cursor = ""
      })
    })
    mapRef.current = map
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(host.current)
    return () => {
      observer.disconnect()
      marker.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const track = map.getSource("track") as maplibregl.GeoJSONSource | undefined
      const pins = map.getSource("pins") as maplibregl.GeoJSONSource | undefined
      const segment = map.getSource("segment") as maplibregl.GeoJSONSource | undefined
      if (!track || !pins || !segment) return
      track.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "MultiLineString", coordinates: trackLines(positions) },
          },
        ],
      })
      pins.setData({
        type: "FeatureCollection",
        features: events
          .filter((event) => event.locationMode === "pin" && event.lat != null && event.lon != null && event.status === "published")
          .map((event) => ({
            type: "Feature" as const,
            properties: {
              id: event.id,
              confidence: event.locationConfidence,
              selected: event.id === selectedEvent?.id ? 1 : 0,
            },
            geometry: { type: "Point" as const, coordinates: [event.lon as number, event.lat as number] },
          })),
      })
      const span =
        selectedEvent?.locationMode === "segment" && selectedEvent.segmentStart && selectedEvent.segmentEnd
          ? positionsBetween(positions, selectedEvent.segmentStart, selectedEvent.segmentEnd)
          : []
      segment.setData({
        type: "FeatureCollection",
        features: span.length
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "MultiLineString", coordinates: trackLines(span) },
              },
            ]
          : [],
      })
    }
    if (map.isStyleLoaded()) apply()
    else map.once("load", apply)
  }, [positions, events, selectedEvent])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus.length) return
    const fit = () => {
      const bounds = new maplibregl.LngLatBounds()
      for (const point of focus) bounds.extend([point.lon, point.lat])
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 56, duration: 0, maxZoom: 6 })
    }
    if (map.isStyleLoaded()) fit()
    else map.once("load", fit)
  }, [focus])

  useEffect(() => {
    const marker = markerRef.current
    const map = mapRef.current
    if (!marker || !map || !boat) return
    const place = () => {
      marker.setLngLat([boat.lon, boat.lat]).addTo(map)
      marker.setRotation(boat.cog ?? 0)
    }
    if (map.isStyleLoaded()) place()
    else map.once("load", place)
  }, [boat])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedEvent) return
    const go = () => {
      if (selectedEvent.locationMode === "pin" && selectedEvent.lat != null && selectedEvent.lon != null) {
        map.easeTo({ center: [selectedEvent.lon, selectedEvent.lat], duration: 600 })
      }
      if (selectedEvent.locationMode === "segment" && selectedEvent.segmentStart && selectedEvent.segmentEnd) {
        const span = positionsBetween(positions, selectedEvent.segmentStart, selectedEvent.segmentEnd)
        if (!span.length) return
        const bounds = new maplibregl.LngLatBounds()
        for (const point of span) bounds.extend([point.lon, point.lat])
        map.fitBounds(bounds, { padding: 64, duration: 600, maxZoom: 6 })
      }
    }
    if (map.isStyleLoaded()) go()
    else map.once("load", go)
  }, [selectedEvent, positions])

  return <div ref={host} className="map" />
}

function emptyCollection() {
  return { type: "FeatureCollection" as const, features: [] }
}
