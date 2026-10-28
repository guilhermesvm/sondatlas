import { Button, Group, Stepper } from '@mantine/core'
import { useState } from 'react'
import { journey, type Route } from '../app/routes'
import type { Lesson } from '../features/lessons/lessons'
import Activate from './Activate'
import Discover from './Discover'
import Follow from './Follow'
import Install from './Install'
import Learn from './Learn'
import './pages.css'

export default function JourneyPage({ route, lesson = null, exercises = false }: { route: Route, lesson?: Lesson | null, exercises?: boolean }) {
  const [understood, setUnderstood] = useState(false)
  const step = journey.indexOf(route)
  const previous = journey[step - 1]
  const next = journey[step + 1]
  return <>
    <Stepper active={step} size="sm" mb="xl" wrap={false} aria-label="Fases da jornada" completedIcon={({ step }) => step + 1} onStepClick={index => { location.hash = `#/${journey[index].id}` }}>
      {journey.map(item => <Stepper.Step key={item.id} label={item.label} aria-label={item.label} aria-current={item === route ? 'step' : undefined} />)}
    </Stepper>
    {route.id === 'conhecer' ? <Discover understood={understood} onUnderstoodChange={setUnderstood} />
      : route.id === 'instalar' ? <Install />
      : route.id === 'ativar' ? <Activate />
      : route.id === 'acompanhar' ? <Follow /> : <Learn lesson={lesson} exercises={exercises} />}
    {!lesson && <Group justify="space-between" mt="xl">
      {previous ? <Button component="a" href={`#/${previous.id}`} variant="default">Voltar: {previous.label}</Button> : <span />}
      {next && <Button component="a" href={`#/${next.id}`} variant={route.id === 'conhecer' && !understood ? 'default' : 'filled'}>Próximo: {next.label}</Button>}
    </Group>}
  </>
}
