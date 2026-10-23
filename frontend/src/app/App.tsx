import { AppShell, Badge, Burger, Button, Group, NavLink, Stepper, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import Home from '../pages/Home'
import PingExplorer from '../features/ping-history/PingExplorer'
import ProbeDistribution from '../features/probe-distribution/ProbeDistribution'
import { journey, routeFromHash, routes, type Route } from './routes'

const ripeLinks = [
  { label: 'Site do RIPE Atlas', href: 'https://atlas.ripe.net/' },
  { label: 'Como hospedar uma probe', href: 'https://atlas.ripe.net/get-involved/become-a-host/' },
  { label: 'Documentação', href: 'https://atlas.ripe.net/docs/' },
  { label: 'RIPE Labs', href: 'https://labs.ripe.net/' },
  { label: 'RIPEstat', href: 'https://stat.ripe.net/' },
]

function Logo() {
  return <svg className="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="2" /><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8" />
  </svg>
}

function Footer() {
  return <footer className="site-footer">
    <div>
      <span className="footer-brand"><Logo />Sondatlas</span>
      <p>Trabalho de Conclusão de Curso em Ciência da Computação na Universidade de Passo Fundo (UPF). A Sondatlas não é um site oficial do RIPE NCC: ela usa os dados públicos do RIPE Atlas.</p>
    </div>
    <nav aria-label="RIPE Atlas, fontes oficiais">
      <h2>RIPE Atlas</h2>
      <ul>{ripeLinks.map(link => <li key={link.href}><a href={link.href} target="_blank" rel="noreferrer">{link.label}</a></li>)}</ul>
    </nav>
    <nav aria-label="Projeto">
      <h2>Projeto</h2>
      <ul><li><a href="https://github.com/guilhermesvm/network-measurement-platform" target="_blank" rel="noreferrer">Código-fonte</a></li></ul>
    </nav>
  </footer>
}

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
            <a className="brand" href="#/inicio" aria-label="Sondatlas, início"><Logo />Sondatlas</a>
          </Group>
          <span className="header-label">RIPE Atlas · Projeto TCC</span>
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
