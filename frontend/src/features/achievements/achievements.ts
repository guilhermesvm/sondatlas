import type { AccountProbe, Credits } from '../atlas-account/account'
import { marathon, type Histories } from './connections'

const hour = 3600
const day = 24 * hour
export const uptimeGoals = [day, 7 * day, 30 * day, 90 * day]

export type Group = 'first' | 'uptime' | 'history' | 'credits'
export type Pioneers = 'checking' | 'failed' | number[]

export interface Badge {
  id: string
  group: Group
  title: string
  rule: string
  mark: string
  earned: boolean
  // When earned: the probe and the moment, if known, and status adds a detail; otherwise status says what is missing.
  by?: number
  on?: number
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

function date(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString('pt-BR')
}

export function statusText(badge: Badge) {
  if (!badge.earned) return badge.status
  const when = badge.on ? ` em ${date(badge.on)}` : ''
  const who = badge.by ? ` pela probe ${badge.by}` : ''
  return `Conquistada${when}${who}${badge.status ? `. ${badge.status}` : ''}`
}

function duration(value: number) {
  if (value < 2 * day) return `${Math.round(value / hour)} horas`
  return `${(value / day).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`
}

function timeGoal(title: string, mark: string, goal: number, best: AccountProbe | null, histories: Histories): Badge {
  const base = { id: `uptime-${goal / day}d`, group: 'uptime' as const, title, rule: `Uma probe sua somou ${mark} conectada.`, mark }
  const uptime = best?.total_uptime ?? 0
  if (best && uptime >= goal) {
    const reached = typeof histories === 'object' ? histories[best.id]?.marks[goal] : undefined
    return { ...base, earned: true, by: best.id, on: reached, status: '' }
  }
  return { ...base, earned: false, status: best ? left(goal - uptime) : 'Ainda não', progress: best ? uptime / goal : undefined }
}

function pending(probes: AccountProbe[], histories: Histories) {
  if (!probes.length) return 'Ainda não'
  return histories === 'checking' ? 'Conferindo no RIPE Atlas…' : 'Não foi possível conferir agora'
}

function historyBadges(probes: AccountProbe[], histories: Histories): Badge[] {
  const resilient = { id: 'resilient', group: 'history' as const, title: 'Resiliente', mark: 'reconnect', rule: 'Uma probe sua voltou sozinha depois de uma queda de 10 minutos ou mais.' }
  const marathonBadge = { id: 'marathon', group: 'history' as const, title: 'Maratona', mark: 'calendar', rule: 'Uma probe sua ficou 7 dias seguidos sem cair.' }
  if (typeof histories !== 'object' || !probes.length) {
    return [{ ...resilient, earned: false, status: pending(probes, histories) }, { ...marathonBadge, earned: false, status: pending(probes, histories) }]
  }
  const summaries = probes.map(probe => ({ probe, summary: histories[probe.id] })).filter(item => item.summary)
  const back = summaries.filter(item => item.summary.comeback !== null).sort((a, b) => a.summary.comeback! - b.summary.comeback!)[0]
  const best = summaries.reduce<typeof summaries[number] | null>((top, item) => item.summary.record > (top?.summary.record ?? -1) ? item : top, null)
  const record = best?.summary.record ?? 0
  return [
    back
      ? { ...resilient, earned: true, by: back.probe.id, on: back.summary.comeback!, status: '' }
      : { ...resilient, earned: false, status: 'Ainda não houve queda de 10 minutos ou mais' },
    record >= marathon && best
      ? { ...marathonBadge, earned: true, by: best.probe.id, on: best.summary.marathonAt ?? undefined, status: `Recorde de ${duration(record)}` }
      : { ...marathonBadge, earned: false, status: `Recorde: ${duration(record)}`, progress: record / marathon },
  ]
}

// credits is undefined without a linked account and null when the key lacks the credits permission.
function creditGoal(id: string, title: string, mark: string, goal: number, credits: Credits | null | undefined): Badge {
  const rule = `Ter ${title} na sua conta.`
  const base = { id, group: 'credits' as const, title, rule, mark }
  if (!credits) return { ...base, earned: false, status: credits === null ? 'Falta a permissão de créditos na chave' : 'Ainda não' }
  const balance = credits.current_balance
  if (balance >= goal) return { ...base, earned: true, status: `Saldo de ${balance.toLocaleString('pt-BR')}` }
  const daily = credits.estimated_daily_income
  return {
    ...base, earned: false, progress: balance / goal,
    status: daily ? left((goal - balance) / daily * day) : `Faltam ${(goal - balance).toLocaleString('pt-BR')} créditos`,
  }
}

export function computeBadges(probes: AccountProbe[], pioneers: Pioneers, credits?: Credits | null, histories: Histories = 'checking'): Badge[] {
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
      earned: Boolean(first), by: first?.probe.id, on: first?.first,
      status: first ? '' : 'Ainda não',
    },
    {
      id: 'open-data', group: 'first', title: 'Dados abertos', mark: 'globe',
      rule: 'Uma probe sua é pública, e qualquer pessoa pode usar os dados dela.',
      earned: Boolean(open), by: open?.id, status: open ? '' : 'Ainda não',
    },
    {
      id: 'pioneer', group: 'first', title: 'Pioneiro', mark: 'flag',
      rule: 'Uma probe sua é a mais antiga do seu provedor no RIPE Atlas.',
      // The probe became the oldest of its provider at its own first connection.
      earned: Boolean(pioneer), by: pioneer?.id, on: pioneer ? seconds(pioneer.first_connected) ?? undefined : undefined,
      status: pioneer ? '' : pioneers === 'checking' && probes.length ? 'Conferindo no RIPE Atlas…'
        : pioneers === 'failed' ? 'Não foi possível conferir agora' : 'Ainda não',
    },
    {
      id: 'collector', group: 'first', title: 'Colecionador', mark: 'probes',
      rule: 'Ter duas probes ou mais na sua conta.',
      earned: probes.length >= 2,
      status: probes.length >= 2 ? `${probes.length} probes na conta` : probes.length === 1 ? '1 de 2 probes' : 'Ainda não',
      progress: probes.length === 1 ? 0.5 : undefined,
    },
    timeGoal('24 horas no ar', '24 horas', day, best, histories),
    timeGoal('7 dias no ar', '7 dias', 7 * day, best, histories),
    timeGoal('30 dias no ar', '30 dias', 30 * day, best, histories),
    timeGoal('90 dias no ar', '90 dias', 90 * day, best, histories),
    ...historyBadges(probes, histories),
    creditGoal('credits-100k', '100 mil créditos', '100 mil', 100000, credits),
    creditGoal('credits-1m', '1 milhão de créditos', '1 milhão', 1000000, credits),
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
