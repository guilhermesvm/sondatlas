import { Button, Text, Title } from '@mantine/core'
import './pages.css'

const steps = [
  { title: 'Conheça', text: 'Entenda o que é o RIPE Atlas, o que a sua probe mede e o que fica público.' },
  { title: 'Instale', text: 'Instale uma probe em casa: num computador com Windows ou Linux (como máquina virtual) ou num Raspberry Pi.' },
  { title: 'Ative', text: 'Cadastre a probe no site do RIPE Atlas e confira se ela está conectada.' },
  { title: 'Acompanhe', text: 'Escolha a probe que a Sondatlas acompanha e guarde o histórico das medições dela.' },
  { title: 'Aprenda', text: 'Use as medições da sua probe, como ping, traceroute e DNS, para aprender como a Internet funciona.' },
]

// Probes around a center, as in a measurement network. Decorative only.
const nodes = [[478, 196], [556, 382], [418, 500], [206, 126], [128, 440]]

function Radar() {
  return <svg className="hero-radar" viewBox="0 0 640 640" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.5">
      {[70, 130, 190, 250, 310].map((r, i) => <circle key={r} cx="320" cy="320" r={r} strokeOpacity={0.34 - i * 0.07} />)}
    </g>
    <g stroke="currentColor" strokeOpacity=".38" strokeWidth="1.2" strokeDasharray="3 5">
      {nodes.map(([x, y]) => <path key={x} d={`M320 320 L${x} ${y}`} />)}
    </g>
    <circle cx="320" cy="320" r="22" fill="currentColor" fillOpacity=".18" />
    <circle cx="320" cy="320" r="9" fill="currentColor" />
    <g fill="var(--ink-raised)" stroke="currentColor" strokeWidth="2">
      {nodes.map(([x, y]) => <circle key={x} cx={x} cy={y} r="6" />)}
    </g>
  </svg>
}

export default function Home() {
  return <>
    <section className="hero" aria-labelledby="hero-title">
      <Radar />
      <div className="hero-body">
        <Title order={1} id="hero-title" className="hero-title">Participe do RIPE Atlas e <span>aprenda redes com dados reais</span></Title>
        <Text className="hero-text">
          O RIPE Atlas é uma rede mundial de milhares de pequenos medidores, as probes, que testam a Internet o tempo todo.
          A Sondatlas guia você para instalar uma probe em casa, colocá-la na rede e entender o que ela mede.
        </Text>
        <div className="hero-actions">
          <Button component="a" href="#/conhecer" size="lg" className="hero-primary">Começar a jornada</Button>
          <Button component="a" href="#/ativar" size="lg" variant="outline" className="hero-secondary">Já tenho uma probe</Button>
        </div>
        <Text className="hero-note">Já instalou? Informe o ID da sua probe para conferir se ela está conectada.</Text>
      </div>
    </section>

    <section className="home-section" aria-labelledby="how-title">
      <Title order={2} id="how-title" className="home-heading">Como funciona</Title>
      <ol className="home-steps">
        {steps.map((step, index) => <li key={step.title}>
          <div className="home-step-mark"><span aria-hidden="true">{index + 1}</span></div>
          <h3><span className="visually-hidden">{index + 1}. </span>{step.title}</h3>
          <Text size="sm">{step.text}</Text>
        </li>)}
      </ol>
    </section>

    <section className="home-section home-audience" aria-labelledby="audience-title">
      <Title order={2} id="audience-title" className="home-heading">Para quem</Title>
      <Text>Estudantes de redes e entusiastas que querem ver a Internet funcionando com medições reais, usando um computador comum ou um Raspberry Pi.</Text>
    </section>
  </>
}
