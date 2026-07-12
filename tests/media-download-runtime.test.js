import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { downloadMediaUrlToFile } from '../scripts/dev-api.js'

async function listen(handler) {
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

test('媒体下载跨源重定向时剥离 Authorization 并流式落盘', async t => {
  let redirectedAuthorization
  const targetServer = await listen((req, res) => {
    redirectedAuthorization = req.headers.authorization
    res.writeHead(200, { 'content-type': 'image/png' })
    res.end('image-data')
  })
  const originServer = await listen((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer secret-key')
    res.writeHead(302, { location: `${targetServer.url}/asset` })
    res.end()
  })
  t.after(async () => { await originServer.close(); await targetServer.close() })

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-media-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const target = path.join(dir, 'asset.png')
  const result = await downloadMediaUrlToFile({
    url: `${originServer.url}/redirect`,
    baseUrl: originServer.url,
    apiKey: 'secret-key',
    target,
    timeoutSeconds: 2,
  })

  assert.equal(redirectedAuthorization, undefined)
  assert.equal(result.bytes, 10)
  assert.equal(fs.readFileSync(target, 'utf8'), 'image-data')
})

test('媒体下载超时覆盖响应体读取并清理临时文件', async t => {
  const server = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4' })
    res.write('partial')
    setTimeout(() => res.end('late'), 250)
  })
  t.after(server.close)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-media-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const target = path.join(dir, 'asset.mp4')

  await assert.rejects(downloadMediaUrlToFile({
    url: `${server.url}/slow`, baseUrl: server.url, apiKey: '', target, timeoutSeconds: 0.05,
  }), /超时|abort/i)
  assert.equal(fs.existsSync(target), false)
  assert.deepEqual(fs.readdirSync(dir), [])
})

test('媒体下载在流式写入时执行大小上限并清理临时文件', async t => {
  const server = await listen((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    res.end('0123456789')
  })
  t.after(server.close)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpanel-media-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const target = path.join(dir, 'asset.bin')

  await assert.rejects(downloadMediaUrlToFile({
    url: `${server.url}/large`, baseUrl: server.url, apiKey: '', target, timeoutSeconds: 2, maxBytes: 5,
  }), /超过/)
  assert.equal(fs.existsSync(target), false)
  assert.deepEqual(fs.readdirSync(dir), [])
})
