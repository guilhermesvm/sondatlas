import { localApiDown, oldApi, proxyDown } from '../../lib/api'

export interface PingResult {
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
  result: { rtt?: number, error?: string }[]
}

// A periodic ping costs 1 credit per packet and a one-off result costs twice as much (credits docs): 6 for the default 3 packets.
export const pingCost = (packets: number) => 2 * packets

export const packetChoices = [3, 5, 10]

// Owners checked on RIPEstat (2026-10-27): AS13335 Cloudflare, AS15169 Google, AS19281 Quad9, AS25152 K-root.
export const destinations = [
  { group: 'Nomes', items: [
    { value: 'google.com', note: 'Google' },
    { value: 'wikipedia.org', note: 'Wikipedia' },
    { value: 'nic.br', note: 'NIC.br, que cuida dos domínios .br' },
  ] },
  { group: 'Endereços IPv4', items: [
    { value: '1.1.1.1', note: 'DNS público da Cloudflare' },
    { value: '8.8.8.8', note: 'DNS público do Google' },
    { value: '9.9.9.9', note: 'DNS público do Quad9' },
    { value: '193.0.14.129', note: 'K-root, servidor raiz do RIPE NCC' },
  ] },
]

const hostname = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

function publicIpv4(target: string) {
  const parts = target.split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null
  const [a, b] = parts.map(Number)
  const reserved = a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  return !reserved
}

// The API checks again; this only avoids a round trip for an obvious mistake.
export function validTarget(typed: string) {
  const target = typed.trim().toLowerCase()
  return publicIpv4(target) ?? hostname.test(target)
}

export class ChallengeError extends Error {
  constructor(message: string, readonly missing: string[] = []) {
    super(message)
  }
}

export async function createPing(probeId: number, target: string, packets: number, description: string) {
  let response: Response
  try {
    response = await fetch('/api/challenges/ping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ probe_id: probeId, target: target.trim().toLowerCase(), packets, description: description.trim() || null }),
    })
  } catch {
    throw new ChallengeError(localApiDown)
  }
  if (response.ok) return (await response.json() as { measurement_id: number }).measurement_id
  const { detail } = await response.json().catch(() => ({})) as { detail?: string | { missing_permissions?: string[], ripe_error?: string } }
  if (typeof detail === 'object' && detail.missing_permissions) throw new ChallengeError('A chave não tem a permissão para criar medições.', detail.missing_permissions)
  if (typeof detail === 'object' && detail.ripe_error) throw new ChallengeError(`O RIPE Atlas recusou o ping: ${detail.ripe_error}`)
  const messages: Record<number, string> = {
    404: oldApi,
    405: oldApi,
    409: 'Vincule a sua conta do RIPE Atlas em Configurações para criar medições.',
    422: 'Confira o destino e a probe e tente de novo.',
    [proxyDown]: localApiDown,
    503: 'O RIPE Atlas não respondeu agora. Nada foi criado. Tente de novo em instantes.',
  }
  throw new ChallengeError(messages[response.status] ?? 'Não foi possível criar o ping. Tente de novo.')
}

export function measurementFromHash(hash: string) {
  const match = /^#\/desafios\/(\d+)$/.exec(hash)
  return match ? Number(match[1]) : null
}

export interface Measurement {
  target: string
  type: string
  probeId: number | null
  resolvedOnProbe: boolean
}

// Public details of any measurement, so a result opened from its own address does not need the account. Null when it does not exist.
export async function fetchMeasurement(measurementId: number, signal: AbortSignal): Promise<Measurement | null> {
  const response = await fetch(`https://atlas.ripe.net/api/v2/measurements/${measurementId}/?fields=target,type,probes,resolve_on_probe&optional_fields=probes`, { signal })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const { target, type, probes, resolve_on_probe } = await response.json() as { target: string, type: string, probes?: { id: number }[], resolve_on_probe?: boolean }
  return { target, type, probeId: probes?.[0]?.id ?? null, resolvedOnProbe: Boolean(resolve_on_probe) }
}

export interface Challenge {
  id: number
  type: string
  target: string
  created: number
  probe_id: number | null
}

export async function fetchChallenges(signal: AbortSignal) {
  let response: Response
  try {
    response = await fetch('/api/challenges', { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new ChallengeError(localApiDown)
  }
  if (response.ok) return await response.json() as { count: number, challenges: Challenge[] }
  const { detail } = await response.json().catch(() => ({})) as { detail?: { missing_permissions?: string[] } }
  if (typeof detail === 'object' && detail.missing_permissions) throw new ChallengeError('A chave não tem a permissão para listar as suas medições.', detail.missing_permissions)
  const messages: Record<number, string> = {
    404: oldApi,
    405: oldApi,
    [proxyDown]: localApiDown,
    503: 'O RIPE Atlas não respondeu agora. Tente de novo em instantes.',
  }
  throw new ChallengeError(messages[response.status] ?? 'Não foi possível consultar os seus desafios. Tente de novo.')
}

// With the name resolved on the probe, a DNS failure there sends no packet: sent is 0 and the reason comes in result.
export const dnsFailure = (round: PingResult) => round.sent === 0 ? round.result.find(packet => packet.error)?.error ?? null : null

// The measurement is public, so its results come straight from RIPE Atlas. An empty list means it is still running.
export async function fetchPingResult(measurementId: number, signal: AbortSignal) {
  const response = await fetch(`https://atlas.ripe.net/api/v2/measurements/${measurementId}/results/`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const [round] = await response.json() as PingResult[]
  if (!round) return null
  const { timestamp, dst_name, dst_addr, size, ttl, sent, rcvd, min, avg, max, result } = round
  return { timestamp, dst_name, dst_addr, size, ttl, sent, rcvd, min, avg, max, result }
}

// Built-in ping from every probe to the K-root, every 4 minutes: the comparison for the probe's own ping.
export async function fetchKRootAverage(probeId: number, signal: AbortSignal) {
  const response = await fetch(`https://atlas.ripe.net/api/v2/measurements/1001/latest/?probe_ids=${probeId}`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const [round] = await response.json() as { avg?: number, rcvd?: number }[]
  return round?.rcvd && round.avg && round.avg > 0 ? round.avg : null
}
