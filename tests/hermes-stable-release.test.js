import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXPECTED_VERSION = '0.18.2'
const EXPECTED_TAG = 'v2026.7.7.2'

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('Web and Tauri installers pin the supported Hermes stable release', () => {
  const webSource = readSource('scripts/dev-api.js')
  const tauriSource = readSource('src-tauri/src/commands/hermes.rs')

  assert.match(webSource, new RegExp(`HERMES_STABLE_VERSION = '${EXPECTED_VERSION}'`))
  assert.match(webSource, new RegExp(`HERMES_STABLE_TAG = '${EXPECTED_TAG.replaceAll('.', '\\.')}'`))
  assert.match(webSource, /git\+\$\{HERMES_REPO_URL\}@\$\{HERMES_STABLE_TAG\}/)

  assert.match(tauriSource, new RegExp(`HERMES_STABLE_VERSION: &str = "${EXPECTED_VERSION}"`))
  assert.match(tauriSource, new RegExp(`HERMES_STABLE_TAG: &str = "${EXPECTED_TAG.replaceAll('.', '\\.')}"`))
  assert.match(tauriSource, /git\+\{HERMES_GIT_REPO_URL\}@\{HERMES_STABLE_TAG\}/)
})

test('Web install and update paths share the Hermes runtime dependency list', () => {
  const webSource = readSource('scripts/dev-api.js')
  const installBody = webSource.match(/async install_hermes\([^]*?\n  \},\n\n  async configure_hermes/)?.[0]
  const updateBody = webSource.match(/async update_hermes\([^]*?\n  \},\n\n  async uninstall_hermes/)?.[0]

  assert.ok(installBody, 'install_hermes handler must be present')
  assert.ok(updateBody, 'update_hermes handler must be present')
  assert.match(webSource, /const HERMES_RUNTIME_EXTRA_DEPS = \['croniter', 'httpx', 'openai', 'aiohttp', 'websockets'\]/)
  assert.match(installBody, /\.\.\.hermesRuntimeExtraArgs\(\)/)
  assert.match(updateBody, /\.\.\.hermesRuntimeExtraArgs\(\)/)
})

test('uv pip fallback installers include the required Hermes runtime dependencies', () => {
  const webSource = readSource('scripts/dev-api.js')
  const tauriSource = readSource('src-tauri/src/commands/hermes.rs')
  const webInstallBody = webSource.match(/async install_hermes\([^]*?\n  \},\n\n  async configure_hermes/)?.[0]
  const tauriPipBody = tauriSource.match(/async fn install_via_uv_pip\([^]*?\n}\n\n\/\/ /)?.[0]

  assert.ok(webInstallBody, 'Web install_hermes handler must be present')
  assert.ok(tauriPipBody, 'Tauri install_via_uv_pip helper must be present')
  assert.match(webInstallBody, /\['pip', 'install', pkg, \.\.\.HERMES_RUNTIME_EXTRA_DEPS\]/)
  assert.match(tauriPipBody, /pip_cmd\.args\(HERMES_RUNTIME_EXTRA_DEPS\)/)
  assert.match(tauriPipBody, /is_uv_wheel_cache_error/)
  assert.match(tauriPipBody, /build_pip_command\(true\)/)
})

test('ClawPanel provides a token-bootstrap Dashboard dist for Hermes 0.18.2', async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-hermes-dashboard-'))
  try {
    const { ensureHermesDashboardFallbackDist } = await import('../scripts/dev-api.js')
    const dist = ensureHermesDashboardFallbackDist(tempHome)
    const indexPath = path.join(dist, 'index.html')

    assert.equal(dist, path.join(tempHome, 'clawpanel-dashboard-web-dist'))
    assert.equal(fs.statSync(path.join(dist, 'assets')).isDirectory(), true)
    assert.match(fs.readFileSync(indexPath, 'utf8'), /clawpanel-dashboard-spa-stub/)

    fs.writeFileSync(indexPath, 'preserve-existing-dashboard-index')
    ensureHermesDashboardFallbackDist(tempHome)
    assert.equal(fs.readFileSync(indexPath, 'utf8'), 'preserve-existing-dashboard-index')
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
})

test('Web and Tauri Dashboard launchers use the managed dist without opening a browser', () => {
  const webSource = readSource('scripts/dev-api.js')
  const tauriSource = readSource('src-tauri/src/commands/hermes.rs')
  const webStartBody = webSource.match(/async hermes_dashboard_start\([^]*?\n  \},\n\n  async hermes_dashboard_stop/)?.[0]
  const tauriStartBody = tauriSource.match(/pub async fn hermes_dashboard_start\([^]*?\n}\n\n/)?.[0]

  assert.ok(webStartBody, 'Web hermes_dashboard_start handler must be present')
  assert.ok(tauriStartBody, 'Tauri hermes_dashboard_start command must be present')
  assert.match(webStartBody, /envVars\.HERMES_WEB_DIST = ensureHermesDashboardFallbackDist\(home\)/)
  assert.match(webStartBody, /spawn\('hermes', \['dashboard', '--no-open'\]/)
  assert.match(tauriStartBody, /ensure_hermes_dashboard_fallback_dist\(&home\)/)
  assert.match(tauriStartBody, /cmd\.args\(\["dashboard", "--no-open"\]\)/)
  assert.match(tauriStartBody, /cmd\.env\("HERMES_WEB_DIST", dashboard_dist\)/)
})
