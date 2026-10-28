import { AppShell, Burger, Group, NavLink, ScrollArea, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import AchievementBell from '../features/achievements/AchievementBell'
import { BadgesProvider } from '../features/achievements/BadgesProvider'
import PingExplorer from '../features/ping-history/PingExplorer'
import ProbeDistribution from '../features/probe-distribution/ProbeDistribution'
import { exercisesFromHash, lessonFromHash } from '../features/lessons/lessons'
import { ProbeProvider, useProbe } from '../features/probe-status/ProbeProvider'
import StatusLabel, { useStatusLook } from '../features/probe-status/StatusLabel'
import Achievements from '../pages/Achievements'
import Challenges from '../pages/Challenges'
import Home from '../pages/Home'
import JourneyPage from '../pages/JourneyPage'
import MyProbe from '../pages/MyProbe'
import Settings from '../pages/Settings'
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

const gearIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <circle cx="12" cy="12" r="3" />
  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
</svg>

export default function App() {
  return <ProbeProvider><BadgesProvider><Layout /></BadgesProvider></ProbeProvider>
}

function Layout() {
  const { probeId } = useProbe()
  const look = useStatusLook()
  const [hash, setHash] = useState(location.hash)
  const [menuOpen, menu] = useDisclosure()
  useEffect(() => {
    // Pages change by the address hash without reloading, so the browser would keep the scroll of the previous page.
    const update = () => { setHash(location.hash); menu.close(); window.scrollTo(0, 0) }
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
            <a className="brand" href="#/inicio" aria-label="Sondatlas, início"><Logo /><span className="brand-name">Sondatlas</span></a>
          </Group>
          <Group gap="md" wrap="nowrap">
            {look && <a className="header-status" href="#/minha-probe" aria-label={`Minha probe: ${look.label}`}><StatusLabel look={look} /></a>}
            <span className="header-label">RIPE Atlas · Projeto TCC</span>
            <AchievementBell />
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs" component="nav" aria-label="Páginas do dashboard">
        <AppShell.Section grow component={ScrollArea}>
          <NavLink href="#/inicio" label="Início" active={route.id === 'inicio'} aria-current={route.id === 'inicio' ? 'page' : undefined} mb={6} />
          {groups.map(group => <div key={group.id} className="nav-group">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" py={6}>{group.label}</Text>
            {routes.filter(item => item.group === group.id).map(item => {
              const step = journey.indexOf(item)
              return <NavLink key={item.id} href={`#/${item.id}`} label={step >= 0 ? `${step + 1}. ${item.label}` : item.label}
                description={item.id === 'minha-probe' && look ? <StatusLabel look={look} /> : undefined}
                active={item === route} aria-current={item === route ? 'page' : undefined} />
            })}
          </div>)}
        </AppShell.Section>
        <AppShell.Section className="nav-bottom">
          <NavLink href="#/configuracoes" label="Configurações" leftSection={gearIcon}
            active={route.id === 'configuracoes'} aria-current={route.id === 'configuracoes' ? 'page' : undefined} />
        </AppShell.Section>
      </AppShell.Navbar>
      <AppShell.Main className="main">
        <div className="page">
          {route.id === 'inicio' && <Home />}
          {route.group === 'journey' && <JourneyPage route={route} lesson={lessonFromHash(hash)} exercises={exercisesFromHash(hash)} />}
          {route.id === 'desafios' && <Challenges />}
          {route.id === 'conquistas' && <Achievements />}
          {route.id === 'minha-probe' && <MyProbe />}
          {route.id === 'configuracoes' && <Settings />}
          {probeId ? <PingExplorer key={probeId} active={route.id === 'minha-probe'} /> : null}
          <ProbeDistribution active={route.id === 'rede-global'} />
        </div>
        <Footer />
      </AppShell.Main>
    </AppShell>
  )
}
