import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { api } from '../src/lib/tauri-api.js'
import { syncChannelToHermes } from '../src/lib/model-channels.js'

test('Hermes 渠道同步使用专用原子命令而不是通用 env 编辑器', async () => {
  const originals = {
    hermesListProviders: api.hermesListProviders,
    revealModelChannelKey: api.revealModelChannelKey,
    hermesEnvSet: api.hermesEnvSet,
    hermesSyncProvider: api.hermesSyncProvider,
  }

  let request = null
  try {
    api.hermesListProviders = async () => [{
      id: 'custom',
      authType: 'api_key',
      baseUrl: '',
      baseUrlEnvVar: 'OPENAI_BASE_URL',
      apiKeyEnvVars: ['OPENAI_API_KEY', 'CUSTOM_API_KEY'],
    }]
    api.revealModelChannelKey = async () => 'sk-runtime-test'
    api.hermesEnvSet = async () => {
      throw new Error('通用 env 编辑器不应被模型渠道同步调用')
    }
    api.hermesSyncProvider = async payload => {
      request = payload
      return { providerId: payload.provider, envKey: 'OPENAI_API_KEY' }
    }

    const result = await syncChannelToHermes({
      id: 'channel-1',
      presetKey: '',
      apiType: 'openai-completions',
      baseUrl: 'https://gateway.example/v1',
      defaultModel: 'gpt-test',
    }, { setDefault: true })

    assert.deepEqual(request, {
      provider: 'custom',
      apiKey: 'sk-runtime-test',
      baseUrl: 'https://gateway.example/v1',
      model: 'gpt-test',
      setDefault: true,
    })
    assert.equal(result.providerId, 'custom')
  } finally {
    Object.assign(api, originals)
  }
})

test('Web Hermes Provider 同步保留其它 Provider 凭据', async () => {
  const devApi = await import('../scripts/dev-api.js')
  assert.equal(typeof devApi.syncHermesProviderFilesAt, 'function')

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-hermes-sync-'))
  try {
    fs.writeFileSync(path.join(home, '.env'), [
      'ANTHROPIC_API_KEY=keep-me',
      'OPENAI_API_KEY=old',
      'CUSTOM_FLAG=keep',
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(home, 'config.yaml'), [
      'model:',
      '  default: old-model',
      '  provider: anthropic',
      'logging:',
      '  level: INFO',
      '',
    ].join('\n'))

    devApi.syncHermesProviderFilesAt(home, {
      provider: 'custom',
      apiKey: 'sk-new',
      baseUrl: 'https://gateway.example/v1',
      model: 'gpt-test',
      setDefault: true,
    })

    const env = fs.readFileSync(path.join(home, '.env'), 'utf8')
    assert.match(env, /ANTHROPIC_API_KEY=keep-me/)
    assert.match(env, /CUSTOM_FLAG=keep/)
    assert.match(env, /OPENAI_API_KEY=sk-new/)
    assert.match(env, /CUSTOM_API_KEY=sk-new/)
    assert.match(env, /OPENAI_BASE_URL=https:\/\/gateway\.example\/v1/)

    const config = fs.readFileSync(path.join(home, 'config.yaml'), 'utf8')
    assert.match(config, /default: gpt-test/)
    assert.match(config, /provider: custom/)
    assert.match(config, /level: INFO/)
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})
