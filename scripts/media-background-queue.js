export function createBackgroundJobQueue({ concurrency = 2, worker, onError = null } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('队列并发数必须是正整数')
  if (typeof worker !== 'function') throw new Error('队列缺少 worker')

  const pending = []
  const pendingIds = new Set()
  const activeIds = new Set()
  const idleWaiters = new Set()

  function settleIdleWaiters() {
    if (pending.length || activeIds.size) return
    for (const resolve of idleWaiters) resolve()
    idleWaiters.clear()
  }

  function drain() {
    while (activeIds.size < concurrency && pending.length) {
      const jobId = pending.shift()
      pendingIds.delete(jobId)
      activeIds.add(jobId)
      Promise.resolve()
        .then(() => worker(jobId))
        .catch(error => onError?.(jobId, error))
        .finally(() => {
          activeIds.delete(jobId)
          drain()
          settleIdleWaiters()
        })
    }
    settleIdleWaiters()
  }

  return {
    enqueue(jobId) {
      const id = String(jobId || '').trim()
      if (!id || pendingIds.has(id) || activeIds.has(id)) return false
      pending.push(id)
      pendingIds.add(id)
      queueMicrotask(drain)
      return true
    },
    has(jobId) {
      const id = String(jobId || '').trim()
      return pendingIds.has(id) || activeIds.has(id)
    },
    stats() {
      return { active: activeIds.size, pending: pending.length }
    },
    whenIdle() {
      if (!pending.length && !activeIds.size) return Promise.resolve()
      return new Promise(resolve => idleWaiters.add(resolve))
    },
  }
}
