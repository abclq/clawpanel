import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHermesProviderOverridesConfigValues,
  mergeHermesProviderOverridesConfig,
} from '../scripts/dev-api.js'

test('Hermes provider 覆盖配置读取会提供空对象默认值', () => {
  const values = buildHermesProviderOverridesConfigValues({})

  assert.deepEqual(values, {
    providerOverridesJson: '{}',
  })
})

test('Hermes provider 覆盖配置读取会格式化上游超时结构', () => {
  const values = buildHermesProviderOverridesConfigValues({
    providers: {
      'ollama-local': {
        request_timeout_seconds: 300,
        stale_timeout_seconds: 900,
      },
      anthropic: {
        request_timeout_seconds: 30,
        models: {
          'claude-opus-4.6': {
            timeout_seconds: 600,
          },
        },
      },
    },
  })
  const mapping = JSON.parse(values.providerOverridesJson)

  assert.deepEqual(mapping['ollama-local'], {
    request_timeout_seconds: 300,
    stale_timeout_seconds: 900,
  })
  assert.deepEqual(mapping.anthropic.models['claude-opus-4.6'], {
    timeout_seconds: 600,
  })
})

test('Hermes provider 覆盖配置保存会保留未知字段并写入 providers', () => {
  const next = mergeHermesProviderOverridesConfig({
    model: { provider: 'openrouter' },
    providers: {
      anthropic: {
        request_timeout_seconds: 30,
        custom_flag: 'keep-provider',
        models: {
          'claude-opus-4.6': {
            timeout_seconds: 600,
            custom_flag: 'keep-model',
          },
        },
      },
    },
    openrouter: { response_cache: true },
  }, {
    providerOverridesJson: JSON.stringify({
      anthropic: {
        request_timeout_seconds: 45,
        stale_timeout_seconds: 300,
        custom_flag: 'keep-provider',
        models: {
          'claude-opus-4.6': {
            timeout_seconds: 900,
            stale_timeout_seconds: 1200,
            custom_flag: 'keep-model',
          },
        },
      },
      'openai-codex': {
        models: {
          'gpt-5.4': {
            stale_timeout_seconds: 1800,
          },
        },
      },
    }),
  })

  assert.deepEqual(next.model, { provider: 'openrouter' })
  assert.deepEqual(next.openrouter, { response_cache: true })
  assert.equal(next.providers.anthropic.request_timeout_seconds, 45)
  assert.equal(next.providers.anthropic.stale_timeout_seconds, 300)
  assert.equal(next.providers.anthropic.custom_flag, 'keep-provider')
  assert.equal(next.providers.anthropic.models['claude-opus-4.6'].timeout_seconds, 900)
  assert.equal(next.providers.anthropic.models['claude-opus-4.6'].stale_timeout_seconds, 1200)
  assert.equal(next.providers.anthropic.models['claude-opus-4.6'].custom_flag, 'keep-model')
  assert.equal(next.providers['openai-codex'].models['gpt-5.4'].stale_timeout_seconds, 1800)
})

test('Hermes provider 覆盖配置保存空对象会移除 providers', () => {
  const next = mergeHermesProviderOverridesConfig({
    providers: {
      anthropic: { request_timeout_seconds: 30 },
    },
    streaming: { enabled: true },
  }, {
    providerOverridesJson: '{}',
  })

  assert.equal(next.providers, undefined)
  assert.deepEqual(next.streaming, { enabled: true })
})

test('Hermes provider 覆盖配置保存会拒绝非法 JSON、名称和超时', () => {
  assert.throws(
    () => mergeHermesProviderOverridesConfig({}, { providerOverridesJson: '[' }),
    /providers JSON/,
  )
  assert.throws(
    () => mergeHermesProviderOverridesConfig({}, { providerOverridesJson: JSON.stringify({ 'bad provider': { request_timeout_seconds: 30 } }) }),
    /providers\.bad provider/,
  )
  assert.throws(
    () => mergeHermesProviderOverridesConfig({}, { providerOverridesJson: JSON.stringify({ anthropic: { request_timeout_seconds: 0 } }) }),
    /providers\.anthropic\.request_timeout_seconds/,
  )
  assert.throws(
    () => mergeHermesProviderOverridesConfig({}, { providerOverridesJson: JSON.stringify({ anthropic: { models: { '../secret': { timeout_seconds: 30 } } } }) }),
    /providers\.anthropic\.models\.\.\.\/secret/,
  )
  assert.throws(
    () => mergeHermesProviderOverridesConfig({}, { providerOverridesJson: JSON.stringify({ anthropic: { models: { opus: { timeout_seconds: 'slow' } } } }) }),
    /providers\.anthropic\.models\.opus\.timeout_seconds/,
  )
})
