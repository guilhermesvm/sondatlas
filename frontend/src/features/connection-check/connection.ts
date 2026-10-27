export interface Connection {
  holder: string
  asn: number
  family: 4 | 6
  probes: number
  // Which of the probes Sondatlas knows (the account's and the followed one) are among those connected probes.
  known: number[]
}

function stat(call: string, resource?: string) {
  const params = new URLSearchParams(resource ? { resource, sourceapp: 'sondatlas' } : { sourceapp: 'sondatlas' })
  return `https://stat.ripe.net/data/${call}/data.json?${params}`
}

async function readJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as T
}

export async function fetchHolder(asn: number, signal: AbortSignal) {
  const { data } = await readJson<{ data: { holder: string } }>(stat('as-overview', `AS${asn}`), signal)
  // RIPEstat writes "HANDLE - Name", like "AS263077 - RazaoInfo Internet Ltda" or "HURRICANE - Hurricane Electric LLC".
  return data.holder.replace(/^\S+\s+-\s+/, '')
}

// known can still be loading: it runs alongside the RIPEstat lookups.
export async function checkConnection(signal: AbortSignal, known: Promise<number[]> | number[] = []): Promise<Connection> {
  const { data: { ip } } = await readJson<{ data: { ip: string } }>(stat('whats-my-ip'), signal)
  const { data: { asns } } = await readJson<{ data: { asns: string[] } }>(stat('network-info', ip), signal)
  if (!asns.length) throw new Error('No ASN for this address')
  const asn = Number(asns[0])
  const family = ip.includes(':') ? 6 : 4
  const connected = `https://atlas.ripe.net/api/v2/probes/?asn_v${family}=${asn}&status=1`
  const [holder, probes, found] = await Promise.all([
    fetchHolder(asn, signal),
    readJson<{ count: number }>(`${connected}&page_size=1&fields=id`, signal),
    Promise.resolve(known).then(ids => ids.length
      ? readJson<{ results: { id: number }[] }>(`${connected}&id__in=${ids.join(',')}&page_size=100&fields=id`, signal)
      : { results: [] }),
  ])
  return { holder, asn, family, probes: probes.count, known: found.results.map(probe => probe.id) }
}
