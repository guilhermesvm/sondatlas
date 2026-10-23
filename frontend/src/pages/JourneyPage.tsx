import { Button, Group, Stepper } from '@mantine/core'
import { useState } from 'react'
import { journey, type Route } from '../app/routes'
import Discover from './Discover'
import InConstruction from './InConstruction'
import './pages.css'

export default function JourneyPage({ route }: { route: Route }) {
  const [understood, setUnderstood] = useState(false)
  const step = journey.indexOf(route)
  const previous = journey[step - 1]
  const next = journey[step + 1]
  return <>
    <Stepper active={step} size="sm" mb="xl" aria-label="Fases da jornada" completedIcon={({ step }) => step + 1} onStepClick={index => { location.hash = `#/${journey[index].id}` }}>
      {journey.map(item => <Stepper.Step key={item.id} label={item.label} aria-label={item.label} aria-current={item === route ? 'step' : undefined} />)}
    </Stepper>
    {route.id === 'conhecer' ? <Discover understood={understood} onUnderstoodChange={setUnderstood} /> : <InConstruction route={route} />}
    <Group justify="space-between" mt="xl">
      {previous ? <Button component="a" href={`#/${previous.id}`} variant="default">Voltar: {previous.label}</Button> : <span />}
      {next && <Button component="a" href={`#/${next.id}`} variant={route.id === 'conhecer' && !understood ? 'default' : 'filled'}>Próximo: {next.label}</Button>}
    </Group>
  </>
}
