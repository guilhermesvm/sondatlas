import { useEffect, useState } from 'react'
import { fetchHistory, fetchTargets } from '../../lib/api'
import { quickPeriod } from '../../lib/time'
import { summarizePingResults } from '../ping-history/chart'
import { fetchAddresses } from '../lessons/useAddresses'
import { useProbe } from '../probe-status/ProbeProvider'
import { busiestPeriodQuestion, fastestTargetQuestion, hopCountQuestion, ipv6Question, nearestRootQuestion, privateAddressQuestion, type Question } from './questions'

// Built-in IPv4 pings from every probe to the root servers (the G-root ping answers 404 on the API, so it is left out).
const rootPings = [
  [1009, 'A-root'], [1010, 'B-root'], [1011, 'C-root'], [1012, 'D-root'], [1013, 'E-root'], [1004, 'F-root'],
  [1015, 'H-root'], [1005, 'I-root'], [1016, 'J-root'], [1001, 'K-root'], [1008, 'L-root'], [1006, 'M-root'],
] as const

async function readJson<T>(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as T
}

async function pingQuestions(signal: AbortSignal) {
  const catalog = await fetchTargets(signal)
  const { start, stop } = quickPeriod(1)
  const days = await Promise.all(catalog.targets.map(async target => {
    const history = await fetchHistory(catalog.probe_id, target.measurement_id, start, stop, signal)
    return { name: target.target_name, records: history.results, typical: summarizePingResults(history.results).medianRtt }
  }))
  const reference = days.find(day => day.name === 'K-root') ?? days[0]
  return [
    reference ? busiestPeriodQuestion(reference.records, reference.name, reference.typical) : null,
    fastestTargetQuestion(days),
  ]
}

async function ipQuestions(probeId: number, signal: AbortSignal) {
  const addresses = await fetchAddresses(probeId, signal)
  return [privateAddressQuestion(addresses.privateAddress), ipv6Question(addresses.hasIpv6)]
}

async function tracerouteQuestions(probeId: number, signal: AbortSignal) {
  const latest = (id: number) => readJson<{ avg?: number, rcvd?: number }[]>(`https://atlas.ripe.net/api/v2/measurements/${id}/latest/?probe_ids=${probeId}`, signal)
  const [roots, [route]] = await Promise.all([
    Promise.all(rootPings.map(async ([id, name]) => {
      const [round] = await latest(id).catch(() => [])
      return round?.rcvd && round.avg && round.avg > 0 ? { name, avg: round.avg } : null
    })),
    readJson<{ dst_addr?: string, result: { hop: number, result?: { from?: string }[] }[] }[]>(
      `https://atlas.ripe.net/api/v2/measurements/5001/latest/?probe_ids=${probeId}`, signal),
  ])
  const answered = route?.result.find(hop => hop.result?.some(packet => packet.from === route.dst_addr))
  return [
    nearestRootQuestion(roots.filter((root): root is { name: (typeof rootPings)[number][1], avg: number } => root !== null)),
    answered ? hopCountQuestion(answered.hop) : null,
  ]
}

// Questions from the followed probe's data. null while loading. A failure or missing data just leaves them out.
export function useDataQuestions(lesson: string) {
  const { probeId } = useProbe()
  const [questions, setQuestions] = useState<Question[] | null>(null)

  useEffect(() => {
    if (!probeId) return
    const controller = new AbortController()
    setQuestions(null)
    const build = lesson === 'ping' ? pingQuestions(controller.signal)
      : lesson === 'ip' ? ipQuestions(probeId, controller.signal)
        : lesson === 'traceroute' ? tracerouteQuestions(probeId, controller.signal)
          : Promise.resolve([])
    build
      .then(found => setQuestions(found.filter((question): question is Question => question !== null)))
      .catch(() => { if (!controller.signal.aborted) setQuestions([]) })
    return () => controller.abort()
  }, [probeId, lesson])

  return { probeId, questions: probeId ? questions : [] }
}
