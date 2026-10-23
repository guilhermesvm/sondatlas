import { describe, expect, it, vi } from 'vitest'
import { formatLocal, localInput, localPeriod, quickPeriod } from './time'

describe('local display and UTC transport', () => {
  it('accepts optional seconds without losing supplied fractional precision', () => {
    expect(localPeriod('09/10/2026 18:00', '09/10/2026 18:01:02.125')).toEqual({
      start: '2026-10-09T21:00:00.000Z', stop: '2026-10-09T21:01:02.125Z',
    })
  })
  it('converts local Sao Paulo inputs to UTC and preserves seconds', () => {
    expect(localPeriod('25/08/2026 23:03:41', '10/10/2026 16:13:27')).toEqual({
      start: '2026-08-26T02:03:41.000Z', stop: '2026-10-10T19:13:27.000Z',
    })
    expect(localPeriod('25/08/2026 23:03:41.000', '10/10/2026 16:13:27.000')).toEqual({
      start: '2026-08-26T02:03:41.000Z', stop: '2026-10-10T19:13:27.000Z',
    })
  })
  it.each([
    ['', '27/08/2026 00:00'], ['bad', '27/08/2026 00:00'],
    ['27/08/2026 00:00', '27/08/2026 00:00'],
    ['28/08/2026 00:00', '27/08/2026 00:00'],
    ['26/08/2026 00:00', '26/08/2027 00:00'],
  ])('rejects an invalid period before fetching data', (start, stop) => {
    expect(() => localPeriod(start, stop)).toThrow()
  })
  it('accepts the inclusive sixty-day limit', () => {
    expect(() => localPeriod('26/08/2026 00:00', '25/10/2026 00:00')).not.toThrow()
  })
  it('formats actual UTC timestamps in the local zone, with date, seconds and offset', () => {
    expect(localInput(new Date('2026-08-26T02:03:41Z'))).toBe('25/08/2026 23:03:41')
    expect(formatLocal('2026-08-26T02:03:41Z', true)).toContain('25/08/2026')
    expect(formatLocal('2026-08-26T02:03:41Z', true)).toContain('23:03:41')
    expect(formatLocal('2026-08-26T02:03:41Z', true)).toContain('GMT-3')
  })
  it('uses exact elapsed hours for quick periods even across daylight-saving transitions', () => {
    const now = new Date('2026-03-09T04:00:00Z')
    expect(quickPeriod(1, now)).toEqual({ start: '2026-03-08T04:00:00.000Z', stop: '2026-03-09T04:00:00.000Z' })
    expect(Date.parse(quickPeriod(7, now).stop) - Date.parse(quickPeriod(7, now).start)).toBe(7 * 86400000)
  })
  it('respects date-specific offsets and rejects nonexistent local DST times', () => {
    vi.stubEnv('TZ', 'America/New_York')
    try {
      expect(localPeriod('08/03/2026 01:30', '08/03/2026 03:30')).toEqual({ start: '2026-03-08T06:30:00.000Z', stop: '2026-03-08T07:30:00.000Z' })
      expect(() => localPeriod('08/03/2026 02:30', '08/03/2026 04:30')).toThrow('não existe')
    } finally { vi.unstubAllEnvs() }
  })
  it('rejects invalid calendar days instead of normalizing them silently', () => {
    expect(() => localPeriod('30/02/2026 10:00', '02/03/2026 10:00')).toThrow()
  })
})
