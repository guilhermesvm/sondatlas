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

const localApiDown = 'A aplicação no seu computador não respondeu. Confira se ela está rodando e tente de novo.'
const oldApi = 'A aplicação em execução ainda não tem essa função. Atualize com docker compose up -d --build.'
// The dev server and the web container answer 502 when they cannot reach the API.
const proxyDown = 502

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(localApiDown)
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      404: 'Este alvo ou probe não está disponível no catálogo.',
      422: 'O período é inválido. Confira as datas e o limite de 60 dias.',
      [proxyDown]: localApiDown,
      503: 'O histórico está temporariamente indisponível. Tente de novo em instantes.',
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

export interface CountryCount {
  country_code: string
  probes: number
  share_percent: number | null
}

export interface ProbeDistribution {
  collection_id: string
  started_at_utc: string
  finished_at_utc: string
  source: string
  scope: string
  total_probes: number
  brazil: CountryCount
  top_countries: CountryCount[]
  duplicate_records: number
  api_count_min: number | null
  api_count_max: number | null
  count_mismatch: boolean
}

export async function fetchDistribution(signal: AbortSignal, refresh = false): Promise<ProbeDistribution | null> {
  const timeout = AbortSignal.timeout(240000)
  const combined = AbortSignal.any([signal, timeout])
  let response: Response
  try {
    response = await fetch(`/api/probe-distribution${refresh ? '/refresh' : ''}`, {
      method: refresh ? 'POST' : 'GET', signal: combined,
    })
    if (!response.ok) {
      const messages: Record<number, string> = {
        404: oldApi,
        [proxyDown]: localApiDown,
        409: 'Já há uma coleta global em andamento ou seu bloqueio não pôde ser verificado. Aguarde e tente novamente.',
        503: refresh ? 'A atualização falhou. A coleta anterior foi preservada. Tente novamente.' : 'Não foi possível ler a coleta salva. Tente novamente.',
        504: 'A atualização excedeu o limite de tempo. A coleta anterior foi preservada. Tente novamente.',
      }
      throw new Error(messages[response.status] ?? 'Não foi possível consultar a distribuição. Tente novamente.')
    }
    const payload = await response.json() as { distribution: ProbeDistribution | null }
    if (!('distribution' in payload) || (refresh && !payload.distribution)) throw new Error('A API retornou uma resposta inválida.')
    return payload.distribution
  } catch (error) {
    if (signal.aborted) throw error
    if (timeout.aborted) throw new Error('A aplicação demorou demais para responder. A coleta pode ainda estar em andamento. Leia a coleta salva antes de tentar atualizar de novo.')
    if (error instanceof TypeError) throw new Error(`${localApiDown} A coleta anterior continua salva.`)
    throw error
  }
}

export interface SavedProbe {
  probe_id: number
  is_public: boolean | null
}

export async function fetchSelectedProbe(signal: AbortSignal): Promise<number | null> {
  let response: Response
  try {
    response = await fetch('/api/probe', { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(localApiDown)
  }
  if (response.status === 404) throw new Error(oldApi)
  if (response.status === proxyDown) throw new Error(localApiDown)
  if (!response.ok) throw new Error('Não foi possível ler a probe salva. Tente de novo.')
  return (await response.json() as { probe_id: number | null }).probe_id
}

export class InvalidProbeError extends Error {}

export async function saveSelectedProbe(probeId: number): Promise<SavedProbe> {
  let response: Response
  try {
    response = await fetch('/api/probe', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ probe_id: probeId }),
    })
  } catch {
    throw new Error(localApiDown)
  }
  if (response.status === 404) throw new InvalidProbeError('Essa probe não existe no RIPE Atlas. Confira o ID e tente de novo.')
  if (response.status === 422) throw new InvalidProbeError('Digite um ID válido, só com números.')
  if (!response.ok) {
    const messages: Record<number, string> = {
      405: oldApi,
      [proxyDown]: localApiDown,
      503: 'O RIPE Atlas não respondeu agora. Tente de novo em instantes. A probe salva antes continua a mesma.',
    }
    throw new Error(messages[response.status] ?? 'Não foi possível salvar a probe. Tente de novo.')
  }
  return await response.json() as SavedProbe
}

export async function stopFollowingProbe(): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/probe', { method: 'DELETE' })
  } catch {
    throw new Error(localApiDown)
  }
  if (response.status === 405) throw new Error(oldApi)
  if (response.status === proxyDown) throw new Error(localApiDown)
  if (!response.ok) throw new Error('Não foi possível parar de acompanhar. Tente de novo.')
}
