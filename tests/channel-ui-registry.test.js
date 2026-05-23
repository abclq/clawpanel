import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const channelsPageSource = readFileSync(new URL('../src/pages/channels.js', import.meta.url), 'utf8')

function getRegistryBlock(platformId) {
  const start = channelsPageSource.indexOf(`  ${platformId}: {`)
  assert.notEqual(start, -1, `未找到 ${platformId} 渠道注册表`)
  const braceStart = channelsPageSource.indexOf('{', start)
  let depth = 0
  for (let index = braceStart; index < channelsPageSource.length; index += 1) {
    const char = channelsPageSource[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return channelsPageSource.slice(start, index + 1)
  }
  assert.fail(`未找到 ${platformId} 渠道注册表结束位置`)
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

test('WhatsApp 渠道 UI 会恢复扫码登录和运行配置入口', () => {
  const whatsappBlock = getRegistryBlock('whatsapp')

  for (const field of [
    'selfChatMode',
    'allowFrom',
    'groupAllowFrom',
    'debounceMs',
    'mediaMaxMb',
    'sendReadReceipts',
    'ackEmoji',
    'ackGroup',
  ]) {
    assert.match(whatsappBlock, new RegExp(`key:\\s*'${field}'`))
  }
  assert.match(whatsappBlock, /id:\s*'login'/)
  assert.match(whatsappBlock, /pluginRequired:\s*'@openclaw\/whatsapp@latest'/)
  assert.match(whatsappBlock, /pluginId:\s*'whatsapp'/)
})

test('ClickClack 渠道 UI 会暴露自托管工作区配置字段', () => {
  const clickclackBlock = getRegistryBlock('clickclack')

  for (const field of [
    'baseUrl',
    'token',
    'workspace',
    'botUserId',
    'agentId',
    'replyMode',
    'model',
    'systemPrompt',
    'timeoutSeconds',
    'toolsAllow',
    'senderIsOwner',
    'defaultTo',
    'allowFrom',
    'reconnectMs',
  ]) {
    assert.match(clickclackBlock, new RegExp(`key:\\s*'${field}'`))
  }
  assert.match(clickclackBlock, /pluginId:\s*'clickclack'/)
})

test('Nextcloud Talk 渠道 UI 会暴露自托管 Talk 配置字段', () => {
  const talkBlock = getRegistryBlock("'nextcloud-talk'")

  for (const field of [
    'baseUrl',
    'botSecret',
    'botSecretFile',
    'apiUser',
    'apiPassword',
    'apiPasswordFile',
    'webhookPort',
    'webhookHost',
    'webhookPath',
    'webhookPublicUrl',
    'dmPolicy',
    'groupPolicy',
    'allowFrom',
    'groupAllowFrom',
    'dangerouslyAllowPrivateNetwork',
    'responsePrefix',
  ]) {
    assert.match(talkBlock, new RegExp(`key:\\s*'${field}'`))
  }
  assert.match(talkBlock, /pluginId:\s*'nextcloud-talk'/)
})
