import { describe, expect, it } from 'vitest'

import type { FlowValidationResult } from './types'
import { validationErrorMessage, validationSuccessMessage } from './validation'

describe('flow validation messages', () => {
  it('includes the node id for actionable errors', () => {
    const result: FlowValidationResult = {
      valid: false,
      errors: [{ level: 'error', code: 'dead_end', message: 'Node has no outgoing edge.', node_id: 'welcome' }],
      warnings: [],
    }

    expect(validationErrorMessage(result)).toBe('welcome: Node has no outgoing edge.')
  })

  it('reports warnings after a successful action', () => {
    const result: FlowValidationResult = {
      valid: true,
      errors: [],
      warnings: [{ level: 'warning', code: 'unreachable_node', message: 'Node is unreachable.' }],
    }

    expect(validationSuccessMessage(result, 'Flow saved.')).toBe('Flow saved. 1 validation warning(s).')
  })
})
