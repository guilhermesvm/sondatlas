import type { PingRecord } from './api'

export type Metric = 'rtt_avg_ms' | 'packet_loss_percent'
export interface Point { time: number; value: number }

// Descriptive statistics over stored rounds, not over individual packets.
// Null metrics have separate denominators; never replace them with zero.
export function summarizePingResults(records: readonly PingRecord[]) {
  const rtts = records.filter(record => record.rtt_avg_ms !== null && Number.isFinite(record.rtt_avg_ms))
  const sorted = rtts.map(record => record.rtt_avg_ms!).sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const medianRtt = sorted.length === 0 ? null : sorted.length % 2
    ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  // If maxima tie, report the earliest observation (input need not be sorted).
  const peak = rtts.reduce<PingRecord | null>((best, record) => !best
    || record.rtt_avg_ms! > best.rtt_avg_ms!
    || (record.rtt_avg_ms === best.rtt_avg_ms && Date.parse(record.timestamp) < Date.parse(best.timestamp))
    ? record : best, null)
  const losses = records.filter(record => record.packet_loss_percent !== null && Number.isFinite(record.packet_loss_percent))
  return {
    medianRtt,
    maxRtt: peak?.rtt_avg_ms ?? null,
    maxRttTime: peak?.timestamp ?? null,
    rttCount: rtts.length,
    lossCount: losses.length,
    lossRounds: losses.filter(record => record.packet_loss_percent! > 0).length,
  }
}

// The current pings nominally run every 240 seconds. A gap exceeding two
// intervals breaks the line; no observations or zero values are invented.
export const GAP_SECONDS = 480

export function splitSeries(records: PingRecord[], metric: Metric): Point[][] {
  const segments: Point[][] = []
  let current: Point[] = []
  for (const record of records) {
    const time = Date.parse(record.timestamp)
    const value = record[metric]
    if (value === null || !Number.isFinite(value) || !Number.isFinite(time)) {
      current = []
      continue
    }
    const previous = current.at(-1)
    if (!previous || time <= previous.time || time - previous.time > GAP_SECONDS * 1000) {
      current = []
      segments.push(current)
    }
    current.push({ time, value })
  }
  return segments
}

export function localInput(value: Date): string {
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

// datetime-local has no offset: parse it as browser-local time, serialize UTC
// only at the API boundary. Reject invalid dates and skipped DST wall times.
export function localPeriod(start: string, stop: string): { start: string; stop: string } {
  if (!start || !stop) throw new Error('Informe o início e o fim do período.')
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(value)) throw new Error('Informe datas locais válidas.')
    const date = new Date(value)
    const wallTime = value.replace(/\.\d{1,3}$/, '')
    if (!Number.isFinite(date.getTime()) || localInput(date) !== (wallTime.length === 16 ? `${wallTime}:00` : wallTime)) {
      throw new Error('Este horário não existe no fuso local. Confira as datas.')
    }
    return date
  }
  const first = parse(start)
  const last = parse(stop)
  if (first >= last) {
    throw new Error('O início precisa ser anterior ao fim do período.')
  }
  if (last.getTime() - first.getTime() > 60 * 86400000) {
    throw new Error('Escolha um período de até 60 dias.')
  }
  return { start: first.toISOString(), stop: last.toISOString() }
}

export function quickPeriod(days: 1 | 7, now = new Date()): { start: string; stop: string } {
  return { start: new Date(now.getTime() - days * 86400000).toISOString(), stop: now.toISOString() }
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Formatting only: never round stored observations or chart coordinates.
// A small positive metric must not be displayed as a measured zero.
export function formatMetric(value: number | null): string {
  if (value === null) return 'Indisponível'
  if (value > 0 && value < 0.1) return '<0,1'
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

export function formatLocal(value: string | number, detail = false): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: detail ? 'numeric' : undefined,
    hour: '2-digit', minute: '2-digit', second: detail ? '2-digit' : undefined,
    timeZoneName: detail ? 'shortOffset' : undefined,
  }).format(new Date(value))
}

// Select an actual stored observation, never an interpolated chart value.
// Same-timestamp records remain accessible individually through the selector.
export function nearestRecordIndex(records: PingRecord[], time: number): number {
  if (records.length === 0) return -1
  let low = 0
  let high = records.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (Date.parse(records[middle].timestamp) < time) low = middle + 1
    else high = middle
  }
  if (low > 0 && time - Date.parse(records[low - 1].timestamp) <= Date.parse(records[low].timestamp) - time) return low - 1
  return low
}
