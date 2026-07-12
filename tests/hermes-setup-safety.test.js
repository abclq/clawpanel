import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Hermes setup phase resolver restores a valid later phase without bypassing prerequisites', async () => {
  const { resolveHermesSetupPhase } = await import('../src/engines/hermes/pages/setup.js')

  assert.equal(resolveHermesSetupPhase('install', 'gateway', false), 'install')
  assert.equal(resolveHermesSetupPhase('configure', 'gateway', true), 'gateway')
  assert.equal(resolveHermesSetupPhase('install', 'configure', true), 'configure')
  assert.equal(resolveHermesSetupPhase('gateway', 'complete', true), 'gateway')
})

test('Hermes setup claims the install single-flight guard before its first await', () => {
  const source = fs.readFileSync(path.join(root, 'src/engines/hermes/pages/setup.js'), 'utf8')
  const body = source.match(/async function doInstall\(\) \{([\s\S]*?)\n  \}\n\n  \/\/ --- 获取模型列表 ---/)?.[1]
  assert.ok(body, 'doInstall body must be present')
  const guard = body.indexOf('if (installing) return')
  const claim = body.indexOf('installing = true')
  const firstAwait = body.indexOf('await ')
  assert.ok(guard >= 0 && claim > guard && claim < firstAwait, 'guard and claim must precede the first await')
})

test('Custom Hermes Gateway is probed before it is persisted', async () => {
  const { probeAndCommitHermesGateway } = await import('../src/engines/hermes/pages/setup.js')
  const calls = []
  const fakeApi = {
    async hermesProbeGateway(url) { calls.push(['probe', url]); return { ok: true } },
    async hermesSetGatewayUrl(url) { calls.push(['save', url]) },
  }
  await probeAndCommitHermesGateway(fakeApi, 'http://gateway.example:8642')
  assert.deepEqual(calls, [
    ['probe', 'http://gateway.example:8642'],
    ['save', 'http://gateway.example:8642'],
  ])

  await assert.rejects(
    probeAndCommitHermesGateway({
      async hermesProbeGateway() { return { ok: false } },
      async hermesSetGatewayUrl() { throw new Error('must not save') },
    }, 'http://bad.example:8642'),
  )
})

test('Web Hermes install environment includes configured PyPI mirror', async () => {
  const { buildHermesInstallEnv } = await import('../scripts/dev-api.js')
  const env = buildHermesInstallEnv({ pypiMirror: 'https://mirror.example/simple', gitMirror: '' }, { PATH: 'base' })
  assert.equal(env.UV_DEFAULT_INDEX, 'https://mirror.example/simple')
  assert.equal(env.PIP_INDEX_URL, 'https://mirror.example/simple')
  assert.equal(env.GIT_TERMINAL_PROMPT, '0')
})

test('Web install_hermes does not block the server event loop with spawnSync', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/dev-api.js'), 'utf8')
  const body = source.match(/async install_hermes\([^]*?\n  \},\n\n  async configure_hermes/)?.[0]
  assert.ok(body, 'install_hermes handler must be present')
  assert.doesNotMatch(body, /spawnSync\s*\(/)
  assert.match(body, /await runHermesInstallCommand\s*\(/)
})
