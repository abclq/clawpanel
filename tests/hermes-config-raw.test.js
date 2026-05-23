import test from 'node:test'
import assert from 'node:assert/strict'

import { validateHermesConfigYamlText } from '../scripts/dev-api.js'

test('Hermes 原始配置保存前会拒绝无效 YAML', () => {
  assert.throws(
    () => validateHermesConfigYamlText('model:\n  default: gpt-4o\n    provider: openai\n'),
    /config\.yaml YAML 格式错误/,
  )
})

test('Hermes 原始配置保存前会拒绝非对象顶层 YAML', () => {
  assert.throws(
    () => validateHermesConfigYamlText('- model\n- display\n'),
    /config\.yaml 顶层必须是对象/,
  )
})

test('Hermes 原始配置保存前允许空内容与对象顶层 YAML', () => {
  assert.deepEqual(validateHermesConfigYamlText(''), {})
  assert.deepEqual(validateHermesConfigYamlText('model:\n  default: gpt-4o\n'), {
    model: { default: 'gpt-4o' },
  })
})
