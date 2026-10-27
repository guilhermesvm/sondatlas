import { useEffect, useState } from 'react'
import { useProbe } from '../probe-status/ProbeProvider'

interface RawMeasurement {
  id: number
  type: string
  description: string | null
  target: string | null
  interval: number | null
  tags?: string[] | null
}

export interface Anchor {
  name: string
  city: string | null
  country: string | null
  types: string[]
}

export interface OwnMeasurements {
  builtIn: RawMeasurement[]
  hasIpv6: boolean
  wellKnown: string[]
  wellKnownCount: number
  anchoring: number
  anchors: Anchor[]
  tagging: number
  others: RawMeasurement[]
}

async function readJson<T>(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as T
}

async function readAll(url: string, signal: AbortSignal) {
  const rows: RawMeasurement[] = []
  for (let next: string | null = url; next;) {
    const page: { next: string | null, results: RawMeasurement[] } = await readJson(next, signal)
    rows.push(...page.results)
    next = page.next
  }
  return rows
}

const atlas = 'https://atlas.ripe.net/api/v2'
const fields = 'id,type,description,target,interval,tags'

// Built-in measurements have the low IDs of the RIPE Atlas catalogue (docs: "Built-in measurements").
const builtInIds = 100000

// Some anchoring measurements target the anchor's "-client" host name; the anchor itself is listed without it.
const anchorName = (target: string) => target.replace('-client.', '.')

async function anchorPlace(name: string, signal: AbortSignal) {
  const { results } = await readJson<{ results: { fqdn: string, city: string | null, country: string | null }[] }>(
    `${atlas}/anchors/?${new URLSearchParams({ search: name.split('.')[0], fields: 'fqdn,city,country' })}`, signal)
  return results.find(anchor => anchor.fqdn === name) ?? null
}

async function fetchOwn(probeId: number, signal: AbortSignal): Promise<OwnMeasurements> {
  const probe = await readJson<{ tags?: { slug: string }[] }>(`${atlas}/probes/${probeId}/?fields=tags`, signal)
  const hasIpv6 = (probe.tags ?? []).some(tag => tag.slug === 'system-ipv6-works')
  const families = hasIpv6 ? [4, 6] : [4]
  const [current, ...builtIns] = await Promise.all([
    readAll(`${atlas}/measurements/?${new URLSearchParams({ current_probes: String(probeId), status: '2', page_size: '500', fields })}`, signal),
    ...families.map(af => readAll(`${atlas}/measurements/?${new URLSearchParams({ id__lt: String(builtInIds), status: '2', af: String(af), page_size: '500', fields })}`, signal)),
  ])
  const isAnchoring = (row: RawMeasurement) => /anchoring/i.test(row.description ?? '')
  const isWellKnown = (row: RawMeasurement) => (row.tags ?? []).includes('system-well-known-target')
  const isTagging = (row: RawMeasurement) => (row.tags ?? []).includes('system-probe-tagging')

  const byAnchor = new Map<string, Set<string>>()
  for (const row of current.filter(isAnchoring)) {
    const target = /for anchor (\S+)/.exec(row.description ?? '')?.[1]
    const name = target && anchorName(target)
    if (name) byAnchor.set(name, (byAnchor.get(name) ?? new Set()).add(row.type))
  }
  const places = await Promise.all([...byAnchor.keys()].map(name => anchorPlace(name, signal).catch(() => null)))
  return {
    builtIn: builtIns.flat(),
    hasIpv6,
    wellKnown: [...new Set(current.filter(isWellKnown).map(row => row.target).filter((target): target is string => Boolean(target)))].sort(),
    wellKnownCount: current.filter(isWellKnown).length,
    anchoring: current.filter(isAnchoring).length,
    anchors: [...byAnchor].map(([name, types], index) => ({ name, city: places[index]?.city ?? null, country: places[index]?.country ?? null, types: [...types] })),
    tagging: current.filter(isTagging).length,
    others: current.filter(row => !isAnchoring(row) && !isWellKnown(row)),
  }
}

export function useOwnMeasurements() {
  const { probeId } = useProbe()
  const [data, setData] = useState<OwnMeasurements | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!probeId) return
    const controller = new AbortController()
    setData(null)
    setError('')
    fetchOwn(probeId, controller.signal)
      .then(setData)
      .catch(() => {
        if (controller.signal.aborted) return
        setError(navigator.onLine === false
          ? 'O seu computador está sem Internet agora. Confira a conexão e tente de novo.'
          : 'O RIPE Atlas não respondeu agora. Tente de novo em instantes.')
      })
    return () => controller.abort()
  }, [probeId, attempt])

  return { probeId, data, error, retry: () => setAttempt(value => value + 1) }
}
