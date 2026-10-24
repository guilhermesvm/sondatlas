export function localInput(value: Date): string {
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${String(value.getFullYear()).padStart(4, '0')} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

export function localPeriod(start: string, stop: string): { start: string; stop: string } {
  if (!start || !stop) throw new Error('Informe o início e o fim do período.')
  const parse = (value: string) => {
    const parts = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?$/.exec(value.trim())
    if (!parts) throw new Error('Use DD/MM/AAAA HH:mm:ss, em horário de 24 horas (segundos opcionais).')
    const [, day, month, year, hour, minute, seconds = '00', fraction = ''] = parts
    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${seconds}${fraction}`)
    if (!Number.isFinite(date.getTime()) || localInput(date) !== `${day}/${month}/${year} ${hour}:${minute}:${seconds}`) {
      throw new Error('Esta data ou horário não existe no fuso local. Confira os campos.')
    }
    return date
  }
  const first = parse(start)
  const last = parse(stop)
  if (first >= last) {
    throw new Error('O início precisa ser anterior ao fim do período.')
  }
  if (last.getTime() - first.getTime() > 60 * 86400000) {
    throw new Error('Escolha um período de até 60 dias.')
  }
  return { start: first.toISOString(), stop: last.toISOString() }
}

export function quickPeriod(days: 1 | 7, now = new Date()): { start: string; stop: string } {
  return { start: new Date(now.getTime() - days * 86400000).toISOString(), stop: now.toISOString() }
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function formatLocal(value: string | number, detail = false): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: detail ? 'numeric' : undefined,
    hour: '2-digit', minute: '2-digit', second: detail ? '2-digit' : undefined,
    hourCycle: 'h23',
    timeZoneName: detail ? 'shortOffset' : undefined,
  }).format(new Date(value))
}
