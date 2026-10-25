import { useEffect, useState } from 'react'
import { fetchHistory, fetchTargets, type PingHistory } from '../../lib/api'
import { quickPeriod } from '../../lib/time'
import { summarizePingResults } from '../ping-history/chart'
import { useProbe } from '../probe-status/ProbeProvider'

export interface TargetDay {
  name: string
  history: PingHistory
  summary: ReturnType<typeof summarizePingResults>
}

export interface LatestPing {
  target: string
  timestamp: number
  dst_name: string
  dst_addr?: string
  size?: number
  ttl?: number
  sent: number
  rcvd: number
  min: number
  avg: number
  max: number
  result: { rtt?: number }[]
}

async function fetchLatestPing(measurementId: number, probeId: number, target: string, signal: AbortSignal): Promise<LatestPing | null> {
  const response = await fetch(`https://atlas.ripe.net/api/v2/measurements/${measurementId}/latest/?probe_ids=${probeId}`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const [round] = await response.json() as Omit<LatestPing, 'target'>[]
  if (!round) return null
  const { timestamp, dst_name, dst_addr, size, ttl, sent, rcvd, min, avg, max, result } = round
  return { target, timestamp, dst_name, dst_addr, size, ttl, sent, rcvd, min, avg, max, result }
}

export function usePingDay() {
  const { probeId } = useProbe()
  const [days, setDays] = useState<TargetDay[] | null>(null)
  const [error, setError] = useState('')
  const [latest, setLatest] = useState<LatestPing | null>(null)
  const [latestFailed, setLatestFailed] = useState(false)

  useEffect(() => {
    if (!probeId) return
    const controller = new AbortController()
    const { start, stop } = quickPeriod(1)
    setDays(null)
    setError('')
    setLatest(null)
    setLatestFailed(false)
    fetchTargets(controller.signal)
      .then(catalog => {
        const reference = catalog.targets.find(target => target.target_name === 'K-root') ?? catalog.targets[0]
        if (reference) fetchLatestPing(reference.measurement_id, catalog.probe_id, reference.target_name, controller.signal)
          .then(setLatest)
          .catch(() => { if (!controller.signal.aborted) setLatestFailed(true) })
        return Promise.all(catalog.targets.map(async target => {
          const history = await fetchHistory(catalog.probe_id, target.measurement_id, start, stop, controller.signal)
          return { name: target.target_name, history, summary: summarizePingResults(history.results) }
        }))
      })
      .then(setDays)
      .catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [probeId])

  return { probeId, days, error, latest, latestFailed }
}
