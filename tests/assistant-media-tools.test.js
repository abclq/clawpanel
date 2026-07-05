import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/assistant.js', import.meta.url), 'utf8')

test('晴辰助手注册媒体生成工具组并受设置开关控制', () => {
  assert.match(source, /media:\s*\[/, 'TOOL_DEFS 必须包含 media 工具组')
  assert.match(source, /tc\.media\s*===\s*true/, '媒体工具必须显式开启（默认关闭，老配置缺省视为关闭）')
  assert.doesNotMatch(source, /media:\s*true\s*\}/, '默认配置不得默认开启媒体工具')
  assert.match(source, /id="ast-tool-media"/, '助手工具设置页必须提供媒体生成开关')
})

test('晴辰助手媒体工具调用复用媒体中心 API', () => {
  for (const name of ['get_media_config', 'generate_image', 'create_video_task', 'poll_video_task', 'list_media_jobs']) {
    assert.match(source, new RegExp(`case ['"]${name}['"]`), `executeTool 缺少 ${name}`)
  }
  assert.match(source, /api\.readMediaConfig\(\)/, 'get_media_config 应复用媒体中心配置')
  assert.match(source, /api\.generateImage\(/, 'generate_image 应复用媒体中心图片生成 API')
  assert.match(source, /api\.createVideoTask\(/, 'create_video_task 应复用媒体中心视频任务 API')
  assert.match(source, /api\.pollVideoTask\(/, 'poll_video_task 应复用媒体中心视频轮询 API')
  assert.match(source, /api\.listMediaJobs\(/, 'list_media_jobs 应复用媒体中心历史任务 API')
})

test('晴辰助手将会产生费用的媒体生成工具纳入确认流程', () => {
  assert.match(source, /DANGEROUS_TOOLS[\s\S]*generate_image/, '图片生成应进入确认流程')
  assert.match(source, /DANGEROUS_TOOLS[\s\S]*create_video_task/, '视频生成应进入确认流程')
  // 付费生成必须无条件确认，不受 confirmDanger（无限制模式）开关影响
  assert.match(source, /isPaidMedia\s*=\s*toolName\s*===\s*'generate_image'\s*\|\|\s*toolName\s*===\s*'create_video_task'/, '付费媒体工具必须有独立的无条件确认分支')
  assert.match(source, /else if \(isPaidMedia\)/, '付费媒体确认分支必须先于 confirmDanger 模式判断')
})
