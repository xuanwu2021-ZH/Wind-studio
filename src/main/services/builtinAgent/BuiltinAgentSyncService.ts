import { loggerService } from '@logger'
import { BaseService } from '@main/core/lifecycle/BaseService'
import { Injectable, ServicePhase } from '@main/core/lifecycle/decorators'
import { Phase } from '@main/core/lifecycle/types'
import { ensureBuiltinAgent } from '@main/ai/agents/ensureBuiltinAgent'
import { BUILTIN_AGENT_ROLE } from '@shared/ai/builtinAgent'

const logger = loggerService.withContext('BuiltinAgentSyncService')

/**
 * Sync the bundled built-in agent rows on every boot.
 *
 * The built-in agent's display name and avatar_image are owned by the
 * bundled template (`resources/builtin-agents/<role>/agent.json`). Earlier
 * installs may have provisioned against an older bundle revision, and
 * `AgentService.ensureBuiltinAgent` only refreshes a row when no row exists
 * yet — so a user who upgrades across a rebrand would otherwise keep the
 * stale name/icon forever, even after the bundled `agent.json` is updated.
 *
 * `ensureBuiltinAgent` in `src/main/ai/agents/ensureBuiltinAgent.ts` already
 * invokes `AgentService.ensureBuiltinAgent` which upserts the row from the
 * bundled template; calling it on every boot is the cheapest way to make
 * sure all bundled-agent identifiers are aligned with the currently-shipped
 * manifest.
 *
 * The service lives in the Background phase so the sync is fire-and-forget
 * — a failed sync is logged and never blocks startup.
 */
@Injectable('BuiltinAgentSyncService')
@ServicePhase(Phase.Background)
export class BuiltinAgentSyncService extends BaseService {
  protected async onInit(): Promise<void> {
    for (const role of [BUILTIN_AGENT_ROLE.ASSISTANT, BUILTIN_AGENT_ROLE.SUPPORT]) {
      try {
        ensureBuiltinAgent(role)
        logger.debug('Built-in agent synced on boot', { role })
      } catch (error) {
        logger.warn('Failed to sync built-in agent on boot', {
          role,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
}