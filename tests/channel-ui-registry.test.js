import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const channelsPageSource = readFileSync(new URL('../src/pages/channels.js', import.meta.url), 'utf8')

function getRegistryBlock(platformId) {
  const start = channelsPageSource.indexOf(`  ${platformId}: {`)
  assert.notEqual(start, -1, `未找到 ${platformId} 渠道注册表`)
  const next = channelsPageSource.indexOf('\n  slack: {', start + 1)
  return channelsPageSource.slice(start, next === -1 ? undefined : next)
}

test('Discord 渠道 UI 会暴露服务器频道 allowlist 配置字段', () => {
  const discordBlock = getRegistryBlock('discord')

  assert.match(discordBlock, /key:\s*'guildId'/)
  assert.match(discordBlock, /key:\s*'channelId'/)
})

test('iMessage 渠道 UI 会暴露桥接运行配置字段', () => {
  const imessageBlock = getRegistryBlock('imessage')

  for (const field of [
    'cliPath',
    'dbPath',
    'remoteHost',
    'service',
    'allowFrom',
    'groupAllowFrom',
    'probeTimeoutMs',
    'attachmentRoots',
    'remoteAttachmentRoots',
    'sendReadReceipts',
    'coalesceSameSenderDms',
  ]) {
    assert.match(imessageBlock, new RegExp(`key:\\s*'${field}'`))
  }
  assert.match(imessageBlock, /pluginRequired:\s*'@openclaw\/imessage@latest'/)
  assert.match(imessageBlock, /pluginId:\s*'imessage'/)
})
