import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildHermesDisplayConfigValues,
  mergeHermesDisplayConfig,
} from '../scripts/dev-api.js'

test('Hermes 显示配置读取会提供上游默认值', () => {
  const values = buildHermesDisplayConfigValues({})

  assert.deepEqual(values, {
    displayToolProgress: 'all',
    displayCompact: false,
    displaySkin: 'default',
    displayShowReasoning: false,
    displayToolPreviewLength: 0,
    displayCleanupProgress: false,
    displayToolProgressCommand: false,
    displayInterimAssistantMessages: true,
    displayRuntimeFooterEnabled: false,
    displayRuntimeFooterFields: 'model\ncontext_pct\ncwd',
    displayFileMutationVerifier: true,
    displayLanguage: 'en',
    displayResumeDisplay: 'full',
    displayBusyInputMode: 'interrupt',
    displayBackgroundProcessNotifications: 'all',
    displayFinalResponseMarkdown: 'strip',
    displayTimestamps: false,
    displayBellOnComplete: false,
    displayPersistentOutput: true,
    displayPersistentOutputMaxLines: 200,
  })
})

test('Hermes 显示配置读取会规范化已有字段', () => {
  const values = buildHermesDisplayConfigValues({
    display: {
      tool_progress: 'VERBOSE',
      compact: true,
      skin: 'MONO',
      show_reasoning: true,
      tool_preview_length: 80,
      cleanup_progress: true,
      tool_progress_command: true,
      interim_assistant_messages: false,
      runtime_footer: {
        enabled: true,
        fields: ['model', 'duration', 'cost'],
      },
      file_mutation_verifier: false,
      language: 'ZH',
      resume_display: 'minimal',
      busy_input_mode: 'QUEUE',
      background_process_notifications: 'ERROR',
      final_response_markdown: 'RAW',
      timestamps: true,
      bell_on_complete: true,
      persistent_output: false,
      persistent_output_max_lines: 80,
    },
  })

  assert.equal(values.displayToolProgress, 'verbose')
  assert.equal(values.displayCompact, true)
  assert.equal(values.displaySkin, 'mono')
  assert.equal(values.displayShowReasoning, true)
  assert.equal(values.displayToolPreviewLength, 80)
  assert.equal(values.displayCleanupProgress, true)
  assert.equal(values.displayToolProgressCommand, true)
  assert.equal(values.displayInterimAssistantMessages, false)
  assert.equal(values.displayRuntimeFooterEnabled, true)
  assert.equal(values.displayRuntimeFooterFields, 'model\nduration\ncost')
  assert.equal(values.displayFileMutationVerifier, false)
  assert.equal(values.displayLanguage, 'zh')
  assert.equal(values.displayResumeDisplay, 'minimal')
  assert.equal(values.displayBusyInputMode, 'queue')
  assert.equal(values.displayBackgroundProcessNotifications, 'error')
  assert.equal(values.displayFinalResponseMarkdown, 'raw')
  assert.equal(values.displayTimestamps, true)
  assert.equal(values.displayBellOnComplete, true)
  assert.equal(values.displayPersistentOutput, false)
  assert.equal(values.displayPersistentOutputMaxLines, 80)
})

test('Hermes 显示配置保存会保留未知 YAML 并写入 display', () => {
  const next = mergeHermesDisplayConfig({
    model: { provider: 'anthropic' },
    display: {
      skin: 'midnight',
      runtime_footer: {
        enabled: false,
        custom_flag: 'keep-footer',
      },
      platforms: {
        telegram: { tool_progress: 'new' },
      },
    },
    memory: { memory_enabled: true },
  }, {
    displayToolProgress: 'off',
    displayCompact: true,
    displaySkin: 'slate',
    displayShowReasoning: true,
    displayToolPreviewLength: 120,
    displayCleanupProgress: true,
    displayToolProgressCommand: 'true',
    displayInterimAssistantMessages: false,
    displayRuntimeFooterEnabled: true,
    displayRuntimeFooterFields: 'model\ncontext_pct\nduration',
    displayFileMutationVerifier: true,
    displayLanguage: 'zh-hant',
    displayResumeDisplay: 'minimal',
    displayBusyInputMode: 'steer',
    displayBackgroundProcessNotifications: 'result',
    displayFinalResponseMarkdown: 'render',
    displayTimestamps: true,
    displayBellOnComplete: true,
    displayPersistentOutput: false,
    displayPersistentOutputMaxLines: 120,
  })

  assert.deepEqual(next.model, { provider: 'anthropic' })
  assert.deepEqual(next.memory, { memory_enabled: true })
  assert.equal(next.display.compact, true)
  assert.equal(next.display.skin, 'slate')
  assert.equal(next.display.show_reasoning, true)
  assert.equal(next.display.tool_preview_length, 120)
  assert.equal(next.display.cleanup_progress, true)
  assert.deepEqual(next.display.platforms.telegram, { tool_progress: 'new' })
  assert.equal(next.display.tool_progress, 'off')
  assert.equal(next.display.tool_progress_command, true)
  assert.equal(next.display.interim_assistant_messages, false)
  assert.equal(next.display.runtime_footer.enabled, true)
  assert.deepEqual(next.display.runtime_footer.fields, ['model', 'context_pct', 'duration'])
  assert.equal(next.display.runtime_footer.custom_flag, 'keep-footer')
  assert.equal(next.display.file_mutation_verifier, true)
  assert.equal(next.display.language, 'zh-hant')
  assert.equal(next.display.resume_display, 'minimal')
  assert.equal(next.display.busy_input_mode, 'steer')
  assert.equal(next.display.background_process_notifications, 'result')
  assert.equal(next.display.final_response_markdown, 'render')
  assert.equal(next.display.timestamps, true)
  assert.equal(next.display.bell_on_complete, true)
  assert.equal(next.display.persistent_output, false)
  assert.equal(next.display.persistent_output_max_lines, 120)
})

test('Hermes 显示配置保存会拒绝非法枚举和页脚字段', () => {
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displayToolProgress: 'everything' }),
    /display\.tool_progress/,
  )
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displaySkin: 'unknown' }),
    /display\.skin/,
  )
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displayResumeDisplay: 'compact' }),
    /display\.resume_display/,
  )
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displayLanguage: 'cn' }),
    /display\.language/,
  )
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displayRuntimeFooterFields: 'model\npassword' }),
    /display\.runtime_footer\.fields/,
  )
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displayBusyInputMode: 'replace' }),
    /display\.busy_input_mode/,
  )
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displayBackgroundProcessNotifications: 'silent' }),
    /display\.background_process_notifications/,
  )
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displayFinalResponseMarkdown: 'html' }),
    /display\.final_response_markdown/,
  )
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displayPersistentOutputMaxLines: '-1' }),
    /display\.persistent_output_max_lines/,
  )
  assert.throws(
    () => mergeHermesDisplayConfig({}, { displayToolPreviewLength: '200001' }),
    /display\.tool_preview_length/,
  )
})
