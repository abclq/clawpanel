import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  buildOpenclawPathConflictRecords,
  quarantineOpenclawPathForWeb,
} from '../scripts/dev-api.js'

test('Web API CLI 冲突扫描会返回横幅需要的字段', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-cli-conflict-'))
  try {
    const cliPath = path.join(tmp, process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw')
    fs.writeFileSync(cliPath, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n')
    const pkgDir = path.join(tmp, 'node_modules', 'openclaw')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'openclaw', version: '9.9.9' }))

    const records = buildOpenclawPathConflictRecords([{
      path: cliPath,
      source: 'npm-official',
      version: '9.9.9',
      active: false,
    }])

    assert.equal(records.length, 1)
    assert.equal(records[0].path, cliPath)
    assert.equal(records[0].source, 'npm-official')
    assert.equal(records[0].sourceLabel, 'npm 官方/全局安装')
    assert.equal(records[0].version, '9.9.9')
    assert.equal(typeof records[0].sizeBytes, 'number')
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('Web API CLI 冲突扫描会排除 standalone 安装', () => {
  const records = buildOpenclawPathConflictRecords([{
    path: path.join(os.tmpdir(), 'openclaw-standalone', 'openclaw.cmd'),
    source: 'standalone',
    version: '1.0.0',
    active: true,
  }])

  assert.deepEqual(records, [])
})

test('Web API CLI 隔离只允许 openclaw 文件并保留可恢复备份', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-cli-quarantine-'))
  try {
    const cliPath = path.join(tmp, process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw')
    fs.writeFileSync(cliPath, 'echo openclaw\n')

    const record = quarantineOpenclawPathForWeb(cliPath, { now: new Date('2026-05-23T00:00:00Z') })

    assert.equal(record.originalPath, cliPath)
    assert.match(path.basename(record.quarantinedPath), /^openclaw(\.cmd)?\.disabled-by-clawpanel-\d{8}-\d{6}\.bak$/)
    assert.equal(fs.existsSync(cliPath), false)
    assert.equal(fs.existsSync(record.quarantinedPath), true)
    assert.ok(record.quarantinedAt)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('Web API CLI 隔离拒绝非 openclaw 文件', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-cli-quarantine-deny-'))
  try {
    const filePath = path.join(tmp, 'node.cmd')
    fs.writeFileSync(filePath, 'echo node\n')

    assert.throws(() => quarantineOpenclawPathForWeb(filePath), /拒绝隔离非 openclaw 文件/)
    assert.equal(fs.existsSync(filePath), true)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
