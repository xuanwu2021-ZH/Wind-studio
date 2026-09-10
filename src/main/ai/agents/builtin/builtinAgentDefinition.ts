import { application } from '@application'
import { loggerService } from '@logger'
import { getAppLanguage } from '@main/i18n'
import { type AgentConfiguration, sanitizeAgentConfiguration } from '@shared/data/api/schemas/agents'
import fs from 'fs'
import path from 'path'

const logger = loggerService.withContext('BuiltinAgentDefinition')

const TEMPLATE_NAME_BY_ROLE: Record<string, string> = {
  assistant: 'cherry-assistant'
}

/**
 * Chromium (renderer process) cannot decode `.ico` via the `<img>` tag, so we
 * rasterise it to a 256x256 PNG the first time it is requested. The result is
 * cached next to the source ICO under `<template>/.cache/` so repeated loads
 * don't pay the conversion cost. PNG is supported everywhere and is the same
 * format Chromium rasterises natively, so there is no further translation
 * needed at draw time.
 *
 * Returns the absolute path to the PNG. If the source is already a PNG/JPG/
 * WEBP/GIF/SVG, returns it unchanged.
 */
async function convertIconToPngIfNeeded(absImagePath: string): Promise<string | undefined> {
  try {
    if (!fs.existsSync(absImagePath)) {
      logger.warn('avatar_image file not found on disk', { path: absImagePath })
      return undefined
    }
    const ext = path.extname(absImagePath).toLowerCase()
    if (ext !== '.ico') return absImagePath

    const cacheDir = path.join(path.dirname(absImagePath), '.cache')
    const cachePng = path.join(cacheDir, path.basename(absImagePath, '.ico') + '.png')
    if (fs.existsSync(cachePng)) return cachePng

    // Defer the heavy nativeImage import to keep the cold path lean.
    const { nativeImage } = await import('electron')
    const image = nativeImage.createFromPath(absImagePath)
    if (image.isEmpty()) {
      logger.warn('avatar_image ICO did not load', { path: absImagePath })
      return undefined
    }
    // 256x256 is plenty for chat avatars (24-32 px) and keeps the file small.
    const resized = image.resize({ width: 256, height: 256 })
    const pngBuffer = resized.toPNG()
    if (!pngBuffer || pngBuffer.length === 0) {
      logger.warn('avatar_image PNG conversion produced empty buffer', { path: absImagePath })
      return undefined
    }
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(cachePng, pngBuffer)
    return cachePng
  } catch (error) {
    logger.warn('avatar_image conversion failed', {
      path: absImagePath,
      error: error instanceof Error ? error.message : String(error)
    })
    return undefined
  }
}

// No `description` here: the builtin agent's display/search description is owned by i18n
// (`agent.builtin.cherry_assistant.description`), not the bundle — a bundle copy would be a
// drift-prone second source of truth.
export interface BuiltinAgentDefinition {
  name?: string
  instructions?: string
  configuration?: Record<string, unknown>
  skills?: string[]
}

interface BuiltinAssistantDefaults {
  name: string
  configuration: AgentConfiguration
}

/** Resolve a localized field: string passes through; locale-keyed object resolves by language. */
function resolveLocalizedField(value: unknown, language: string): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) return undefined

  const map = value as Record<string, string>
  const prefix = language.split('-')[0]
  const prefixKey = Object.keys(map).find((key) => key.startsWith(prefix))

  return map[language] || (prefixKey && map[prefixKey]) || map['en-US'] || Object.values(map)[0]
}

export function getBuiltinAgentTemplateDirectory(builtinRole: string): string | undefined {
  const templateName = TEMPLATE_NAME_BY_ROLE[builtinRole]
  if (!templateName) {
    logger.warn('Unknown builtin role, skipping provisioning', { builtinRole })
    return undefined
  }

  return path.join(application.getPath('feature.agents.builtin'), templateName)
}

export async function loadBuiltinAgentDefinition(
  builtinRole: string,
  language: string = getAppLanguage()
): Promise<BuiltinAgentDefinition | undefined> {
  const templateDir = getBuiltinAgentTemplateDirectory(builtinRole)
  if (!templateDir) return undefined

  const agentJsonPath = path.join(templateDir, 'agent.json')
  if (!fs.existsSync(agentJsonPath)) {
    logger.error('Builtin agent definition not found', { agentJsonPath, builtinRole })
    return undefined
  }

  try {
    const agentConfig = JSON.parse(fs.readFileSync(agentJsonPath, 'utf-8'))
    if (
      agentConfig.skills !== undefined &&
      (!Array.isArray(agentConfig.skills) || agentConfig.skills.some((skill: unknown) => typeof skill !== 'string'))
    ) {
      throw new Error('Builtin agent skills must be a string array')
    }
    // Resolve avatar_image relative to the builtin template directory so the
    // renderer can hand the absolute path straight to <img src="file://...">.
    // Falls back to the raw string if absolute already; if no avatar_image is set,
    // we leave configuration untouched.
    let resolvedAvatarImage: string | undefined
    if (agentConfig.configuration && typeof agentConfig.configuration.avatar_image === 'string') {
      const raw = agentConfig.configuration.avatar_image.trim()
      if (raw) {
        const absPath = path.isAbsolute(raw) ? raw : path.join(templateDir, raw)
        resolvedAvatarImage = await convertIconToPngIfNeeded(absPath)
      }
    }
    const configuration =
      agentConfig.configuration && resolvedAvatarImage
        ? { ...agentConfig.configuration, avatar_image: resolvedAvatarImage }
        : agentConfig.configuration
    return {
      name: resolveLocalizedField(agentConfig.name, language),
      instructions: resolveLocalizedField(agentConfig.instructions, language),
      configuration,
      skills: agentConfig.skills
    }
  } catch (error) {
    logger.error('Failed to load builtin agent definition', {
      builtinRole,
      agentJsonPath,
      error: error instanceof Error ? error.message : String(error)
    })
    return undefined
  }
}

export async function loadBuiltinAssistantDefaults(language?: string): Promise<BuiltinAssistantDefaults> {
  const definition = await loadBuiltinAgentDefinition('assistant', language)
  if (!definition) {
    throw new Error('Cherry Assistant package definition is unavailable')
  }

  const { data: configuration, invalidKeys } = sanitizeAgentConfiguration(definition.configuration)
  if (!configuration || invalidKeys.length > 0) {
    throw new Error(`Cherry Assistant package configuration is invalid: ${invalidKeys.join(', ') || '<root>'}`)
  }

  return {
    name: definition.name?.trim() || 'Cherry Assistant',
    configuration: { ...configuration, builtin_role: 'assistant' }
  }
}
