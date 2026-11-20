import { Alert, Anchor, Button, Group, Modal, Text, TextInput, Title } from '@mantine/core'
import { useState, type SubmitEvent } from 'react'
import { useProbe } from '../features/probe-status/ProbeProvider'
import { parseProbeId } from '../features/probe-status/status'
import { InvalidProbeError, saveSelectedProbe, stopFollowingProbe } from '../lib/api'
import SystemError from '../lib/SystemError'
import './pages.css'

export default function Follow() {
  const { probeId, loadError, select } = useProbe()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [error, setError] = useState<{ title: string, message: string } | null>(null)
  const [notPublic, setNotPublic] = useState(false)

  async function follow(event: SubmitEvent) {
    event.preventDefault()
    setError(null)
    setFieldError('')
    const id = parseProbeId(typed)
    if (id === null) {
      setFieldError('Digite um ID válido, só com números.')
      return
    }
    setBusy(true)
    try {
      const saved = await saveSelectedProbe(id)
      setNotPublic(saved.is_public === false)
      setEditing(false)
      setTyped('')
      select(saved.probe_id)
    } catch (reason) {
      if (reason instanceof InvalidProbeError) setFieldError(reason.message)
      else setError({ title: editing ? 'Não foi possível trocar a probe' : 'Não foi possível acompanhar a probe', message: (reason as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setError(null)
    setBusy(true)
    try {
      await stopFollowingProbe()
      setConfirming(false)
      setNotPublic(false)
      select(null)
    } catch (reason) {
      setError({ title: 'Não foi possível parar de acompanhar', message: (reason as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function closeChange() {
    setEditing(false)
    setTyped('')
    setFieldError('')
    setError(null)
  }

  const idField = <TextInput label={editing ? 'ID da nova probe' : 'ID da probe'} inputMode="numeric" value={typed}
    onChange={event => setTyped(event.currentTarget.value)} w={220} error={fieldError} data-autofocus />
  const errorText = error && <SystemError title={error.title}>{error.message}</SystemError>

  return <div className="install">
    <Title order={1} className="page-title">Acompanhar a probe</Title>
    <Text size="lg" mt="sm" maw={1000}>
      A Sondatlas pode guardar os resultados da sua probe no seu computador. Assim você vê como a sua conexão se comportou ao longo dos dias, e não só agora.
    </Text>
    <dl className="follow-facts">
      <div>
        <dt>Começa na hora</dt>
        <dd>A coleta começa quando você escolhe a probe. Os primeiros resultados aparecem em poucos minutos, ou em cerca de meia hora se a probe acabou de ser ligada.</dd>
      </div>
      <div>
        <dt>Não perde o período parado</dt>
        <dd>Se o computador ficar desligado, a coleta busca o que faltou assim que a aplicação voltar a rodar.</dd>
      </div>
      <div>
        <dt>Uma probe por vez</dt>
        <dd>Você pode trocar de probe ou parar quando quiser. O que já foi guardado continua guardado.</dd>
      </div>
    </dl>

    <section className="follow-box">
      {loadError && <SystemError title="Não foi possível falar com a aplicação local" mt="0">{loadError}</SystemError>}
      {!loadError && probeId === null && <>
        <Text size="sm" mb="sm">
          Informe o ID da probe. Ele aparece em{' '}
          <Anchor href="https://atlas.ripe.net/probes/mine" target="_blank" rel="noreferrer">Minhas probes</Anchor> no site do RIPE Atlas.
        </Text>
        <form onSubmit={follow}>
          <Group align="flex-start" gap="sm">
            {idField}
            <Button type="submit" loading={busy} mt={24}>Acompanhar esta probe</Button>
          </Group>
        </form>
      </>}
      {!loadError && probeId && <>
        <Text fw={600}>A Sondatlas acompanha a probe {probeId}.</Text>
        <Group gap="sm" mt="md">
          <Button component="a" href="#/minha-probe">Ver Minha probe</Button>
          <Button variant="default" onClick={() => { setError(null); setFieldError(''); setEditing(true) }}>Trocar probe</Button>
          <Button variant="default" className="danger-button" onClick={() => { setError(null); setConfirming(true) }}>Parar de acompanhar</Button>
        </Group>
        <Modal opened={editing} onClose={closeChange} closeOnClickOutside={false} centered title="Trocar a probe acompanhada">
          <form onSubmit={follow}>
            <Text size="sm" mb="sm">A coleta passa para a nova probe. Os dados da probe {probeId} continuam guardados.</Text>
            {idField}
            {errorText}
            <Group gap="sm" mt="lg" justify="flex-end">
              <Button variant="default" onClick={closeChange}>Cancelar</Button>
              <Button type="submit" loading={busy}>Trocar probe</Button>
            </Group>
          </form>
        </Modal>
        <Modal opened={confirming} onClose={() => setConfirming(false)} closeOnClickOutside={false} centered
          title={`Parar de acompanhar a probe ${probeId}?`}>
          <Text size="sm">A coleta para, e os dados já coletados continuam guardados. Você pode voltar a acompanhar quando quiser.</Text>
          {errorText}
          <Group gap="sm" mt="lg" justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button color="red.9" loading={busy} onClick={stop}>Sim, parar</Button>
          </Group>
        </Modal>
      </>}
      {!editing && !confirming && errorText}
      {notPublic && <Alert color="yellow" mt="sm" maw={720} title="Esta probe não é pública">
        A Sondatlas só lê dados públicos do RIPE Atlas, então os resultados desta probe podem não aparecer aqui. Confira a visibilidade na página da probe no RIPE Atlas.
      </Alert>}
    </section>
  </div>
}
