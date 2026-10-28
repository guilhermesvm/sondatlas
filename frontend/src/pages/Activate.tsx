import { Alert, Anchor, Box, Button, Group, List, SegmentedControl, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { StatusCard } from '../features/probe-status/ProbeStatusCard'
import { fetchProbeStatus, parseProbeId, ProbeNotFoundError, type ProbeStatus } from '../features/probe-status/status'
import Command from './Command'
import Step from './Step'
import './pages.css'

export default function Activate() {
  const [method, setMethod] = useState('vm')
  const [typed, setTyped] = useState('')
  const [checkedId, setCheckedId] = useState<number | null>(null)
  const [probe, setProbe] = useState<ProbeStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState(false)
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  async function verify(id: number) {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setChecking(true)
    setFailed(false)
    try {
      const result = await fetchProbeStatus(id, controller.signal)
      if (controller.signal.aborted) return
      setProbe(result)
    } catch (reason) {
      if (controller.signal.aborted) return
      if (reason instanceof ProbeNotFoundError) {
        setCheckedId(null)
        setError('Essa probe não existe no RIPE Atlas. Confira o ID e tente de novo.')
      } else setFailed(true)
    } finally {
      if (!controller.signal.aborted) setChecking(false)
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault()
    setError('')
    setProbe(null)
    setCheckedId(null)
    const id = parseProbeId(typed)
    if (id === null) {
      setError('Digite um ID válido, só com números.')
      return
    }
    setCheckedId(id)
    verify(id)
  }

  return <div className="install">
    <Title order={1} size="h2">Ativar a probe</Title>
    <Text size="lg" mt="sm" maw={1000}>Falta cadastrar a probe no RIPE Atlas, pegar o ID dela, ligar a probe e conferir se ela está conectada.</Text>

    <ol className="install-steps">
      <Step title="Cadastre a probe no RIPE Atlas">
        <Text size="sm">
          Abra o link de cadastro que apareceu no fim da instalação. Para entrar, use a sua conta do RIPE. Se ainda não tiver uma, crie na hora. A conta é gratuita.
        </Text>
        <Button component="a" href="https://atlas.ripe.net/register/swprobe" target="_blank" rel="noreferrer" variant="light" size="sm" my="sm">Abrir o cadastro</Button>
        <Text size="sm">No formulário:</Text>
        <List size="sm" spacing={4} mt={4} maw={720}>
          <List.Item><strong>Location:</strong> marque no mapa onde a probe fica. Para os outros, o RIPE mostra só uma posição aproximada.</List.Item>
          <List.Item><strong>Public key:</strong> cole a chave pública da probe.</List.Item>
          <List.Item><strong>Description:</strong> escreva uma descrição curta. Ela fica pública, então não coloque seu nome nem seu endereço.</List.Item>
          <List.Item><strong>Notes:</strong> é opcional.</List.Item>
          <List.Item>Marque que leu e aceita os termos de serviço do RIPE Atlas e a declaração de privacidade do RIPE NCC e envie o cadastro.</List.Item>
        </List>
      </Step>
      <Step title="Pegue o ID da probe no seu email">
        <Text size="sm" maw={720}>
          Depois do cadastro, a conta do RIPE que você usou recebe um email do RIPE Atlas avisando que a probe foi ativada. O ID da probe está nesse email. Ele é um número, e você vai usar no último passo.
        </Text>
      </Step>
      <Step title="Ligue a probe">
        <Text size="sm">A probe fica parada até o cadastro. Agora ligue a probe. Com este comando, ela também volta sozinha quando a máquina reiniciar.</Text>
        <SegmentedControl size="sm" my="sm" value={method} onChange={setMethod} aria-label="Como você instalou a probe"
          data={[{ value: 'vm', label: 'Máquina virtual' }, { value: 'native', label: 'Direto no sistema' }]} />
        {method === 'vm'
          ? <><Text size="sm">Na pasta lab do projeto:</Text><Command>{'vagrant ssh -c "sudo systemctl enable --now ripe-atlas"'}</Command></>
          : <Command>sudo systemctl enable --now ripe-atlas</Command>}
      </Step>
      <Step title="Confira se a probe está conectada">
        <Text size="sm" mb="sm" maw={720}>
          Digite o ID que veio no email. Não achou o email? O RIPE Atlas também mostra o número da sua probe em{' '}
          <Anchor href="https://atlas.ripe.net/probes/mine" target="_blank" rel="noreferrer">Minhas probes</Anchor>.
        </Text>
        <form onSubmit={submit}>
          <Group align="flex-start" gap="sm">
            <TextInput label="ID da probe" inputMode="numeric" value={typed} onChange={event => setTyped(event.currentTarget.value)} w={220} error={error} />
            <Button type="submit" loading={checking} mt={24}>Verificar</Button>
          </Group>
        </form>
        {checkedId && <Box mt="sm">
          <StatusCard probeId={checkedId} probe={probe} error={failed} checking={checking}
            next={{ href: '#/acompanhar', label: 'Seguir para Acompanhar' }} />
        </Box>}
        {probe?.is_public === false && <Alert color="yellow" mt="sm" maw={720} title="Sua probe não é pública">
          A Sondatlas só lê dados públicos do RIPE Atlas, então os resultados desta probe podem não aparecer aqui. Confira a visibilidade na página da probe no RIPE Atlas.
        </Alert>}
      </Step>
    </ol>
  </div>
}
