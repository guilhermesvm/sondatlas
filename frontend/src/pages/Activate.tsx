import { Alert, Anchor, Button, Group, List, SegmentedControl, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useState, type FormEvent } from 'react'
import { useProbe } from '../features/probe-status/ProbeProvider'
import ProbeStatusCard from '../features/probe-status/ProbeStatusCard'
import { saveSelectedProbe } from '../lib/api'
import Command from './Command'
import Step from './Step'
import './pages.css'

export default function Activate() {
  const { probeId: savedId, loadError, select } = useProbe()
  const [method, setMethod] = useState('vm')
  const [typed, setTyped] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [notPublic, setNotPublic] = useState(false)

  useEffect(() => {
    if (savedId) setTyped(String(savedId))
  }, [savedId])

  async function save(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!/^\d+$/.test(typed.trim()) || Number(typed) === 0) {
      setError('Digite um ID válido, só com números.')
      return
    }
    setSaving(true)
    try {
      const saved = await saveSelectedProbe(Number(typed))
      select(saved.probe_id)
      setNotPublic(saved.is_public === false)
      setNotice(`Probe ${saved.probe_id} salva. A coleta dos dados dela começa no próximo ciclo da aplicação.`)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return <div className="install">
    <Title order={1} size="h2">Ativar a probe</Title>
    <Text size="lg" mt="sm" maw={680}>Falta cadastrar a probe no RIPE Atlas, ligar a probe e informar o ID dela aqui.</Text>

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
      <Step title="Ligue a probe">
        <Text size="sm">A probe fica parada até o cadastro. Agora ligue a probe. Com este comando, ela também volta sozinha quando a máquina reiniciar.</Text>
        <SegmentedControl size="sm" my="sm" value={method} onChange={setMethod} aria-label="Como você instalou a probe"
          data={[{ value: 'vm', label: 'Máquina virtual' }, { value: 'native', label: 'Direto no sistema' }]} />
        {method === 'vm'
          ? <><Text size="sm">Na pasta lab do projeto:</Text><Command>{'vagrant ssh -c "sudo systemctl enable --now ripe-atlas"'}</Command></>
          : <Command>sudo systemctl enable --now ripe-atlas</Command>}
      </Step>
      <Step title="Informe o ID da probe">
        <Text size="sm" mb="sm">
          O RIPE Atlas mostra o número da sua probe em{' '}
          <Anchor href="https://atlas.ripe.net/probes/mine" target="_blank" rel="noreferrer">Minhas probes</Anchor>. Copie esse número e salve no campo abaixo.
        </Text>
        <form onSubmit={save}>
          <Group align="flex-end" gap="sm">
            <TextInput label="ID da probe" inputMode="numeric" value={typed} onChange={event => setTyped(event.currentTarget.value)} w={180} />
            <Button type="submit" loading={saving}>Salvar</Button>
          </Group>
        </form>
        {(error || loadError) && <Text size="sm" mt="sm" className="form-error" role="alert">{error || loadError}</Text>}
        {notice && <Text size="sm" mt="sm">{notice}</Text>}
        {notPublic && <Alert color="yellow" mt="sm" maw={720} title="Sua probe não é pública">
          A Sondatlas só lê dados públicos do RIPE Atlas, então os resultados desta probe podem não aparecer aqui. Confira a visibilidade na página da probe no RIPE Atlas.
        </Alert>}
      </Step>
      <Step title="Sua probe está conectada?">
        {savedId
          ? <ProbeStatusCard />
          : <Text size="sm">Salve o ID no passo 3 para ver o status da probe.</Text>}
      </Step>
    </ol>
  </div>
}
