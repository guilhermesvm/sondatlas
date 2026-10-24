import { Alert, Anchor, Button, Group, Modal, Text, TextInput, Title } from '@mantine/core'
import { useState, type FormEvent } from 'react'
import { useProbe } from '../features/probe-status/ProbeProvider'
import StatusLabel, { useStatusLook } from '../features/probe-status/StatusLabel'
import { saveSelectedProbe, stopFollowingProbe } from '../lib/api'
import './pages.css'

export default function Follow() {
  const { probeId, loadError, select } = useProbe()
  const look = useStatusLook()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notPublic, setNotPublic] = useState(false)

  async function follow(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!/^\d+$/.test(typed.trim()) || Number(typed) === 0) {
      setError('Digite um ID válido, só com números.')
      return
    }
    setBusy(true)
    try {
      const saved = await saveSelectedProbe(Number(typed))
      setNotPublic(saved.is_public === false)
      setEditing(false)
      setTyped('')
      select(saved.probe_id)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setError('')
    setBusy(true)
    try {
      await stopFollowingProbe()
      setConfirming(false)
      setNotPublic(false)
      select(null)
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function closeChange() {
    setEditing(false)
    setTyped('')
    setError('')
  }

  const idField = <TextInput label={editing ? 'ID da nova probe' : 'ID da probe'} inputMode="numeric" value={typed}
    onChange={event => setTyped(event.currentTarget.value)} w={180} data-autofocus />
  const errorText = error && <Text size="sm" mt="sm" className="form-error" role="alert">{error}</Text>

  return <div className="install">
    <Title order={1} size="h2">Acompanhar a probe</Title>
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
      {loadError && <Text size="sm" className="form-error" role="alert">{loadError}</Text>}
      {!loadError && probeId === null && <>
        <Text size="sm" mb="sm">
          Informe o ID da probe. Ele aparece em{' '}
          <Anchor href="https://atlas.ripe.net/probes/mine" target="_blank" rel="noreferrer">Minhas probes</Anchor> no site do RIPE Atlas.
        </Text>
        <form onSubmit={follow}>
          <Group align="flex-end" gap="sm">
            {idField}
            <Button type="submit" loading={busy}>Acompanhar esta probe</Button>
          </Group>
        </form>
      </>}
      {!loadError && probeId && <>
        <Text fw={600}>A Sondatlas acompanha a probe {probeId}.</Text>
        {look && <Text size="sm" mt={4}><StatusLabel look={look} /></Text>}
        <Group gap="sm" mt="md">
          <Button component="a" href="#/minha-probe">Ver Minha probe</Button>
          <Button variant="default" onClick={() => { setError(''); setEditing(true) }}>Trocar probe</Button>
          <Button variant="default" className="danger-button" onClick={() => { setError(''); setConfirming(true) }}>Parar de acompanhar</Button>
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
