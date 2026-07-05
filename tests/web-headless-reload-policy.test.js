import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tauriApi = readFileSync(new URL('../src/lib/tauri-api.js', import.meta.url), 'utf8')
const wsClient = readFileSync(new URL('../src/lib/ws-client.js', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
const chat = readFileSync(new URL('../src/pages/chat.js', import.meta.url), 'utf8')

test('Web/headless 模式配置写入不能隐式 reload Gateway', () => {
  assert.match(
    tauriApi,
    /function\s+_debouncedReloadGateway\(\)\s*\{[\s\S]*?if\s*\(\s*!isTauriRuntime\(\)\s*\)\s*return/,
    'tauri-api 的防抖 reload 必须在 Web/headless 模式直接跳过',
  )
})

test('Web/headless 模式自动配对重连不能隐式 reload Gateway', () => {
  assert.match(
    wsClient,
    /import\s+\{\s*api\s*,\s*isTauriRuntime\s*\}\s+from\s+['"]\.\/tauri-api\.js['"]/,
    'ws-client 必须能判断当前是否为 Tauri 桌面端',
  )
  // e16ff2b 起自动配对后不再隐式 reload（任何平台）：连接层不得触发 Gateway 重载
  assert.doesNotMatch(
    wsClient,
    /api\.reloadGateway\(/,
    'ws-client 不得隐式 reload Gateway（自动配对重连由上层显式处理）',
  )
})

test('Web/headless 模式启动自动连接不能隐式 reload Gateway', () => {
  assert.match(
    main,
    /if\s*\(\s*needReload\s*&&\s*isTauriRuntime\(\)\s*\)\s*\{[\s\S]*?await\s+api\.reloadGateway\(\)/,
    '启动自动连接合并 reload 只能在 Tauri 桌面端执行',
  )
})

test('Web/headless 模式聊天连接修复不自动 reload Gateway', () => {
  assert.match(
    chat,
    /if\s*\(\s*isTauriRuntime\(\)\s*\)\s*\{[\s\S]*?await\s+api\.reloadGateway\(\)/,
    '聊天页连接修复按钮只能在 Tauri 桌面端自动 reload',
  )
})

test('聊天发送按钮会在输入状态变化时重新同步 disabled 状态', () => {
  assert.match(
    chat,
    /<button class="chat-send-btn" id="chat-send-btn" type="button" disabled>/,
    '发送按钮必须是普通按钮，避免表单/浏览器默认行为干扰点击状态',
  )
  for (const eventName of ['compositionend', 'change', 'keyup']) {
    assert.match(
      chat,
      new RegExp(`_textarea\\.addEventListener\\('${eventName}',\\s*updateSendState\\)`),
      `textarea ${eventName} 事件必须同步发送按钮状态`,
    )
  }
  assert.match(
    chat,
    /requestAnimationFrame\(updateSendState\)/,
    '页面初始化后需要再同步一次发送按钮状态，覆盖自动填充或恢复输入内容',
  )
})
