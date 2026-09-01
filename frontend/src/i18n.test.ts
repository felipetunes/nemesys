import { describe, expect, it } from 'vitest'

import { detectSystemLanguage, translate } from './i18n'

describe('translations', () => {
  it('uses Brazilian Portuguese product navigation', () => {
    expect(translate('pt-BR', 'nav.editor')).toBe('Editor de fluxos')
    expect(translate('pt-BR', 'nav.ivrs')).toBe('IVRs')
    expect(translate('pt-BR', 'app.collaborate')).toBe('Collaborate')
    expect(translate('pt-BR', 'node.queueDescription')).toContain('fila humana')
  })

  it('interpolates localized messages', () => {
    expect(translate('pt-BR', 'queue.waiting', { count: 3 })).toBe('3 aguardando')
    expect(translate('en-US', 'notice.versionPublished', { version: 4 })).toBe('Version 4 published successfully.')
  })

  it('maps browser language preferences to supported locales', () => {
    expect(detectSystemLanguage(['en-GB'])).toBe('en-US')
    expect(detectSystemLanguage(['pt-PT'])).toBe('pt-BR')
    expect(detectSystemLanguage(['es-AR', 'en-US'])).toBe('en-US')
    expect(detectSystemLanguage(['es-AR'])).toBe('pt-BR')
  })
})
