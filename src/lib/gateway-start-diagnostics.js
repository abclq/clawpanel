import { api, invalidate } from './tauri-api.js'
import { showContentModal } from '../components/modal.js'
import { navigate } from '../router.js'
import { t } from './i18n.js'

function errorText(error) {
  return String(error?.message || error || '').trim()
}

function redactSecrets(value) {
  return String(value || '')
    .replace(/\b(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1***')
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s]+/gi, '$1***')
    .replace(/((?:api[_-]?key|token|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1***')
}

function fulfilledText(result) {
  return result.status === 'fulfilled' ? String(result.value || '').trim() : ''
}

export async function collectGatewayStartDiagnostics(error) {
  invalidate('read_log_tail')
  const [stderrResult, stdoutResult, guardianResult] = await Promise.allSettled([
    api.readLogTail('gateway-err', 80),
    api.readLogTail('gateway', 50),
    api.readLogTail('guardian', 30),
  ])
  return {
    reason: redactSecrets(errorText(error)),
    stderr: redactSecrets(fulfilledText(stderrResult)),
    stdout: redactSecrets(fulfilledText(stdoutResult)),
    guardian: redactSecrets(fulfilledText(guardianResult)),
  }
}

function renderDiagnosticText(diagnostics) {
  const sections = []
  if (diagnostics.reason) sections.push(`${t('services.gatewayDiagnosticsReason')}\n${diagnostics.reason}`)
  if (diagnostics.stderr) sections.push(`${t('services.gatewayDiagnosticsErrorLog')}\n${diagnostics.stderr}`)
  if (diagnostics.stdout) sections.push(`${t('services.gatewayDiagnosticsOutputLog')}\n${diagnostics.stdout}`)
  if (diagnostics.guardian) sections.push(`${t('services.gatewayDiagnosticsGuardianLog')}\n${diagnostics.guardian}`)
  return sections.join('\n\n') || t('services.gatewayDiagnosticsNoLogs')
}

/**
 * 显示持久的 Gateway 启动诊断，不再只依赖数秒后消失的 toast。
 * 内容通过 textContent 写入，避免日志中的任意文本被当作 HTML 执行。
 */
export async function showGatewayStartDiagnostics(error) {
  const overlay = showContentModal({
    title: t('services.gatewayDiagnosticsTitle'),
    content: `
      <div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:12px">
        ${t('services.gatewayDiagnosticsHint')}
      </div>
      <pre data-gateway-diagnostics style="margin:0;max-height:420px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.55 var(--font-mono);background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:12px">${t('common.loading')}</pre>
    `,
    width: 720,
    buttons: [
      { id: 'gateway-diagnostics-logs', label: t('sidebar.logs'), className: 'btn btn-secondary btn-sm' },
      { id: 'gateway-diagnostics-repair', label: t('sidebar.chatDebug'), className: 'btn btn-primary btn-sm' },
    ],
  })
  overlay.querySelector('#gateway-diagnostics-logs')?.addEventListener('click', () => {
    overlay.close()
    navigate('/logs')
  })
  overlay.querySelector('#gateway-diagnostics-repair')?.addEventListener('click', () => {
    overlay.close()
    navigate('/chat-debug')
  })

  const target = overlay.querySelector('[data-gateway-diagnostics]')
  try {
    const diagnostics = await collectGatewayStartDiagnostics(error)
    if (target) target.textContent = renderDiagnosticText(diagnostics)
  } catch (diagnosticError) {
    if (target) target.textContent = redactSecrets(errorText(error) || errorText(diagnosticError))
  }
  return overlay
}
