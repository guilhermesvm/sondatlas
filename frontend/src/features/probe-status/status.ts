export interface ProbeStatus {
  id: number
  is_public: boolean
  status: { id: number, name: string, since: string | null }
}

export async function fetchProbeStatus(probeId: number, signal: AbortSignal): Promise<ProbeStatus> {
  const response = await fetch(`https://atlas.ripe.net/api/v2/probes/${probeId}/?fields=status,is_public`, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as ProbeStatus
}
