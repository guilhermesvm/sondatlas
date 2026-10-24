export interface ProbeStatus {
  id: number
  is_public: boolean
  status: { id: number, name: string, since: string | null }
}

export class ProbeNotFoundError extends Error {}

export async function fetchProbeStatus(probeId: number, signal: AbortSignal): Promise<ProbeStatus> {
  const response = await fetch(`https://atlas.ripe.net/api/v2/probes/${probeId}/?fields=status,is_public`, { signal })
  if (response.status === 404) throw new ProbeNotFoundError()
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as ProbeStatus
}

const looks: Record<number, { key: string, label: string }> = {
  0: { key: 'never', label: 'Nunca conectou' },
  1: { key: 'connected', label: 'Conectada' },
  2: { key: 'disconnected', label: 'Desconectada' },
  3: { key: 'abandoned', label: 'Abandonada' },
}

export function statusLook(probe: ProbeStatus) {
  return looks[probe.status.id] ?? { key: 'abandoned', label: probe.status.name }
}
