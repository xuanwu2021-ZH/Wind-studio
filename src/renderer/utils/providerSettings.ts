import { LOCAL_EMBEDDING_PROVIDER_ID } from '@shared/data/presets/localEmbedding'
import type { Provider } from '@shared/data/types/provider'
import { isCherryAIProvider } from '@shared/utils/provider'

/**
 * Canonical preset provider IDs that the Windbot Studio rebrand exposes in
 * the provider settings list. Other preset providers (gemini, github, etc.)
 * are still functional but hidden by default to keep the model-service menu
 * focused on the supported set. User-added custom providers (no
 * presetProviderId, or a forked id that doesn't match its preset) are
 * always shown regardless of this list.
 */
export const WINDBOT_VISIBLE_PRESET_IDS: ReadonlySet<string> = new Set([
  'deepseek',
  'anthropic',
  'zhipu',
  'claude-code',
  'openai',
  'minimax',
  'minimax-global',
  'moonshot'
])

/**
 * @returns true when a provider should be shown in the provider settings list.
 *
 * Rules:
 *  - The local embedding provider is download-managed and is always hidden.
 *  - Cherry-AI branded providers are always hidden (kept from upstream).
 *  - Canonical preset providers (id === presetProviderId) are filtered by
 *    WINDBOT_VISIBLE_PRESET_IDS. Other preset providers are hidden.
 *  - User-added providers — custom (no presetProviderId) or forked
 *    (id !== presetProviderId) — are always visible.
 */
export function isProviderSettingsListVisibleProvider(provider: Provider): boolean {
  // The local embedding provider is download-managed, so exposing generic
  // edit/disable/delete controls would bypass its weight lifecycle checks.
  if (isCherryAIProvider(provider) || provider.id === LOCAL_EMBEDDING_PROVIDER_ID) {
    return false
  }
  const presetId = provider.presetProviderId
  // User-added (custom or fork) — always show.
  if (!presetId || provider.id !== presetId) {
    return true
  }
  // Canonical preset — check the allowlist.
  return WINDBOT_VISIBLE_PRESET_IDS.has(provider.id)
}
