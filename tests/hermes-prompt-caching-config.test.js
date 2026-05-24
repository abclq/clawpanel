import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHermesPromptCachingConfigValues,
  mergeHermesPromptCachingConfig,
} from '../scripts/dev-api.js'

test('Hermes 提示缓存配置读取会提供上游默认 TTL', () => {
  const values = buildHermesPromptCachingConfigValues({})

  assert.deepEqual(values, {
    promptCacheTtl: '5m',
  })
})

test('Hermes 提示缓存配置读取会规范化 YAML 中的 TTL', () => {
  const values = buildHermesPromptCachingConfigValues({
    prompt_caching: {
      cache_ttl: '1H',
    },
  })

  assert.equal(values.promptCacheTtl, '1h')
})

test('Hermes 提示缓存配置保存会保留无关 YAML 和未知字段', () => {
  const next = mergeHermesPromptCachingConfig({
    model: { provider: 'anthropic' },
    prompt_caching: {
      cache_ttl: '5m',
      custom_flag: 'keep-prompt-cache',
    },
    compression: { enabled: true },
  }, {
    promptCacheTtl: '1h',
  })

  assert.deepEqual(next.model, { provider: 'anthropic' })
  assert.deepEqual(next.compression, { enabled: true })
  assert.equal(next.prompt_caching.cache_ttl, '1h')
  assert.equal(next.prompt_caching.custom_flag, 'keep-prompt-cache')
})

test('Hermes 提示缓存配置保存会拒绝上游不支持的 TTL', () => {
  assert.throws(
    () => mergeHermesPromptCachingConfig({}, { promptCacheTtl: '30m' }),
    /prompt_caching\.cache_ttl/,
  )
})
