import { Anchor, Button, List, Text } from '@mantine/core'
import { useEffect, useState } from 'react'
import Loading from '../../lib/Loading'
import SystemError from '../../lib/SystemError'
import { fetchAccount, KeyRefusedError, type Account } from '../atlas-account/account'
import { useProbe } from '../probe-status/ProbeProvider'
import LessonParts from './LessonParts'
import './lessons.css'

const count = (value: number) => Math.round(value).toLocaleString('pt-BR')

// One-off results cost twice the periodic ones (credits docs): 6 for a default ping, 60 for a default traceroute.
const pingCost = 6
const tracerouteCost = 60

function about(value: number) {
  if (value >= 1e6) return `${(value / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} milhões`
  if (value >= 1e3) return `${Math.round(value / 1e3).toLocaleString('pt-BR')} mil`
  return count(value)
}

function useAccount() {
  const [account, setAccount] = useState<Account | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal)
      .then(setAccount)
      .catch((reason: Error) => {
        if (controller.signal.aborted) return
        setError(reason instanceof KeyRefusedError ? 'O RIPE Atlas recusou a chave salva. Vincule uma chave nova em Configurações.' : reason.message)
      })
    return () => controller.abort()
  }, [])
  return { account, error }
}

function ToSettings({ children }: { children: string }) {
  return <>
    <Text size="sm">{children}</Text>
    <Button component="a" href="#/configuracoes" variant="light" size="sm" mt="sm">Ir para Configurações</Button>
  </>
}

function YourData({ account, error }: ReturnType<typeof useAccount>) {
  const followed = useProbe().probeId !== null
  if (error) return <SystemError title="Não foi possível consultar a sua conta" mt="0">{error}</SystemError>
  if (!account) return <Loading>Consultando a sua conta…</Loading>
  if (!account.connected) return <ToSettings>Vincule a sua conta do RIPE Atlas em Configurações para ver o seu saldo aqui.</ToSettings>
  if (!account.credits) return <ToSettings>A chave vinculada não tem a permissão de créditos. Veja o que acrescentar em Configurações.</ToSettings>
  const { current_balance: balance, estimated_daily_income: daily } = account.credits
  const income = account.income ?? []
  const yesterday = income.reduce((total, item) => total + (item.yesterday_results_reward ?? 0), 0)
  return <>
    {!followed && <Text size="sm" c="dimmed" mb="sm" maw={680}>
      A Sondatlas não acompanha nenhuma probe agora, mas os créditos são da sua conta do RIPE Atlas, então aparecem mesmo assim.
      Para guardar o histórico das medições de uma probe, escolha qual em <Anchor href="#/acompanhar">Acompanhar</Anchor>.
    </Text>}
    <dl className="lesson-numbers">
      <div>
        <dt>Saldo</dt>
        <dd className="lesson-number-value">{count(balance)}</dd>
        <dd>Créditos na sua conta agora.</dd>
      </div>
      {daily ? <div>
        <dt>Por dia</dt>
        <dd className="lesson-number-value">{count(daily)}</dd>
        <dd>Quanto o RIPE Atlas estima que você ganha por dia, somando todas as suas probes.</dd>
      </div> : null}
      {income.length > 0 && <div>
        <dt>Ontem, por resultados</dt>
        <dd className="lesson-number-value">{count(yesterday)}</dd>
        <dd>Ganhos por entregar resultados de medições, além do tempo conectada.</dd>
      </div>}
    </dl>
    <Text size="sm" mt="lg" maw={680}>
      Com esse saldo, você poderia criar cerca de <strong>{about(balance / pingCost)} pings</strong> ou <strong>{about(balance / tracerouteCost)} traceroutes</strong>.
    </Text>
    {income.length > 1 && <ul className="lesson-networks">
      {income.map(item => <li key={item.probe_id}>
        <span>Probe {item.probe_id}</span>
        <span>cerca de {count(item.estimated_daily_income)} por dia</span>
      </li>)}
    </ul>}
  </>
}

function Reading({ account }: { account: Account }) {
  const credits = account.credits!
  const income = account.income ?? []
  const yesterday = income.reduce((total, item) => total + (item.yesterday_results_reward ?? 0), 0)
  return <dl className="lesson-reading">
    {income.length > 0 && <div>
      <dt>{count(yesterday)} ontem</dt>
      <dd>
        É o que as suas probes ganharam por entregar resultados das medições de outras pessoas e do RIPE Atlas. Quanto mais a probe é usada, mais ela rende.
        A <Anchor href="#/aprender/medicoes-automaticas">lição sobre o que a probe mede sozinha</Anchor> mostra quem usa a sua.
      </dd>
    </div>}
    {credits.estimated_daily_income ? <div>
      <dt>{count(credits.estimated_daily_income)} por dia</dt>
      <dd>O tempo conectada, sozinho, rende 21.600 por dia para cada probe. O que passa disso vem dos resultados. Se a probe fica desligada, os dois param.</dd>
    </div> : null}
    <div>
      <dt>Cerca de {pingCost} créditos</dt>
      <dd>É o custo de um ping criado por você, como o do <Anchor href="#/desafios">desafio do ping</Anchor>. Perto do seu saldo, é quase nada.</dd>
    </div>
  </dl>
}

function ReadingPart({ account, error }: ReturnType<typeof useAccount>) {
  if (account?.credits) return <Reading account={account} />
  if (!account && !error) return <Loading>Esperando os dados da sua conta…</Loading>
  return <Text size="sm">Com a conta vinculada, aqui aparece o que os seus números querem dizer.</Text>
}

export default function CreditsLesson() {
  const state = useAccount()
  return <LessonParts parts={[
    {
      title: 'O que é',
      content: <>
        <Text size="sm">
          Os créditos são a moeda do RIPE Atlas. Você ganha créditos deixando a sua probe ligada e gasta quando cria as suas próprias medições. É uma troca: quem ajuda a medir a Internet ganha o direito de medir também.
        </Text>
        <Text size="sm" mt="sm">
          Uma medição sua pode usar probes do mundo inteiro, não só a sua. É assim que dá para ver a Internet de lugares onde você não está.
        </Text>
      </>,
    },
    {
      title: 'Como ganhar e gastar',
      content: <div className="lesson-reminders">
        <div>
          <strong>Entra</strong>
          <List size="sm" spacing={4} mt={4}>
            <List.Item>15 créditos por minuto com a probe conectada, cerca de 21.600 por dia.</List.Item>
            <List.Item>1 crédito por resultado que a probe entrega para uma medição.</List.Item>
            <List.Item>Contas novas podem receber 50 mil créditos de início.</List.Item>
          </List>
        </div>
        <div>
          <strong>Sai</strong>
          <List size="sm" spacing={4} mt={4}>
            <List.Item>Cada medição que você cria custa créditos. Um ping custa cerca de 6, e um traceroute, cerca de 60.</List.Item>
            <List.Item>O desconto não acontece na hora: o RIPE Atlas cobra em lotes, a cada 4 a 6 horas.</List.Item>
          </List>
        </div>
      </div>,
    },
    { title: 'O seu dado', content: <YourData {...state} /> },
    { title: 'Como ler', content: <ReadingPart {...state} /> },
    {
      title: 'O que não mostra',
      content: <ul className="lesson-limits">
        <li><Text size="sm">O histórico de ganhos e gastos. O extrato completo fica no site do RIPE Atlas.</Text></li>
        <li><Text size="sm">Quem usou a sua probe. As medições de outras pessoas não dizem quem as criou.</Text></li>
        <li><Text size="sm">Os números exatos de cada medição. Os custos aqui são os de uma medição simples, e mudam com o número e o tamanho dos pacotes.</Text></li>
      </ul>,
    },
    {
      title: 'Para ir mais fundo',
      content: <List size="sm" spacing={4}>
        <List.Item><Anchor href="https://atlas.ripe.net/docs/getting-started/credits" target="_blank" rel="noreferrer">Créditos, na documentação do RIPE Atlas</Anchor> (em inglês)</List.Item>
        <List.Item><Anchor href="https://atlas.ripe.net/docs/getting-started/user-defined-measurements/" target="_blank" rel="noreferrer">Medições criadas por você</Anchor> (em inglês)</List.Item>
      </List>,
    },
  ]} />
}
