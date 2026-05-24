import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHermesUnauthorizedDmConfigValues,
  mergeHermesUnauthorizedDmConfig,
} from '../scripts/dev-api.js'

test('Hermes 未授权 DM 配置读取会提供默认配对策略', () => {
  const values = buildHermesUnauthorizedDmConfigValues({})

  assert.deepEqual(values, {
    unauthorizedDmBehavior: 'pair',
  })
})

test('Hermes 未授权 DM 配置读取会规范化已有策略', () => {
  assert.equal(buildHermesUnauthorizedDmConfigValues({ unauthorized_dm_behavior: 'IGNORE' }).unauthorizedDmBehavior, 'ignore')
  assert.equal(buildHermesUnauthorizedDmConfigValues({ unauthorized_dm_behavior: 'bad' }).unauthorizedDmBehavior, 'pair')
})

test('Hermes 未授权 DM 配置保存会保留无关 YAML 并写入顶层策略', () => {
  const next = mergeHermesUnauthorizedDmConfig({
    model: { provider: 'anthropic' },
    unauthorized_dm_behavior: 'pair',
    platforms: {
      telegram: { enabled: true, custom_flag: 'keep-platform' },
    },
    memory: { memory_enabled: true },
  }, {
    unauthorizedDmBehavior: 'ignore',
  })

  assert.deepEqual(next.model, { provider: 'anthropic' })
  assert.deepEqual(next.memory, { memory_enabled: true })
  assert.deepEqual(next.platforms.telegram, { enabled: true, custom_flag: 'keep-platform' })
  assert.equal(next.unauthorized_dm_behavior, 'ignore')
})

test('Hermes 未授权 DM 配置保存会拒绝非法策略', () => {
  assert.throws(
    () => mergeHermesUnauthorizedDmConfig({}, { unauthorizedDmBehavior: 'silent' }),
    /unauthorized_dm_behavior/,
  )
})
