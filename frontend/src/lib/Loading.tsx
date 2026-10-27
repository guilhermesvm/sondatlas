import { Group, Loader, Text, type MantineSpacing } from '@mantine/core'
import type { ReactNode } from 'react'

export default function Loading({ children, mt }: { children: ReactNode, mt?: MantineSpacing }) {
  return <Group gap={8} mt={mt} wrap="nowrap" role="status">
    <Loader size={14} aria-hidden="true" />
    <Text size="sm">{children}</Text>
  </Group>
}
