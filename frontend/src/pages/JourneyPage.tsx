import { Button, Group, Stepper } from '@mantine/core'
import { journey, type Route } from '../app/routes'
import InConstruction from './InConstruction'
import './pages.css'

export default function JourneyPage({ route }: { route: Route }) {
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
