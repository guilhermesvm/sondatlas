import type { PingHistory, PingRecord } from '../lib/api'

export function ping(overrides: Partial<PingRecord> = {}): PingRecord {
  return {
    timestamp: '2026-08-26T02:04:43Z', probe_id: 1017210, measurement_id: 1001,
    measurement_type: 'ping', target_name: 'K-root', measurement_category: 'built-in',
    address_family: 4, protocol: 'ICMP', destination_address: '193.0.14.129',
    destination_name: 'k.root-servers.net', packets_sent: 3, packets_received: 3,
    duplicate_packets: 0, packet_loss_percent: 0, rtt_min_ms: 18, rtt_avg_ms: 20,
    rtt_max_ms: 22, ...overrides,
  }
}

export function history(results: PingRecord[] = [ping()]): PingHistory {
  return {
    probe_id: 1017210, measurement_id: 1001,
    start: '2026-08-26T02:03:41Z', stop: '2026-10-10T19:13:27Z',
    count: results.length, results,
  }
}

export const catalog = {
  probe_id: 1017210,
  targets: [
    { measurement_id: 1001, target_name: 'K-root', measurement_category: 'built-in' },
    { measurement_id: 86206926, target_name: 'Google', measurement_category: 'well-known' },
  ],
}

export const probeStatus = {
  id: 1017210, is_public: true,
  status: { id: 1, name: 'Connected', since: '2026-10-23T22:30:24Z' },
}

export const latestPing = [{
  msm_id: 1001, prb_id: 1017210, timestamp: 1792969004, type: 'ping', af: 4, proto: 'ICMP',
  dst_name: 'k.root-servers.net', dst_addr: '193.0.14.129', src_addr: '10.0.5.6', from: '203.0.113.77',
  size: 32, ttl: 51, sent: 3, rcvd: 3, min: 22.4, avg: 26.4, max: 33, result: [{ rtt: 33 }, { rtt: 23.7 }, { rtt: 22.4 }],
}]
