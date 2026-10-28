// Exercise progress is a personal convenience, so it lives in this browser only. The storage can be blocked or empty,
// and then the exercises work as before, starting over.
export interface Round {
  index: number
  score: number
  picked: number | null
}

export interface LastResult {
  score: number
  total: number
  at: number
}

interface Saved {
  round?: Round
  last?: LastResult
}

const key = (lesson: string) => `sondatlas.exercicios.${lesson}`

function read(lesson: string): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(key(lesson)) ?? '{}') as Saved
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function write(lesson: string, saved: Saved) {
  try {
    localStorage.setItem(key(lesson), JSON.stringify(saved))
  } catch {
    // Blocked storage: nothing is remembered, and the exercises still work.
  }
}

export const savedRound = (lesson: string) => read(lesson).round ?? null
export const lastResult = (lesson: string) => read(lesson).last ?? null

export function saveRound(lesson: string, round: Round | null) {
  const { last } = read(lesson)
  write(lesson, round ? { round, last } : { last })
}

export function finishRound(lesson: string, score: number, total: number) {
  write(lesson, { last: { score, total, at: Date.now() } })
}
