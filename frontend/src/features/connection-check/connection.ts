export interface Connection {
  holder: string
  asn: number
  family: 4 | 6
  probes: number
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

export async function checkConnection(signal: AbortSignal): Promise<Connection> {
  const { data: { ip } } = await readJson<{ data: { ip: string } }>(stat('whats-my-ip'), signal)
  const { data: { asns } } = await readJson<{ data: { asns: string[] } }>(stat('network-info', ip), signal)
  if (!asns.length) throw new Error('No ASN for this address')
  const asn = Number(asns[0])
  const family = ip.includes(':') ? 6 : 4
  const [holder, probes] = await Promise.all([
    fetchHolder(asn, signal),
    readJson<{ count: number }>(`https://atlas.ripe.net/api/v2/probes/?asn_v${family}=${asn}&status=1&page_size=1&fields=id`, signal),
  ])
  return { holder, asn, family, probes: probes.count }
}
