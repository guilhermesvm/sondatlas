import { Badge, Group, Text, Title } from '@mantine/core'
import type { Route } from '../app/routes'

export default function InConstruction({ route }: { route: Route }) {
  return <>
    <Group gap="sm" mb="xs"><Title order={1} size="h2">{route.label}</Title><Badge variant="light" color="gray">Em construção</Badge></Group>
    <Text c="dimmed" maw={640}>{route.summary}</Text>
  </>
}
