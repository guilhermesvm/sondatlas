import { useEffect, useState } from 'react'
import { fetchHolder } from '../connection-check/connection'
import { useProbe } from '../probe-status/ProbeProvider'
import { isPrivate } from './useAddresses'

// Built-in traceroute from every probe to the K-root over IPv4, every 30 minutes.
const kRootTraceroute = 5001

export type HopNetwork =
  | { kind: 'private' }
  | { kind: 'network', asn: number, holder: string | null }
  | { kind: 'exchange', name: string, member: string | null }
  | { kind: 'unknown' }
  | { kind: 'silent' }

export interface Hop {
  hop: number
  address: string | null
  rtts: (number | null)[]
  network: HopNetwork
}

export interface Route {
  timestamp: number
  destination: string
  protocol: string
  size: number | null
  reached: boolean
  hops: Hop[]
}

interface RawRound {
  timestamp: number
  dst_addr: string
  proto: string
  size?: number
  destination_ip_responded?: boolean
  result: { hop: number, result?: { from?: string, rtt?: number, x?: string }[] }[]
}

async function readJson<T>(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as T
}

function stat(call: string, resource: string) {
  return `https://stat.ripe.net/data/${call}/data.json?${new URLSearchParams({ resource, sourceapp: 'sondatlas' })}`
}

async function asnOf(address: string, signal: AbortSignal) {
  const { data } = await readJson<{ data: { asns: string[] } }>(stat('network-info', address), signal)
  return data.asns.length ? Number(data.asns[0]) : null
}

// Exchange points (IXPs) use addresses no network announces; PeeringDB says which exchange and which member they belong to.
async function exchanges(addresses: string[], signal: AbortSignal) {
  if (!addresses.length) return new Map<string, { name: string, asn: number }>()
  const params = new URLSearchParams({ ipaddr4__in: addresses.join(','), fields: 'ipaddr4,name,asn' })
  const { data } = await readJson<{ data: { ipaddr4: string, name: string, asn: number }[] }>(`https://www.peeringdb.com/api/netixlan?${params}`, signal)
  return new Map(data.map(row => [row.ipaddr4, { name: row.name.split(':')[0].trim(), asn: row.asn }]))
}

export function median(values: (number | null)[]) {
  const sorted = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function fetchRoute(probeId: number, signal: AbortSignal): Promise<Route | null> {
  const [round] = await readJson<RawRound[]>(`https://atlas.ripe.net/api/v2/measurements/${kRootTraceroute}/latest/?probe_ids=${probeId}`, signal)
  if (!round) return null
  const hops = round.result.map(({ hop, result = [] }) => ({
    hop,
    address: result.find(packet => packet.from)?.from ?? null,
    rtts: result.map(packet => typeof packet.rtt === 'number' ? packet.rtt : null),
  }))
  const publicAddresses = [...new Set(hops.map(hop => hop.address).filter((address): address is string => Boolean(address) && !isPrivate(address!)))]
  const asns = new Map(await Promise.all(publicAddresses.map(async address => [address, await asnOf(address, signal).catch(() => null)] as const)))
  const exchange = await exchanges(publicAddresses.filter(address => asns.get(address) === null), signal).catch(() => new Map<string, { name: string, asn: number }>())
  const holderAsns = [...new Set([...asns.values(), ...[...exchange.values()].map(row => row.asn)].filter((asn): asn is number => asn !== null))]
  const holders = new Map(await Promise.all(holderAsns.map(async asn => [asn, await fetchHolder(asn, signal).catch(() => null)] as const)))

  const network = (address: string | null): HopNetwork => {
    if (!address) return { kind: 'silent' }
    if (isPrivate(address)) return { kind: 'private' }
    const asn = asns.get(address)
    if (asn) return { kind: 'network', asn, holder: holders.get(asn) ?? null }
    const point = exchange.get(address)
    return point ? { kind: 'exchange', name: point.name, member: holders.get(point.asn) ?? null } : { kind: 'unknown' }
  }
  return {
    timestamp: round.timestamp,
    destination: round.dst_addr,
    protocol: round.proto,
    size: round.size ?? null,
    reached: round.destination_ip_responded ?? hops.some(hop => hop.address === round.dst_addr),
    hops: hops.map(hop => ({ ...hop, network: network(hop.address) })),
  }
}

export function useTraceroute() {
  const { probeId } = useProbe()
  const [route, setRoute] = useState<Route | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!probeId) return
    const controller = new AbortController()
    setRoute(null)
    setLoaded(false)
    setError('')
    fetchRoute(probeId, controller.signal)
      .then(result => { setRoute(result); setLoaded(true) })
      .catch(() => { if (!controller.signal.aborted) setError('O RIPE Atlas não respondeu agora. Tente de novo em instantes.') })
    return () => controller.abort()
  }, [probeId])

  return { probeId, route, loaded, error }
}
