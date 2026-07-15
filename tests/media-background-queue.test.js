import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let createBackgroundJobQueue
try {
  ({ createBackgroundJobQueue } = await import('../scripts/media-background-queue.js'))
} catch {}

const rustSource = readFileSync(new URL('../src-tauri/src/commands/media.rs', import.meta.url), 'utf8')
const webSource = readFileSync(new URL('../scripts/dev-api.js', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/pages/media.js', import.meta.url), 'utf8')

async function waitFor(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('等待后台队列状态超时')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

test('后台队列限制并发并拒绝重复入队', async () => {
  assert.equal(typeof createBackgroundJobQueue, 'function', '应提供可复用的后台任务队列')

  const releases = []
  const started = []
  let active = 0
  let maxActive = 0
  const queue = createBackgroundJobQueue({
    concurrency: 2,
    worker: async jobId => {
      started.push(jobId)
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => releases.push(resolve))
      active -= 1
    },
  })

  assert.equal(queue.enqueue('job-1'), true)
  assert.equal(queue.enqueue('job-1'), false, '同一任务不能重复消费')
  assert.equal(queue.enqueue('job-2'), true)
  assert.equal(queue.enqueue('job-3'), true)
  await waitFor(() => started.length === 2)
  assert.equal(maxActive, 2)
  assert.deepEqual(started, ['job-1', 'job-2'])

  releases.shift()()
  await waitFor(() => started.length === 3)
  assert.equal(started[2], 'job-3')
  while (releases.length) releases.shift()()
  await queue.whenIdle()
  assert.deepEqual(queue.stats(), { active: 0, pending: 0 })
})

test('Tauri 和 Web 提交立即持久化 queued 并由后台恢复消费', () => {
  for (const [label, source] of [['Tauri', rustSource], ['Web', webSource]]) {
    assert.match(source, /MEDIA_QUEUE_CONCURRENCY/, `${label} 应限制媒体生成并发`)
    assert.match(source, /status["']?\s*[:=]\s*["']queued["']|["']status["']\s*:\s*["']queued["']/, `${label} 应持久化 queued 状态`)
    assert.match(source, /schedule_media_job|queueMediaJob/, `${label} 应在后台调度任务`)
    assert.match(source, /recover_media_queue|recoverMediaQueue/, `${label} 应恢复持久化的未完成任务`)
  }
})

test('创作中心提供生成队列、自动刷新并在提交后解锁当前表单', () => {
  assert.match(pageSource, /['"]queue['"][\s\S]*media\.tabQueue/, '页面应提供生成队列页签')
  assert.match(pageSource, /setInterval\([\s\S]*refresh/, '页面应自动刷新任务状态')
  assert.match(pageSource, /export function cleanup\(/, '离开页面时应停止自动刷新')
  assert.match(pageSource, /querySelector\(['"]#media-image-form button\[type="submit"\]/, '图片提交后应解锁当前表单按钮')
  assert.match(pageSource, /querySelector\(['"]#media-video-form button\[type="submit"\]/, '视频提交后应解锁当前表单按钮')
})
