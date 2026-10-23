import { describe, expect, it } from 'vitest'
import { formatMetric, nearestRecordIndex, splitSeries, summarizePingResults } from './chart'
import { ping } from '../../test/fixtures'

describe('period summaries', () => {
  it('uses the median of available round averages, including zero, without mutating input', () => {
    const records = Object.freeze([20, null, 0, 10, 30].map(value => Object.freeze(ping({ rtt_avg_ms: value, rtt_max_ms: 999 }))))
    expect(summarizePingResults(records)).toMatchObject({ medianRtt: 15, rttCount: 4, maxRtt: 30 })
    expect(records.map(record => record.rtt_avg_ms)).toEqual([20, null, 0, 10, 30])
    expect(summarizePingResults([ping({ rtt_avg_ms: 30 }), ping(), ping({ rtt_avg_ms: 0 })]).medianRtt).toBe(20)
  })
  it('reports the earliest tied maximum of round averages, not packet maxima', () => {
    expect(summarizePingResults([
      ping({ rtt_avg_ms: 50, timestamp: '2026-08-26T03:00:00Z' }),
      ping({ rtt_avg_ms: 10, rtt_max_ms: 500 }),
      ping({ rtt_avg_ms: 50, timestamp: '2026-08-26T02:00:00Z' }),
    ])).toMatchObject({ maxRtt: 50, maxRttTime: '2026-08-26T02:00:00Z' })
  })
  it('counts loss rounds against their own calculable denominator, including total and tiny loss', () => {
    expect(summarizePingResults([
      ping({ packet_loss_percent: 0 }), ping({ packet_loss_percent: null }),
      ping({ packet_loss_percent: 100, rtt_avg_ms: null }), ping({ packet_loss_percent: 0.04 }),
    ])).toMatchObject({ lossRounds: 2, lossCount: 3, rttCount: 3 })
  })
  it.each([{ records: [] }, { records: [ping({ rtt_avg_ms: null, packet_loss_percent: null })] }])('keeps summaries unavailable without usable metrics', ({ records }) => {
    expect(summarizePingResults(records)).toEqual({ medianRtt: null, maxRtt: null, maxRttTime: null, rttCount: 0, lossRounds: 0, lossCount: 0 })
  })
  it('keeps real zero metrics available and unrounded positive medians', () => {
    expect(summarizePingResults([ping({ rtt_avg_ms: 0 })])).toMatchObject({ medianRtt: 0, maxRtt: 0, lossCount: 1, lossRounds: 0 })
    expect(summarizePingResults([ping({ rtt_avg_ms: 0.03 }), ping({ rtt_avg_ms: 0.04 })]).medianRtt).toBeCloseTo(0.035)
  })
})

describe('ping series', () => {
  it('keeps legitimate zero loss without inventing values for null RTT', () => {
    const records = [ping({ rtt_avg_ms: null }), ping({ timestamp: '2026-08-26T02:08:43Z' })]
    expect(splitSeries(records, 'rtt_avg_ms').flat().map(point => point.value)).toEqual([20])
    expect(splitSeries(records, 'packet_loss_percent')[0].map(point => point.value)).toEqual([0, 0])
  })
  it('breaks a line at an unavailable metric', () => {
    const records = [ping(), ping({ timestamp: '2026-08-26T02:08:43Z', rtt_avg_ms: null }), ping({ timestamp: '2026-08-26T02:12:43Z' })]
    expect(splitSeries(records, 'rtt_avg_ms').map(segment => segment.length)).toEqual([1, 1])
  })
  it('breaks collection gaps exceeding eight minutes', () => {
    const records = [ping(), ping({ timestamp: '2026-08-26T02:08:43Z' }), ping({ timestamp: '2026-08-27T02:04:43Z' })]
    expect(splitSeries(records, 'rtt_avg_ms').map(segment => segment.length)).toEqual([2, 1])
  })
  it('retains distinct observations at the same timestamp without connecting them', () => {
    const records = [ping(), ping({ destination_address: '193.0.14.130', rtt_avg_ms: 30 })]
    expect(splitSeries(records, 'rtt_avg_ms').map(segment => segment[0].value)).toEqual([20, 30])
  })
  it('returns no points when all metrics are unavailable', () => {
    expect(splitSeries([ping({ rtt_avg_ms: null })], 'rtt_avg_ms')).toEqual([])
  })
})

it('selects an actual nearest observation instead of filling a gap or inventing a value', () => {
  const records = [ping(), ping({ timestamp: '2026-08-27T02:04:43Z', rtt_avg_ms: null })]
  expect(nearestRecordIndex(records, Date.parse('2026-08-26T03:00:00Z'))).toBe(0)
  expect(nearestRecordIndex(records, Date.parse('2026-08-27T02:04:43Z'))).toBe(1)
})

it('uses display-only precision while distinguishing zero, small positives and missing metrics', () => {
  expect([30.12345, 33.33333, 0, null, 0.04, 0.1].map(formatMetric)).toEqual(['30,1', '33,3', '0', 'Indisponível', '<0,1', '0,1'])
  const records = [ping({ rtt_avg_ms: 30.12345 })]
  expect(splitSeries(records, 'rtt_avg_ms')[0][0].value).toBe(30.12345)
  expect(records[0].rtt_avg_ms).toBe(30.12345)
})
