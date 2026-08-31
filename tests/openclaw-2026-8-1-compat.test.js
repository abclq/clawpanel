import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  addAgentConfig,
  ensureAgentRoster,
  ensureMutableAgentConfig,
  listAgentConfigs,
  removeAgentConfig,
  supportsAgentEntries,
} from '../src/lib/openclaw-agent-roster.js'
import { syncExplicitModelPolicyAllow } from '../src/lib/openclaw-model-policy.js'
import { stripRetiredOpenclawFields, stripUiFields } from '../scripts/dev-api.js'

const webBackend = readFileSync(new URL('../scripts/dev-api.js', import.meta.url), 'utf8')
const desktopAgents = readFileSync(new URL('../src-tauri/src/commands/agent.rs', import.meta.url), 'utf8')
const desktopConfig = readFileSync(new URL('../src-tauri/src/commands/config.rs', import.meta.url), 'utf8')
const featureCatalog = readFileSync(new URL('../src/lib/feature-catalog.js', import.meta.url), 'utf8')

test('OpenClaw 2026.8.1 使用 keyed agents.entries，7.1 仍保留 agents.list', () => {
  assert.equal(supportsAgentEntries('2026.8.1'), true)
  assert.equal(supportsAgentEntries('2026.8.1-zh.1'), true)
  assert.equal(supportsAgentEntries('2026.7.1-2-zh.1'), false)

  const official = { agents: { defaults: {} } }
  assert.equal(ensureAgentRoster(official, '2026.8.1'), 'entries')
  assert.deepEqual(official.agents.entries, { main: {} })
  assert.equal(official.agents.list, undefined)

  const chinese = { agents: { defaults: {} } }
  assert.equal(ensureAgentRoster(chinese, '2026.7.1-2-zh.1'), 'list')
  assert.deepEqual(chinese.agents.list, [])
  assert.equal(chinese.agents.entries, undefined)
})

test('8.1 Agent 增删改保持 canonical keyed 形状、ownership 并清理失效引用', () => {
  const config = {
    agents: {
      entries: { main: { name: 'Main' } },
      defaults: {
        heartbeat: { agentId: 'worker', every: '30m' },
        systemAgent: { agentId: 'WORKER' },
      },
    },
    bindings: [
      { agentId: 'worker', match: { channel: 'telegram' } },
      { agentId: 'main', match: { channel: 'discord' } },
    ],
  }
  addAgentConfig(config, 'Worker', { id: 'forbidden-inline-id', workspace: '/tmp/worker' })

  assert.deepEqual(listAgentConfigs(config).map(agent => agent.id), ['main', 'worker'])
  assert.equal(config.agents.ownership, 'explicit')
  assert.equal(config.agents.entries.worker.id, undefined)
  assert.equal(config.agents.entries.worker.workspace, '/tmp/worker')

  const worker = ensureMutableAgentConfig(config, 'worker')
  worker.model = { primary: 'openai/gpt-5.5' }
  assert.deepEqual(config.agents.entries.worker.model, { primary: 'openai/gpt-5.5' })

  assert.equal(removeAgentConfig(config, 'worker'), true)
  assert.equal(config.agents.ownership, 'explicit')
  assert.deepEqual(config.agents.entries, { main: { name: 'Main' } })
  assert.deepEqual(config.agents.defaults.heartbeat, { every: '30m' })
  assert.equal(config.agents.defaults.systemAgent, undefined)
  assert.deepEqual(config.bindings, [{ agentId: 'main', match: { channel: 'discord' } }])
})

test('旧版 Agent 写入继续保留 list，避免破坏尚未升级的汉化内核', () => {
  const config = { agents: { list: [{ id: 'main' }] } }
  addAgentConfig(config, 'worker', { workspace: '/tmp/worker' }, { installedVersion: '2026.8.1' })
  assert.deepEqual(config.agents.list.map(agent => agent.id), ['main', 'worker'])
  assert.equal(config.agents.entries, undefined)
})

test('配置清理覆盖 entries 且移除 8.1 禁止的内嵌 id', () => {
  const config = {
    agents: {
      entries: {
        main: { id: 'main', current: 'ui-only', name: 'keep' },
      },
    },
  }
  stripUiFields(config)
  assert.deepEqual(config.agents.entries.main, { name: 'keep' })
})

test('8.1 写入会移除退役字段，7.1 配置保持原样', () => {
  const legacy = {
    commands: { ownerDisplay: 'raw', ownerDisplaySecret: 'keep-on-7-1' },
    gateway: { controlUi: { allowInsecureAuth: true } },
  }
  const official = structuredClone(legacy)
  stripRetiredOpenclawFields(official, '2026.8.1')
  assert.deepEqual(official, { commands: {}, gateway: { controlUi: {} } })

  const chinese = structuredClone(legacy)
  stripRetiredOpenclawFields(chinese, '2026.7.1-2-zh.1')
  assert.deepEqual(chinese, legacy)
})

test('8.1 显式模型策略随面板候选模型同步，allow-any 配置不被收紧', () => {
  const restricted = {
    models: { 'openai/gpt-5.5': {}, 'lmstudio/qwen': {} },
    modelPolicy: { allow: ['stale/model'] },
  }
  assert.equal(syncExplicitModelPolicyAllow(restricted), true)
  assert.deepEqual(restricted.modelPolicy.allow, ['openai/gpt-5.5', 'lmstudio/qwen'])

  const allowAny = { models: { 'openai/gpt-5.5': {} }, modelPolicy: {} }
  assert.equal(syncExplicitModelPolicyAllow(allowAny), false)
  assert.equal(allowAny.modelPolicy.allow, undefined)
})

test('Web 与桌面后端均声明 8.1 注册表和 doctor 迁移支持', () => {
  assert.match(webBackend, /listAgentConfigs\(cfg\)/)
  assert.match(webBackend, /runOpenclawCaptured\(args\)/)
  assert.match(webBackend, /'doctor', '--fix', '--non-interactive', '--yes'/)
  assert.match(desktopAgents, /fn\s+uses_agent_entries\s*\(/)
  assert.match(desktopAgents, /get\("entries"\)/)
  assert.match(desktopConfig, /OPENCLAW_AGENT_ENTRIES_VERSION_FLOOR:\s*&str\s*=\s*"2026\.8\.1"/)
  assert.match(featureCatalog, /'agents\.keyedEntries'/)
  assert.match(featureCatalog, /'models\.explicitPolicy'/)
  assert.match(featureCatalog, /'doctor\.startupConfigRepair'/)
})
