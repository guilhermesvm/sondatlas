import type { AccountProbe } from '../atlas-account/account'

const hour = 3600
const day = 24 * hour
// RIPE Atlas pays 15 credits per connected minute, so each credit takes 4 seconds.
const secondsPerCredit = 4

export type Group = 'first' | 'uptime' | 'credits'
export type Pioneers = 'checking' | 'failed' | number[]

export interface Badge {
  id: string
  group: Group
  title: string
  rule: string
  mark: string
  earned: boolean
  status: string
  progress?: number
}

function seconds(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null
  return typeof value === 'number' ? value : Date.parse(value) / 1000
}

function left(remaining: number) {
  if (remaining < hour) return 'Falta menos de 1 hora'
  if (remaining < 2 * day) return `Faltam cerca de ${Math.round(remaining / hour)} horas`
  return `Faltam cerca de ${Math.round(remaining / day)} dias`
}

function timeGoal(id: string, group: Group, title: string, rule: string, mark: string, goal: number, best: AccountProbe | null): Badge {
  const uptime = best?.total_uptime ?? 0
  if (best && uptime >= goal) return { id, group, title, rule, mark, earned: true, status: `Probe ${best.id}` }
  return { id, group, title, rule, mark, earned: false, status: best ? left(goal - uptime) : 'Ainda não', progress: best ? uptime / goal : undefined }
}

export function computeBadges(probes: AccountProbe[], pioneers: Pioneers): Badge[] {
  const connected = probes
    .map(probe => ({ probe, first: seconds(probe.first_connected) }))
    .filter((item): item is { probe: AccountProbe, first: number } => item.first !== null)
    .sort((a, b) => a.first - b.first)
  const first = connected[0]
  const open = probes.find(probe => probe.is_public)
  const best = probes.reduce<AccountProbe | null>((top, probe) => (probe.total_uptime ?? 0) > (top?.total_uptime ?? 0) ? probe : top, null)
  const pioneer = Array.isArray(pioneers) ? probes.find(probe => pioneers.includes(probe.id)) : undefined

  return [
    {
      id: 'first-contact', group: 'first', title: 'Primeiro contato', mark: 'signal',
      rule: 'Uma probe sua se conectou ao RIPE Atlas pela primeira vez.',
      earned: Boolean(first),
      status: first ? `Probe ${first.probe.id}, em ${new Date(first.first * 1000).toLocaleDateString('pt-BR')}` : 'Ainda não',
    },
    {
      id: 'open-data', group: 'first', title: 'Dados abertos', mark: 'globe',
      rule: 'Uma probe sua é pública, e qualquer pessoa pode usar os dados dela.',
      earned: Boolean(open), status: open ? `Probe ${open.id}` : 'Ainda não',
    },
    {
      id: 'pioneer', group: 'first', title: 'Pioneiro', mark: 'flag',
      rule: 'Uma probe sua é a mais antiga do seu provedor no RIPE Atlas.',
      earned: Boolean(pioneer),
      status: pioneer ? `Probe ${pioneer.id}` : pioneers === 'checking' && probes.length ? 'Conferindo no RIPE Atlas…'
        : pioneers === 'failed' ? 'Não foi possível conferir agora' : 'Ainda não',
    },
    {
      id: 'collector', group: 'first', title: 'Colecionador', mark: 'probes',
      rule: 'Ter duas probes ou mais na sua conta.',
      earned: probes.length >= 2,
      status: probes.length >= 2 ? `${probes.length} probes na conta` : probes.length === 1 ? '1 de 2 probes' : 'Ainda não',
      progress: probes.length === 1 ? 0.5 : undefined,
    },
    timeGoal('uptime-1d', 'uptime', '24 horas no ar', 'Uma probe sua somou 24 horas conectada.', '24 horas', day, best),
    timeGoal('uptime-7d', 'uptime', '7 dias no ar', 'Uma probe sua somou 7 dias conectada.', '7 dias', 7 * day, best),
    timeGoal('uptime-30d', 'uptime', '30 dias no ar', 'Uma probe sua somou 30 dias conectada.', '30 dias', 30 * day, best),
    timeGoal('uptime-90d', 'uptime', '90 dias no ar', 'Uma probe sua somou 90 dias conectada.', '90 dias', 90 * day, best),
    timeGoal('credits-100k', 'credits', '100 mil créditos', 'Uma probe sua rendeu cerca de 100 mil créditos.', '100 mil', 100000 * secondsPerCredit, best),
    timeGoal('credits-1m', 'credits', '1 milhão de créditos', 'Uma probe sua rendeu cerca de 1 milhão de créditos.', '1 milhão', 1000000 * secondsPerCredit, best),
  ]
}

const maxPages = 10

async function oldestInAsn(asn: number, signal: AbortSignal) {
  let url: string | null = `https://atlas.ripe.net/api/v2/probes/?asn_v4=${asn}&fields=first_connected&page_size=100`
  let oldest = Infinity
  for (let page = 0; url; page++) {
    if (page === maxPages) throw new Error('Too many probes to compare')
    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json() as { next: string | null, results: { first_connected: number | null }[] }
    for (const probe of body.results) {
      if (probe.first_connected !== null && probe.first_connected < oldest) oldest = probe.first_connected
    }
    url = body.next
  }
  return oldest
}

export async function findPioneers(probes: AccountProbe[], signal: AbortSignal) {
  const asns = [...new Set(probes.map(probe => probe.asn_v4).filter((asn): asn is number => typeof asn === 'number'))]
  const oldest = new Map(await Promise.all(asns.map(async asn => [asn, await oldestInAsn(asn, signal)] as const)))
  return probes.filter(probe => probe.asn_v4 && seconds(probe.first_connected) === oldest.get(probe.asn_v4)).map(probe => probe.id)
}
