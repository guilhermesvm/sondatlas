import { fetchHolder } from '../connection-check/connection'

export interface ProbeWorld {
  asn: number | null
  holder: string | null
  // Public connected probes in the probe's network (itself included when connected), in its country and in the world.
  network: number | null
  country: string | null
  inCountry: number | null
  inWorld: number
  tags: string[]
}

async function readJson<T>(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.json() as T
}

const connected = (filter: string, signal: AbortSignal) =>
  readJson<{ count: number }>(`https://atlas.ripe.net/api/v2/probes/?${filter}status=1&is_public=true&page_size=1&fields=id`, signal).then(page => page.count)

// Without is_public the list also counts about 1,100 non-public probes. Only public fields are asked for: the address, the prefix and the coordinates never leave RIPE Atlas.
export async function fetchProbeWorld(probeId: number, signal: AbortSignal): Promise<ProbeWorld> {
  const probe = await readJson<{ asn_v4: number | null, country_code: string | null, tags: { slug: string }[] }>(
    `https://atlas.ripe.net/api/v2/probes/${probeId}/?fields=asn_v4,country_code,tags`, signal)
  const asn = probe.asn_v4
  const country = probe.country_code
  const [holder, network, inCountry, inWorld] = await Promise.all([
    asn ? fetchHolder(asn, signal).catch(() => null) : null,
    asn ? connected(`asn_v4=${asn}&`, signal) : null,
    country ? connected(`country_code=${country}&`, signal) : null,
    connected('', signal),
  ])
  return { asn, holder, network, country, inCountry, inWorld, tags: probe.tags.map(tag => tag.slug) }
}

// System tags, re-assessed every 4 hours (RIPE Atlas "Probe Tags"): "works" means at least one successful ping over that IP version.
export function tested(tags: string[]) {
  const has = (slug: string) => tags.includes(`system-${slug}`)
  const results = [
    has('ipv4-works') ? 'IPv4 funciona' : has('ipv4-doesnt-work') ? 'IPv4 com falha' : null,
    has('ipv6-works') ? 'IPv6 funciona' : has('ipv6-doesnt-work') ? 'IPv6 com falha' : has('ipv6-capable') ? null : 'sem IPv6',
    has('ipv4-rfc1918') ? 'endereço privado (atrás de NAT)' : null,
  ]
  return results.filter((result): result is string => result !== null)
}
