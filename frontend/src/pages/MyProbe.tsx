import { Button, Group, Text, Title } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { useProbe } from '../features/probe-status/ProbeProvider'
import ProbeStatusCard from '../features/probe-status/ProbeStatusCard'
import SystemError from '../lib/SystemError'

export default function MyProbe() {
  const { probeId, loadError, status, check } = useProbe()
  const checkedBefore = useRef(status !== null)
  useEffect(() => { if (checkedBefore.current) check() }, [check])

  if (probeId === null) return <>
    <Title order={1} size="h2" mb="sm">Minha probe</Title>
    <Text maw={640}>A Sondatlas ainda não acompanha nenhuma probe. Quando você escolher uma, o status e o histórico de ping dela aparecem aqui.</Text>
    <Text maw={640} mt="xs">Ainda não tem uma probe? A jornada mostra como instalar uma em casa.</Text>
    <Group mt="lg">
      <Button component="a" href="#/conhecer">Começar pela fase Conhecer</Button>
      <Button component="a" href="#/acompanhar" variant="light">Já tenho uma probe</Button>
    </Group>
  </>
  return <>
    <Title order={1} size="h2" mb="sm">Minha probe{probeId ? ` ${probeId}` : ''}</Title>
    {loadError ? <SystemError title="Não foi possível falar com a aplicação local" mt="0">{loadError}</SystemError> : <ProbeStatusCard />}
  </>
}
