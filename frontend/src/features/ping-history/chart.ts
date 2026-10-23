import type { PingRecord } from '../../lib/api'

export type Metric = 'rtt_avg_ms' | 'packet_loss_percent'
export interface Point { time: number; value: number }

export function summarizePingResults(records: readonly PingRecord[]) {
  const rtts = records.filter(record => record.rtt_avg_ms !== null && Number.isFinite(record.rtt_avg_ms))
  const sorted = rtts.map(record => record.rtt_avg_ms!).sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const medianRtt = sorted.length === 0 ? null : sorted.length % 2
    ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
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

export function formatMetric(value: number | null): string {
  if (value === null) return 'Indisponível'
  if (value > 0 && value < 0.1) return '<0,1'
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

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
