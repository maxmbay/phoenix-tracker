export function formatUtc(value: string | number): string {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown time"
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date)
  return `${formatted} UTC`
}

export function formatAge(fromSeconds: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round(now / 1000 - fromSeconds))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatLatLon(lat: number, lon: number): string {
  const part = (value: number, positive: string, negative: string) => {
    const absolute = Math.abs(value)
    const degrees = Math.floor(absolute)
    const minutes = (absolute - degrees) * 60
    return `${degrees}°${minutes.toFixed(1)}′${value >= 0 ? positive : negative}`
  }
  return `${part(lat, "N", "S")} ${part(lon, "E", "W")}`
}

export function confidenceLabel(value: string): string {
  if (value === "high") return "High confidence"
  if (value === "medium") return "Approximate"
  if (value === "low") return "Uncertain"
  return "Unknown"
}
