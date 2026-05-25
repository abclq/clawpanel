import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHermesOpenrouterCacheConfigValues,
  mergeHermesOpenrouterCacheConfig,
} from '../scripts/dev-api.js'

test('Hermes OpenRouter 响应缓存配置读取会提供上游默认值', () => {
  const values = buildHermesOpenrouterCacheConfigValues({})

  assert.deepEqual(values, {
    openrouterResponseCache: true,
    openrouterResponseCacheTtl: 300,
  })
})

test('Hermes OpenRouter 响应缓存配置读取会回显 YAML 字段', () => {
  const values = buildHermesOpenrouterCacheConfigValues({
    openrouter: {
      response_cache: false,
      response_cache_ttl: 900,
    },
  })

  assert.equal(values.openrouterResponseCache, false)
  assert.equal(values.openrouterResponseCacheTtl, 900)
})

test('Hermes OpenRouter 响应缓存配置保存会保留未知字段并写入上游结构', () => {
  const next = mergeHermesOpenrouterCacheConfig({
    model: { provider: 'openrouter' },
    streaming: { enabled: true },
    openrouter: {
      response_cache: false,
      response_cache_ttl: 900,
      custom_flag: 'keep-openrouter',
    },
  }, {
    openrouterResponseCache: true,
    openrouterResponseCacheTtl: '600',
  })

  assert.deepEqual(next.model, { provider: 'openrouter' })
  assert.deepEqual(next.streaming, { enabled: true })
  assert.equal(next.openrouter.response_cache, true)
  assert.equal(next.openrouter.response_cache_ttl, 600)
  assert.equal(next.openrouter.custom_flag, 'keep-openrouter')
})

test('Hermes OpenRouter 响应缓存配置保存会拒绝非法 TTL', () => {
  for (const ttl of ['0', '86401', '1.5']) {
    assert.throws(
      () => mergeHermesOpenrouterCacheConfig({}, { openrouterResponseCacheTtl: ttl }),
      /openrouter\.response_cache_ttl/,
    )
  }
})
