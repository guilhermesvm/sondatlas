import { Text } from '@mantine/core'
import type { ReactNode } from 'react'
import './pages.css'

export default function Step({ title, children }: { title: string, children: ReactNode }) {
  return <li><Text className="install-step-title">{title}</Text>{children}</li>
}
