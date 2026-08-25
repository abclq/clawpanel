import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readFileExcerptSince } from '../scripts/dev-api.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

test('Web 启动错误只返回本次新增日志并兼容日志轮转', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-gateway-log-'))
  const file = path.join(dir, 'gateway.err.log')
  fs.writeFileSync(file, 'old error\n', 'utf8')
  const offset = fs.statSync(file).size
  fs.appendFileSync(file, 'new error\n', 'utf8')
  assert.equal(readFileExcerptSince(file, offset, 8192), 'new error')

  fs.writeFileSync(file, 'rotated error\n', 'utf8')
  assert.equal(readFileExcerptSince(file, 9999, 8192), 'rotated error')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('Gateway 失败信息在三处操作入口使用持久诊断弹窗', () => {
  const diagnostics = read('src/lib/gateway-start-diagnostics.js')
  assert.match(diagnostics, /api\.readLogTail\('gateway-err', 80\)/)
  assert.match(diagnostics, /api\.readLogTail\('gateway', 50\)/)
  assert.match(diagnostics, /target\.textContent = renderDiagnosticText/)

  assert.match(read('src/pages/dashboard.js'), /showGatewayStartDiagnostics\(err\)/)
  assert.match(read('src/pages/services.js'), /await showGatewayStartDiagnostics\(e\)/)

  const main = read('src/main.js')
  assert.match(main, /renderStartFailure\(err\)/)
  assert.match(main, /api\.readLogTail\('gateway-err', 20\)/)
  assert.doesNotMatch(main, /renderStartFailure\(err\)[\s\S]{0,180}update\(false\)/)
})

test('桌面与 Web 启动后端都保留 stderr 并把增量错误带回界面', () => {
  const rust = read('src-tauri/src/commands/service.rs')
  assert.match(rust, /gateway\.log.*2>>\{\}/s)
  assert.match(rust, /gateway\.err\.log/)
  assert.match(rust, /append_gateway_error_excerpt\(err, error_log_offset\)/)
  assert.match(rust, /spawn_blocking\(move \|\| platform::check_service_status/)

  const web = read('scripts/dev-api.js')
  assert.match(web, /const errorLogOffset = gatewayErrorLogSize\(\)/)
  assert.match(web, /waitForGatewayRunning\(label, 10000, errorLogOffset\)/)
  assert.match(web, /最近一次启动错误/)
  assert.match(web, /const listening = linuxPortListening\(port\)/)
})

test('仪表盘刷新合并为一个执行中请求和一个最新待处理请求', () => {
  const dashboard = read('src/pages/dashboard.js')
  assert.doesNotMatch(dashboard, /_dashboardLoadChain/)
  assert.match(dashboard, /let _dashboardLoadPromise = null/)
  assert.match(dashboard, /let _dashboardPendingLoad = null/)
  assert.match(dashboard, /while \(_dashboardPendingLoad\)/)
  assert.match(dashboard, /_dashboardPendingLoad\.fullRefresh \|\|= fullRefresh/)
})
