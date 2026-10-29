import { Anchor } from '@mantine/core'
import SystemError from '../../lib/SystemError'

// Shown when RIPE Atlas ends a measurement without any result. It does not say why, so the text only names the likely causes.
export default function MeasurementFailed({ status, group = false }: { status: string, group?: boolean }) {
  return <SystemError title="O RIPE Atlas não conseguiu fazer esta medição" mt="md">
    Ela terminou como "{status}", sem nenhum resultado.{' '}
    {group
      ? 'As probes escolhidas podem ter desconectado antes de medir. Tente de novo em alguns minutos.'
      : <>Logo depois de conectar, a probe pode levar um tempo até receber medições. Confira em <Anchor href="#/minha-probe" inherit>Minha probe</Anchor> se ela está conectada e tente de novo em alguns minutos.</>}
    {' '}Os créditos são cobrados por resultado, e esta medição não teve nenhum.
  </SystemError>
}
