import type { FlowValidationResult } from './types'

export function validationErrorMessage(result: FlowValidationResult): string {
  return result.errors.map(issue => issue.node_id ? `${issue.node_id}: ${issue.message}` : issue.message).join('\n')
}

export function validationSuccessMessage(
  result: FlowValidationResult,
  action: string,
  formatWarnings: (count: number) => string = count => `${count} validation warning(s).`,
): string {
  if (result.warnings.length === 0) return action
  return `${action} ${formatWarnings(result.warnings.length)}`
}
