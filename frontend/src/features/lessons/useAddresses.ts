import { useEffect, useState } from 'react'
import { fetchHolder } from '../connection-check/connection'
import { useProbe } from '../probe-status/ProbeProvider'

// Built-in ping from every probe to the K-root over IPv4: its src_addr is the probe's own address.
const kRootPing = 1001

export interface Addresses {
  privateAddress: string | null
  behindNat: boolean
  hasIpv6: boolean
  asn: number | null
  holder: string | null
}

// Only the RFC 1918 blocks are shown: any other source address could be the public one.
export function isPrivate(address: string) {
  const [a, b] = address.split('.').map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

async function readJson<T>(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as T
}

async function fetchAddresses(probeId: number, signal: AbortSignal): Promise<Addresses> {
  const probe = await readJson<{ tags?: { slug: string }[], asn_v4: number | null, address_v6: string | null }>(
    `https://atlas.ripe.net/api/v2/probes/${probeId}/?fields=tags,asn_v4,address_v6`, signal)
  const tags = (probe.tags ?? []).map(tag => tag.slug)
  const [source, holder] = await Promise.all([
    readJson<{ src_addr?: string }[]>(`https://atlas.ripe.net/api/v2/measurements/${kRootPing}/latest/?probe_ids=${probeId}`, signal)
      .then(([round]) => round?.src_addr ?? null, () => null),
    probe.asn_v4 ? fetchHolder(probe.asn_v4, signal).catch(() => null) : null,
  ])
  return {
    privateAddress: source && isPrivate(source) ? source : null,
    behindNat: tags.includes('system-ipv4-rfc1918'),
    hasIpv6: Boolean(probe.address_v6) || tags.includes('system-ipv6-works'),
    asn: probe.asn_v4,
    holder,
  }
}

export function useAddresses() {
  const { probeId } = useProbe()
  const [addresses, setAddresses] = useState<Addresses | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!probeId) return
    const controller = new AbortController()
    setAddresses(null)
    setError('')
    fetchAddresses(probeId, controller.signal)
      .then(setAddresses)
      .catch(() => { if (!controller.signal.aborted) setError('O RIPE Atlas não respondeu agora. Tente de novo em instantes.') })
    return () => controller.abort()
  }, [probeId])

  return { probeId, addresses, error }
}
