import { expect, it } from 'vitest'
import type { AccountProbe } from '../atlas-account/account'
import { computeBadges } from './achievements'

const day = 86400
const probe = (id: number, days: number, first: number, isPublic: boolean): AccountProbe => ({
  id, description: null, is_public: isPublic, status: { id: 1, name: 'Connected', since: null },
  first_connected: first, total_uptime: days * day, asn_v4: 64500,
})

it('counts each badge per probe instead of adding the probes together', () => {
  const badges = Object.fromEntries(computeBadges([probe(1, 10, 1787709821, false), probe(2, 5, 1787000000, true)], [2], { current_balance: 1206887, estimated_daily_income: 21600 }).map(badge => [badge.id, badge]))
  expect(badges['first-contact']).toMatchObject({ earned: true, status: 'Probe 2, em 17/08/2026' })
  expect(badges['open-data']).toMatchObject({ earned: true, status: 'Probe 2' })
  expect(badges.pioneer).toMatchObject({ earned: true, status: 'Probe 2' })
  expect(badges.collector).toMatchObject({ earned: true, status: '2 probes na conta' })
  expect(badges['uptime-7d']).toMatchObject({ earned: true, status: 'Probe 1' })
  expect(badges['uptime-30d']).toMatchObject({ earned: false, status: 'Faltam cerca de 20 dias', progress: 1 / 3 })
  expect(badges['credits-100k']).toMatchObject({ earned: true, status: 'Saldo de 1.206.887' })
  expect(badges['credits-1m']).toMatchObject({ earned: true, status: 'Saldo de 1.206.887' })
})

it('reads the credit badges from the account balance', () => {
  const credits = (value: Parameters<typeof computeBadges>[2]) => computeBadges([], 'checking', value).find(badge => badge.id === 'credits-1m')
  expect(credits({ current_balance: 900000, estimated_daily_income: 20000 })).toMatchObject({ earned: false, status: 'Faltam cerca de 5 dias', progress: 0.9 })
  expect(credits({ current_balance: 900000, estimated_daily_income: null })).toMatchObject({ status: 'Faltam 100.000 créditos' })
  expect(credits(null)).toMatchObject({ earned: false, status: 'Falta a permissão de créditos na chave' })
  expect(credits(undefined)).toMatchObject({ earned: false, status: 'Ainda não' })
})
