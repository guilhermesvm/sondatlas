import { AppShell, Burger, Group, NavLink, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import PingExplorer from '../features/ping-history/PingExplorer'
import ProbeDistribution from '../features/probe-distribution/ProbeDistribution'
import Home from '../pages/Home'
import InConstruction from '../pages/InConstruction'
import JourneyPage from '../pages/JourneyPage'
import ColorSchemeToggle from './ColorSchemeToggle'
import Footer from './Footer'
import Logo from './Logo'
import { journey, routeFromHash, routes } from './routes'
import './app.css'

const groups = [
  { id: 'journey', label: 'Jornada' },
  { id: 'probe', label: 'Sua probe' },
  { id: 'network', label: 'RIPE Atlas' },
] as const

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
            <a className="brand" href="#/inicio" aria-label="Sondatlas, início"><Logo />Sondatlas</a>
          </Group>
          <Group gap="md" wrap="nowrap">
            <span className="header-label">RIPE Atlas · Projeto TCC</span>
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs" component="nav" aria-label="Páginas do dashboard">
        <NavLink href="#/inicio" label="Início" active={route.id === 'inicio'} aria-current={route.id === 'inicio' ? 'page' : undefined} mb={6} />
        {groups.map(group => <div key={group.id} className="nav-group">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" py={6}>{group.label}</Text>
          {routes.filter(item => item.group === group.id).map(item => {
            const step = journey.indexOf(item)
            return <NavLink key={item.id} href={`#/${item.id}`} label={step >= 0 ? `${step + 1}. ${item.label}` : item.label}
              active={item === route} aria-current={item === route ? 'page' : undefined} />
          })}
        </div>)}
      </AppShell.Navbar>
      <AppShell.Main className="main">
        <div className="page">
          {route.id === 'inicio' && <Home />}
          {route.group === 'journey' && <JourneyPage route={route} />}
          {(route.id === 'desafios' || route.id === 'conquistas') && <InConstruction route={route} />}
          <PingExplorer active={route.id === 'minha-probe'} />
          <ProbeDistribution active={route.id === 'rede-global'} />
        </div>
        <Footer />
      </AppShell.Main>
    </AppShell>
  )
}
