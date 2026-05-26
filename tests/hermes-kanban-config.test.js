import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHermesKanbanConfigValues,
  mergeHermesKanbanConfig,
} from '../scripts/dev-api.js'

test('Hermes Kanban 配置读取会提供上游默认值', () => {
  const values = buildHermesKanbanConfigValues({})

  assert.deepEqual(values, {
    dispatchInGateway: true,
    dispatchIntervalSeconds: 60,
    maxSpawn: 0,
    maxInProgress: 0,
    failureLimit: 2,
    autoDecompose: true,
    autoDecomposePerTick: 3,
    workerLogRotateBytes: 2097152,
    workerLogBackupCount: 1,
    orchestratorProfile: '',
    defaultAssignee: '',
    dispatchStaleTimeoutSeconds: 14400,
  })
})

test('Hermes Kanban 配置读取会规范化已有字段', () => {
  const values = buildHermesKanbanConfigValues({
    kanban: {
      dispatch_in_gateway: false,
      dispatch_interval_seconds: '120',
      max_spawn: '4',
      max_in_progress: '6',
      failure_limit: '5',
      auto_decompose: false,
      auto_decompose_per_tick: '7',
      worker_log_rotate_bytes: '4194304',
      worker_log_backup_count: '3',
      orchestrator_profile: 'triage',
      default_assignee: 'builder',
      dispatch_stale_timeout_seconds: '7200',
    },
  })

  assert.equal(values.dispatchInGateway, false)
  assert.equal(values.dispatchIntervalSeconds, 120)
  assert.equal(values.maxSpawn, 4)
  assert.equal(values.maxInProgress, 6)
  assert.equal(values.failureLimit, 5)
  assert.equal(values.autoDecompose, false)
  assert.equal(values.autoDecomposePerTick, 7)
  assert.equal(values.workerLogRotateBytes, 4194304)
  assert.equal(values.workerLogBackupCount, 3)
  assert.equal(values.orchestratorProfile, 'triage')
  assert.equal(values.defaultAssignee, 'builder')
  assert.equal(values.dispatchStaleTimeoutSeconds, 7200)
})

test('Hermes Kanban 配置保存会保留未知 YAML 并写入 kanban', () => {
  const next = mergeHermesKanbanConfig({
    model: { provider: 'anthropic' },
    kanban: {
      dispatch_interval_seconds: 30,
      max_spawn: 9,
      max_in_progress: 11,
      custom_flag: 'keep-me',
    },
    memory: { memory_enabled: true },
  }, {
    dispatchInGateway: false,
    dispatchIntervalSeconds: '15',
    maxSpawn: '4',
    maxInProgress: '6',
    failureLimit: '4',
    autoDecompose: false,
    autoDecomposePerTick: '2',
    workerLogRotateBytes: '1048576',
    workerLogBackupCount: '0',
    orchestratorProfile: 'triage',
    defaultAssignee: 'builder',
    dispatchStaleTimeoutSeconds: '0',
  })

  assert.deepEqual(next.model, { provider: 'anthropic' })
  assert.deepEqual(next.memory, { memory_enabled: true })
  assert.equal(next.kanban.custom_flag, 'keep-me')
  assert.equal(next.kanban.dispatch_in_gateway, false)
  assert.equal(next.kanban.dispatch_interval_seconds, 15)
  assert.equal(next.kanban.max_spawn, 4)
  assert.equal(next.kanban.max_in_progress, 6)
  assert.equal(next.kanban.failure_limit, 4)
  assert.equal(next.kanban.auto_decompose, false)
  assert.equal(next.kanban.auto_decompose_per_tick, 2)
  assert.equal(next.kanban.worker_log_rotate_bytes, 1048576)
  assert.equal(next.kanban.worker_log_backup_count, 0)
  assert.equal(next.kanban.orchestrator_profile, 'triage')
  assert.equal(next.kanban.default_assignee, 'builder')
  assert.equal(next.kanban.dispatch_stale_timeout_seconds, 0)
})

test('Hermes Kanban profile 路由保存为空会移除可选字段', () => {
  const next = mergeHermesKanbanConfig({
    kanban: {
      orchestrator_profile: 'triage',
      default_assignee: 'builder',
      custom_flag: 'keep-me',
    },
  }, {
    orchestratorProfile: '   ',
    defaultAssignee: '',
  })

  assert.equal(next.kanban.custom_flag, 'keep-me')
  assert.equal(Object.hasOwn(next.kanban, 'orchestrator_profile'), false)
  assert.equal(Object.hasOwn(next.kanban, 'default_assignee'), false)
})

test('Hermes Kanban 并发上限保存为 0 会移除可选限制字段', () => {
  const next = mergeHermesKanbanConfig({
    kanban: {
      max_spawn: 4,
      max_in_progress: 6,
      custom_flag: 'keep-me',
    },
  }, {
    maxSpawn: '0',
    maxInProgress: '0',
  })

  assert.equal(next.kanban.custom_flag, 'keep-me')
  assert.equal(Object.hasOwn(next.kanban, 'max_spawn'), false)
  assert.equal(Object.hasOwn(next.kanban, 'max_in_progress'), false)
})

test('Hermes Kanban 配置保存会拒绝非法调度参数', () => {
  assert.throws(
    () => mergeHermesKanbanConfig({}, { dispatchIntervalSeconds: '0' }),
    /kanban\.dispatch_interval_seconds/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { failureLimit: '0' }),
    /kanban\.failure_limit/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { maxSpawn: '-1' }),
    /kanban\.max_spawn/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { maxInProgress: '-1' }),
    /kanban\.max_in_progress/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { autoDecomposePerTick: '0' }),
    /kanban\.auto_decompose_per_tick/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { workerLogRotateBytes: '0' }),
    /kanban\.worker_log_rotate_bytes/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { workerLogBackupCount: '-1' }),
    /kanban\.worker_log_backup_count/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { orchestratorProfile: 123 }),
    /kanban\.orchestrator_profile/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { defaultAssignee: false }),
    /kanban\.default_assignee/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { dispatchStaleTimeoutSeconds: '-1' }),
    /kanban\.dispatch_stale_timeout_seconds/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { dispatchStaleTimeoutSeconds: '604801' }),
    /kanban\.dispatch_stale_timeout_seconds/,
  )
  assert.throws(
    () => mergeHermesKanbanConfig({}, { dispatchStaleTimeoutSeconds: '12.5' }),
    /kanban\.dispatch_stale_timeout_seconds/,
  )
})
