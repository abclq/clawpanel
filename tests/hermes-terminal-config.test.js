import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHermesTerminalConfigValues,
  mergeHermesTerminalConfig,
} from '../scripts/dev-api.js'

test('Hermes 终端执行配置读取会提供上游默认值', () => {
  const values = buildHermesTerminalConfigValues({})

  assert.deepEqual(values, {
    terminalBackend: 'local',
    terminalCwd: '.',
    terminalTimeout: 180,
    terminalLifetimeSeconds: 300,
    terminalDockerMountCwdToWorkspace: false,
    terminalDockerRunAsHostUser: false,
    terminalContainerCpu: 1,
    terminalContainerMemory: 5120,
    terminalContainerDisk: 51200,
    terminalContainerPersistent: true,
  })
})

test('Hermes 终端执行配置读取会回显 YAML 字段', () => {
  const values = buildHermesTerminalConfigValues({
    terminal: {
      backend: 'docker',
      cwd: '/workspace',
      timeout: 600,
      lifetime_seconds: 1800,
      docker_mount_cwd_to_workspace: true,
      docker_run_as_host_user: true,
      container_cpu: 4,
      container_memory: 8192,
      container_disk: 102400,
      container_persistent: false,
    },
  })

  assert.equal(values.terminalBackend, 'docker')
  assert.equal(values.terminalCwd, '/workspace')
  assert.equal(values.terminalTimeout, 600)
  assert.equal(values.terminalLifetimeSeconds, 1800)
  assert.equal(values.terminalDockerMountCwdToWorkspace, true)
  assert.equal(values.terminalDockerRunAsHostUser, true)
  assert.equal(values.terminalContainerCpu, 4)
  assert.equal(values.terminalContainerMemory, 8192)
  assert.equal(values.terminalContainerDisk, 102400)
  assert.equal(values.terminalContainerPersistent, false)
})

test('Hermes 终端执行配置保存会保留未知字段并写入上游结构', () => {
  const next = mergeHermesTerminalConfig({
    model: { provider: 'anthropic' },
    terminal: {
      backend: 'local',
      docker_image: 'custom/python-node',
      docker_forward_env: ['GITHUB_TOKEN'],
      custom_flag: 'keep-terminal',
    },
    streaming: { enabled: true },
  }, {
    terminalBackend: 'docker',
    terminalCwd: '/workspace',
    terminalTimeout: '900',
    terminalLifetimeSeconds: '1200',
    terminalDockerMountCwdToWorkspace: true,
    terminalDockerRunAsHostUser: true,
    terminalContainerCpu: '2',
    terminalContainerMemory: '6144',
    terminalContainerDisk: '20480',
    terminalContainerPersistent: false,
  })

  assert.deepEqual(next.model, { provider: 'anthropic' })
  assert.deepEqual(next.streaming, { enabled: true })
  assert.equal(next.terminal.backend, 'docker')
  assert.equal(next.terminal.cwd, '/workspace')
  assert.equal(next.terminal.timeout, 900)
  assert.equal(next.terminal.lifetime_seconds, 1200)
  assert.equal(next.terminal.docker_mount_cwd_to_workspace, true)
  assert.equal(next.terminal.docker_run_as_host_user, true)
  assert.equal(next.terminal.container_cpu, 2)
  assert.equal(next.terminal.container_memory, 6144)
  assert.equal(next.terminal.container_disk, 20480)
  assert.equal(next.terminal.container_persistent, false)
  assert.equal(next.terminal.docker_image, 'custom/python-node')
  assert.deepEqual(next.terminal.docker_forward_env, ['GITHUB_TOKEN'])
  assert.equal(next.terminal.custom_flag, 'keep-terminal')
})

test('Hermes 终端执行配置保存会拒绝非法后端和越界值', () => {
  assert.throws(
    () => mergeHermesTerminalConfig({}, { terminalBackend: 'unsafe' }),
    /terminal\.backend/,
  )
  assert.throws(
    () => mergeHermesTerminalConfig({}, { terminalTimeout: '0' }),
    /terminal\.timeout/,
  )
  assert.throws(
    () => mergeHermesTerminalConfig({}, { terminalLifetimeSeconds: '-1' }),
    /terminal\.lifetime_seconds/,
  )
  assert.throws(
    () => mergeHermesTerminalConfig({}, { terminalContainerCpu: '0' }),
    /terminal\.container_cpu/,
  )
  assert.throws(
    () => mergeHermesTerminalConfig({}, { terminalContainerMemory: '127' }),
    /terminal\.container_memory/,
  )
})
