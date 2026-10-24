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
