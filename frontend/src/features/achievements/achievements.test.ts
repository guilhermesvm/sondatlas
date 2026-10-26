import { expect, it } from 'vitest'
import type { AccountProbe } from '../atlas-account/account'
import { computeBadges } from './achievements'

const day = 86400
const probe = (id: number, days: number, first: number, isPublic: boolean): AccountProbe => ({
  id, description: null, is_public: isPublic, status: { id: 1, name: 'Connected', since: null },
  first_connected: first, total_uptime: days * day, asn_v4: 64500,
})

it('counts each badge per probe instead of adding the probes together', () => {
  const badges = Object.fromEntries(computeBadges([probe(1, 10, 1787709821, false), probe(2, 5, 1787000000, true)], [2]).map(badge => [badge.id, badge]))
  expect(badges['first-contact']).toMatchObject({ earned: true, status: 'Probe 2, em 17/08/2026' })
  expect(badges['open-data']).toMatchObject({ earned: true, status: 'Probe 2' })
  expect(badges.pioneer).toMatchObject({ earned: true, status: 'Probe 2' })
  expect(badges.collector).toMatchObject({ earned: true, status: '2 probes na conta' })
  expect(badges['uptime-7d']).toMatchObject({ earned: true, status: 'Probe 1' })
  expect(badges['uptime-30d']).toMatchObject({ earned: false, status: 'Faltam cerca de 20 dias', progress: 1 / 3 })
  expect(badges['credits-100k']).toMatchObject({ earned: true, status: 'Probe 1' })
  expect(badges['credits-1m']).toMatchObject({ earned: false, status: 'Faltam cerca de 36 dias' })
})
