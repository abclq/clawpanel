import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'yaml'

const root = resolve(import.meta.dirname, '..')

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function workflow(path) {
  return parse(read(path))
}

function stepText(job) {
  return (job.steps || []).map((step) => `${step.name || ''}\n${step.run || ''}\n${step.uses || ''}`).join('\n')
}

function needs(job) {
  return Array.isArray(job.needs) ? job.needs : [job.needs]
}

test('CI runs Node and locked Rust tests and checks', () => {
  const ci = workflow('.github/workflows/ci.yml')
  const text = stepText(ci.jobs.check)

  assert.match(text, /node --test tests/)
  assert.match(text, /cargo test --locked/)
  assert.match(text, /cargo check --locked/)
  assert.match(text, /cargo clippy --locked --all-targets -- -D warnings/)
})

test('release dispatch validates semver, binds an existing tag to HEAD, and rejects an existing release', () => {
  const release = workflow('.github/workflows/release.yml')
  const validate = release.jobs['validate-release']
  assert.ok(validate)

  const text = stepText(validate)
  assert.match(text, /SEMVER_PATTERN=/)
  assert.match(text, /refs\/tags\/\$TAG_NAME\^\{commit\}/)
  assert.match(text, /git rev-parse HEAD/)
  assert.match(text, /gh release view "\$TAG_NAME"/)
  assert.ok(validate.outputs?.tag_name)
  assert.ok(validate.outputs?.version)
})

test('release runs tests before builders and builders only upload workflow artifacts', () => {
  const release = workflow('.github/workflows/release.yml')
  const verify = release.jobs['test-release']
  const build = release.jobs.build
  const web = release.jobs['build-web']

  assert.ok(verify)
  const verifyText = stepText(verify)
  assert.match(verifyText, /node --test tests/)
  assert.match(verifyText, /cargo test --locked/)

  for (const job of [build, web]) {
    assert.ok(job)
    assert.ok(needs(job).includes('validate-release'))
    assert.ok(needs(job).includes('test-release'))
    const text = stepText(job)
    assert.match(text, /actions\/upload-artifact@/)
    assert.doesNotMatch(text, /tauri-apps\/tauri-action/)
    assert.doesNotMatch(text, /gh release (create|upload|edit)/)
    assert.doesNotMatch(text, /latest\.json/)
  }
})

test('one final job publishes only after all artifacts succeed and pins minAppVersion', () => {
  const release = workflow('.github/workflows/release.yml')
  const publish = release.jobs['publish-release']
  assert.ok(publish)
  assert.deepEqual(
    [...needs(publish)].sort(),
    ['build', 'build-web', 'test-release', 'validate-release'].sort(),
  )

  const text = stepText(publish)
  assert.match(text, /actions\/download-artifact@/)
  assert.match(text, /gh release create "\$TAG_NAME"[^\n]*--draft/)
  assert.match(text, /gh release upload "\$TAG_NAME"/)
  assert.match(text, /gh release edit "\$TAG_NAME"[^\n]*--draft=false/)
  assert.match(text, /"minAppVersion": "\$\{VERSION\}"/)
  assert.doesNotMatch(text, /MIN_APP_VER|\.get\(['"]minAppVersion/)
  assert.doesNotMatch(text, /git push[^\n]*\|\| true/)
})

test('frontend compatibility uses the packaged app version while update comparison uses frontend current', () => {
  const source = read('src-tauri/src/commands/update.rs')

  assert.match(source, /let app_version = env!\("CARGO_PKG_VERSION"\);/)
  assert.match(source, /let compatible = version_ge\(app_version, min_app\);/)
  assert.match(source, /let remote_newer =[^;]*version_gt\(&latest, &frontend_current\);/s)
  assert.match(source, /"currentVersion": frontend_current/)
})

test('sync-version exits nonzero when any target cannot be updated', () => {
  const temp = mkdtempSync(join(tmpdir(), 'clawpanel-version-policy-'))
  try {
    mkdirSync(join(temp, 'scripts'))
    mkdirSync(join(temp, 'src-tauri'))
    copyFileSync(resolve(root, 'scripts/sync-version.js'), join(temp, 'scripts/sync-version.js'))
    writeFileSync(join(temp, 'package.json'), '{"version":"1.2.3","type":"module"}\n')
    writeFileSync(join(temp, 'package-lock.json'), '{"version":"1.2.3","packages":{"":{"version":"1.2.3"}}}\n')
    writeFileSync(join(temp, 'src-tauri/tauri.conf.json'), '{"version":"1.2.3"}\n')
    writeFileSync(join(temp, 'src-tauri/Cargo.toml'), '[package]\nname = "clawpanel"\nversion = "1.2.3"\n')
    writeFileSync(join(temp, 'src-tauri/Cargo.lock'), 'version = 3\n')

    const result = spawnSync(process.execPath, [join(temp, 'scripts/sync-version.js')], {
      cwd: temp,
      encoding: 'utf8',
    })

    assert.notEqual(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stderr, /Cargo\.lock/)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})

test('Pages manual deployments only run from main', () => {
  const pages = workflow('.github/workflows/pages.yml')
  assert.equal(
    pages.jobs.build.if,
    "${{ github.event_name != 'workflow_dispatch' || github.ref == 'refs/heads/main' }}",
  )
})
