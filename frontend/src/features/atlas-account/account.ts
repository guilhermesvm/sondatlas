import { localApiDown, oldApi, proxyDown } from '../../lib/api'
import type { ProbeStatus } from '../probe-status/status'

export type AccountProbe = ProbeStatus & { description: string | null, asn_v4?: number | null }

export interface Account {
  connected: boolean
  probes?: AccountProbe[]
}

export class KeyRefusedError extends Error {}

const ripeDown = 'O RIPE Atlas não respondeu agora. Tente de novo em instantes.'

async function request(init?: RequestInit, signal?: AbortSignal) {
  try {
    return await fetch('/api/account', { ...init, signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(localApiDown)
  }
}

function fail(response: Response, fallback: string): never {
  const messages: Record<number, string> = { 404: oldApi, 405: oldApi, [proxyDown]: localApiDown, 503: ripeDown }
  throw new Error(messages[response.status] ?? fallback)
}

export async function fetchAccount(signal: AbortSignal): Promise<Account> {
  const response = await request(undefined, signal)
  if (response.status === 403) throw new KeyRefusedError('O RIPE Atlas recusou a chave salva.')
  if (!response.ok) fail(response, 'Não foi possível consultar a sua conta. Tente de novo.')
  return await response.json() as Account
}

export async function saveAccountKey(key: string): Promise<Account> {
  const response = await request({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })
  if (response.status === 422) throw new KeyRefusedError('O RIPE Atlas recusou esta chave. Confira se ela está ativa e tem a permissão Show information about your probes.')
  if (!response.ok) fail(response, 'Não foi possível vincular a conta. Tente de novo.')
  return await response.json() as Account
}

export async function disconnectAccount(): Promise<void> {
  const response = await request({ method: 'DELETE' })
  if (!response.ok) fail(response, 'Não foi possível desvincular. Tente de novo.')
}
