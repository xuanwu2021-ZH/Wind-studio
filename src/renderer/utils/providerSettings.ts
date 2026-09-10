import { LOCAL_EMBEDDING_PROVIDER_ID } from '@shared/data/presets/localEmbedding'
import type { Provider } from '@shared/data/types/provider'
import { isCherryAIProvider } from '@shared/utils/provider'

/**
 * Canonical preset providers we keep visible in the settings list. Anything
 * not on this allow-list is hidden from the model-service menu — but ONLY
 * for canonical presets (those with `id === presetProviderId`). User-added
 * providers (custom URLs, work/personal forks of a preset, etc.) are NEVER
 * filtered, so anything the user actually configures shows up in the menu.
 */
const WINDBOT_VISIBLE_PRESET_IDS = new Set<string>([
  'deepseek',
  'anthropic',
  'zhipu', // 智普开放平台 (Zhipu / Z.AI / BigModel)
  'claude-code',
  'openai',
  'minimax',
  'minimax-global',
  'moonshot' // 月之暗面 (Moonshot / Kimi)
])

/**
 * Canonical preset = a provider whose `id` matches its `presetProviderId`
 * (i.e. the bundled preset definition itself, not a user-created instance).
 * User instances carry `presetProviderId === 'openai'` but `id === 'openai-work'`,
 * and custom providers carry `presetProviderId === undefined`.
 */
function isCanonicalPresetProvider(provider: Provider): boolean {
  return provider.presetProviderId != null && provider.id === provider.presetProviderId
}

export function isProviderSettingsListVisibleProvider(provider: Provider): boolean {
  // The local embedding provider is download-managed, so exposing generic
  // edit/disable/delete controls would bypass its weight lifecycle checks.
  if (isCherryAIProvider(provider)) return false
  if (provider.id === LOCAL_EMBEDDING_PROVIDER_ID) return false

  // Anything the user explicitly added (custom URL, preset fork, etc.) is
  // always visible — silencing it would make the add-provider button a no-op.
  if (!isCanonicalPresetProvider(provider)) return true

  // Canonical preset: honour the allow-list.
  return WINDBOT_VISIBLE_PRESET_IDS.has(provider.id)
}