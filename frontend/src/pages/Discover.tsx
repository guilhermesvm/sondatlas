import { Anchor, Checkbox, List, Paper, SimpleGrid, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { fetchDistribution, type ProbeDistribution } from '../lib/api'
import './pages.css'

const links = {
  about: { label: 'O que é o RIPE Atlas', href: 'https://www.ripe.net/analyse/internet-measurements/ripe-atlas/' },
  credits: { label: 'Créditos', href: 'https://atlas.ripe.net/docs/getting-started/credits.html' },
  privacy: { label: 'FAQ: segurança e privacidade', href: 'https://atlas.ripe.net/docs/faq/security-and-privacy/' },
  technical: { label: 'FAQ: detalhes técnicos', href: 'https://atlas.ripe.net/docs/faq/technical-details/' },
  terms: { label: 'Termos de serviço', href: 'https://www.ripe.net/about-us/legal/ripe-atlas-service-terms-and-conditions/' },
  host: { label: 'Como se tornar anfitrião', href: 'https://atlas.ripe.net/docs/getting-started/become-a-host.html' },
}

function Sources({ items }: { items: (keyof typeof links)[] }) {
  return <Text size="sm" c="dimmed" mt="sm">
    Fontes oficiais: {items.map((key, index) => <span key={key}>{index > 0 && ' · '}<Anchor href={links[key].href} target="_blank" rel="noreferrer">{links[key].label}</Anchor></span>)}
  </Text>
}

function BrazilCount() {
  const [distribution, setDistribution] = useState<ProbeDistribution | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetchDistribution(controller.signal).then(setDistribution).catch(() => {})
    return () => controller.abort()
  }, [])
  if (!distribution) return <Text size="sm" mt={4}>Veja quantas probes o Brasil tem em <Anchor href="#/rede-global">Rede global</Anchor>.</Text>
  const { probes, share_percent } = distribution.brazil
  const share = share_percent === null ? '' : `, ${share_percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% das probes públicas conectadas no mundo`
  const date = new Date(distribution.finished_at_utc).toLocaleDateString('pt-BR')
  return <Text size="sm" mt={4}>
    {probes.toLocaleString('pt-BR')} probes conectadas{share} (coleta de {date}). <Anchor href="#/rede-global">Ver a distribuição</Anchor>.
  </Text>
}

export default function Discover({ understood, onUnderstoodChange }: { understood: boolean, onUnderstoodChange: (value: boolean) => void }) {
  return <>
    <Title order={1} size="h2">Conhecer o RIPE Atlas</Title>
    <Text c="dimmed" maw={720} mt="xs">Antes de instalar, veja o que é o RIPE Atlas, o que a probe faz na sua rede e do que você precisa.</Text>

    <Title order={2} mt={32} mb="xs">O que é o RIPE Atlas</Title>
    <Text maw={720}>
      Uma rede de medição da Internet mantida pelo RIPE NCC, uma organização sem fins lucrativos. Voluntários do mundo todo hospedam
      probes: medidores que fazem testes como ping, traceroute e DNS o tempo todo, e os resultados são abertos. A software probe é a
      versão em programa, que roda num computador ou num Raspberry Pi.
    </Text>
    <Sources items={['about']} />

    <Title order={2} mt={32} mb="md">Por que participar</Title>
    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      <Paper withBorder p="md">
        <Text className="step-title">Mostrar a Internet a partir da sua rede</Text>
        <Text size="sm" mt={4}>Cada probe nova mede a partir de um provedor e de uma região a mais.</Text>
      </Paper>
      <Paper withBorder p="md">
        <Text className="step-title">No Brasil</Text>
        <BrazilCount />
      </Paper>
      <Paper withBorder p="md">
        <Text className="step-title">Créditos</Text>
        <Text size="sm" mt={4}>A probe ganha 15 créditos por minuto conectada (cerca de 21.600 por dia). Com eles, você cria as suas próprias medições, como nos desafios da Sondatlas.</Text>
      </Paper>
    </SimpleGrid>
    <Sources items={['credits']} />

    <Title order={2} mt={32} mb="md">O que fica público</Title>
    <SimpleGrid cols={{ base: 1, sm: 2 }}>
      <Paper withBorder p="md">
        <Text className="step-title">Fica público</Text>
        <List size="sm" mt={4} spacing={4}>
          <List.Item>A localização aproximada (o RIPE a desloca de propósito)</List.Item>
          <List.Item>O IP público da sua conexão e o provedor, se a probe for pública; o IP também aparece nos resultados das medições</List.Item>
          <List.Item>Quando a probe está ligada ou desligada</List.Item>
          <List.Item>Os resultados das medições automáticas</List.Item>
          <List.Item>A descrição que você escrever: não coloque nome nem endereço</List.Item>
        </List>
      </Paper>
      <Paper withBorder p="md">
        <Text className="step-title">Não fica público</Text>
        <List size="sm" mt={4} spacing={4}>
          <List.Item>Seu nome, e-mail e contatos</List.Item>
          <List.Item>A localização exata: só você a vê</List.Item>
        </List>
      </Paper>
    </SimpleGrid>
    <Title order={3} mt="lg" mb="xs">Na sua rede, a probe</Title>
    <List maw={720} spacing={4}>
      <List.Item><strong>Não escuta o seu tráfego:</strong> só conversa com a infraestrutura do RIPE e mede destinos na Internet.</List.Item>
      <List.Item><strong>Não mede a sua rede local:</strong> recusa endereços privados, como 192.168.x.x.</List.Item>
      <List.Item><strong>Não aceita conexões de fora:</strong> não tem portas abertas.</List.Item>
      <List.Item><strong>Usa pouca banda:</strong> cerca de 4 kbit/s, pouco mais de 1 GB por mês. Outras pessoas do RIPE Atlas podem usar a sua probe nas medições delas, o que aumenta esse consumo.</List.Item>
      <List.Item><strong>Fora de casa, precisa de permissão:</strong> numa rede que não é sua, como a da faculdade ou da empresa, peça autorização antes a quem cuida dela.</List.Item>
    </List>
    <Sources items={['privacy', 'technical', 'terms']} />

    <Title order={2} mt={32} mb="xs">Do que você precisa</Title>
    <List maw={720} spacing={4}>
      <List.Item>Um computador com Windows ou Linux que possa ficar ligado, porque os créditos só contam com a probe conectada; ou um Raspberry Pi</List.Item>
      <List.Item>Virtualização ativada na BIOS/UEFI</List.Item>
      <List.Item>Cerca de 4 GB livres em disco e 1 GB de memória para a máquina virtual (no nosso teste, a probe usou cerca de 270 MB)</List.Item>
      <List.Item>Permissão de administrador para instalar o VirtualBox e o Vagrant, na fase Instalar</List.Item>
      <List.Item>Estar na rede de casa ou ter permissão de quem cuida da rede</List.Item>
    </List>
    <Text maw={720} mt="sm">Na fase Ativar, você vai criar uma conta gratuita no RIPE (ou entrar na sua) para cadastrar a probe.</Text>
    <Sources items={['host']} />

    <Checkbox mt="xl" checked={understood} onChange={event => onUnderstoodChange(event.currentTarget.checked)}
      label="Entendi o que fica público e tenho o que preciso para instalar" />
    {understood && <Text mt="xs" className="step-title">Tudo pronto: siga para Instalar.</Text>}
  </>
}
