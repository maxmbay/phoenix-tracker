import fs from "node:fs"
import path from "node:path"
import type { Database } from "../shared/types.ts"

export interface Meta {
  lastIngestAt: string | null
  lastIngestError: string | null
}

export interface Persisted extends Database {
  meta: Meta
}

const root = path.resolve(process.cwd())
const seedPath = path.join(root, "data", "seed.json")
const dbPath = path.join(root, "data", "db.json")

let cache: Persisted | null = null
let writing: Promise<void> = Promise.resolve()

function emptyMeta(): Meta {
  return { lastIngestAt: null, lastIngestError: null }
}

export function loadDb(): Persisted {
  if (cache) return cache
  const raw = fs.readFileSync(fs.existsSync(dbPath) ? dbPath : seedPath, "utf8")
  const parsed = JSON.parse(raw) as Persisted
  parsed.meta = parsed.meta ?? emptyMeta()
  cache = parsed
  return parsed
}

export function updateDb(mutate: (db: Persisted) => void): Persisted {
  const db = loadDb()
  mutate(db)
  cache = db
  const snapshot = JSON.stringify(db)
  writing = writing.then(() => fs.promises.writeFile(dbPath, snapshot))
  return db
}

export async function flushDb(): Promise<void> {
  await writing
}
