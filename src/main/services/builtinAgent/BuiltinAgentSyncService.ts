import { ensureBuiltinAssistant } from '@main/ai/agents/ensureBuiltinAssistant'
import { loggerService } from '@logger'
import { BaseService } from '@main/core/lifecycle/BaseService'
import { Injectable, ServicePhase } from '@main/core/lifecycle/decorators'
import { Phase } from '@main/core/lifecycle/types'

const logger = loggerService.withContext('BuiltinAgentSyncService')

/**
 * Sync the built-in agent row on every boot.
 *
 * The built-in agent's name and avatar_image are owned by the bundled
 * `cherry-assistant` template (`agent.json`). Earlier installs may have
 * provisioned against an older bundle revision (e.g. pre-rebrand "Cherry
 * Assistant"), and `AgentService.ensureBuiltinAgent` only refreshes the row
 * when no row exists yet — so a user who upgraded across the rebrand would
 * otherwise keep the stale name/icon forever, even after the bundled
 * `agent.json` was updated.
 *
 * The sync lives in `ensureBuiltinAgent` itself now; this Background service
 * just ensures the sync actually runs once per boot. It is intentionally
 * fire-and-forget (Background phase) — a failed sync is logged and never
 * blocks startup.
 */
@Injectable('BuiltinAgentSyncService')
@ServicePhase(Phase.Background)
export class BuiltinAgentSyncService extends BaseService {
  protected async onInit(): Promise<void> {
    try {
      await ensureBuiltinAssistant()
      logger.debug('Built-in agent synced on boot')
    } catch (error) {
      logger.warn('Failed to sync built-in agent on boot', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}