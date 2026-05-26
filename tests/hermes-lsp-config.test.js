import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHermesLspConfigValues,
  mergeHermesLspConfig,
} from '../scripts/dev-api.js'

test('Hermes LSP 配置读取会提供上游默认值', () => {
  const values = buildHermesLspConfigValues({})

  assert.deepEqual(values, {
    lspEnabled: true,
    lspWaitMode: 'document',
    lspWaitTimeout: 5,
    lspInstallStrategy: 'auto',
  })
})

test('Hermes LSP 配置读取会回显 YAML 字段并保留复杂 servers 给 raw YAML', () => {
  const values = buildHermesLspConfigValues({
    lsp: {
      enabled: false,
      wait_mode: 'full',
      wait_timeout: 12.5,
      install_strategy: 'manual',
      servers: {
        pyright: {
          disabled: true,
        },
      },
    },
  })

  assert.equal(values.lspEnabled, false)
  assert.equal(values.lspWaitMode, 'full')
  assert.equal(values.lspWaitTimeout, 12.5)
  assert.equal(values.lspInstallStrategy, 'manual')
})

test('Hermes LSP 配置保存会保留未知字段并写入上游结构', () => {
  const next = mergeHermesLspConfig({
    model: { provider: 'anthropic' },
    lsp: {
      enabled: false,
      wait_mode: 'full',
      wait_timeout: 12.5,
      install_strategy: 'manual',
      servers: {
        pyright: {
          disabled: true,
        },
      },
      custom_flag: 'keep-lsp',
    },
    streaming: { enabled: true },
  }, {
    lspEnabled: true,
    lspWaitMode: 'document',
    lspWaitTimeout: 7.5,
    lspInstallStrategy: 'off',
  })

  assert.deepEqual(next.model, { provider: 'anthropic' })
  assert.deepEqual(next.streaming, { enabled: true })
  assert.equal(next.lsp.enabled, true)
  assert.equal(next.lsp.wait_mode, 'document')
  assert.equal(next.lsp.wait_timeout, 7.5)
  assert.equal(next.lsp.install_strategy, 'off')
  assert.deepEqual(next.lsp.servers, { pyright: { disabled: true } })
  assert.equal(next.lsp.custom_flag, 'keep-lsp')
})

test('Hermes LSP 配置保存会拒绝非法枚举和超时', () => {
  assert.throws(
    () => mergeHermesLspConfig({}, { lspWaitMode: 'workspace' }),
    /lsp\.wait_mode/,
  )
  assert.throws(
    () => mergeHermesLspConfig({}, { lspInstallStrategy: 'unsafe' }),
    /lsp\.install_strategy/,
  )
  assert.throws(
    () => mergeHermesLspConfig({}, { lspWaitTimeout: 0 }),
    /lsp\.wait_timeout/,
  )
  assert.throws(
    () => mergeHermesLspConfig({}, { lspWaitTimeout: 120.5 }),
    /lsp\.wait_timeout/,
  )
})
