import { LOCAL_EMBEDDING_PROVIDER_ID } from '@shared/data/presets/localEmbedding'
import type { Provider } from '@shared/data/types/provider'
import { describe, expect, it, vi } from 'vitest'

// isProviderSettingsListVisibleProvider only reads the provider id; stub the i18n +
// CherryAI helpers the module imports so the test stays focused on visibility.
vi.mock('@renderer/i18n', () => ({ default: { t: (k: string) => k } }))
vi.mock('@renderer/i18n/label', () => ({ getProviderLabelKey: (id: string) => id }))
vi.mock('@shared/utils/provider', () => ({
  isCherryAIProvider: (p: Provider) => p.id === 'cherryai',
  isLoginBasedProvider: (p: Provider) =>
    p.authMethods !== undefined && p.authMethods.length > 0 && !p.authMethods.includes('api-key')
}))

const { isProviderPresetInstanceSource, isProviderSettingsListVisibleProvider } = await import('../providerDisplay')

const provider = (idOrPartial: string | Partial<Provider>): Provider => {
  if (typeof idOrPartial === 'string') {
    return { id: idOrPartial } as Provider
  }
  return idOrPartial as Provider
}
const presetSource = (overrides: Partial<Provider> = {}): Provider =>
  ({
    id: 'openai',
    name: 'OpenAI',
    presetProviderId: 'openai',
    authType: 'api-key',
    defaultChatEndpoint: 'openai-responses',
    endpointConfigs: {
      'openai-responses': { baseUrl: 'https://api.openai.com' }
    },
    ...overrides
  }) as Provider

describe('isProviderSettingsListVisibleProvider', () => {
  it('hides the internal local-embedding provider from the management list', () => {
    expect(isProviderSettingsListVisibleProvider(provider(LOCAL_EMBEDDING_PROVIDER_ID))).toBe(false)
  })

  it('hides the CherryAI provider', () => {
    expect(isProviderSettingsListVisibleProvider(provider('cherryai'))).toBe(false)
  })

  it('keeps a normal provider visible', () => {
    expect(isProviderSettingsListVisibleProvider(provider('openai'))).toBe(true)
  })

  it('hides canonical preset providers that are not on the Windbot allow-list', () => {
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'gemini', presetProviderId: 'gemini' }))
    ).toBe(false)
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'github', presetProviderId: 'github' }))
    ).toBe(false)
  })

  it('keeps canonical preset providers on the Windbot allow-list visible', () => {
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'deepseek', presetProviderId: 'deepseek' }))
    ).toBe(true)
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'anthropic', presetProviderId: 'anthropic' }))
    ).toBe(true)
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'zhipu', presetProviderId: 'zhipu' }))
    ).toBe(true)
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'claude-code', presetProviderId: 'claude-code' }))
    ).toBe(true)
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'openai', presetProviderId: 'openai' }))
    ).toBe(true)
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'minimax', presetProviderId: 'minimax' }))
    ).toBe(true)
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'minimax-global', presetProviderId: 'minimax-global' }))
    ).toBe(true)
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'moonshot', presetProviderId: 'moonshot' }))
    ).toBe(true)
  })

  it('keeps user-added custom providers visible (regression: http://192.168.100.19:1234/v1)', () => {
    // Custom provider added by the user via "Add provider" — no presetProviderId,
    // arbitrary id, no canonical preset backing it.
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'local-llm-1234' }))
    ).toBe(true)
  })

  it('keeps user-added preset forks visible (e.g. an OpenAI work instance)', () => {
    // User cloned the OpenAI preset to point at a different base URL: id differs
    // from presetProviderId. Must remain visible regardless of the allow-list.
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'openai-work', presetProviderId: 'openai' }))
    ).toBe(true)
    expect(
      isProviderSettingsListVisibleProvider(provider({ id: 'gemini-personal', presetProviderId: 'gemini' }))
    ).toBe(true)
  })
})

describe('isProviderPresetInstanceSource', () => {
  it('accepts a canonical URL-based preset with a configured primary endpoint', () => {
    expect(isProviderPresetInstanceSource(presetSource())).toBe(true)
  })

  it('accepts the canonical New API preset without a registry default endpoint', () => {
    expect(
      isProviderPresetInstanceSource(
        presetSource({
          id: 'new-api',
          name: 'New API',
          presetProviderId: 'new-api',
          defaultChatEndpoint: undefined,
          endpointConfigs: {
            'openai-chat-completions': { baseUrl: 'http://localhost:3000' }
          }
        })
      )
    ).toBe(true)
  })

  it('rejects derived providers and presets without an independent generic-auth flow', () => {
    expect(isProviderPresetInstanceSource(presetSource({ id: 'openai-work' }))).toBe(false)
    expect(isProviderPresetInstanceSource(presetSource({ authMethods: ['oauth'] }))).toBe(false)
    expect(isProviderPresetInstanceSource(presetSource({ authType: 'iam-gcp' }))).toBe(false)
    expect(isProviderPresetInstanceSource(presetSource({ id: 'copilot', presetProviderId: 'copilot' }))).toBe(false)
  })

  it('rejects other presets without a configured default chat endpoint', () => {
    expect(isProviderPresetInstanceSource(presetSource({ defaultChatEndpoint: undefined }))).toBe(false)
    expect(isProviderPresetInstanceSource(presetSource({ endpointConfigs: undefined }))).toBe(false)
  })
})
