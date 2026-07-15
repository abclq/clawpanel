import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { syncHermesProviderFilesAt } from '../scripts/dev-api.js'

test('Hermes 模型同步仅在事务回读成功后返回 verified', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-hermes-sync-'))
  try {
    const oldEnv = 'KEEP=value\n'
    const oldConfig = 'model:\n  default: old-model\nlogging:\n  level: INFO\n'
    fs.writeFileSync(path.join(home, '.env'), oldEnv)
    fs.writeFileSync(path.join(home, 'config.yaml'), oldConfig)
    const result = syncHermesProviderFilesAt(home, {
      provider: 'custom',
      apiKey: 'sk-test-only',
      baseUrl: 'https://example.com/v1',
      model: 'gpt-test',
      setDefault: true,
    })
    assert.equal(result.verified, true)
    assert.equal(result.providerId, 'custom')
    assert.match(fs.readFileSync(path.join(home, '.env'), 'utf8'), /OPENAI_API_KEY=sk-test-only/)
    assert.match(fs.readFileSync(path.join(home, 'config.yaml'), 'utf8'), /default: gpt-test/)
    assert.equal(fs.readFileSync(path.join(home, '.env.bak'), 'utf8'), oldEnv)
    assert.equal(fs.readFileSync(path.join(home, 'config.yaml.bak'), 'utf8'), oldConfig)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
