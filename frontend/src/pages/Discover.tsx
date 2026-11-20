import { Anchor, Checkbox, List, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import ConnectionCheck from '../features/connection-check/ConnectionCheck'
import { fetchDistribution, type ProbeDistribution } from '../lib/api'
import './pages.css'

const sources = [
  { label: 'O que é o RIPE Atlas', href: 'https://www.ripe.net/analyse/internet-measurements/ripe-atlas/' },
  { label: 'Créditos', href: 'https://atlas.ripe.net/docs/getting-started/credits.html' },
  { label: 'FAQ: segurança e privacidade', href: 'https://atlas.ripe.net/docs/faq/security-and-privacy/' },
  { label: 'FAQ: detalhes técnicos', href: 'https://atlas.ripe.net/docs/faq/technical-details/' },
  { label: 'Termos de serviço do RIPE Atlas', href: 'https://www.ripe.net/about-us/legal/ripe-atlas-service-terms-and-conditions/' },
  { label: 'Como se tornar anfitrião', href: 'https://atlas.ripe.net/docs/getting-started/become-a-host.html' },
  { label: 'RIPEstat: dados de rede usados na verificação da conexão', href: 'https://stat.ripe.net/docs/data-api/ripestat-data-api' },
]

const onYourNetwork = [
  ['Seu tráfego', 'Não é escutado. A probe só conversa com a infraestrutura do RIPE e mede destinos na Internet.'],
  ['Sua rede local', 'Não é medida. A probe recusa endereços privados, como 192.168.x.x.'],
  ['Conexões de fora', 'Não são aceitas. A probe não tem portas abertas.'],
  ['Banda', 'Cerca de 4 kbit/s, pouco mais de 1 GB por mês. Outras pessoas do RIPE Atlas podem usar a sua probe nas medições delas, o que aumenta esse consumo.'],
  ['Fora de casa', 'Numa rede que não é sua, como a da faculdade ou da empresa, peça autorização antes a quem cuida dela.'],
]

const count = (value: number) => value.toLocaleString('pt-BR')

function Scale({ distribution }: { distribution: ProbeDistribution | null }) {
  const share = distribution?.brazil.share_percent
  return <div className="scale">
    <div className="scale-step">
      <Text className="scale-place">No mundo</Text>
      {distribution ? <><Text className="scale-number">{count(distribution.total_probes)}</Text><Text size="sm">probes públicas conectadas</Text></>
        : <Text size="sm">Veja o total em <Anchor href="#/rede-global">Rede global</Anchor>.</Text>}
    </div>
    <div className="scale-step">
      <Text className="scale-place">No Brasil</Text>
      {distribution ? <><Text className="scale-number">{count(distribution.brazil.probes)}</Text>
        <Text size="sm">{share == null ? 'probes públicas conectadas' : `${share.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% das do mundo`}</Text></>
        : <Text size="sm">Veja quantas probes o Brasil tem em <Anchor href="#/rede-global">Rede global</Anchor>.</Text>}
    </div>
    <div className="scale-step yours">
      <Text className="scale-place">Na sua rede</Text>
      <ConnectionCheck />
    </div>
    {distribution && <Text size="xs" c="dimmed" className="scale-note">
      Mundo e Brasil: coleta de {new Date(distribution.finished_at_utc).toLocaleDateString('pt-BR')}. <Anchor href="#/rede-global">Ver a distribuição</Anchor>
    </Text>}
  </div>
}

export default function Discover({ understood, onUnderstoodChange }: { understood: boolean, onUnderstoodChange: (value: boolean) => void }) {
  const [distribution, setDistribution] = useState<ProbeDistribution | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetchDistribution(controller.signal).then(setDistribution).catch(() => {})
    return () => controller.abort()
  }, [])

  return <div className="discover">
    <Title order={1} size="h2">Conhecer o RIPE Atlas</Title>
    <Text size="lg" mt="sm" maw={1000}>
      O RIPE Atlas é uma rede de medição da Internet mantida pelo RIPE NCC, uma organização sem fins lucrativos. Voluntários do mundo
      todo hospedam probes: medidores que fazem testes como ping, traceroute e DNS o tempo todo, e os resultados são abertos. A
      software probe é a versão em programa, que roda num computador ou num Raspberry Pi.
    </Text>

    <Title order={2} mt={40}>Por que participar</Title>
    <div className="reasons">
      <Text><strong>Você mostra a Internet a partir da sua rede.</strong> Cada probe nova mede a partir de um provedor e de uma região a mais.</Text>
      <Text><strong>Você ganha créditos.</strong> A probe ganha 15 créditos por minuto conectada, cerca de 21.600 por dia. Com eles, você cria as suas próprias medições, como nos desafios da Sondatlas.</Text>
    </div>

    <Title order={2} mt={40} mb="md">Sua conexão faz diferença?</Title>
    <Scale distribution={distribution} />

    <Title order={2} mt={40} mb="md">O que fica público</Title>
    <div className="visibility">
      <section className="visibility-side public" aria-labelledby="public-title">
        <Text id="public-title" className="visibility-title">Qualquer pessoa vê</Text>
        <List size="sm" spacing={6}>
          <List.Item>A localização aproximada: o RIPE a desloca de propósito</List.Item>
          <List.Item>O IP público da sua conexão e o provedor, se a probe for pública; o IP também aparece nos resultados das medições</List.Item>
          <List.Item>Quando a probe está ligada ou desligada</List.Item>
          <List.Item>Os resultados das medições automáticas</List.Item>
          <List.Item>A descrição que você escrever: não coloque nome nem endereço</List.Item>
        </List>
      </section>
      <section className="visibility-side private" aria-labelledby="private-title">
        <Text id="private-title" className="visibility-title">Não fica público</Text>
        <List size="sm" spacing={6}>
          <List.Item>Seu nome, e-mail e contatos</List.Item>
          <List.Item>A localização exata</List.Item>
        </List>
      </section>
    </div>

    <Title order={2} mt={40} mb="sm">Na sua rede, a probe</Title>
    <dl className="spec">
      {onYourNetwork.map(([term, text]) => <div key={term}><dt>{term}</dt><dd>{text}</dd></div>)}
    </dl>

    <Title order={2} mt={40} mb="sm">Do que você precisa</Title>
    <ul className="checklist">
      <li>Um computador com Windows ou Linux que possa ficar ligado, porque os créditos só contam com a probe conectada</li>
      <li>Virtualização ativada na BIOS/UEFI</li>
      <li>Cerca de 4 GB livres em disco e 1 GB de memória para a máquina virtual (a probe usa cerca de 270 MB)</li>
      <li>Permissão de administrador para instalar o VirtualBox e o Vagrant, na fase Instalar</li>
      <li>Estar na rede de casa ou ter permissão de quem cuida da rede</li>
    </ul>
    <Text maw={700} mt="sm">Na fase Ativar, você vai criar uma conta gratuita no RIPE (ou entrar na sua) para cadastrar a probe.</Text>

    <Checkbox mt="xl" checked={understood} onChange={event => onUnderstoodChange(event.currentTarget.checked)}
      label="Entendi o que fica público e tenho o que preciso para instalar" />
    {understood && <Text mt="xs" className="step-title">Tudo pronto: siga para Instalar.</Text>}

    <section className="sources" aria-labelledby="sources-title">
      <Text id="sources-title" size="sm" fw={600}>Fontes oficiais</Text>
      <ul>{sources.map(source => <li key={source.href}><Anchor size="sm" href={source.href} target="_blank" rel="noreferrer">{source.label}</Anchor></li>)}</ul>
    </section>
  </div>
}
