import type { AccountProbe } from '../atlas-account/account'

export interface ConnectionEvent {
  timestamp: number
  event: 'connect' | 'disconnect'
  asn?: number | null
}

export const longOutage = 10 * 60
export const marathon = 7 * 24 * 3600

export interface ConnectionSummary {
  record: number
  // First return after a long outage, and first moment a streak reached the marathon.
  comeback: number | null
  marathonAt: number | null
  // Seconds of connected time → moment the probe reached it.
  marks: Record<number, number>
}

export type Histories = 'checking' | 'failed' | Record<number, ConnectionSummary>

// RIPE Atlas returns the events out of order and sometimes repeats one, so they are sorted and a repeated event is ignored.
export function summarizeConnections(events: ConnectionEvent[], now: number, goals: number[]): ConnectionSummary {
  const intervals: [number, number][] = []
  let start: number | null = null
  for (const { event, timestamp } of [...events].sort((a, b) => a.timestamp - b.timestamp)) {
    if (event === 'connect' && start === null) start = timestamp
    else if (event === 'disconnect' && start !== null) {
      intervals.push([start, timestamp])
      start = null
    }
  }
  if (start !== null) intervals.push([start, now])

  let record = 0
  let total = 0
  let comeback: number | null = null
  let marathonAt: number | null = null
  const marks: Record<number, number> = {}
  intervals.forEach(([from, to], index) => {
    if (comeback === null && index > 0 && from - intervals[index - 1][1] >= longOutage) comeback = from
    if (marathonAt === null && to - from >= marathon) marathonAt = from + marathon
    record = Math.max(record, to - from)
    for (const goal of goals) {
      if (!(goal in marks) && total + to - from >= goal) marks[goal] = from + goal - total
    }
    total += to - from
  })
  return { record, comeback, marathonAt, marks }
}

// Measurement 7000 logs every connection and disconnection of every probe, publicly.
export async function fetchConnectionEvents(probeId: number, firstConnected: number | string | null | undefined, now: number, signal: AbortSignal) {
  const first = typeof firstConnected === 'number' ? firstConnected : Date.parse(String(firstConnected)) / 1000
  if (!firstConnected || Number.isNaN(first)) return []
  const url = `https://atlas.ripe.net/api/v2/measurements/7000/results/?probe_ids=${probeId}&start=${Math.floor(first) - 3600}&stop=${now}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as ConnectionEvent[]
}

export async function findHistories(probes: AccountProbe[], goals: number[], signal: AbortSignal) {
  const now = Math.floor(Date.now() / 1000)
  const summaries = await Promise.all(probes.map(async probe => [probe.id, summarizeConnections(await fetchConnectionEvents(probe.id, probe.first_connected, now, signal), now, goals)] as const))
  return Object.fromEntries(summaries) as Record<number, ConnectionSummary>
}
