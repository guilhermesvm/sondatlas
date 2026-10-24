import { Alert } from '@mantine/core'
import type { ReactNode } from 'react'

const icon = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
  <circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" />
</svg>

export default function SystemError({ title, children, mt = 'sm' }: { title: string, children: ReactNode, mt?: string }) {
  return <Alert className="system-error" color="red" variant="light" title={title} icon={icon} role="alert" mt={mt} maw={720}>{children}</Alert>
}
