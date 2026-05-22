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

test('Zalo 渠道保存会补齐策略并保留 Bot Token 或 Token File', () => {
  const tokenForm = normalizeMessagingPlatformForm('zalo', {
    botToken: 'zalo-token',
    groupAllowFrom: 'group-1, group-2',
    mediaMaxMb: '25',
  })
  const tokenFileForm = normalizeMessagingPlatformForm('zalo', {
    tokenFile: '/run/secrets/zalo-token',
  })

  assert.equal(tokenForm.botToken, 'zalo-token')
  assert.equal(tokenForm.dmPolicy, 'pairing')
  assert.equal(tokenForm.groupPolicy, 'allowlist')
  assert.deepEqual(tokenForm.groupAllowFrom, ['group-1', 'group-2'])
  assert.equal(tokenForm.mediaMaxMb, 25)
  assert.equal(tokenFileForm.tokenFile, '/run/secrets/zalo-token')
})

test('OpenClaw 渠道保存会写入 Zalo 多账号配置', () => {
  const cfg = { channels: {} }

  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'zalo',
    accountId: 'vn',
    form: {
      botToken: 'zalo-token',
      groupAllowFrom: 'thread-1',
      mediaMaxMb: '30',
    },
  })

  assert.equal(cfg.channels.zalo.defaultAccount, 'vn')
  assert.equal(cfg.channels.zalo.accounts.vn.botToken, 'zalo-token')
  assert.deepEqual(cfg.channels.zalo.accounts.vn.groupAllowFrom, ['thread-1'])
  assert.equal(cfg.channels.zalo.accounts.vn.mediaMaxMb, 30)
})

test('Zalo 诊断接受 Bot Token 或 Token File 二选一', () => {
  const tokenResult = buildOpenClawChannelDiagnosis({
    platform: 'zalo',
    configExists: true,
    channelEnabled: true,
    form: { botToken: 'zalo-token' },
  })
  const fileResult = buildOpenClawChannelDiagnosis({
    platform: 'zalo',
    configExists: true,
    channelEnabled: true,
    form: { tokenFile: '/run/secrets/zalo-token' },
  })
  const missingResult = buildOpenClawChannelDiagnosis({
    platform: 'zalo',
    configExists: true,
    channelEnabled: true,
    form: {},
  })

  assert.equal(tokenResult.checks.find(item => item.id === 'credentials')?.ok, true)
  assert.equal(fileResult.checks.find(item => item.id === 'credentials')?.ok, true)
  assert.equal(missingResult.checks.find(item => item.id === 'credentials')?.ok, false)
  assert.match(missingResult.checks.find(item => item.id === 'credentials')?.detail || '', /Bot Token.*Token File/)
})

test('Zalo Personal 保存和诊断按二维码会话型渠道处理', () => {
  const form = normalizeMessagingPlatformForm('zalouser', {
    profile: 'work',
    dangerouslyAllowNameMatching: 'true',
    allowFrom: '12345, Alice',
    groupAllowFrom: 'group-1',
    historyLimit: '12',
  })
  const cfg = { channels: {} }

  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'zalouser',
    accountId: 'work',
    form,
  })
  const result = buildOpenClawChannelDiagnosis({
    platform: 'zalouser',
    configExists: true,
    channelEnabled: true,
    form: buildMessagingPlatformFormValues('zalouser', cfg.channels.zalouser.accounts.work),
  })

  assert.equal(cfg.channels.zalouser.defaultAccount, 'work')
  assert.equal(cfg.channels.zalouser.accounts.work.profile, 'work')
  assert.equal(cfg.channels.zalouser.accounts.work.dangerouslyAllowNameMatching, true)
  assert.deepEqual(cfg.channels.zalouser.accounts.work.allowFrom, ['12345', 'Alice'])
  assert.deepEqual(cfg.channels.zalouser.accounts.work.groupAllowFrom, ['group-1'])
  assert.equal(cfg.channels.zalouser.accounts.work.historyLimit, 12)
  assert.equal(result.checks.find(item => item.id === 'credentials')?.ok, true)
  assert.equal(result.checks.find(item => item.id === 'credentials')?.title, '登录/会话配置')
})

test('LINE 渠道保存会写入双凭证组合并支持多账号', () => {
  const cfg = { channels: {} }

  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'line',
    accountId: 'jp',
    form: {
      tokenFile: '/run/secrets/line-token',
      secretFile: '/run/secrets/line-secret',
      allowFrom: 'U123, U456',
      groupAllowFrom: 'C123',
      groupPolicy: 'open',
      mediaMaxMb: '25',
      webhookPath: '/line/webhook',
    },
  })

  const account = cfg.channels.line.accounts.jp
  assert.equal(cfg.channels.line.defaultAccount, 'jp')
  assert.equal(account.tokenFile, '/run/secrets/line-token')
  assert.equal(account.secretFile, '/run/secrets/line-secret')
  assert.deepEqual(account.allowFrom, ['U123', 'U456'])
  assert.deepEqual(account.groupAllowFrom, ['C123'])
  assert.equal(account.groupPolicy, 'open')
  assert.equal(account.mediaMaxMb, 25)
  assert.equal(account.webhookPath, '/line/webhook')
})

test('LINE 诊断要求 token 与 secret 两组凭证各满足一项', () => {
  const ready = buildOpenClawChannelDiagnosis({
    platform: 'line',
    configExists: true,
    channelEnabled: true,
    form: {
      channelAccessToken: 'line-token',
      secretFile: '/run/secrets/line-secret',
    },
  })
  const missingSecret = buildOpenClawChannelDiagnosis({
    platform: 'line',
    configExists: true,
    channelEnabled: true,
    form: {
      channelAccessToken: 'line-token',
    },
  })

  assert.equal(ready.checks.find(item => item.id === 'credentials')?.ok, true)
  assert.equal(missingSecret.checks.find(item => item.id === 'credentials')?.ok, false)
  assert.match(missingSecret.checks.find(item => item.id === 'credentials')?.detail || '', /Channel Secret.*Secret File/)
})

test('Mattermost 渠道保存会写入嵌套命令和网络配置', () => {
  const cfg = { channels: {} }

  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'mattermost',
    accountId: 'ops',
    form: {
      botToken: 'mattermost-token',
      baseUrl: 'https://mattermost.example.com/',
      groupPolicy: 'mentioned',
      allowFrom: '@alice, bob',
      groupAllowFrom: 'town-square',
      callbackPath: '/api/channels/mattermost/ops',
      callbackUrl: 'https://panel.example.com/api/channels/mattermost/ops',
      dangerouslyAllowNameMatching: 'true',
      dangerouslyAllowPrivateNetwork: 'true',
      replyToMode: 'all',
    },
  })

  const account = cfg.channels.mattermost.accounts.ops
  assert.equal(cfg.channels.mattermost.defaultAccount, 'ops')
  assert.equal(account.botToken, 'mattermost-token')
  assert.equal(account.baseUrl, 'https://mattermost.example.com/')
  assert.equal(account.groupPolicy, 'open')
  assert.equal(account.requireMention, true)
  assert.deepEqual(account.allowFrom, ['@alice', 'bob'])
  assert.deepEqual(account.groupAllowFrom, ['town-square'])
  assert.equal(account.commands.callbackPath, '/api/channels/mattermost/ops')
  assert.equal(account.commands.callbackUrl, 'https://panel.example.com/api/channels/mattermost/ops')
  assert.equal(account.network.dangerouslyAllowPrivateNetwork, true)
  assert.equal(account.dangerouslyAllowNameMatching, true)
  assert.equal(account.replyToMode, 'all')
})

test('Mattermost 诊断要求 Bot Token 和 Base URL', () => {
  const missingBaseUrl = buildOpenClawChannelDiagnosis({
    platform: 'mattermost',
    configExists: true,
    channelEnabled: true,
    form: { botToken: 'mattermost-token' },
  })
  const ready = buildOpenClawChannelDiagnosis({
    platform: 'mattermost',
    configExists: true,
    channelEnabled: true,
    form: {
      botToken: 'mattermost-token',
      baseUrl: 'https://mattermost.example.com',
    },
  })

  assert.equal(missingBaseUrl.checks.find(item => item.id === 'credentials')?.ok, false)
  assert.match(missingBaseUrl.checks.find(item => item.id === 'credentials')?.detail || '', /Base URL/)
  assert.equal(ready.checks.find(item => item.id === 'credentials')?.ok, true)
})

test('Synology Chat 渠道保存会写入上游运行时字段并支持多账号', () => {
  const cfg = { channels: {} }

  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'synology-chat',
    accountId: 'nas',
    form: {
      token: 'synology-token',
      incomingUrl: 'https://nas.example.com/webapi/entry.cgi',
      nasHost: 'https://nas.example.com',
      webhookPath: '/webhook/synology',
      dmPolicy: 'allowlist',
      allowedUserIds: 'alice, bob',
      rateLimitPerMinute: '45',
      botName: 'OpenClaw Ops',
      dangerouslyAllowNameMatching: 'true',
      dangerouslyAllowInheritedWebhookPath: 'true',
      allowInsecureSsl: 'true',
    },
  })

  const account = cfg.channels['synology-chat'].accounts.nas
  assert.equal(cfg.channels['synology-chat'].defaultAccount, 'nas')
  assert.equal(account.token, 'synology-token')
  assert.equal(account.incomingUrl, 'https://nas.example.com/webapi/entry.cgi')
  assert.equal(account.nasHost, 'https://nas.example.com')
  assert.equal(account.webhookPath, '/webhook/synology')
  assert.equal(account.dmPolicy, 'allowlist')
  assert.deepEqual(account.allowedUserIds, ['alice', 'bob'])
  assert.equal(account.rateLimitPerMinute, 45)
  assert.equal(account.botName, 'OpenClaw Ops')
  assert.equal(account.dangerouslyAllowNameMatching, true)
  assert.equal(account.dangerouslyAllowInheritedWebhookPath, true)
  assert.equal(account.allowInsecureSsl, true)
  assert.equal(cfg.plugins.entries['synology-chat'].enabled, true)
})

test('Synology Chat 诊断要求 Token 和 Incoming URL', () => {
  const missingUrl = buildOpenClawChannelDiagnosis({
    platform: 'synology-chat',
    configExists: true,
    channelEnabled: true,
    form: { token: 'synology-token' },
  })
  const ready = buildOpenClawChannelDiagnosis({
    platform: 'synology-chat',
    configExists: true,
    channelEnabled: true,
    form: {
      token: 'synology-token',
      incomingUrl: 'https://nas.example.com/webapi/entry.cgi',
    },
  })

  assert.equal(missingUrl.checks.find(item => item.id === 'credentials')?.ok, false)
  assert.match(missingUrl.checks.find(item => item.id === 'credentials')?.detail || '', /Incoming URL/)
  assert.equal(ready.checks.find(item => item.id === 'credentials')?.ok, true)
})

test('Google Chat 渠道保存会写入 service account 与嵌套 DM 策略', () => {
  const cfg = { channels: {} }

  mergeOpenClawMessagingPlatformConfig(cfg, {
    platform: 'googlechat',
    accountId: 'workspace',
    form: {
      serviceAccountFile: '/run/secrets/googlechat.json',
      audienceType: 'app-url',
      audience: 'https://panel.example.com/googlechat',
      webhookPath: '/googlechat',
      webhookUrl: 'https://panel.example.com/googlechat',
      dmPolicy: 'open',
      allowFrom: 'users/123',
      groupPolicy: 'mentioned',
      groupAllowFrom: 'spaces/AAA',
      dangerouslyAllowNameMatching: 'true',
      requireMention: 'true',
      mediaMaxMb: '20',
      responsePrefix: '[AI]',
    },
  })

  const account = cfg.channels.googlechat.accounts.workspace
  assert.equal(cfg.channels.googlechat.defaultAccount, 'workspace')
  assert.equal(account.serviceAccountFile, '/run/secrets/googlechat.json')
  assert.equal(account.audienceType, 'app-url')
  assert.equal(account.audience, 'https://panel.example.com/googlechat')
  assert.equal(account.webhookPath, '/googlechat')
  assert.equal(account.webhookUrl, 'https://panel.example.com/googlechat')
  assert.deepEqual(account.dm, { policy: 'open', allowFrom: ['users/123', '*'] })
  assert.equal(account.groupPolicy, 'open')
  assert.equal(account.requireMention, true)
  assert.deepEqual(account.groupAllowFrom, ['spaces/AAA'])
  assert.equal(account.dangerouslyAllowNameMatching, true)
  assert.equal(account.mediaMaxMb, 20)
  assert.equal(account.responsePrefix, '[AI]')
  assert.equal(cfg.plugins.entries.googlechat.enabled, true)
})

test('Google Chat 读取会把嵌套 DM 策略回显为表单字段', () => {
  const values = buildMessagingPlatformFormValues('googlechat', {
    serviceAccountFile: '/run/secrets/googlechat.json',
    audienceType: 'project-number',
    audience: '1234567890',
    dm: { policy: 'allowlist', allowFrom: ['users/123', 'name@example.com'] },
    groupPolicy: 'allowlist',
    groupAllowFrom: ['spaces/AAA'],
    requireMention: true,
    dangerouslyAllowNameMatching: true,
    mediaMaxMb: 20,
  })

  assert.equal(values.serviceAccountFile, '/run/secrets/googlechat.json')
  assert.equal(values.audienceType, 'project-number')
  assert.equal(values.audience, '1234567890')
  assert.equal(values.dmPolicy, 'allowlist')
  assert.equal(values.allowFrom, 'users/123, name@example.com')
  assert.equal(values.groupPolicy, 'allowlist')
  assert.equal(values.groupAllowFrom, 'spaces/AAA')
  assert.equal(values.requireMention, 'true')
  assert.equal(values.dangerouslyAllowNameMatching, 'true')
  assert.equal(values.mediaMaxMb, '20')
})

test('Google Chat 诊断要求 service account 文件或内联 JSON 其中一项', () => {
  const missingCredential = buildOpenClawChannelDiagnosis({
    platform: 'googlechat',
    configExists: true,
    channelEnabled: true,
    form: { audienceType: 'app-url', audience: 'https://panel.example.com/googlechat' },
  })
  const ready = buildOpenClawChannelDiagnosis({
    platform: 'googlechat',
    configExists: true,
    channelEnabled: true,
    form: { serviceAccountFile: '/run/secrets/googlechat.json' },
  })

  assert.equal(missingCredential.checks.find(item => item.id === 'credentials')?.ok, false)
  assert.match(missingCredential.checks.find(item => item.id === 'credentials')?.detail || '', /Service Account/)
  assert.equal(ready.checks.find(item => item.id === 'credentials')?.ok, true)
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
