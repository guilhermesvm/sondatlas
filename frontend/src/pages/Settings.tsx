import { Alert, Anchor, Badge, Button, Group, Modal, PasswordInput, Text, Title } from '@mantine/core'
import { useEffect, useState, type SubmitEvent } from 'react'
import { disconnectAccount, fetchAccount, KeyRefusedError, saveAccountKey, type Account, type AccountProbe } from '../features/atlas-account/account'
import { useProbe } from '../features/probe-status/ProbeProvider'
import SystemError from '../lib/SystemError'
import './pages.css'

const keysPage = 'https://atlas.ripe.net/keys/'

const keyIcon = <svg className="settings-key" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  <circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3 20 3M16 7l3 3M14 9l2 2" />
</svg>

function KeyGuide() {
  return <aside className="settings-guide" aria-labelledby="key-guide">
    <Title order={3} size="h5" id="key-guide">Como criar a chave</Title>
    <Text size="sm" mt={6}>
      A chave é como um crachá com acesso limitado. Ela não é a sua senha, e você pode cancelar quando quiser no site do RIPE Atlas.
    </Text>
    <ol>
      <li>Abra as <Anchor href={keysPage} target="_blank" rel="noreferrer">chaves de API do RIPE Atlas</Anchor> com a mesma conta em que você cadastrou a probe.</li>
      <li>Comece uma chave nova com o nome Sondatlas.</li>
      <li>Escolha a validade. Alguns meses, como até o fim do semestre, é um bom prazo. Quando a chave vencer, esta página avisa, e é só criar outra e trocar.</li>
      <li>No campo Permission, abra a lista e escolha só <strong>Show information about your probes</strong>, no grupo PROBES.</li>
      <li>Crie e copie a chave. Ela aparece inteira só uma vez.</li>
      <li>Cole a chave no campo Chave de API e clique em Vincular.</li>
    </ol>
  </aside>
}

function ProbeList({ probes }: { probes: AccountProbe[] }) {
  const { probeId } = useProbe()
  if (probes.length === 0) return <Text size="sm">
    O RIPE Atlas não encontrou probes nesta conta. Confira se a chave foi criada na mesma conta em que você cadastrou a probe.
  </Text>
  return <ul className="settings-list">
    {probes.map(probe => <li key={probe.id}>
      <div>
        <Text size="sm" fw={600}>Probe {probe.id}</Text>
        {probe.description && <Text size="sm" c="dimmed">{probe.description}</Text>}
      </div>
      {probe.id === probeId && <Group gap="sm">
        <Badge variant="light" tt="none">Acompanhada</Badge>
        <Anchor href="#/minha-probe" size="sm">Ver Minha probe</Anchor>
      </Group>}
    </li>)}
  </ul>
}

const unlocks = [
  { title: 'Conquistas', text: 'Contam só as suas probes.' },
  { title: 'Desafios', text: 'Medições criadas por você, com os seus créditos. Vão pedir mais permissões na chave.' },
]

export default function Settings() {
  const [account, setAccount] = useState<Account | null>(null)
  const [refused, setRefused] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [changing, setChanging] = useState(false)
  const [typed, setTyped] = useState('')
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState<{ title: string, message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchAccount(controller.signal)
      .then(setAccount)
      .catch((reason: Error) => {
        if (controller.signal.aborted) return
        if (reason instanceof KeyRefusedError) setRefused(true)
        else setLoadError(reason.message)
      })
    return () => controller.abort()
  }, [])

  function closeForm() {
    setChanging(false)
    setTyped('')
    setFieldError('')
    setError(null)
  }

  async function link(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    setFieldError('')
    if (!typed.trim()) {
      setFieldError('Cole a chave que você criou no RIPE Atlas.')
      return
    }
    setBusy(true)
    try {
      setAccount(await saveAccountKey(typed))
      setRefused(false)
      closeForm()
    } catch (reason) {
      if (reason instanceof KeyRefusedError) setFieldError(reason.message)
      else setError({ title: 'Não foi possível vincular a conta', message: (reason as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    setError(null)
    setBusy(true)
    try {
      await disconnectAccount()
      setConfirming(false)
      setRefused(false)
      closeForm()
      setAccount({ connected: false })
    } catch (reason) {
      setError({ title: 'Não foi possível desvincular', message: (reason as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const linked = account?.connected === true
  const ready = account !== null || refused
  const showForm = ready && !linked
  const inModal = changing || confirming
  const errorText = error && <SystemError title={error.title}>{error.message}</SystemError>
  const keyField = (label?: string) => <PasswordInput label={label} aria-label={label ? undefined : 'Chave de API do RIPE Atlas'} placeholder="Cole a chave aqui"
    autoComplete="off" value={typed} onChange={event => setTyped(event.currentTarget.value)} flex={1} maw={label ? undefined : 320} error={fieldError} data-autofocus={label ? true : undefined} />

  return <div className="install">
    <Title order={1} size="h2">Configurações</Title>
    <Text size="lg" mt="sm" maw={680}>O que a Sondatlas guarda neste computador para funcionar do seu jeito.</Text>

    <div className={`settings-layout ${showForm ? 'with-guide' : ''}`}>
      <section aria-labelledby="ripe-account">
        <Title order={2} size="h4" id="ripe-account">Conta RIPE</Title>
        <Text size="sm" mt={4} maw={620}>Vincule a sua conta do RIPE Atlas para a Sondatlas saber quais probes são suas.</Text>

        {loadError && <SystemError title="Não foi possível consultar a sua conta">{loadError}</SystemError>}
        {!loadError && !ready && <Text size="sm" mt="lg">Consultando a sua conta…</Text>}

        {ready && <dl className="settings-rows">
          <div>
            <dt>Situação</dt>
            <dd>
              <Text fw={600} className="settings-state" data-linked={linked && !refused}>{keyIcon}{linked ? 'Vinculada' : refused ? 'Chave recusada' : 'Não vinculada'}</Text>
              {linked && <Text size="sm">A chave pode ver as suas probes.</Text>}
              {refused && <Alert color="yellow" mt="xs" title="O RIPE Atlas recusou a chave salva">
                A chave pode ter vencido, ter sido apagada ou desativada no site, ter ficado congelada depois de muito tempo sem uso ou estar sem a permissão Show information about your probes. Vincule uma chave nova ou desvincule.
              </Alert>}
            </dd>
          </div>
          <div>
            <dt>Chave de API</dt>
            <dd>
              {showForm
                ? <form onSubmit={link}>
                  <Group align="flex-start" gap="sm" wrap="nowrap">
                    {keyField()}
                    <Button type="submit" loading={busy}>Vincular</Button>
                  </Group>
                  <Text size="sm" c="dimmed" mt={6}>A chave fica só no seu computador, e a Sondatlas não mostra ela de novo.</Text>
                </form>
                : <Text size="sm">Guardada neste computador.</Text>}
              {(linked || refused) && <Group gap="sm" mt={showForm ? 'sm' : 6}>
                {linked && <Button variant="default" size="sm" onClick={() => { setError(null); setChanging(true) }}>Trocar chave</Button>}
                <Button variant="default" size="sm" className="danger-button" onClick={() => { setError(null); setConfirming(true) }}>Desvincular</Button>
              </Group>}
              {!inModal && errorText}
            </dd>
          </div>
          {linked && <div>
            <dt>Suas probes</dt>
            <dd><ProbeList probes={account.probes ?? []} /></dd>
          </div>}
          <div>
            <dt>O que a chave libera</dt>
            <dd>
              <ul className="settings-list settings-unlocks">
                {unlocks.map(item => <li key={item.title}>
                  <div><Text size="sm" fw={600}>{item.title}</Text><Text size="sm" c="dimmed">{item.text}</Text></div>
                  <Badge variant="light" color="gray" tt="none">Em breve</Badge>
                </li>)}
              </ul>
            </dd>
          </div>
        </dl>}
      </section>
      {showForm && <KeyGuide />}
    </div>

    <Modal opened={changing} onClose={closeForm} closeOnClickOutside={false} centered title="Trocar a chave de API">
      <form onSubmit={link}>
        <Text size="sm" mb="sm">Cole a chave nova. Ela só substitui a atual se o RIPE Atlas aceitar.</Text>
        {keyField('Chave nova')}
        <Text size="sm" mt="sm">
          Para criar outra chave, abra as <Anchor href={keysPage} target="_blank" rel="noreferrer">chaves de API do RIPE Atlas</Anchor> e escolha só a permissão <strong>Show information about your probes</strong>. Depois de trocar, apague a chave antiga no site.
        </Text>
        {errorText}
        <Group gap="sm" mt="lg" justify="flex-end">
          <Button variant="default" onClick={closeForm}>Cancelar</Button>
          <Button type="submit" loading={busy}>Trocar chave</Button>
        </Group>
      </form>
    </Modal>
    <Modal opened={confirming} onClose={() => setConfirming(false)} closeOnClickOutside={false} centered title="Desvincular a conta RIPE?">
      <Text size="sm">A Sondatlas apaga a chave do seu computador e deixa de saber quais probes são suas.</Text>
      <Text size="sm" mt="xs">
        No site do RIPE Atlas, a chave continua ativa. Se não for usar mais, apague a chave em{' '}
        <Anchor href={keysPage} target="_blank" rel="noreferrer">Chaves de API</Anchor>.
      </Text>
      {errorText}
      <Group gap="sm" mt="lg" justify="flex-end">
        <Button variant="default" onClick={() => setConfirming(false)}>Cancelar</Button>
        <Button color="red.9" loading={busy} onClick={unlink}>Sim, desvincular</Button>
      </Group>
    </Modal>
  </div>
}
