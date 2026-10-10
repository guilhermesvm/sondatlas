export interface Target {
  measurement_id: number
  target_name: string
  measurement_category: string
}

export interface Catalog {
  probe_id: number
  targets: Target[]
}

export interface PingRecord {
  timestamp: string
  probe_id: number
  measurement_id: number
  measurement_type: string
  target_name: string | null
  measurement_category: string | null
  address_family: number | null
  protocol: string | null
  destination_address: string | null
  destination_name: string | null
  packets_sent: number | null
  packets_received: number | null
  duplicate_packets: number | null
  packet_loss_percent: number | null
  rtt_min_ms: number | null
  rtt_avg_ms: number | null
  rtt_max_ms: number | null
}

export interface PingHistory {
  probe_id: number
  measurement_id: number
  start: string
  stop: string
  count: number
  results: PingRecord[]
}

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('Não foi possível acessar a API. Verifique se o backend está em execução e tente novamente.')
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      404: 'Este alvo ou probe não está disponível no catálogo.',
      422: 'O período é inválido. Confira as datas e o limite de 60 dias.',
      503: 'O histórico está temporariamente indisponível. Verifique o backend e tente novamente.',
    }
    throw new Error(messages[response.status] ?? 'Não foi possível concluir a consulta. Tente novamente.')
  }
  try {
    return await response.json() as T
  } catch {
    throw new Error('A API retornou uma resposta inválida. Tente novamente.')
  }
}

export function fetchTargets(signal: AbortSignal): Promise<Catalog> {
  return readJson('/api/targets', signal)
}

export function fetchHistory(
  probeId: number, measurementId: number, start: string, stop: string, signal: AbortSignal,
): Promise<PingHistory> {
  const params = new URLSearchParams({
    probe_id: String(probeId), measurement_id: String(measurementId), start, stop,
  })
  return readJson(`/api/ping?${params}`, signal)
}
