// The only place that names the permissions the RIPE Atlas key needs. The ids match the API's missing_permissions.
export const permissions = [
  { id: 'probes', group: 'PROBES', name: 'Show information about your probes', use: 'ver as suas probes' },
  { id: 'credits', group: 'CREDITS', name: 'Get information about your credits', use: 'consultar o seu saldo de créditos' },
  { id: 'measurements', group: 'MEASUREMENTS', name: 'Schedule a new measurement', use: 'criar medições com os seus créditos' },
] as const

export function missingPermissions(ids: readonly string[]) {
  return permissions.filter(permission => ids.includes(permission.id))
}

const uses = permissions.map(permission => permission.use)
export const keyAllows = `A chave pode ${uses.slice(0, -1).join(', ')} e ${uses[uses.length - 1]}.`
