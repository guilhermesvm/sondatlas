import { Button, Group, Paper, SimpleGrid, Text, Title } from '@mantine/core'

const steps = [
  { title: 'Conheça', text: 'Entenda o que é o RIPE Atlas, o que a sua probe mede e o que fica público.' },
  { title: 'Instale', text: 'Instale uma probe em casa: num computador com Windows ou Linux (como máquina virtual) ou num Raspberry Pi.' },
  { title: 'Ative', text: 'Cadastre a probe no site do RIPE Atlas e confira se ela está conectada.' },
  { title: 'Aprenda', text: 'Use as medições da sua probe, como ping, traceroute e DNS, para aprender como a Internet funciona.' },
]

export default function Home() {
  return <>
    <Title order={1} maw={720}>Participe do RIPE Atlas e aprenda redes com dados reais</Title>
    <Text size="lg" mt="md" maw={720}>
      O RIPE Atlas é uma rede mundial de milhares de pequenos medidores, as probes, que testam a Internet o tempo todo.
      A Sondatlas guia você para instalar uma probe em casa, colocá-la na rede e entender o que ela mede.
    </Text>
    <Group mt="lg">
      <Button component="a" href="#/conhecer" size="md">Começar a jornada</Button>
      <Button component="a" href="#/ativar" size="md" variant="light">Já tenho uma probe</Button>
    </Group>
    <Text size="sm" c="dimmed" mt="xs">Já instalou? Informe o ID da sua probe para conferir se ela está conectada.</Text>

    <Title order={2} mt={40} mb="md">Como funciona</Title>
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} component="ol" className="home-steps">
      {steps.map((step, index) => <Paper key={step.title} component="li" withBorder p="md">
        <Text fw={600} c="indigo.8">{index + 1}. {step.title}</Text>
        <Text size="sm" mt={4}>{step.text}</Text>
      </Paper>)}
    </SimpleGrid>

    <Title order={2} mt={40} mb="xs">Para quem</Title>
    <Text maw={720}>Estudantes de redes e entusiastas que querem ver a Internet funcionando com medições reais, usando um computador comum ou um Raspberry Pi.</Text>
  </>
}
