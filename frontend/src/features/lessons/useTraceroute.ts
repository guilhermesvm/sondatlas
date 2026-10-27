import { useEffect, useState } from 'react'
import { fetchHolder } from '../connection-check/connection'
import { useProbe } from '../probe-status/ProbeProvider'
import { isPrivate } from './useAddresses'

// Built-in traceroutes that every probe runs over IPv4, every 30 minutes, to the 13 DNS root servers (operators from root-servers.org).
export const roots = [
  { measurement: 5009, name: 'A-root', operator: 'Verisign' },
  { measurement: 5010, name: 'B-root', operator: 'Information Sciences Institute' },
  { measurement: 5011, name: 'C-root', operator: 'Cogent Communications' },
  { measurement: 5012, name: 'D-root', operator: 'University of Maryland' },
  { measurement: 5013, name: 'E-root', operator: 'NASA' },
  { measurement: 5004, name: 'F-root', operator: 'Internet Systems Consortium' },
  { measurement: 5014, name: 'G-root', operator: 'Defense Information Systems Agency' },
  { measurement: 5015, name: 'H-root', operator: 'U.S. Army Research Lab' },
  { measurement: 5005, name: 'I-root', operator: 'Netnod' },
  { measurement: 5016, name: 'J-root', operator: 'Verisign' },
  { measurement: 5001, name: 'K-root', operator: 'RIPE NCC' },
  { measurement: 5008, name: 'L-root', operator: 'ICANN' },
  { measurement: 5006, name: 'M-root', operator: 'WIDE Project' },
]

export type Root = typeof roots[number]

export type HopNetwork =
  | { kind: 'private' }
  | { kind: 'network', asn: number, holder: string | null }
  | { kind: 'exchange', name: string, city: string | null, country: string | null, member: string | null, memberAsn: number }
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

interface Exchange {
  name: string
  city: string | null
  country: string | null
  asn: number
}

// Exchange points (IXPs) use addresses no network announces. PeeringDB says which exchange and member each one belongs to, and where the exchange is.
async function exchanges(addresses: string[], signal: AbortSignal) {
  if (!addresses.length) return new Map<string, Exchange>()
  const members = new URLSearchParams({ ipaddr4__in: addresses.join(','), fields: 'ipaddr4,name,asn,ix_id' })
  const { data } = await readJson<{ data: { ipaddr4: string, name: string, asn: number, ix_id: number }[] }>(`https://www.peeringdb.com/api/netixlan?${members}`, signal)
  const ids = [...new Set(data.map(row => row.ix_id))]
  const places = ids.length
    ? (await readJson<{ data: { id: number, name: string, city: string, country: string }[] }>(
      `https://www.peeringdb.com/api/ix?${new URLSearchParams({ id__in: ids.join(','), fields: 'id,name,city,country' })}`, signal).catch(() => ({ data: [] }))).data
    : []
  const byId = new Map(places.map(place => [place.id, place]))
  return new Map(data.map(row => {
    const place = byId.get(row.ix_id)
    return [row.ipaddr4, {
      name: place?.name ?? row.name.split(':')[0].trim(),
      city: place?.city ? place.city.split('/')[0].trim() : null,
      country: place?.country ?? null,
      asn: row.asn,
    }]
  }))
}

export function median(values: (number | null)[]) {
  const sorted = values.filter((value): value is number => value !== null).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function fetchRoute(probeId: number, measurement: number, signal: AbortSignal): Promise<Route | null> {
  const [round] = await readJson<RawRound[]>(`https://atlas.ripe.net/api/v2/measurements/${measurement}/latest/?probe_ids=${probeId}`, signal)
  if (!round) return null
  const hops = round.result.map(({ hop, result = [] }) => ({
    hop,
    address: result.find(packet => packet.from)?.from ?? null,
    rtts: result.map(packet => typeof packet.rtt === 'number' ? packet.rtt : null),
  }))
  const publicAddresses = [...new Set(hops.map(hop => hop.address).filter((address): address is string => Boolean(address) && !isPrivate(address!)))]
  const asns = new Map(await Promise.all(publicAddresses.map(async address => [address, await asnOf(address, signal).catch(() => null)] as const)))
  const exchange = await exchanges(publicAddresses.filter(address => asns.get(address) === null), signal).catch(() => new Map<string, Exchange>())
  const holderAsns = [...new Set([...asns.values(), ...[...exchange.values()].map(row => row.asn)].filter((asn): asn is number => asn !== null))]
  const holders = new Map(await Promise.all(holderAsns.map(async asn => [asn, await fetchHolder(asn, signal).catch(() => null)] as const)))

  const network = (address: string | null): HopNetwork => {
    if (!address) return { kind: 'silent' }
    if (isPrivate(address)) return { kind: 'private' }
    const asn = asns.get(address)
    if (asn) return { kind: 'network', asn, holder: holders.get(asn) ?? null }
    const point = exchange.get(address)
    return point
      ? { kind: 'exchange', name: point.name, city: point.city, country: point.country, member: holders.get(point.asn) ?? null, memberAsn: point.asn }
      : { kind: 'unknown' }
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

export function useTraceroute(measurement: number) {
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
    fetchRoute(probeId, measurement, controller.signal)
      .then(result => { setRoute(result); setLoaded(true) })
      .catch(() => { if (!controller.signal.aborted) setError('O RIPE Atlas não respondeu agora. Tente de novo em instantes.') })
    return () => controller.abort()
  }, [probeId, measurement])

  return { probeId, route, loaded, error }
}
