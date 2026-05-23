import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHermesSessionRuntimeConfigValues,
  mergeHermesSessionRuntimeConfig,
} from '../scripts/dev-api.js'

test('Hermes 会话运行时配置读取会提供稳定表单默认值', () => {
  const values = buildHermesSessionRuntimeConfigValues({})

  assert.deepEqual(values, {
    sessionResetMode: 'both',
    idleMinutes: 1440,
    atHour: 4,
    groupSessionsPerUser: true,
    threadSessionsPerUser: false,
  })
})

test('Hermes 会话运行时配置读取会回显 session_reset 与隔离开关', () => {
  const values = buildHermesSessionRuntimeConfigValues({
    session_reset: {
      mode: 'daily',
      idle_minutes: 720,
      at_hour: 3,
    },
    group_sessions_per_user: false,
    thread_sessions_per_user: true,
  })

  assert.equal(values.sessionResetMode, 'daily')
  assert.equal(values.idleMinutes, 720)
  assert.equal(values.atHour, 3)
  assert.equal(values.groupSessionsPerUser, false)
  assert.equal(values.threadSessionsPerUser, true)
})

test('Hermes 会话运行时配置保存会保留无关 YAML 并写入 snake_case 字段', () => {
  const next = mergeHermesSessionRuntimeConfig({
    model: { provider: 'anthropic', default: 'claude-sonnet-4-6' },
    session_reset: {
      mode: 'idle',
      idle_minutes: 60,
      custom_flag: 'keep-me',
    },
    streaming: { enabled: true },
  }, {
    sessionResetMode: 'both',
    idleMinutes: '90',
    atHour: '6',
    groupSessionsPerUser: false,
    threadSessionsPerUser: true,
  })

  assert.deepEqual(next.model, { provider: 'anthropic', default: 'claude-sonnet-4-6' })
  assert.deepEqual(next.streaming, { enabled: true })
  assert.equal(next.session_reset.mode, 'both')
  assert.equal(next.session_reset.idle_minutes, 90)
  assert.equal(next.session_reset.at_hour, 6)
  assert.equal(next.session_reset.custom_flag, 'keep-me')
  assert.equal(next.group_sessions_per_user, false)
  assert.equal(next.thread_sessions_per_user, true)
})

test('Hermes 会话运行时配置保存会拒绝非法模式和范围', () => {
  assert.throws(
    () => mergeHermesSessionRuntimeConfig({}, { sessionResetMode: 'weekly' }),
    /session_reset\.mode/,
  )
  assert.throws(
    () => mergeHermesSessionRuntimeConfig({}, { idleMinutes: '0' }),
    /idle_minutes/,
  )
  assert.throws(
    () => mergeHermesSessionRuntimeConfig({}, { atHour: '24' }),
    /at_hour/,
  )
})
