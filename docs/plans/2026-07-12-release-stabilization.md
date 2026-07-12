# ClawPanel Release Stabilization Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use test-driven-development and subagent-driven-development to implement this plan task-by-task.

**Goal:** 修复 `v0.18.5` 之后审计确认的上线阻断问题，使双运行时功能、迁移、媒体下载与发布链具备可验证的失败保护。

**Architecture:** 将高风险操作收口到后端原子命令，前端只提交意图；文件迁移和媒体下载使用 staging + 原子切换；发布流程先验证、后构建、最后一次性公开并更新热更新清单。测试从源码正则升级为真实函数/HTTP/文件系统行为测试。

**Tech Stack:** Vanilla JS、Node.js `node:test`、Rust/Tauri、GitHub Actions、Playwright。

## 执行结果（2026-07-12）

**状态：本地稳定化闭环完成，暂不打 tag。**

- 发布链改为先校验 tag/ref 与既有 Release，再测试、构建并汇总 workflow artifacts；只有全部平台成功后才公开 Release 和提交本次热更新清单。
- Hermes 模型渠道改用专用事务命令；安装向导恢复阶段、安装单飞、Web 异步安装、镜像传递和候选 Gateway 先探活后保存均已覆盖。
- 便携迁移增加 canonical path、junction/reparse 拒绝、staging/回滚、外部绝对路径警告和严格 RealUsb 只读检查。
- 媒体下载改为手动重定向、逐跳凭据判断、响应体全程超时、流式 staging 落盘和失败清理；Node 真实 HTTP 测试覆盖跨源鉴权、超时与超限。
- 移动端 Hermes 页面为 FAB 预留 96px 底部空间；390×844 Playwright 实测无重叠。
- `package.json` / `package-lock.json` 已锁定 Vite `^6.4.3`，`npm audit --omit=dev` 为 0 漏洞。当前工作区 `node_modules/vite` 实体仍残留 6.4.2，未擅自删除依赖目录；干净 `npm ci` 会按锁文件安装 6.4.3。

**已验证：** Node 451/451、Rust 330/330、前端构建、Rust fmt/check/clippy、Windows Tauri MSI/NSIS、便携模拟 smoke、`git diff --check`、新增 diff 敏感内容扫描。

**外部依赖：** GitHub Actions 真实发布链、macOS/Linux 打包、真实服务商账号、真实 U 盘完整迁移仍需发布前在对应环境执行。

---

### Task 1: 发布与热更新门禁

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/pages.yml`
- Modify: `scripts/sync-version.js`
- Modify: `src-tauri/src/commands/update.rs`
- Create: `tests/release-safety-policy.test.js`

1. 先写失败测试，覆盖 tag/ref 绑定、禁止覆盖既有发布、构建失败不得更新 Release、CI 必跑 Node/Rust 测试、版本同步失败非零退出、兼容判断使用真实二进制版本。
2. 运行目标测试并确认按预期失败。
3. 增加 verify job，发布产物先作为 workflow artifact 汇总，完整成功后再创建/公开 Release。
4. 将 `minAppVersion` 设为显式发布输入或当前目标版本；兼容判断拆分 `appVersion` 与 `frontendVersion`。
5. 运行目标测试、Rust 更新模块测试与 YAML 静态复核。

### Task 2: Hermes 模型渠道同步

**Files:**
- Modify: `src/lib/model-channels.js`
- Modify: `src/lib/tauri-api.js`
- Modify: `src-tauri/src/commands/hermes.rs`
- Modify: `scripts/dev-api.js`
- Modify: `src-tauri/src/lib.rs`
- Modify: `tests/model-channels.test.js`

1. 写失败测试复现受管 Provider Key 被 `hermes_env_set` 拒绝。
2. 新增专用 `hermes_sync_provider` 后端命令，原子更新受管 Key、Base URL 和可选默认模型；保留通用 env 编辑器的拒绝策略。
3. 前端改用专用命令并在成功后回读确认。
4. 对齐 Rust/Web Provider Registry 的字段和默认模型，并增加字段级契约测试。

### Task 3: 便携迁移事务与路径安全

**Files:**
- Modify: `src-tauri/src/utils.rs`
- Modify: `src-tauri/src/commands/portable.rs`
- Modify: `scripts/smoke-portable-usb.ps1`

1. 写失败 Rust 测试覆盖 `..` 目标、自包含复制、symlink/junction、复制失败回滚和 manifest 最后提交。
2. 规范化源/目标及已存在祖先，拒绝链接和重叠路径。
3. 正反向迁移先复制到同级 staging，验证后原子切换；失败自动清理 staging 并恢复备份。
4. 检测并报告 OpenClaw/Hermes 内部根目录外绝对路径；非 Windows 平台不再声称单文件复制为完整便携应用。
5. 真实 U 盘 smoke 默认只读，组件缺失必须令检查失败。

### Task 4: 媒体下载安全与资源边界

**Files:**
- Modify: `scripts/dev-api.js`
- Modify: `src-tauri/src/commands/media.rs`
- Replace: `tests/media-download-policy.test.js`

1. 写真实本地 HTTP 测试，覆盖协议降级不带鉴权、401/403 无鉴权重试、无 Content-Length 超限、响应体超时和取消。
2. 同源判定比较 scheme + host + 有效端口。
3. 下载边读边写 staging 文件并计数，成功后原子改名；错误、超时或超限时取消并删除 staging。
4. 避免合法 512MB 文件在内存中形成一至两份完整副本。

### Task 5: Hermes 安装向导可靠性

**Files:**
- Modify: `src/engines/hermes/pages/setup.js`
- Modify: `src-tauri/src/commands/hermes.rs`
- Modify: `scripts/dev-api.js`
- Create: `tests/hermes-setup-runtime.test.js`

1. 写失败测试覆盖阶段恢复、安装 single-flight、候选 Gateway 验证后保存、Web 异步安装和 PyPI 镜像传递。
2. 首次绘制前读取恢复阶段；安装入口立即进入忙碌态，后端增加互斥。
3. Web 改为异步子进程并提供状态/日志轮询，不阻塞 API 事件循环。
4. 自定义 Gateway 先探测候选 URL，成功后再持久化。

### Task 6: UI、依赖与版本说明收口

**Files:**
- Modify: `src/style/ai-drawer.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Add/Modify: relevant tests

1. 写移动端碰撞测试，确保 FAB 不覆盖固定操作区。
2. 更新 Vite 到已修复的 `6.4.3`。
3. 暂不改发布版本号；将未发布内容保持在单一 Unreleased 口径，真正发布前再执行 `version:set`。

### Task 7: 全量验证

1. 运行 `node --test tests/*.test.js`。
2. 运行 `npm run build` 和 `npm audit --omit=dev`。
3. 运行 `cargo fmt --all -- --check`、`cargo check --locked`、`cargo clippy --all-targets --locked -- -D warnings`、`cargo test --locked --lib`。
4. 运行 Web 生产模式桌面/移动端 Playwright 冒烟。
5. 运行 `npm run tauri build` 生成 Windows MSI/NSIS。
6. 运行 `git diff --check` 并确认未创建 commit/tag/push。
