import { AppShell, Badge, Burger, Button, Group, NavLink, Stepper, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import PingExplorer from './PingExplorer'
import ProbeDistribution from './ProbeDistribution'
import { journey, routeFromHash, routes, type Route } from './routes'

const groups = [
  { id: 'journey', label: 'Jornada' },
  { id: 'probe', label: 'Sua probe' },
  { id: 'network', label: 'RIPE Atlas' },
] as const

function InConstruction({ route }: { route: Route }) {
  return <>
    <Group gap="sm" mb="xs"><Title order={1} size="h2">{route.label}</Title><Badge variant="light" color="gray">Em construção</Badge></Group>
    <Text c="dimmed" maw={640}>{route.summary}</Text>
  </>
}

function JourneyPage({ route }: { route: Route }) {
  const step = journey.indexOf(route)
  const previous = journey[step - 1]
  const next = journey[step + 1]
  return <>
    <Stepper active={step} size="sm" mb="xl" aria-label="Fases da jornada" completedIcon={({ step }) => step + 1} onStepClick={index => { location.hash = `#/${journey[index].id}` }}>
      {journey.map(item => <Stepper.Step key={item.id} label={item.label} aria-label={item.label} aria-current={item === route ? 'step' : undefined} />)}
    </Stepper>
    <InConstruction route={route} />
    {route.id === 'conhecer' && <Button component="a" href="#/ativar" variant="light" mt="lg">Já tenho probe</Button>}
    <Group justify="space-between" mt="xl">
      {previous ? <Button component="a" href={`#/${previous.id}`} variant="default">Voltar: {previous.label}</Button> : <span />}
      {next && <Button component="a" href={`#/${next.id}`}>Próximo: {next.label}</Button>}
    </Group>
  </>
}

export default function App() {
  const [hash, setHash] = useState(location.hash)
  const [menuOpen, menu] = useDisclosure()
  useEffect(() => {
    const update = () => { setHash(location.hash); menu.close() }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [menu])
  const route = routeFromHash(hash)

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !menuOpen } }} padding="md">
      <AppShell.Header className="topbar">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={menuOpen} onClick={menu.toggle} hiddenFrom="sm" size="sm" color="white" aria-label="Abrir menu" />
            <a className="brand" href="#/conhecer" aria-label="Atlas, início da jornada">atlas</a>
          </Group>
          <span className="header-label">RIPE Atlas · Projeto TCC</span>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs" component="nav" aria-label="Páginas do dashboard">
        {groups.map(group => <div key={group.id} className="nav-group">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" py={6}>{group.label}</Text>
          {routes.filter(item => item.group === group.id).map(item => {
            const step = journey.indexOf(item)
            return <NavLink key={item.id} href={`#/${item.id}`} label={step >= 0 ? `${step + 1}. ${item.label}` : item.label}
              active={item === route} aria-current={item === route ? 'page' : undefined} />
          })}
        </div>)}
      </AppShell.Navbar>
      <AppShell.Main>
        <div className="page">
          {route.group === 'journey' && <JourneyPage route={route} />}
          {(route.id === 'desafios' || route.id === 'conquistas') && <InConstruction route={route} />}
          <PingExplorer active={route.id === 'minha-probe'} />
          <ProbeDistribution active={route.id === 'rede-global'} />
        </div>
      </AppShell.Main>
    </AppShell>
  )
}
