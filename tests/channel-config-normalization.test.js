import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildOpenClawChannelDiagnosis,
  buildMessagingPlatformFormValues,
  listPlatformAccounts,
  mergeOpenClawMessagingPlatformConfig,
  resolveMessagingCredentialValueForSave,
  normalizeMessagingPlatformForm,
} from '../scripts/dev-api.js'

test('渠道保存会为 Telegram 补齐新版 OpenClaw 必填访问策略', () => {
  const form = normalizeMessagingPlatformForm('telegram', {
    botToken: '123:token',
  })

  assert.equal(form.botToken, '123:token')
  assert.equal(form.dmPolicy, 'pairing')
  assert.equal(form.groupPolicy, 'allowlist')
})

test('渠道保存会把旧 UI 策略值转换为 OpenClaw 支持的枚举', () => {
  const form = normalizeMessagingPlatformForm('slack', {
    mode: 'socket',
    botToken: 'xoxb-token',
    appToken: 'xapp-token',
    dmPolicy: 'allow',
    groupPolicy: 'mentioned',
  })

  assert.equal(form.dmPolicy, 'open')
  assert.deepEqual(form.allowFrom, ['*'])
  assert.equal(form.groupPolicy, 'open')
  assert.equal(form.requireMention, true)
  assert.equal(form.webhookPath, '/slack/events')
  assert.equal(form.userTokenReadOnly, false)
})

test('渠道保存不会向不支持顶层 requireMention 的平台写入非法字段', () => {
  const form = normalizeMessagingPlatformForm('signal', {
    account: '+15551234567',
    dmPolicy: 'deny',
    groupPolicy: 'mentioned',
  })

  assert.equal(form.dmPolicy, 'disabled')
  assert.equal(form.groupPolicy, 'open')
  assert.equal(Object.hasOwn(form, 'requireMention'), false)
})

test('渠道保存会为飞书补齐新版内核要求的默认字段', () => {
  const form = normalizeMessagingPlatformForm('feishu', {
    appId: 'cli_a',
    appSecret: 'secret',
    domain: '',
  })

  assert.equal(form.domain, 'feishu')
  assert.equal(form.connectionMode, 'websocket')
  assert.equal(form.webhookPath, '/feishu/events')
  assert.equal(form.dmPolicy, 'pairing')
  assert.equal(form.groupPolicy, 'allowlist')
  assert.equal(form.reactionNotifications, 'off')
  assert.equal(form.typingIndicator, true)
  assert.equal(form.resolveSenderNames, true)
})

test('渠道读取会把新版访问策略字段回显为表单可编辑值', () => {
  const values = buildMessagingPlatformFormValues('telegram', {
    botToken: '123:token',
    dmPolicy: 'allowlist',
    groupPolicy: 'disabled',
    allowFrom: ['u-1', 'u-2'],
  })

  assert.equal(values.botToken, '123:token')
  assert.equal(values.dmPolicy, 'allowlist')
  assert.equal(values.groupPolicy, 'disabled')
  assert.equal(values.allowFrom, 'u-1, u-2')
  assert.equal(values.allowedUsers, 'u-1, u-2')
})

test('渠道读取会合并飞书账号凭证和根节点共享策略字段', () => {
  const values = buildMessagingPlatformFormValues(
    'feishu',
    {
      appId: 'cli_a',
      appSecret: 'secret',
    },
    {
      channelRoot: {
        domain: 'lark',
        connectionMode: 'websocket',
        webhookPath: '/feishu/events',
        dmPolicy: 'pairing',
        groupPolicy: 'allowlist',
        reactionNotifications: 'off',
        typingIndicator: true,
        resolveSenderNames: false,
      },
    },
  )

  assert.equal(values.appId, 'cli_a')
  assert.equal(values.appSecret, 'secret')
  assert.equal(values.domain, 'lark')
  assert.equal(values.connectionMode, 'websocket')
  assert.equal(values.webhookPath, '/feishu/events')
  assert.equal(values.dmPolicy, 'pairing')
  assert.equal(values.groupPolicy, 'allowlist')
  assert.equal(values.reactionNotifications, 'off')
  assert.equal(values.typingIndicator, 'true')
  assert.equal(values.resolveSenderNames, 'false')
})

test('渠道读取飞书多账号时不会用根节点旧凭证覆盖账号凭证', () => {
  const values = buildMessagingPlatformFormValues(
    'feishu',
    {
      appId: 'account_app',
      appSecret: 'account_secret',
      dmPolicy: 'pairing',
    },
    {
      channelRoot: {
        appId: 'root_app',
        appSecret: 'root_secret',
        domain: 'lark',
        groupPolicy: 'allowlist',
      },
    },
  )

  assert.equal(values.appId, 'account_app')
  assert.equal(values.appSecret, 'account_secret')
  assert.equal(values.domain, 'lark')
  assert.equal(values.dmPolicy, 'pairing')
  assert.equal(values.groupPolicy, 'allowlist')
})

test('渠道读取会把 open + requireMention 反向回显为仅提及时策略', () => {
  const values = buildMessagingPlatformFormValues('slack', {
    mode: 'socket',
    botToken: 'xoxb-token',
    appToken: 'xapp-token',
    groupPolicy: 'open',
    requireMention: true,
  })

  assert.equal(values.groupPolicy, 'mentioned')
  assert.equal(values.requireMention, 'true')
})

test('Discord 渠道读取会回显 applicationId', () => {
  const values = buildMessagingPlatformFormValues('discord', {
    token: 'discord-token',
    applicationId: '123456789012345678',
  })

  assert.equal(values.token, 'discord-token')
  assert.equal(values.applicationId, '123456789012345678')
})

test('渠道保存会在用户改回所有群组时显式清除仅提及开关', () => {
  const form = normalizeMessagingPlatformForm('slack', {
    mode: 'socket',
    botToken: 'xoxb-token',
    appToken: 'xapp-token',
    groupPolicy: 'open',
  })

  assert.equal(form.groupPolicy, 'open')
  assert.equal(form.requireMention, false)
})

test('渠道读取会把 SecretRef 密钥显示为安全占位并携带原始对象', () => {
  const secretRef = { source: 'env', provider: 'default', id: 'TELEGRAM_BOT_TOKEN' }
  const values = buildMessagingPlatformFormValues('telegram', {
    botToken: secretRef,
    dmPolicy: 'pairing',
    groupPolicy: 'allowlist',
  })

  assert.equal(values.botToken, 'SecretRef(env:default:TELEGRAM_BOT_TOKEN)')
  assert.deepEqual(values.__secretRefs, { botToken: secretRef })
})

test('渠道保存时用户未改动 SecretRef 占位会保留原始密钥引用', () => {
  const secretRef = { source: 'env', provider: 'default', id: 'SLACK_BOT_TOKEN' }
  const value = resolveMessagingCredentialValueForSave({
    form: { botToken: 'SecretRef(env:default:SLACK_BOT_TOKEN)' },
    current: { botToken: secretRef },
    key: 'botToken',
  })

  assert.deepEqual(value, secretRef)
})

test('渠道保存时用户输入新密钥会替换旧 SecretRef', () => {
  const secretRef = { source: 'env', provider: 'default', id: 'DISCORD_BOT_TOKEN' }
  const value = resolveMessagingCredentialValueForSave({
    form: { token: 'new-discord-token' },
    current: { token: secretRef },
    key: 'token',
  })

  assert.equal(value, 'new-discord-token')
})

test('渠道账号列表会把 SecretRef 标识显示为安全占位', () => {
  const accounts = listPlatformAccounts({
    accounts: {
      prod: {
        appId: { source: 'env', provider: 'default', id: 'FEISHU_APP_ID' },
      },
      backup: {
        clientId: { source: 'env', provider: 'default', id: 'DINGTALK_CLIENT_ID' },
      },
    },
  })

  assert.deepEqual(accounts, [
    { accountId: 'backup', appId: 'SecretRef(env:default:DINGTALK_CLIENT_ID)' },
    { accountId: 'prod', appId: 'SecretRef(env:default:FEISHU_APP_ID)' },
  ])
})

test('渠道保存时 clientId 未改动 SecretRef 占位会保留原始引用', () => {
  const secretRef = { source: 'env', provider: 'default', id: 'DINGTALK_CLIENT_ID' }
  const value = resolveMessagingCredentialValueForSave({
    form: { clientId: 'SecretRef(env:default:DINGTALK_CLIENT_ID)' },
    current: { clientId: secretRef },
    key: 'clientId',
  })

  assert.deepEqual(value, secretRef)
})

test('OpenClaw 渠道保存带账号标识时会写入 accounts 而不是覆盖根配置', () => {
  const cfg = {
    channels: {
      telegram: {
        enabled: true,
        botToken: 'root-token',
        dmPolicy: 'pairing',
        groupPolicy: 'allowlist',
      },
      discord: {
        enabled: true,
        token: 'root-discord',
        groupPolicy: 'allowlist',
      },
      slack: {
        enabled: true,
        mode: 'socket',
        botToken: 'root-slack',
        appToken: 'root-app',
      },
    },
  }

  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'telegram',
    accountId: 'alerts',
    form: { botToken: 'alerts-token', dmPolicy: 'allowlist', groupPolicy: 'disabled' },
  })
  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'discord',
    accountId: 'ops',
    form: { token: 'ops-discord', guildId: 'guild-1', channelId: 'channel-1' },
  })
  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'slack',
    accountId: 'team-a',
    form: { mode: 'socket', botToken: 'team-slack', appToken: 'team-app' },
  })

  assert.equal(cfg.channels.telegram.botToken, 'root-token')
  assert.equal(cfg.channels.telegram.accounts.alerts.botToken, 'alerts-token')
  assert.equal(cfg.channels.telegram.accounts.alerts.dmPolicy, 'allowlist')
  assert.equal(cfg.channels.discord.token, 'root-discord')
  assert.equal(cfg.channels.discord.accounts.ops.token, 'ops-discord')
  assert.equal(cfg.channels.discord.accounts.ops.guilds['guild-1'].channels['channel-1'].allow, true)
  assert.equal(cfg.channels.slack.botToken, 'root-slack')
  assert.equal(cfg.channels.slack.accounts['team-a'].botToken, 'team-slack')
  assert.equal(cfg.channels.slack.accounts['team-a'].appToken, 'team-app')
})

test('通用渠道诊断会指出 Telegram 缺少 Bot Token', () => {
  const result = buildOpenClawChannelDiagnosis({
    platform: 'telegram',
    configExists: true,
    channelEnabled: true,
    form: {
      dmPolicy: 'pairing',
      groupPolicy: 'allowlist',
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.overallReady, false)
  assert.equal(result.checks.find(item => item.id === 'credentials')?.ok, false)
  assert.match(result.checks.find(item => item.id === 'credentials')?.detail || '', /Bot Token/)
})

test('通用渠道诊断在缺少渠道配置时不会误报渠道已禁用', () => {
  const result = buildOpenClawChannelDiagnosis({
    platform: 'telegram',
    configExists: false,
    channelEnabled: true,
    form: {},
  })

  assert.equal(result.ok, false)
  assert.equal(result.checks.find(item => item.id === 'config_exists')?.ok, false)
  assert.equal(result.checks.find(item => item.id === 'channel_enabled')?.ok, true)
  assert.match(result.checks.find(item => item.id === 'channel_enabled')?.detail || '', /未被显式禁用/)
})

test('通用渠道诊断会按 Slack 模式检查动态必填凭证', () => {
  const socketResult = buildOpenClawChannelDiagnosis({
    platform: 'slack',
    configExists: true,
    channelEnabled: true,
    form: {
      mode: 'socket',
      botToken: 'xoxb-token',
    },
  })
  const httpResult = buildOpenClawChannelDiagnosis({
    platform: 'slack',
    configExists: true,
    channelEnabled: true,
    form: {
      mode: 'http',
      botToken: 'xoxb-token',
      signingSecret: 'secret',
    },
  })

  assert.equal(socketResult.ok, false)
  assert.match(socketResult.checks.find(item => item.id === 'credentials')?.detail || '', /App Token/)
  assert.equal(httpResult.checks.find(item => item.id === 'credentials')?.ok, true)
})

test('通用渠道诊断会识别钉钉 Client ID 和 Client Secret', () => {
  const result = buildOpenClawChannelDiagnosis({
    platform: 'dingtalk',
    configExists: true,
    channelEnabled: true,
    form: {
      clientId: 'ding-app-key',
      clientSecret: 'ding-secret',
    },
    verifyResult: {
      valid: true,
      details: ['已通过 accessToken 接口校验'],
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.overallReady, true)
  assert.equal(result.checks.find(item => item.id === 'credentials')?.ok, true)
  assert.equal(result.checks.find(item => item.id === 'online_verify')?.ok, true)
})

test('Discord 渠道保存会保留运行时需要的 applicationId', () => {
  const cfg = { channels: {} }

  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'discord',
    form: {
      token: 'discord-token',
      applicationId: '123456789012345678',
    },
  })

  assert.equal(cfg.channels.discord.token, 'discord-token')
  assert.equal(cfg.channels.discord.applicationId, '123456789012345678')
})

test('OpenClaw 渠道保存第一个命名账号时会固定 defaultAccount', () => {
  const cfg = { channels: {} }

  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'telegram',
    accountId: 'alerts',
    form: { botToken: 'alerts-token' },
  })
  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'telegram',
    accountId: 'ops',
    form: { botToken: 'ops-token' },
  })

  assert.equal(cfg.channels.telegram.defaultAccount, 'alerts')
  assert.equal(cfg.channels.telegram.accounts.alerts.botToken, 'alerts-token')
  assert.equal(cfg.channels.telegram.accounts.ops.botToken, 'ops-token')
})

test('OpenClaw 渠道保存命名账号时不会覆盖已有默认账号或根凭证默认账号', () => {
  const explicitDefault = {
    channels: {
      discord: {
        defaultAccount: 'ops',
        accounts: { ops: { token: 'ops-token' } },
      },
    },
  }
  mergeOpenClawMessagingPlatformConfig(explicitDefault, {
    platform: 'discord',
    accountId: 'alerts',
    form: { token: 'alerts-token' },
  })

  const rootDefault = {
    channels: {
      slack: {
        mode: 'socket',
        botToken: 'root-bot',
        appToken: 'root-app',
      },
    },
  }
  mergeOpenClawMessagingPlatformConfig(rootDefault, {
    platform: 'slack',
    accountId: 'team-a',
    form: { mode: 'socket', botToken: 'team-bot', appToken: 'team-app' },
  })

  assert.equal(explicitDefault.channels.discord.defaultAccount, 'ops')
  assert.equal(explicitDefault.channels.discord.accounts.alerts.token, 'alerts-token')
  assert.equal(rootDefault.channels.slack.defaultAccount, undefined)
  assert.equal(rootDefault.channels.slack.accounts['team-a'].botToken, 'team-bot')
})
