/**
 * 统一模型渠道 — 共享逻辑
 *
 * 渠道是唯一维护入口（Base URL + API Key + 模型列表），通过显式同步推送到
 * OpenClaw / Hermes / 晴辰助手。同步全部组合现有 API 完成：
 * - OpenClaw：read/write_openclaw_config（后端自带备份，合并保留未知字段）
 * - Hermes：hermes_env_set（写 .env）+ hermes_model_config_save（自带备份）
 * - 助手：一次性拷贝到 localStorage（clawpanel-assistant）
 * 本模块自身不直接写任何引擎配置文件。
 */
import { api } from './tauri-api.js'

export const ASSISTANT_STORAGE_KEY = 'clawpanel-assistant'

/**
 * 渠道 apiType → Hermes 回退 provider id（已按内核注册表逐一核对）：
 * - openai-completions → 'custom'（Custom OpenAI-Compatible：OPENAI_BASE_URL + OPENAI_API_KEY，
 *   覆盖官方 OpenAI、聚合网关、NewAPI、本地 Ollama 等一切 OpenAI 兼容端点）
 * - anthropic-messages → 'anthropic'（ANTHROPIC_API_KEY）
 * - google-generative-ai → 'gemini'（内核经 OpenAI 兼容端点接入 Gemini，GOOGLE_API_KEY）
 * 仅 API Key 型可同步；OAuth / 云 SDK 型仍走 Hermes 向导。
 */
export const HERMES_TARGET_MAP = {
  'openai-completions': { fallbackProvider: 'custom' },
  'anthropic-messages': { fallbackProvider: 'anthropic' },
  'google-generative-ai': { fallbackProvider: 'gemini' },
}

/** 晴辰助手支持的 apiType 族（见 assistant.js normalizeApiType） */
export const ASSISTANT_SUPPORTED_API_TYPES = [
  'openai-completions', 'anthropic-messages', 'google-generative-ai', 'ollama',
]

export function hermesSyncSupported(channel) {
  return Boolean(HERMES_TARGET_MAP[channel?.apiType])
}

export function assistantSyncSupported(channel) {
  return ASSISTANT_SUPPORTED_API_TYPES.includes(channel?.apiType)
}

/**
 * 渠道内容指纹（djb2）：基于脱敏字段计算，用于「已同步 / 有未同步变更」徽标。
 * apiKeyMask 参与计算 —— Key 更换时掩码随之变化。
 */
export function channelFingerprint(channel) {
  const src = JSON.stringify([
    channel?.name || '',
    channel?.baseUrl || '',
    channel?.apiType || '',
    channel?.apiKeyMask || '',
    (channel?.models || []).map(m => m.id),
    channel?.defaultModel || '',
  ])
  let hash = 5381
  for (let i = 0; i < src.length; i += 1) {
    hash = ((hash << 5) + hash + src.charCodeAt(i)) >>> 0
  }
  return hash.toString(16)
}

/** OpenClaw providers 键：优先预设 key，否则由名称生成 slug */
export function channelProviderKey(channel) {
  const preset = String(channel?.presetKey || '').trim()
  if (preset) return preset
  const slug = String(channel?.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `channel-${channel?.id || ''}`
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/**
 * 同步到 OpenClaw：只 upsert 渠道对应的 models.providers.{key}，
 * 展开旧对象保留未知字段；渠道模型为准但保留目标已有模型的测试元数据。
 */
export async function syncChannelToOpenclaw(channel, { setDefault = false } = {}) {
  const apiKey = await api.revealModelChannelKey(channel.id)
  const config = asObject(await api.readOpenclawConfig())
  config.models = asObject(config.models)
  config.models.providers = asObject(config.models.providers)
  const providerKey = channelProviderKey(channel)
  const existing = asObject(config.models.providers[providerKey])
  const existingModels = Array.isArray(existing.models) ? existing.models : []

  // 内核 ModelDefinitionSchema 为 strict 且 id/name 必填（zod-schema.core.ts）：
  // 恒写完整对象、name 缺省回退为 id，不写裸字符串；保留目标已有条目的
  // cost/reasoning 等扩展元数据（展开 prevObj）
  const models = (channel.models || []).map(model => {
    const prev = existingModels.find(e => (typeof e === 'string' ? e : e?.id) === model.id)
    const prevObj = prev && typeof prev === 'object' ? prev : {}
    const merged = {
      ...prevObj,
      id: model.id,
      name: model.name || prevObj.name || model.id,
    }
    if (model.contextWindow) merged.contextWindow = model.contextWindow
    return merged
  })

  config.models.providers[providerKey] = {
    ...existing,
    baseUrl: channel.baseUrl,
    api: channel.apiType,
    apiKey,
    models,
  }

  if (setDefault && channel.defaultModel) {
    config.agents = asObject(config.agents)
    config.agents.defaults = asObject(config.agents.defaults)
    config.agents.defaults.model = {
      ...asObject(config.agents.defaults.model),
      primary: `${providerKey}/${channel.defaultModel}`,
    }
  }

  await api.writeOpenclawConfig(config)
  return { providerKey, modelCount: models.length }
}

/** 解析渠道对应的 Hermes provider（API Key 型；预设命中优先，否则用核对过的回退 id），不支持返回 null */
export async function resolveHermesTarget(channel) {
  const mapping = HERMES_TARGET_MAP[channel?.apiType]
  if (!mapping) return null
  const raw = await api.hermesListProviders().catch(() => null)
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.providers) ? raw.providers : [])
  const usable = p => p
    && p.authType === 'api_key'
    && Array.isArray(p.apiKeyEnvVars) && p.apiKeyEnvVars.length > 0
  const byPreset = list.find(p => p.id === String(channel?.presetKey || '') && usable(p))
  const fallback = list.find(p => p.id === mapping.fallbackProvider && usable(p))
  return byPreset || fallback || null
}

/**
 * 同步到 Hermes：API Key 写入对应环境变量（Hermes .env），
 * OpenAI 兼容渠道的自定义 Base URL 写 baseUrlEnvVar；可选设为默认模型（config.yaml，自带备份）。
 */
export async function syncChannelToHermes(channel, { setDefault = false } = {}) {
  const target = await resolveHermesTarget(channel)
  if (!target) throw new Error('unsupported')
  const apiKey = await api.revealModelChannelKey(channel.id)
  if (!apiKey) throw new Error('no-key')

  // 仅 OpenAI 兼容渠道写自定义端点：anthropic / gemini 在 Hermes 侧走各自的
  // transport 专用端点，渠道里的原生 API 地址格式不一定一致，误写会破坏请求。
  // Provider Key/Base URL/默认模型由后端单个事务命令更新，避免通用 env
  // 编辑器拒绝受管 Key，也避免多步写入留下半同步状态。
  const targetBase = String(target.baseUrl || '').replace(/\/+$/, '')
  const baseUrlDiffers = channel.apiType === 'openai-completions'
    && Boolean(channel.baseUrl) && channel.baseUrl !== targetBase
  return api.hermesSyncProvider({
    provider: target.id,
    apiKey,
    baseUrl: baseUrlDiffers ? channel.baseUrl : '',
    model: channel.defaultModel || '',
    setDefault: Boolean(setDefault && channel.defaultModel),
  })
}

/**
 * 同步到晴辰助手：一次性拷贝接入信息（渠道后续变更需再次同步）。
 * apiKey 由调用方 reveal 后传入，避免本模块内多次取明文。
 */
export function syncChannelToAssistant(channel, apiKey, model = '') {
  let config = {}
  try {
    config = JSON.parse(localStorage.getItem(ASSISTANT_STORAGE_KEY) || '{}') || {}
  } catch {
    config = {}
  }
  config.baseUrl = channel.baseUrl
  config.apiKey = apiKey
  config.model = model || channel.defaultModel || config.model || ''
  config.apiType = channel.apiType
  localStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(config))
  return { model: config.model }
}

/** 从 OpenClaw 现有 providers 生成渠道（跳过已按 presetKey 存在的），用于冷启动导入 */
export async function importChannelsFromOpenclaw(existingChannels = []) {
  const config = await api.readOpenclawConfig().catch(() => null)
  const providers = asObject(asObject(config?.models).providers)
  const taken = new Set(existingChannels.map(c => c.presetKey).filter(Boolean))
  const imported = []
  for (const [key, provider] of Object.entries(providers)) {
    if (!provider || typeof provider !== 'object' || taken.has(key)) continue
    const models = (Array.isArray(provider.models) ? provider.models : [])
      .map(m => (typeof m === 'string' ? { id: m } : { id: String(m?.id || '').trim(), name: m?.name }))
      .filter(m => m.id)
    imported.push({
      id: `ch-${key}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      name: key,
      presetKey: key,
      baseUrl: String(provider.baseUrl || '').trim().replace(/\/+$/, ''),
      apiType: String(provider.api || 'openai-completions').trim(),
      apiKey: String(provider.apiKey || ''),
      models,
      defaultModel: '',
      enabled: true,
    })
  }
  return imported
}
