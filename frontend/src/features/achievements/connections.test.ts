import { expect, it } from 'vitest'
import { summarizeConnections, type ConnectionEvent } from './connections'

const day = 86400

it('sorts the events, ignores repeated ones and finds outages, the record and when each goal was reached', () => {
  const events: ConnectionEvent[] = [
    { timestamp: 5300, event: 'connect' },
    { timestamp: 1000, event: 'connect' },
    { timestamp: 5000, event: 'disconnect' },
    { timestamp: 3000, event: 'connect' },
    { timestamp: 5300 + day, event: 'disconnect' },
    { timestamp: 6200 + day, event: 'connect' },
    { timestamp: 8200 + day, event: 'disconnect' },
    { timestamp: 8300 + day, event: 'disconnect' },
    { timestamp: 9000 + day, event: 'connect' },
  ]
  const summary = summarizeConnections(events, 9500 + day, [day, 7 * day])
  expect(summary.comeback).toBe(6200 + day)
  expect(summary.record).toBe(day)
  expect(summary.marathonAt).toBeNull()
  expect(summary.marks).toEqual({ [day]: 5300 + day - 4000 })
})
