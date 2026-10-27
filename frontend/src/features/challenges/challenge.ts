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
  result: { rtt?: number }[]
}

// One-off results cost twice the periodic ones (credits docs): 6 for a default ping of 3 packets.
export const pingCost = 6

export const suggestions = ['google.com', 'wikipedia.org', 'nic.br', 'ripe.net', 'cloudflare.com']

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

export async function createPing(probeId: number, target: string) {
  let response: Response
  try {
    response = await fetch('/api/challenges/ping', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ probe_id: probeId, target: target.trim().toLowerCase() }),
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

// The measurement is public, so its results come straight from RIPE Atlas. An empty list means it is still running.
export async function fetchPingResult(measurementId: number, signal: AbortSignal) {
  const response = await fetch(`https://atlas.ripe.net/api/v2/measurements/${measurementId}/results/`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const [round] = await response.json() as PingResult[]
  if (!round) return null
  const { timestamp, dst_name, dst_addr, size, ttl, sent, rcvd, min, avg, max, result } = round
  return { timestamp, dst_name, dst_addr, size, ttl, sent, rcvd, min, avg, max, result }
}
