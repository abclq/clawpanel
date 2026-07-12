import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const devApi = readFileSync(new URL('../scripts/dev-api.js', import.meta.url), 'utf8')

test('Web 媒体资产下载流式落盘并同时执行 Content-Length 与流量上限', () => {
  assert.match(devApi, /function mediaContentLengthExceedsLimit[\s\S]*content-length/)
  assert.match(devApi, /async function downloadMediaUrlToFile[\s\S]*createWriteStream[\s\S]*getReader[\s\S]*total > maxBytes/)
  assert.match(devApi, /async function downloadMediaAsset[\s\S]*downloadMediaUrlToFile/)
  assert.match(devApi, /async function downloadOpenAIVideoContent[\s\S]*downloadMediaUrlToFile/)
})

test('Web 媒体资产逐跳处理重定向并只向同源地址发送 Authorization', () => {
  assert.match(devApi, /new URL\(url\)\.origin\.toLowerCase\(\)/)
  assert.match(devApi, /redirect:\s*'manual'/)
  assert.match(devApi, /response\.body\?\.cancel/)
  assert.match(devApi, /sendAuth\s*&&\s*\[401,\s*403\]\.includes\(response\.status\)/)
})
