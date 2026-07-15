import { api, isTauriRuntime } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { showConfirm } from '../components/modal.js'
import { icon } from '../lib/icons.js'
import { t } from '../lib/i18n.js'

function esc(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function attr(value) {
  return esc(value).replace(/'/g, '&#39;')
}

const MEDIA_PROVIDERS = [
  { id: 'volcengine', icon: 'box', defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'openai', icon: 'sparkles', defaultBaseUrl: 'https://api.openai.com/v1' },
  { id: 'newapi', icon: 'globe', defaultBaseUrl: 'https://your-newapi.example.com/v1' },
]

let activeMediaState = null

export function cleanup() {
  if (!activeMediaState) return
  if (activeMediaState.refreshTimer) clearInterval(activeMediaState.refreshTimer)
  activeMediaState.previewObserver?.disconnect?.()
  activeMediaState = null
}

function providerMeta(providerId) {
  return MEDIA_PROVIDERS.find(item => item.id === providerId) || MEDIA_PROVIDERS[0]
}

function providerLabel(providerId) {
  const key = providerId === 'openai' ? 'media.providerOpenAI'
    : providerId === 'newapi' ? 'media.providerNewAPI'
      : 'media.providerVolcengine'
  const label = t(key)
  return label === key ? providerId : label
}

function activeProviderId(state) {
  const id = state.activeProvider || state.config?.defaults?.provider || 'volcengine'
  return MEDIA_PROVIDERS.some(item => item.id === id) ? id : 'volcengine'
}

function isOpenAICompatibleProvider(state) {
  const id = activeProviderId(state)
  return id === 'openai' || id === 'newapi'
}

function providerConfig(state, providerId = activeProviderId(state)) {
  return state.config?.providers?.[providerId] || {}
}

function imageSizeOptions(state) {
  if (isOpenAICompatibleProvider(state)) {
    return ['auto', '1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792']
  }
  return ['1K', '2K', '4K', 'adaptive', '1024x1024', '1536x1024']
}

function defaultImageSize(state) {
  return isOpenAICompatibleProvider(state) ? '1024x1024' : '2K'
}

function statusLabel(status) {
  return t(`media.${status}`) === `media.${status}` ? status : t(`media.${status}`)
}

function mergeJob(state, job) {
  if (!job?.id) return
  const idx = state.jobs.findIndex(item => item.id === job.id)
  if (idx >= 0) state.jobs[idx] = job
  else {
    state.jobs.unshift(job)
    state.historyTotal += 1
  }
  state.jobs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

function assetCount(jobs) {
  return jobs.reduce((sum, job) => sum + (Array.isArray(job.assets) ? job.assets.length : 0), 0)
}

function assetKind(asset) {
  const kind = String(asset?.kind || '').toLowerCase()
  if (kind === 'image' || kind === 'video') return kind
  const mime = String(asset?.mime || '').toLowerCase()
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('image/')) return 'image'
  const path = String(asset?.path || '').toLowerCase()
  if (/\.(mp4|mov|webm)$/.test(path)) return 'video'
  return 'image'
}

function outputDirLabel(config) {
  return String(config?.outputDir || '').trim() ? t('media.outputDirCustom') : t('media.outputDirDefault')
}

export async function render() {
  cleanup()
  const page = document.createElement('div')
  page.className = 'page media-page'
  const state = {
    tab: 'image',
    config: null,
    activeProvider: 'volcengine',
    jobs: [],
    filter: { type: '', status: '', offset: 0, limit: 24 },
    historyTotal: 0,
    historyHasMore: false,
    historyLoadingMore: false,
    previews: new Map(),
    lastImageJob: null,
    modelFetch: null,
    modelFetchBusy: false,
    busy: '',
    refreshBusy: false,
    refreshTimer: null,
  }
  activeMediaState = state

  page.innerHTML = `
    <style>
      .media-page .media-header-row{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
      .media-page .media-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border-primary);border-radius:8px;background:var(--bg-secondary);color:var(--text-secondary);font-size:12px}
      .media-page .media-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0}
      .media-page .media-summary-card{border:1px solid var(--border-primary);background:var(--bg-primary);border-radius:8px;padding:14px 16px;min-height:72px}
      .media-page .media-summary-label{font-size:12px;color:var(--text-tertiary);margin-bottom:8px}
      .media-page .media-summary-value{font-size:18px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px}
      .media-page .media-summary-path{margin-top:8px;font-size:11px;color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .media-page .media-shell{border:1px solid var(--border-primary);background:var(--bg-primary);border-radius:8px;overflow:hidden}
      .media-page .media-tabs{display:flex;gap:0;border-bottom:1px solid var(--border-primary);background:var(--bg-secondary);overflow:auto}
      .media-page .media-tab{border:0;border-right:1px solid var(--border-primary);background:transparent;color:var(--text-secondary);padding:12px 16px;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap}
      .media-page .media-tab.active{background:var(--bg-primary);color:var(--primary);font-weight:600}
      .media-page .media-body{padding:18px}
      .media-page .media-workbench{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:18px;align-items:start}
      .media-page .media-panel{border:1px solid var(--border-primary);border-radius:8px;background:var(--bg-primary);padding:16px}
      .media-page .media-panel-title{display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text-primary);margin-bottom:14px}
      .media-page .media-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .media-page .media-form-grid .wide{grid-column:1/-1}
      .media-page textarea.form-input{min-height:136px;resize:vertical;line-height:1.55}
      .media-page .media-result{min-height:320px;border:1px dashed var(--border-primary);border-radius:8px;background:var(--bg-secondary);padding:14px}
      .media-page .media-empty{display:flex;align-items:center;justify-content:center;text-align:center;color:var(--text-tertiary);min-height:260px;font-size:13px;line-height:1.7}
      .media-page .media-empty-stack{display:grid;justify-items:center;gap:10px;max-width:300px}
      .media-page .media-summary-action{margin-top:10px}
      .media-page .media-asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
      .media-page .media-preview{aspect-ratio:1/1;border:1px solid var(--border-primary);border-radius:8px;background:var(--bg-secondary);overflow:hidden;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:12px}
      .media-page .media-preview img,.media-page .media-preview video{width:100%;height:100%;object-fit:cover;display:block}
      .media-page .media-preview video{background:#000}
      .media-page .media-history-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}
      .media-page .media-filter-group{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .media-page .media-history-count{font-size:12px;color:var(--text-tertiary);margin-bottom:12px}
      .media-page .media-history-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:12px;align-items:start}
      .media-page .media-history-card{border:1px solid var(--border-primary);border-radius:8px;background:var(--bg-primary);overflow:hidden;min-width:0}
      .media-page .media-history-preview{border:0;border-bottom:1px solid var(--border-primary);border-radius:0;background:var(--bg-secondary)}
      .media-page .media-history-preview .media-video-placeholder-inner{padding:12px;text-align:center;display:grid;gap:8px;justify-items:center;color:var(--text-tertiary)}
      .media-page .media-history-body{padding:10px;display:grid;gap:7px}
      .media-page .media-history-title{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
      .media-page .media-history-kind{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--text-primary);min-width:0}
      .media-page .media-history-prompt{font-size:12px;line-height:1.45;color:var(--text-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:34px}
      .media-page .media-history-meta{font-size:11px;color:var(--text-tertiary);display:grid;gap:2px;min-width:0}
      .media-page .media-history-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .media-page .media-history-actions{display:flex;gap:6px;flex-wrap:wrap}
      .media-page .media-history-actions .btn{min-height:28px}
      .media-page .media-history-footer{display:flex;justify-content:center;margin-top:14px}
      .media-page .media-video-placeholder{background:linear-gradient(135deg,var(--bg-secondary),var(--bg-primary));}
      .media-page .media-job-list{display:grid;gap:12px}
      .media-page .media-job-card{border:1px solid var(--border-primary);border-radius:8px;background:var(--bg-primary);padding:14px}
      .media-page .media-job-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}
      .media-page .media-job-title{display:flex;align-items:center;gap:8px;font-weight:700;color:var(--text-primary)}
      .media-page .media-status{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;font-size:11px;border:1px solid var(--border-primary);color:var(--text-secondary);white-space:nowrap;flex:0 0 auto}
      .media-page .media-status.succeeded{color:var(--success);border-color:color-mix(in srgb,var(--success) 35%,var(--border-primary))}
      .media-page .media-status.failed{color:var(--error);border-color:color-mix(in srgb,var(--error) 35%,var(--border-primary))}
      .media-page .media-status.running{color:var(--primary);border-color:color-mix(in srgb,var(--primary) 35%,var(--border-primary))}
      .media-page .media-status.queued{color:var(--warning);border-color:color-mix(in srgb,var(--warning) 35%,var(--border-primary))}
      .media-page .media-meta{font-size:12px;color:var(--text-tertiary);display:flex;gap:12px;flex-wrap:wrap}
      .media-page .media-prompt{margin:10px 0;color:var(--text-secondary);font-size:13px;line-height:1.6;white-space:pre-wrap}
      .media-page .media-job-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .media-page .media-asset-chip{display:flex;align-items:center;gap:8px;border:1px solid var(--border-primary);border-radius:8px;padding:8px 10px;color:var(--text-secondary);font-size:12px;min-width:0}
      .media-page .media-asset-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .media-page .media-settings{display:grid;grid-template-columns:minmax(320px,520px) 1fr;gap:18px;align-items:start}
      .media-page .media-path-row{display:flex;gap:8px;align-items:center}
      .media-page .media-path-row .form-input{min-width:0;flex:1}
      .media-page .media-note{border:1px solid var(--border-primary);border-radius:8px;padding:14px;background:var(--bg-secondary);color:var(--text-secondary);font-size:13px;line-height:1.7}
      .media-page .media-guide-steps{display:grid;gap:8px;margin:10px 0 14px;padding:0;list-style:none}
      .media-page .media-guide-steps li{display:flex;gap:8px;align-items:flex-start;color:var(--text-secondary);font-size:13px}
      .media-page .media-guide-steps b{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;background:var(--primary);color:#fff;font-size:11px;flex:0 0 auto;margin-top:1px}
      .media-page .media-link-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .media-page .media-model-list{display:grid;gap:8px;margin-top:12px;max-height:360px;overflow:auto}
      .media-page .media-model-row{border:1px solid var(--border-primary);border-radius:8px;padding:10px;background:var(--bg-primary)}
      .media-page .media-model-main{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .media-page .media-model-id{font-family:var(--font-mono);font-size:12px;color:var(--text-primary);word-break:break-all}
      .media-page .media-model-caps{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
      .media-page .media-model-cap{font-size:10px;border:1px solid var(--border-primary);border-radius:999px;padding:2px 7px;color:var(--text-tertiary)}
      .media-page .media-error{margin-top:10px;color:var(--error);font-size:12px;white-space:pre-wrap}
      @media (max-width:900px){
        .media-page .media-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
        .media-page .media-workbench,.media-page .media-settings{grid-template-columns:1fr}
      }
      @media (max-width:560px){
        .media-page .media-summary{grid-template-columns:1fr}
        .media-page .media-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible}
        .media-page .media-tab{justify-content:center;border-bottom:1px solid var(--border-primary);padding:10px 8px}
        .media-page .media-body{padding:14px}
        .media-page .media-panel{padding:14px}
        .media-page .media-form-grid{grid-template-columns:1fr}
        .media-page .media-path-row{align-items:stretch;flex-direction:column}
        .media-page .media-history-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
      }
    </style>
    <div class="page-header">
      <div class="media-header-row">
        <div>
          <h1 class="page-title">${t('media.title')}</h1>
          <p class="page-desc">${t('media.desc')}</p>
        </div>
        <div class="media-badge">${icon('sparkles', 14)} ${t('media.localOnlyHint')}</div>
      </div>
    </div>
    <div class="media-summary" id="media-summary"></div>
    <div class="media-shell">
      <div class="media-tabs" id="media-tabs">
        ${renderTabs(state.tab)}
      </div>
      <div class="media-body" id="media-body">
        <div class="media-empty">${t('media.loading') || 'Loading...'}</div>
      </div>
    </div>
  `

  bindEvents(page, state)
  loadInitial(page, state)
  return page
}

function renderTabs(active) {
  const tabs = [
    ['image', 'image', t('media.tabImage')],
    ['video', 'film', t('media.tabVideo')],
    ['queue', 'list', t('media.tabQueue')],
    ['history', 'list', t('media.tabHistory')],
    ['settings', 'gear', t('media.tabSettings')],
  ]
  return tabs.map(([key, iconName, label]) => `
    <button class="media-tab${active === key ? ' active' : ''}" data-tab="${key}" type="button">${icon(iconName, 14)} ${label}</button>
  `).join('')
}

async function loadInitial(page, state) {
  try {
    const [config, jobsDoc] = await Promise.all([
      api.readMediaConfig(),
      api.listMediaJobs({ limit: state.filter.limit, offset: 0 }),
    ])
    state.config = config
    state.activeProvider = MEDIA_PROVIDERS.some(item => item.id === config?.defaults?.provider)
      ? config.defaults.provider
      : 'volcengine'
    applyJobsResponse(state, jobsDoc)
    renderAll(page, state)
    startAutoRefresh(page, state)
  } catch (error) {
    console.error('[media] load failed', error)
    page.querySelector('#media-body').innerHTML = `<div class="media-empty">${esc(error?.message || String(error))}</div>`
    toast(error?.message || String(error), 'error')
  }
}

function applyJobsResponse(state, jobsDoc, { append = false } = {}) {
  const incoming = Array.isArray(jobsDoc?.jobs) ? jobsDoc.jobs : []
  if (append) {
    const seen = new Set()
    state.jobs = [...state.jobs, ...incoming].filter(job => {
      if (!job?.id || seen.has(job.id)) return false
      seen.add(job.id)
      return true
    })
  } else {
    state.jobs = incoming
  }
  const total = Number(jobsDoc?.total)
  state.historyTotal = Number.isFinite(total) ? Math.max(total, state.jobs.length) : state.jobs.length
  state.historyHasMore = Boolean(jobsDoc?.hasMore)
  state.filter.offset = state.jobs.length
}

async function refreshJobs(page, state, { append = false } = {}) {
  const filter = {
    type: state.filter.type,
    status: state.filter.status,
    limit: state.filter.limit,
    offset: append ? state.jobs.length : 0,
  }
  if (append) {
    state.historyLoadingMore = true
    renderAll(page, state)
  }
  try {
    const jobsDoc = await api.listMediaJobs(filter)
    applyJobsResponse(state, jobsDoc, { append })
  } finally {
    state.historyLoadingMore = false
  }
  renderAll(page, state)
}

function startAutoRefresh(page, state) {
  if (state.refreshTimer) clearInterval(state.refreshTimer)
  state.refreshTimer = setInterval(() => {
    refreshLiveJobs(page, state).catch(error => console.warn('[media] auto refresh failed', error))
  }, 2000)
}

async function refreshLiveJobs(page, state) {
  if (state.refreshBusy || !page.isConnected) return
  state.refreshBusy = true
  try {
    const filter = state.tab === 'history'
      ? { type: state.filter.type, status: state.filter.status, limit: state.filter.limit, offset: 0 }
      : { limit: 100, offset: 0 }
    const jobsDoc = await api.listMediaJobs(filter)
    applyJobsResponse(state, jobsDoc)
    if (state.lastImageJob?.id) {
      state.lastImageJob = state.jobs.find(job => job.id === state.lastImageJob.id) || state.lastImageJob
    } else {
      state.lastImageJob = state.jobs.find(job => job.type === 'image') || null
    }
    renderLiveJobs(page, state)
  } finally {
    state.refreshBusy = false
  }
}

function renderLiveJobs(page, state) {
  renderSummary(page, state)
  if (state.tab === 'queue' || state.tab === 'history') {
    renderBody(page, state)
    hydratePreviews(page, state)
    return
  }
  if (state.tab === 'image') {
    const result = page.querySelector('#media-image-result')
    if (result && state.lastImageJob) result.innerHTML = `<div class="media-job-list">${renderJobCard(state.lastImageJob)}</div>`
  } else if (state.tab === 'video') {
    const result = page.querySelector('#media-video-result')
    if (result) result.innerHTML = renderRunningVideos(state)
  }
  hydratePreviews(page, state)
}

function renderAll(page, state) {
  page.querySelector('#media-tabs').innerHTML = renderTabs(state.tab)
  renderSummary(page, state)
  renderBody(page, state)
  hydratePreviews(page, state)
}

function renderSummary(page, state) {
  const provider = providerConfig(state)
  const saved = !!provider.apiKeySaved
  const activeProvider = activeProviderId(state)
  const running = state.jobs.filter(job => job.status === 'queued' || job.status === 'running').length
  const totalJobs = Math.max(state.historyTotal || 0, state.jobs.length)
  page.querySelector('#media-summary').innerHTML = `
    <div class="media-summary-card">
      <div class="media-summary-label">${t('media.provider')}</div>
      <div class="media-summary-value">${icon(providerMeta(activeProvider).icon, 18)} ${providerLabel(activeProvider)}</div>
      <div class="media-summary-path">${saved ? t('media.configured') : t('media.unconfigured')}</div>
      ${saved ? '' : `<button class="btn btn-secondary btn-sm media-summary-action" type="button" data-action="open-settings">${icon('gear', 12)} ${t('media.configureNow')}</button>`}
    </div>
    <div class="media-summary-card">
      <div class="media-summary-label">${t('media.jobs')}</div>
      <div class="media-summary-value">${icon('list', 18)} ${totalJobs}</div>
    </div>
    <div class="media-summary-card">
      <div class="media-summary-label">${t('media.assets')}</div>
      <div class="media-summary-value">${icon('folder', 18)} ${assetCount(state.jobs)}</div>
    </div>
    <div class="media-summary-card">
      <div class="media-summary-label">${t('media.outputDir')}</div>
      <div class="media-summary-value">${icon('folder', 18)} ${outputDirLabel(state.config)}</div>
      <div class="media-summary-path" title="${attr(state.config?.resolvedOutputDir || '')}">${esc(state.config?.resolvedOutputDir || '-')}</div>
      <button class="btn btn-secondary btn-sm media-summary-action" type="button" data-action="open-output-dir">${icon('folder', 12)} ${t('media.outputDirOpen')}</button>
    </div>
    <div class="media-summary-card">
      <div class="media-summary-label">${t('media.running')}</div>
      <div class="media-summary-value">${icon('refresh-cw', 18)} ${running}</div>
    </div>
  `
}

function renderBody(page, state) {
  const body = page.querySelector('#media-body')
  if (state.tab === 'settings') body.innerHTML = renderSettings(state)
  else if (state.tab === 'video') body.innerHTML = renderVideoWorkbench(state)
  else if (state.tab === 'queue') body.innerHTML = renderQueue(state)
  else if (state.tab === 'history') body.innerHTML = renderHistory(state)
  else body.innerHTML = renderImageWorkbench(state)
}

function renderImageWorkbench(state) {
  const provider = providerConfig(state)
  const selectedSize = defaultImageSize(state)
  return `
    <div class="media-workbench">
      <form class="media-panel" id="media-image-form">
        <div class="media-panel-title">${icon('image', 16)} ${t('media.tabImage')}</div>
        <div class="media-form-grid">
          <div class="form-group wide">
            <label class="form-label" for="media-image-prompt">${t('media.imagePrompt')}</label>
            <textarea class="form-input" id="media-image-prompt" placeholder="${attr(t('media.imagePlaceholder'))}"></textarea>
          </div>
          <div class="form-group wide">
            <label class="form-label" for="media-image-model">${t('media.modelId')}</label>
            <input class="form-input" id="media-image-model" value="${attr(provider.imageModel || '')}" placeholder="${attr(t('media.modelIdPlaceholder'))}">
          </div>
          <div class="form-group">
            <label class="form-label" for="media-image-size">${t('media.size')}</label>
            <select class="form-input" id="media-image-size">
              ${imageSizeOptions(state).map(v => `<option value="${v}" ${v === selectedSize ? 'selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="media-image-count">${t('media.count')}</label>
            <input class="form-input" id="media-image-count" type="number" min="1" max="4" value="1">
          </div>
          <label class="form-group wide" style="display:${isOpenAICompatibleProvider(state) ? 'none' : 'flex'};align-items:center;gap:8px;color:var(--text-secondary);font-size:13px">
            <input id="media-image-watermark" type="checkbox" checked>
            <span>${t('media.watermark')}</span>
          </label>
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%;margin-top:12px" ${state.busy ? 'disabled' : ''}>${icon('sparkles', 14)} ${t('media.generateImage')}</button>
      </form>
      <div class="media-panel">
        <div class="media-panel-title">${icon('folder', 16)} ${t('media.assets')}</div>
        <div id="media-image-result" class="media-result">
          ${state.lastImageJob ? `<div class="media-job-list">${renderJobCard(state.lastImageJob)}</div>` : `<div class="media-empty">${provider.apiKeySaved ? t('media.imagePlaceholder') : renderConfigureFirstCta()}</div>`}
        </div>
      </div>
    </div>
  `
}

function renderVideoWorkbench(state) {
  const provider = providerConfig(state)
  return `
    <div class="media-workbench">
      <form class="media-panel" id="media-video-form">
        <div class="media-panel-title">${icon('film', 16)} ${t('media.tabVideo')}</div>
        <div class="media-form-grid">
          <div class="form-group wide">
            <label class="form-label" for="media-video-prompt">${t('media.videoPrompt')}</label>
            <textarea class="form-input" id="media-video-prompt" placeholder="${attr(t('media.videoPlaceholder'))}"></textarea>
          </div>
          <div class="form-group wide">
            <label class="form-label" for="media-video-model">${t('media.modelId')}</label>
            <input class="form-input" id="media-video-model" value="${attr(provider.videoModel || '')}" placeholder="${attr(t('media.modelIdPlaceholder'))}">
          </div>
          <div class="form-group">
            <label class="form-label" for="media-video-ratio">${t('media.ratio')}</label>
            <select class="form-input" id="media-video-ratio">${['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].map(v => `<option value="${v}">${v}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="media-video-resolution">${t('media.resolution')}</label>
            <select class="form-input" id="media-video-resolution">${['720p', '1080p', '480p', '1440p'].map(v => `<option value="${v}">${v}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="media-video-duration">${t('media.duration')}</label>
            <input class="form-input" id="media-video-duration" type="number" min="1" max="30" value="5">
          </div>
          <div class="form-group">
            <label class="form-label" for="media-video-image-url">${t('media.imageUrl')}</label>
            <input class="form-input" id="media-video-image-url" placeholder="${attr(t('media.imageUrlPlaceholder'))}">
          </div>
        </div>
        <button class="btn btn-primary" type="submit" style="width:100%;margin-top:12px" ${state.busy ? 'disabled' : ''}>${icon('play', 14)} ${t('media.createVideoTask')}</button>
      </form>
      <div class="media-panel">
        <div class="media-panel-title">${icon('refresh-cw', 16)} ${t('media.running')}</div>
        <div id="media-video-result" class="media-result">
          ${renderRunningVideos(state)}
        </div>
      </div>
    </div>
  `
}

function renderRunningVideos(state) {
  const videos = state.jobs.filter(job => job.type === 'video').slice(0, 5)
  if (!videos.length) return `<div class="media-empty">${providerConfig(state).apiKeySaved ? t('media.videoPlaceholder') : renderConfigureFirstCta()}</div>`
  return `<div class="media-job-list">${videos.map(renderJobCard).join('')}</div>`
}

function renderConfigureFirstCta() {
  return `
    <div class="media-empty-stack">
      <div>${t('media.configureFirst')}</div>
      <button class="btn btn-primary btn-sm" type="button" data-action="open-settings">${icon('gear', 13)} ${t('media.configureNow')}</button>
    </div>
  `
}

function renderSettings(state) {
  const activeProvider = activeProviderId(state)
  const provider = providerConfig(state, activeProvider)
  const meta = providerMeta(activeProvider)
  const mask = provider.apiKeyMask ? `<div class="form-hint">${t('media.keySavedMask', { mask: provider.apiKeyMask })}</div>` : ''
  return `
    <div class="media-settings">
      <form class="media-panel" id="media-settings-form">
        <div class="media-panel-title">${icon(meta.icon, 16)} ${t('media.settingsTitle')}</div>
        <div class="media-form-grid">
          <div class="form-group wide">
            <label class="form-label" for="media-provider">${t('media.providerSelect')}</label>
            <select class="form-input" id="media-provider">
              ${MEDIA_PROVIDERS.map(item => `<option value="${item.id}" ${item.id === activeProvider ? 'selected' : ''}>${providerLabel(item.id)}</option>`).join('')}
            </select>
            <div class="form-hint">${t('media.providerSelectHint')}</div>
          </div>
          <div class="form-group wide">
            <label class="form-label" for="media-api-key">${t('media.apiKey')}</label>
            <input class="form-input" id="media-api-key" type="password" autocomplete="new-password" spellcheck="false" placeholder="${attr(apiKeyPlaceholder(activeProvider))}">
            ${mask}
          </div>
          <div class="form-group wide">
            <label class="form-label" for="media-output-dir">${t('media.outputDir')}</label>
            <div class="media-path-row">
              <input class="form-input" id="media-output-dir" value="${attr(state.config?.outputDir || '')}" spellcheck="false" placeholder="${attr(t('media.outputDirPlaceholder'))}">
              <button class="btn btn-secondary" type="button" data-action="open-output-dir">${icon('folder', 14)} ${t('media.outputDirOpen')}</button>
            </div>
            <div class="form-hint">${t('media.outputDirHint', { path: state.config?.resolvedOutputDir || '' })}</div>
          </div>
          <div class="form-group wide">
            <label class="form-label" for="media-base-url">${t('media.baseUrl')}</label>
            <input class="form-input" id="media-base-url" value="${attr(provider.baseUrl || meta.defaultBaseUrl)}">
          </div>
          <div class="form-group">
            <label class="form-label" for="media-default-image-model">${t('media.imageModel')}</label>
            <input class="form-input" id="media-default-image-model" list="media-model-candidates" value="${attr(provider.imageModel || '')}">
          </div>
          <div class="form-group">
            <label class="form-label" for="media-default-video-model">${t('media.videoModel')}</label>
            <input class="form-input" id="media-default-video-model" list="media-model-candidates" value="${attr(provider.videoModel || '')}">
          </div>
          <div class="form-group">
            <label class="form-label" for="media-timeout">${t('media.timeoutSeconds')}</label>
            <input class="form-input" id="media-timeout" type="number" min="30" max="1800" value="${attr(provider.timeoutSeconds || 600)}">
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
          <button class="btn btn-primary" type="submit">${icon('check', 14)} ${t('media.saveSettings')}</button>
          <button class="btn btn-secondary" type="button" id="media-test-provider">${icon('zap', 14)} ${t('media.testProvider')}</button>
          <button class="btn btn-secondary" type="button" data-action="fetch-models" ${state.modelFetchBusy ? 'disabled' : ''}>${icon('refresh-cw', 14)} ${t('media.fetchModels')}</button>
        </div>
        ${renderModelDatalist(state)}
      </form>
      <div class="media-note">
        <div style="font-weight:700;color:var(--text-primary);margin-bottom:8px">${providerLabel(activeProvider)}</div>
        ${renderProviderGuide(activeProvider)}
        ${renderFetchedModels(state)}
      </div>
    </div>
  `
}

function apiKeyPlaceholder(providerId) {
  if (providerId === 'openai') return t('media.apiKeyPlaceholderOpenAI')
  if (providerId === 'newapi') return t('media.apiKeyPlaceholderNewAPI')
  return t('media.apiKeyPlaceholder')
}

function renderProviderGuide(providerId) {
  const steps = providerId === 'openai'
    ? ['media.guideStepKeyOpenAI', 'media.guideStepModelOpenAI', 'media.guideStepSaveOpenAI']
    : providerId === 'newapi'
      ? ['media.guideStepKeyNewAPI', 'media.guideStepModelNewAPI', 'media.guideStepSaveNewAPI']
      : ['media.guideStepKey', 'media.guideStepModel', 'media.guideStepSave']
  const links = providerId === 'openai'
    ? [
        ['key', 'https://platform.openai.com/api-keys', 'media.openOpenAIApiKeys'],
        ['image', 'https://developers.openai.com/api/docs/guides/image-generation', 'media.openOpenAIImageDoc'],
        ['film', 'https://developers.openai.com/api/docs/guides/video-generation', 'media.openOpenAIVideoDoc'],
      ]
    : providerId === 'newapi'
      ? [
          ['globe', 'https://docs.newapi.pro/en/docs/api', 'media.openNewAPIDoc'],
          ['image', 'https://docs.newapi.pro/en/docs/api/ai-model/images/openai/post-v1-images-generations', 'media.openNewAPIImageDoc'],
          ['film', 'https://docs.newapi.pro/en/docs/api/ai-model/videos/sora/createvideo', 'media.openNewAPIVideoDoc'],
        ]
      : [
          ['key', 'https://www.volcengine.com/docs/82379/1541594', 'media.openApiKeyDoc'],
          ['globe', 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey', 'media.openApiKeyConsole'],
          ['list', 'https://www.volcengine.com/docs/82379/1330310', 'media.openModelDoc'],
          ['box', 'https://console.volcengine.com/ark/region:ark+cn-beijing/model', 'media.openModelConsole'],
        ]
  const endpoints = providerId === 'volcengine'
    ? 'POST /images/generations · POST /contents/generations/tasks · GET /models'
    : 'POST /images/generations · POST /videos · GET /videos/{id} · GET /models'
  return `
    <ol class="media-guide-steps">
      ${steps.map((step, index) => `<li><b>${index + 1}</b><span>${t(step)}</span></li>`).join('')}
    </ol>
    <div class="media-link-row">
      ${links.map(([iconName, href, label]) => `<a class="btn btn-secondary btn-sm" href="${href}" target="_blank" rel="noopener">${icon(iconName, 13)} ${t(label)}</a>`).join('')}
    </div>
    ${providerId === 'openai' ? `<div style="margin-top:12px;color:var(--text-tertiary)">${t('media.openAISoraNotice')}</div>` : ''}
    <div style="margin-top:12px;color:var(--text-tertiary)">${endpoints}</div>
  `
}

function renderModelDatalist(state) {
  const models = state.modelFetch?.models || []
  if (!models.length) return ''
  return `<datalist id="media-model-candidates">${models.map(m => `<option value="${attr(m.id)}">${attr(m.label || m.id)}</option>`).join('')}</datalist>`
}

function renderFetchedModels(state) {
  const fetch = state.modelFetch
  if (state.modelFetchBusy) {
    return `<div class="media-model-list"><div class="media-asset-chip">${icon('refresh-cw', 13)} <span>${t('media.fetchingModels')}</span></div></div>`
  }
  if (!fetch) {
    return `<div style="margin-top:12px;color:var(--text-tertiary)">${t('media.fetchModelsHintGeneric')}</div>`
  }
  const models = Array.isArray(fetch.models) ? fetch.models : []
  if (!models.length) {
    return `<div class="media-error">${esc(fetch.message || t('media.fetchModelsUnsupported'))}</div>`
  }
  return `
    <div class="media-model-list">
      ${models.map(model => {
        const caps = Array.isArray(model.capabilities) ? model.capabilities : []
        return `<div class="media-model-row">
          <div class="media-model-main">
            <div>
              <div class="media-model-id">${esc(model.id)}</div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">${esc(model.label || model.id)}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-xs btn-secondary" type="button" data-action="use-model" data-kind="image" data-model="${attr(model.id)}">${t('media.useAsImageModel')}</button>
              <button class="btn btn-xs btn-secondary" type="button" data-action="use-model" data-kind="video" data-model="${attr(model.id)}">${t('media.useAsVideoModel')}</button>
            </div>
          </div>
          <div class="media-model-caps">${caps.length ? caps.map(c => `<span class="media-model-cap">${esc(c)}</span>`).join('') : `<span class="media-model-cap">${t('media.capUnknown')}</span>`}</div>
        </div>`
      }).join('')}
    </div>
  `
}

function renderQueue(state) {
  const active = state.jobs.filter(job => job.status === 'queued' || job.status === 'running')
  const recent = state.jobs.filter(job => job.status !== 'queued' && job.status !== 'running').slice(0, 12)
  return `
    <div class="media-history-toolbar">
      <div>
        <div class="media-panel-title" style="margin-bottom:4px">${icon('list', 16)} ${t('media.queueTitle')}</div>
        <div class="media-history-count" style="margin:0">${t('media.queueCount', { active: active.length, total: state.jobs.length })}</div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" data-action="refresh">${icon('refresh-cw', 13)} ${t('media.refresh')}</button>
    </div>
    <div class="media-panel-title">${t('media.queueActive')}</div>
    ${active.length ? `<div class="media-job-list">${active.map(renderJobCard).join('')}</div>` : `<div class="media-empty">${t('media.queueEmpty')}</div>`}
    ${recent.length ? `<div class="media-panel-title" style="margin-top:20px">${t('media.queueRecent')}</div><div class="media-job-list">${recent.map(renderJobCard).join('')}</div>` : ''}
  `
}

function renderHistory(state) {
  const typeOptions = [['', t('media.all')], ['image', t('media.tabImage')], ['video', t('media.tabVideo')]]
  const statusOptions = [['', t('media.all')], ['queued', t('media.queued')], ['running', t('media.running')], ['succeeded', t('media.succeeded')], ['failed', t('media.failed')], ['canceled', t('media.canceled')]]
  const items = historyItems(state.jobs)
  const total = Math.max(state.historyTotal || 0, state.jobs.length)
  return `
    <div class="media-history-toolbar">
      <div class="media-filter-group">
        <select class="form-input" id="media-filter-type" style="width:150px">
          ${typeOptions.map(([v, label]) => `<option value="${v}" ${state.filter.type === v ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <select class="form-input" id="media-filter-status" style="width:150px">
          ${statusOptions.map(([v, label]) => `<option value="${v}" ${state.filter.status === v ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div class="media-filter-group">
        <button class="btn btn-secondary btn-sm" type="button" data-action="poll-running">${icon('refresh-cw', 13)} ${t('media.pollAll')}</button>
        <button class="btn btn-secondary btn-sm" type="button" data-action="refresh">${icon('refresh-cw', 13)} ${t('media.refresh')}</button>
      </div>
    </div>
    <div class="media-history-count">${t('media.historyCount', { shown: state.jobs.length, total, assets: items.length })}</div>
    ${items.length ? `<div class="media-history-grid">${items.map(renderHistoryCard).join('')}</div>` : `<div class="media-empty">${t('media.historyEmpty')}</div>`}
    ${state.historyHasMore ? `<div class="media-history-footer"><button class="btn btn-secondary btn-sm" type="button" data-action="load-more" ${state.historyLoadingMore ? 'disabled' : ''}>${icon('list', 13)} ${state.historyLoadingMore ? t('media.loading') : t('media.loadMore')}</button></div>` : ''}
  `
}

function historyItems(jobs) {
  return jobs.flatMap(job => {
    const assets = Array.isArray(job.assets) ? job.assets : []
    if (!assets.length) return [{ job, asset: null, index: 0 }]
    return assets.map((asset, index) => ({ job, asset, index }))
  })
}

function renderHistoryCard(item) {
  const { job, asset, index } = item
  const kind = asset ? assetKind(asset) : (job.type === 'video' ? 'video' : 'image')
  const kindIcon = kind === 'video' ? 'film' : 'image'
  const kindLabel = kind === 'video' ? t('media.tabVideo') : t('media.tabImage')
  const assetPath = asset?.path || ''
  const assetRoot = asset?.root || ''
  const ordinal = asset ? ` #${index + 1}` : ''
  return `
    <div class="media-history-card" data-job-id="${attr(job.id)}">
      ${asset ? renderAssetPreview(asset, 'media-history-preview') : `<div class="media-preview media-history-preview">${icon(kindIcon, 28)} <span>${t('media.noAssets')}</span></div>`}
      <div class="media-history-body">
        <div class="media-history-title">
          <div class="media-history-kind">${icon(kindIcon, 14)} <span>${kindLabel}${ordinal}</span></div>
          <span class="media-status ${attr(job.status || '')}">${statusLabel(job.status || '')}</span>
        </div>
        <div class="media-history-prompt" title="${attr(job.prompt || '')}">${esc(job.prompt || '')}</div>
        <div class="media-history-meta">
          <span title="${attr(job.model || '')}">${t('media.modelId')}: ${esc(job.model || '-')}</span>
          <span>${t('media.createdAt')}: ${esc(formatTime(job.createdAt))}</span>
        </div>
        ${job.error ? `<details class="media-error"><summary>${t('media.errorDetails')}</summary>${esc(job.error)}</details>` : ''}
        ${renderJobActions(job, assetPath, assetRoot, 'media-history-actions')}
      </div>
    </div>
  `
}

// 任务操作按钮行（历史卡片与工作台卡片共用）。
// 失败但有服务商任务 ID 的视频任务仍可轮询：瞬时错误或误判后可找回服务商侧结果
function renderJobActions(job, assetPath, assetRoot, className) {
  const canPoll = job.type === 'video' && job.providerTaskId
    && (job.status === 'running' || job.status === 'failed')
  const canCancel = job.status === 'queued' || (job.type === 'video' && job.status === 'running')
  const canDelete = job.status !== 'queued' && job.status !== 'running'
  return `
    <div class="${className}">
      ${canPoll ? `<button class="btn btn-xs btn-primary" type="button" data-action="poll" data-job-id="${attr(job.id)}">${icon('refresh-cw', 12)} ${t('media.poll')}</button>` : ''}
      ${canCancel ? `<button class="btn btn-xs btn-secondary" type="button" data-action="cancel" data-job-id="${attr(job.id)}">${icon('stop', 12)} ${t('media.cancel')}</button>` : ''}
      <button class="btn btn-xs btn-secondary" type="button" data-action="copy-prompt" data-prompt="${attr(job.prompt || '')}">${icon('copy', 12)} ${t('media.copyPrompt')}</button>
      ${assetPath ? `<button class="btn btn-xs btn-secondary" type="button" data-action="reveal" data-path="${attr(assetPath)}" data-root="${attr(assetRoot)}">${icon('folder', 12)} ${t('media.openFolder')}</button>` : ''}
      ${canDelete ? `<button class="btn btn-xs btn-secondary" type="button" data-action="delete" data-job-id="${attr(job.id)}">${icon('trash', 12)} ${t('media.delete')}</button>` : ''}
    </div>
  `
}

function renderJobCard(job) {
  const kindIcon = job.type === 'video' ? 'film' : 'image'
  const assets = Array.isArray(job.assets) ? job.assets : []
  const firstAsset = assets[0]?.path || ''
  const firstAssetRoot = assets[0]?.root || ''
  return `
    <div class="media-job-card" data-job-id="${attr(job.id)}">
      <div class="media-job-head">
        <div>
          <div class="media-job-title">${icon(kindIcon, 15)} ${job.type === 'video' ? t('media.tabVideo') : t('media.tabImage')} <span class="media-status ${attr(job.status || '')}">${statusLabel(job.status || '')}</span></div>
          <div class="media-meta">
            <span>${t('media.modelId')}: ${esc(job.model || '-')}</span>
            <span>${t('media.createdAt')}: ${esc(formatTime(job.createdAt))}</span>
            ${job.providerStatus ? `<span>${esc(job.providerStatus)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="media-prompt">${esc(job.prompt || '')}</div>
      ${assets.length ? `<div class="media-asset-grid">${assets.map(renderAsset).join('')}</div>` : `<div class="media-asset-chip">${icon('folder', 13)} <span>${t('media.noAssets')}</span></div>`}
      ${job.error ? `<details class="media-error"><summary>${t('media.errorDetails')}</summary>${esc(job.error)}</details>` : ''}
      ${renderJobActions(job, firstAsset, firstAssetRoot, 'media-job-actions')}
    </div>
  `
}

function renderAsset(asset) {
  return renderAssetPreview(asset)
}

function renderAssetPreview(asset, extraClass = '') {
  if (!asset?.path) {
    return `<div class="media-preview ${extraClass}">${t('media.previewUnavailable')}</div>`
  }
  const kind = assetKind(asset)
  if (kind === 'video') {
    return `
      <div class="media-preview media-video-placeholder ${extraClass}" data-media-video-path="${attr(asset.path)}" data-media-video-root="${attr(asset.root || '')}">
        <div class="media-video-placeholder-inner">
          ${icon('film', 24)}
          <span>${t('media.videoPreviewHint')}</span>
          <button class="btn btn-xs btn-secondary" type="button" data-action="preview-asset" data-path="${attr(asset.path)}" data-root="${attr(asset.root || '')}">${t('media.previewVideo')}</button>
        </div>
      </div>
    `
  }
  if (kind === 'image') {
    return `<div class="media-preview ${extraClass}" data-media-preview="${attr(asset.path)}" data-media-root="${attr(asset.root || '')}" data-media-kind="${attr(kind)}">${t('media.previewLoading')}</div>`
  }
  return `<button class="media-asset-chip" type="button" data-action="reveal" data-path="${attr(asset.path)}">${icon('film', 14)} <span>${esc(asset.path || '')}</span></button>`
}

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function bindEvents(page, state) {
  page.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-tab]')
    if (tab) {
      state.tab = tab.dataset.tab
      renderAll(page, state)
      if (state.tab === 'queue') await refreshLiveJobs(page, state)
      return
    }

    const actionEl = event.target.closest('[data-action]')
    if (!actionEl) return
    const action = actionEl.dataset.action
    try {
      if (action === 'refresh') await refreshJobs(page, state)
      else if (action === 'load-more') await refreshJobs(page, state, { append: true })
      else if (action === 'poll-running') await pollRunning(page, state)
      else if (action === 'poll') await pollOne(page, state, actionEl.dataset.jobId)
      else if (action === 'cancel') await cancelOne(page, state, actionEl.dataset.jobId)
      else if (action === 'delete') await deleteOne(page, state, actionEl.dataset.jobId)
      else if (action === 'copy-prompt') await copyText(actionEl.dataset.prompt || '', t('media.copied'))
      else if (action === 'reveal') await revealAsset(actionEl.dataset.path || '', actionEl.dataset.root || '')
      else if (action === 'preview-asset') await previewAsset(actionEl, state)
      else if (action === 'open-output-dir') await revealOutputDir()
      else if (action === 'open-settings') openSettings(page, state)
      else if (action === 'fetch-models') await fetchModels(page, state)
      else if (action === 'use-model') useFetchedModel(page, actionEl.dataset.kind, actionEl.dataset.model)
    } catch (error) {
      toast(error?.message || String(error), 'error')
    }
  })

  page.addEventListener('submit', async (event) => {
    const form = event.target
    if (form.id === 'media-image-form') {
      event.preventDefault()
      await submitImage(page, state)
    } else if (form.id === 'media-video-form') {
      event.preventDefault()
      await submitVideo(page, state)
    } else if (form.id === 'media-settings-form') {
      event.preventDefault()
      await saveSettings(page, state)
    }
  })

  page.addEventListener('change', async (event) => {
    if (event.target.id === 'media-filter-type' || event.target.id === 'media-filter-status') {
      state.filter.type = page.querySelector('#media-filter-type')?.value || ''
      state.filter.status = page.querySelector('#media-filter-status')?.value || ''
      await refreshJobs(page, state)
    } else if (event.target.id === 'media-provider') {
      state.activeProvider = event.target.value || 'volcengine'
      state.modelFetch = null
      renderAll(page, state)
    }
  })

  page.addEventListener('click', async (event) => {
    if (event.target.closest('#media-test-provider')) {
      try {
        if (!(await persistSettingsForProviderAction(page, state))) return
        const result = await api.testMediaProvider(activeProviderId(state))
        toast(result?.message || t('media.providerTestOk'), 'success')
      } catch (error) {
        toast(error?.message || String(error), 'error')
      }
    }
  })
}

function openSettings(page, state) {
  state.tab = 'settings'
  renderAll(page, state)
  page.querySelector('#media-api-key')?.focus()
}

async function submitImage(page, state) {
  const request = {
    provider: activeProviderId(state),
    prompt: page.querySelector('#media-image-prompt')?.value || '',
    model: page.querySelector('#media-image-model')?.value || '',
    size: page.querySelector('#media-image-size')?.value || defaultImageSize(state),
    count: Number(page.querySelector('#media-image-count')?.value || 1),
    watermark: page.querySelector('#media-image-watermark')?.checked !== false,
  }
  state.busy = 'image'
  const btn = page.querySelector('#media-image-form button[type="submit"]')
  if (btn) btn.disabled = true
  try {
    const job = await api.generateImage(request)
    mergeJob(state, job)
    state.lastImageJob = job
    toast(t('media.imageQueued'), 'success')
    renderLiveJobs(page, state)
  } catch (error) {
    toast(error?.message || String(error), 'error')
  } finally {
    state.busy = ''
    const currentBtn = page.querySelector('#media-image-form button[type="submit"]')
    if (currentBtn) currentBtn.disabled = false
  }
}

async function submitVideo(page, state) {
  const request = {
    provider: activeProviderId(state),
    prompt: page.querySelector('#media-video-prompt')?.value || '',
    model: page.querySelector('#media-video-model')?.value || '',
    ratio: page.querySelector('#media-video-ratio')?.value || '16:9',
    resolution: page.querySelector('#media-video-resolution')?.value || '720p',
    duration: Number(page.querySelector('#media-video-duration')?.value || 5),
    imageUrl: page.querySelector('#media-video-image-url')?.value || '',
  }
  state.busy = 'video'
  const btn = page.querySelector('#media-video-form button[type="submit"]')
  if (btn) btn.disabled = true
  try {
    const job = await api.createVideoTask(request)
    mergeJob(state, job)
    toast(t('media.videoQueued'), 'success')
    renderLiveJobs(page, state)
  } catch (error) {
    toast(error?.message || String(error), 'error')
  } finally {
    state.busy = ''
    const currentBtn = page.querySelector('#media-video-form button[type="submit"]')
    if (currentBtn) currentBtn.disabled = false
  }
}

async function saveSettings(page, state) {
  const config = collectSettingsConfig(page, state)
  await api.writeMediaConfig(config)
  state.config = await api.readMediaConfig()
  state.activeProvider = activeProviderId(state)
  toast(t('media.providerSaved'), 'success')
  renderAll(page, state)
}

function collectSettingsConfig(page, state) {
  const activeProvider = page.querySelector('#media-provider')?.value || activeProviderId(state)
  const meta = providerMeta(activeProvider)
  const provider = {
    enabled: true,
    apiKey: page.querySelector('#media-api-key')?.value || '__KEEP__',
    baseUrl: page.querySelector('#media-base-url')?.value || meta.defaultBaseUrl,
    imageModel: page.querySelector('#media-default-image-model')?.value || '',
    videoModel: page.querySelector('#media-default-video-model')?.value || '',
    timeoutSeconds: Number(page.querySelector('#media-timeout')?.value || 600),
  }
  const providers = {
    ...(state.config?.providers || {}),
    [activeProvider]: provider,
  }
  return {
    version: 1,
    outputDir: page.querySelector('#media-output-dir')?.value || '',
    providers,
    defaults: {
      ...(state.config?.defaults || {}),
      provider: activeProvider,
    },
  }
}

async function persistSettingsForProviderAction(page, state) {
  const form = page.querySelector('#media-settings-form')
  if (!form) return true
  const rawApiKey = page.querySelector('#media-api-key')?.value?.trim() || ''
  const provider = providerConfig(state)
  if (!rawApiKey && !provider.apiKeySaved) {
    state.modelFetch = { error: true, message: t('media.apiKeyRequired') }
    toast(t('media.apiKeyRequired'), 'warning')
    renderAll(page, state)
    return false
  }
  await api.writeMediaConfig(collectSettingsConfig(page, state))
  state.config = await api.readMediaConfig()
  state.activeProvider = activeProviderId(state)
  return true
}

async function fetchModels(page, state) {
  if (!(await persistSettingsForProviderAction(page, state))) return
  state.modelFetchBusy = true
  renderAll(page, state)
  try {
    state.modelFetch = await api.fetchMediaModels(activeProviderId(state))
    const models = state.modelFetch?.models || []
    toast(models.length ? t('media.fetchModelsOk', { count: models.length }) : (state.modelFetch?.message || t('media.fetchModelsUnsupported')), models.length ? 'success' : 'info')
  } finally {
    state.modelFetchBusy = false
    renderAll(page, state)
  }
}

function useFetchedModel(page, kind, model) {
  if (!model) return
  const target = kind === 'video'
    ? page.querySelector('#media-default-video-model')
    : page.querySelector('#media-default-image-model')
  if (target) {
    target.value = model
    toast(t('media.modelFilled'), 'success')
  }
}

async function pollOne(page, state, jobId) {
  const job = await api.pollVideoTask(jobId)
  mergeJob(state, job)
  toast(t('media.taskPolled'), 'success')
  renderAll(page, state)
}

async function pollRunning(page, state) {
  const running = state.jobs.filter(job => job.type === 'video' && job.status === 'running')
  // 各任务的状态查询相互独立，可并行；后端对 jobs 文件有写锁保护
  await Promise.allSettled(running.map(job =>
    api.pollVideoTask(job.id)
      .then(updated => mergeJob(state, updated))
      .catch(error => console.warn('[media] poll failed', job.id, error)),
  ))
  toast(t('media.taskPolled'), 'success')
  renderAll(page, state)
}

async function cancelOne(page, state, jobId) {
  mergeJob(state, await api.cancelMediaJob(jobId))
  renderAll(page, state)
}

async function deleteOne(page, state, jobId) {
  // 不用 window.confirm：Tauri 的 WKWebView 不实现原生对话框，会静默返回 falsy
  const ok = await showConfirm(t('media.deleteConfirm'), { title: t('media.delete') })
  if (!ok) return
  await api.deleteMediaJob(jobId, true)
  state.jobs = state.jobs.filter(job => job.id !== jobId)
  state.historyTotal = Math.max(0, (state.historyTotal || 0) - 1)
  toast(t('media.taskDeleted'), 'success')
  renderAll(page, state)
}

async function revealAsset(path, root = '') {
  if (!path) return
  const info = await api.revealMediaAsset(path, root)
  if (isTauriRuntime() && info?.parent) {
    try {
      const shell = await import('@tauri-apps/plugin-shell')
      await shell.open(info.parent)
      return
    } catch (error) {
      console.warn('[media] reveal via shell failed, fallback copy', error)
    }
  }
  await copyText(info?.parent || info?.path || path, t('media.pathCopied'))
}

async function previewAsset(actionEl, state) {
  const path = actionEl.dataset.path || ''
  const root = actionEl.dataset.root || ''
  if (!path) return
  const box = actionEl.closest('[data-media-video-path]') || actionEl.closest('.media-preview')
  if (!box) return
  const cacheKey = `${root}::${path}`
  if (state.previews.has(cacheKey)) {
    setPreviewBox(box, state.previews.get(cacheKey))
    return
  }
  box.textContent = t('media.previewLoading')
  const asset = await api.loadMediaAsset(path, root)
  cachePreview(state, cacheKey, asset)
  setPreviewBox(box, asset)
}

const PREVIEW_CACHE_MAX = 80

// 简单 FIFO 淘汰：预览是 base64 dataUrl，长时间浏览大量产物时防止内存无上限增长
function cachePreview(state, key, asset) {
  state.previews.set(key, asset)
  while (state.previews.size > PREVIEW_CACHE_MAX) {
    state.previews.delete(state.previews.keys().next().value)
  }
}

async function revealOutputDir() {
  const info = await api.revealMediaOutputDir()
  const target = info?.path || ''
  if (isTauriRuntime() && target) {
    try {
      const shell = await import('@tauri-apps/plugin-shell')
      await shell.open(target)
      return
    } catch (error) {
      console.warn('[media] open output dir via shell failed, fallback copy', error)
    }
  }
  await copyText(target, t('media.pathCopied'))
}

async function copyText(text, message) {
  if (!text) return
  await navigator.clipboard?.writeText(text)
  toast(message, 'success')
}

async function hydratePreviews(page, state) {
  const boxes = [...page.querySelectorAll('[data-media-preview]:not([data-preview-bound])')]
  if (state.previewObserver?.disconnect) state.previewObserver.disconnect()
  const loadBox = async (box) => {
    const path = box.dataset.mediaPreview
    const root = box.dataset.mediaRoot || ''
    const cacheKey = `${root}::${path}`
    if (!path) return
    if (state.previews.has(cacheKey)) {
      setPreviewBox(box, state.previews.get(cacheKey))
      return
    }
    try {
      const asset = await api.loadMediaAsset(path, root)
      cachePreview(state, cacheKey, asset)
      setPreviewBox(box, asset)
    } catch (error) {
      box.textContent = t('media.previewUnavailable')
    }
  }
  if ('IntersectionObserver' in window) {
    state.previewObserver = new IntersectionObserver((entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        loadBox(entry.target)
      }
    }, { rootMargin: '240px' })
    for (const box of boxes) {
      box.dataset.previewBound = '1'
      state.previewObserver.observe(box)
    }
  } else {
    for (const box of boxes) {
      box.dataset.previewBound = '1'
      await loadBox(box)
    }
  }
}

function setPreviewBox(box, asset) {
  if (!asset?.dataUrl) {
    box.textContent = t('media.previewUnavailable')
    return
  }
  const mime = String(asset.mime || '')
  if (mime.startsWith('video/')) {
    box.innerHTML = `<video src="${attr(asset.dataUrl)}" controls preload="metadata"></video>`
  } else if (mime.startsWith('image/')) {
    box.innerHTML = `<img src="${attr(asset.dataUrl)}" alt="">`
  } else {
    box.textContent = t('media.previewUnavailable')
  }
}
