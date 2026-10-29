import { Badge } from '@mantine/core'

const externalIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
</svg>

// The same link badge as "Ler lição" in Aprender, in the light blue of the theme. Addresses outside the dashboard open in a new tab.
export default function LinkBadge({ href, children, label }: { href: string, children: string, label?: string }) {
  const external = !href.startsWith('#')
  return <Badge component="a" href={href} size="lg" variant="light" tt="none" className="link-badge" aria-label={label}
    rightSection={external ? externalIcon : undefined} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{children}</Badge>
}
