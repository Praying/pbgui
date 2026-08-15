# pbgui 前端 Vue 3 迁移 — 实施计划（Phase 0 + Phase 1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Vue 3 + Vite + TypeScript 前端工程，以 MPA 绞杀者模式完成两个试点页面（root_login、services_monitor）的迁移，并为其余 33 个页面提供可复用的迁移 playbook。

**Architecture:** Vite 多入口 MPA（每页一个 entry 目录），构建产物由现有 FastAPI StaticFiles 直接托管；新增 `/api/boot.js` 端点运行时注入 token/origin/version/serial；旧页面逐页替换、迁完即删，新旧共存。

**Tech Stack:** Vue 3（`<script setup>`）、Vite 6、TypeScript（strict + `noUncheckedIndexedAccess`）、vue-i18n 11、Vitest 3、@vue/test-utils、Python/FastAPI（boot 端点）、GitHub Actions。

## Global Constraints

- TypeScript strict 全开：`"strict": true` + `"noUncheckedIndexedAccess": true`
- 不引入 Pinia / Tailwind / 组件库；状态用 composables；样式用 SFC `<style scoped>` + 全局 `tokens.css`
- 视觉保持现状：验收标准是「观感一致」，不是逐像素一致
- i18n 复用现有 `frontend/i18n/en.json` / `zh.json`（扁平 key，5328 个，key 集合 en/zh 必须保持一致——`tests/test_i18n.py` 强制）；`serverMsg` 机制照搬
- 不动 21 个现有 `/main_page` 路由的 URL；迁移页面改读 `dist/` 下的构建产物，URL 不变
- 迁移期旧页面零改动（i18n 修复类小改动除外）
- 每个任务以绿色测试 + commit 结束；commit 格式 `<type>: <desc>`（feat/refactor/test/chore/ci）
- 运行测试命令统一用 `uv run --no-project --with pytest -m pytest ...`（Python 侧）；前端测试用 `npm test` / `npm run build`
- 现状关键事实（写代码前必读）：
  - `frontend/` 35 个 HTML 共 97,207 行；`services_monitor.html` 3,538 行；`root_login.html` 213 行
  - `PBApiServer.py:1006` 挂载 `app.mount("/app", StaticFiles(directory=frontend, html=True))`
  - `api/services.py:2907` 的 `/main_page` 读 `frontend/services_monitor.html` 并注入 `%%TOKEN%%`、`%%API_BASE%%`（绝对 URL `origin + /api/services`）、`%%WS_BASE%%`、`%%VERSION%%`、`%%SERIAL%%`
  - `api/auth.py:446` 的 login 页只注入 `%%API_ORIGIN%%`；`api/auth.py:413` 有 `_frontend_template_path(name)` helper；`api/auth.py` 的 `_bootstrap_payload()` 已产出 version/serial/auth 结构
  - 导航由 `frontend/pbgui_nav.js`（URL `/app/pbgui_nav.js`，`%%NAV_HASH%%` 缓存破坏）提供，Vue 页面继续引用它，本计划**不重写导航**

---

## Phase 0 — 工程基建（不触碰任何现有页面）

### Task 1: Vite 工程骨架

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/src/env.d.ts`
- Create: `frontend/src/pages/_template/index.html`（模板页，仅验证构建）
- Create: `frontend/.gitignore`（追加 `node_modules/`、`dist/`）
- Modify: `.gitignore`（若根 .gitignore 需排除 `frontend/node_modules`）

**Interfaces:**
- Produces: 多入口构建管线。约定：`frontend/src/pages/<page>/index.html` 为入口；产物 `frontend/dist/<page>/index.html`。`@/` 别名指向 `frontend/src/`。

- [ ] **Step 1: 写 package.json**

```json
{
  "name": "pbgui-frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "vue": "^3.5.13",
    "vue-i18n": "^11.1.1"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.3",
    "@vue/test-utils": "^2.4.6",
    "jsdom": "^26.0.0",
    "typescript": "^5.7.3",
    "vite": "^6.1.0",
    "vitest": "^3.0.5",
    "vue-tsc": "^2.2.2"
  }
}
```

- [ ] **Step 2: 写 vite.config.ts（多入口自动发现 + dev proxy）**

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

// MPA: every src/pages/<page>/index.html becomes an entry; output dist/<page>/index.html
const pageEntries = Object.fromEntries(
  globSync('src/pages/*/index.html').map((p) => {
    const name = p.split('/')[2]!;
    return [name, fileURLToPath(new URL(p, import.meta.url))];
  }),
);

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: pageEntries },
  },
  server: {
    port: 5173,
    proxy: {
      // local FastAPI dev: point at your running PBApiServer
      '/api': 'http://127.0.0.1:8000',
      '/app': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 3: 写 tsconfig.json（strict 全开）**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "jsx": "preserve",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true,
    "types": ["vite/client"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vite.config.ts"]
}
```

- [ ] **Step 4: 写 env.d.ts 与模板页验证管线**

`frontend/src/env.d.ts`:

```ts
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

interface BootInfo {
  token: string;
  origin: string;
  version: string;
  serial: string;
}
declare const __BOOT__: BootInfo | undefined;
```

`frontend/src/pages/_template/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>template</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

`frontend/src/pages/_template/main.ts`（同时作为 Vitest 最小冒烟）:

```ts
import { createApp, h } from 'vue';

createApp({ render: () => h('div', 'ok') }).mount('#app');
```

- [ ] **Step 5: 验证构建**

Run: `cd frontend && npm install && npm run build`
Expected: `vite build` 产出 `dist/_template/index.html`，`vue-tsc` 无错误。

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/vite.config.ts frontend/tsconfig.json frontend/src frontend/.gitignore
git commit -m "chore: scaffold vite+vue3 mpa frontend workspace"
```

---

### Task 2: 共享层 shared/（boot / api / utils）+ Vitest 测试

**Files:**
- Create: `frontend/src/shared/boot.ts`
- Create: `frontend/src/shared/api.ts`
- Create: `frontend/src/shared/utils.ts`
- Test: `frontend/src/shared/boot.test.ts`
- Test: `frontend/src/shared/api.test.ts`
- Test: `frontend/src/shared/utils.test.ts`

**Interfaces:**
- Produces（后续所有任务依赖）:
  - `getBoot(): BootInfo`（`{ token, origin, version, serial }`；未注入时 throw）
  - `apiFetch<T>(url: string, init?: RequestInit): Promise<T>`（自动带 `Authorization: Bearer`；401 时抛 `ApiError`，401 消息约定为重定向登录）
  - `class ApiError extends Error { status: number; detail: string }`
  - `esc(s: unknown): string`（HTML 转义，与旧 `esc()` 语义一致）

- [ ] **Step 1: 写失败测试 `boot.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { getBoot } from './boot';

describe('getBoot', () => {
  it('returns injected boot info', () => {
    (globalThis as Record<string, unknown>).__BOOT__ = { token: 't1', origin: 'http://x:1', version: 'v1', serial: 's1' };
    expect(getBoot()).toEqual({ token: 't1', origin: 'http://x:1', version: 'v1', serial: 's1' });
  });
  it('throws when boot.js was not loaded', () => {
    (globalThis as Record<string, unknown>).__BOOT__ = undefined;
    expect(() => getBoot()).toThrow(/boot/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm test -- boot`
Expected: FAIL（`Cannot find module './boot'`）

- [ ] **Step 3: 实现 `boot.ts`**

```ts
export function getBoot(): BootInfo {
  const b = (globalThis as { __BOOT__?: BootInfo }).__BOOT__;
  if (!b || !b.origin) throw new Error('boot.js not loaded — add <script src="/api/boot.js"></script> before the page bundle');
  return b;
}
```

- [ ] **Step 4: 同法完成 `api.ts` / `utils.ts`（先测后码）**

`api.test.ts` 核心断言（用 `vi.stubGlobal('fetch', ...)`）：

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { apiFetch, ApiError } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('sends bearer token and parses json', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    (globalThis as Record<string, unknown>).__BOOT__ = { token: 'tk', origin: 'http://x', version: '', serial: '' };
    await expect(apiFetch('/api/x')).resolves.toEqual({ ok: true });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tk');
  });
  it('throws ApiError with detail on !ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"nope"}', { status: 400 })));
    await expect(apiFetch('/api/x')).rejects.toMatchObject({ status: 400, detail: 'nope' });
    try { await apiFetch('/api/x'); } catch (e) { expect(e).toBeInstanceOf(ApiError); }
  });
});
```

`api.ts` 实现：

```ts
import { getBoot } from './boot';

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`API ${status}: ${detail}`);
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getBoot().token;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const resp = await fetch(url, { ...init, headers });
  const data: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const detail = typeof (data as { detail?: unknown })?.detail === 'string' ? (data as { detail: string }).detail : resp.statusText;
    throw new ApiError(resp.status, detail);
  }
  return data as T;
}
```

`utils.test.ts` 断言 `esc('<a href="x">&')` === `'&lt;a href=&quot;x&quot;&gt;&amp;'`；`utils.ts`:

```ts
export function esc(s: unknown): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 5: 全部测试通过后 commit**

Run: `cd frontend && npm test` → Expected: 全 PASS

```bash
git add frontend/src/shared
git commit -m "feat: add shared boot/api/utils layer with vitest coverage"
```

---

### Task 3: i18n 桥（vue-i18n 复用扁平 JSON + serverMsg）

**Files:**
- Create: `frontend/src/shared/i18n.ts`
- Test: `frontend/src/shared/i18n.test.ts`

**Interfaces:**
- Produces: `createI18n()` 返回配置好的 vue-i18n 实例（默认 en，语言读取 `localStorage['pbgui-lang']`，与旧 `frontend/i18n.js` 的存储约定一致——执行时先 `grep -n 'localStorage' frontend/i18n.js` 确认 key 名，以实测为准）；`serverMsg(text: string): string`（en 或无映射时原样返回）
- 关键实现约束：en.json/zh.json 是**扁平 key**（`"sysmon.users"`），vue-i18n 按点路径查**嵌套**对象——必须先做扁平→嵌套转换

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { createI18n, serverMsg } from './i18n';
import en from '../../../i18n/en.json';
import zh from '../../../i18n/zh.json';

describe('i18n bridge', () => {
  it('translates flat keys via nested conversion', () => {
    const i18n = createI18n('en');
    expect(i18n.global.t('sysmon.settings')).toBe(en['sysmon.settings'] as string);
    i18n.global.locale.value = 'zh';
    expect(i18n.global.t('sysmon.settings')).toBe(zh['sysmon.settings'] as string);
  });
  it('interpolates params', () => {
    const i18n = createI18n('en');
    expect(i18n.global.t('v7backtest.filtersApplied', { approved: 1, ignored: 2 })).toBe('Filters applied: 1 approved, 2 ignored');
  });
  it('serverMsg passes through unknown text', () => {
    expect(serverMsg('totally unknown message')).toBe('totally unknown message');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm test -- i18n`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 i18n.ts**

```ts
import { createI18n as vueCreateI18n, type I18n } from 'vue-i18n';
import en from '../../i18n/en.json';
import zh from '../../i18n/zh.json';
import serverMsgs from '../../i18n/server_msgs.json';

type FlatDict = Record<string, string>;

/** vue-i18n resolves dotted paths against nested objects; our dicts are flat. */
function nest(flat: FlatDict): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let node: Record<string, unknown> = root;
    for (const p of parts.slice(0, -1)) {
      const next = node[p];
      node = (typeof next === 'object' && next !== null ? next : (node[p] = {})) as Record<string, unknown>;
    }
    node[parts[parts.length - 1]!] = value;
  }
  return root;
}

export function createI18n(lang: 'en' | 'zh' = 'en'): I18n {
  return vueCreateI18n({
    legacy: false,
    locale: lang,
    fallbackLocale: 'en',
    messages: { en: nest(en), zh: nest(zh) },
  });
}

/** Exact-match translation of known server English messages; passthrough otherwise. */
export function serverMsg(text: string): string {
  const lang = localStorage.getItem('pbgui-lang') ?? 'en';
  if (lang === 'en' || !text) return text;
  const mapped = (serverMsgs as Record<string, string>)[text];
  return mapped ?? text;
}
```

注意：执行时先 `grep -n "localStorage" frontend/i18n.js`，若旧实现的存储 key 或语言切换 API 与上面假设不同，以旧实现为准对齐（两个实现短期共存，行为必须一致）。

- [ ] **Step 4: 测试通过后 commit**

Run: `cd frontend && npm test -- i18n` → PASS

```bash
git add frontend/src/shared/i18n.ts frontend/src/shared/i18n.test.ts
git commit -m "feat: bridge vue-i18n onto existing flat en/zh dictionaries"
```

---

### Task 4: FastAPI `/api/boot.js` 端点

**Files:**
- Create: `api/boot.py`
- Modify: `PBApiServer.py`（include boot router，位置在 `app.mount("/app", ...)`（约 1006 行）之前）
- Test: `tests/test_boot_endpoint.py`

**Interfaces:**
- Produces: `GET /api/boot.js` → `application/javascript`，内容 `window.__BOOT__={...};`。字段：`token`（未认证为 `""`）、`origin`（请求 origin）、`version`、`serial`。`Cache-Control: no-store`。
- Consumes: `api/auth.py` 的认证依赖模式（执行时 `grep -n "def require_auth\|def optional_auth\|Depends" api/auth.py | head` 确认可用的可选认证依赖名；若无 optional 依赖，参考现有「session 可能为 None」的写法自建）

- [ ] **Step 1: 写失败测试 `tests/test_boot_endpoint.py`**

```python
"""GET /api/boot.js must return a no-store JS payload with boot fields."""
import json
from fastapi.testclient import TestClient


def _client() -> TestClient:
    from PBApiServer import app
    return TestClient(app, raise_server_exceptions=False)


def test_boot_js_returns_boot_payload() -> None:
    resp = _client().get("/api/boot.js")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/javascript")
    assert resp.headers["cache-control"] == "no-store"
    body = resp.text
    assert body.startswith("window.__BOOT__=")
    payload = json.loads(body.removeprefix("window.__BOOT__=").removesuffix(";"))
    assert {"token", "origin", "version", "serial"} <= set(payload)


def test_boot_js_token_empty_without_auth() -> None:
    payload = json.loads(
        _client().get("/api/boot.js").text.removeprefix("window.__BOOT__=").removesuffix(";")
    )
    assert payload["token"] == ""
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run --no-project --with pytest -m pytest tests/test_boot_endpoint.py -v`
Expected: FAIL（404）

- [ ] **Step 3: 实现 `api/boot.py`**

```python
"""Runtime boot script: injects token/origin/version/serial for migrated Vue pages."""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request, Response

from pbgui_purefunc import PBGUI_SERIAL, PBGUI_VERSION

router = APIRouter()


def _boot_payload(request: Request, token: str) -> dict[str, Any]:
    return {
        "token": token,
        "origin": str(request.base_url).rstrip("/"),
        "version": PBGUI_VERSION,
        "serial": PBGUI_SERIAL,
    }


@router.get("/api/boot.js")
def boot_js(request: Request) -> Response:
    token = ""
    # Optional auth: reuse the session resolution pattern from api/auth.py.
    session = getattr(request.state, "session", None)
    if session is not None:
        token = str(getattr(session, "token", ""))
    js = "window.__BOOT__=" + json.dumps(_boot_payload(request, token)) + ";"
    return Response(content=js, media_type="application/javascript", headers={"Cache-Control": "no-store"})
```

实现时按 `api/auth.py` 的真实认证接口调整 token 获取方式（可参考其 `Depends` 会话解析，让已登录请求拿到真实 token——测试补充一个登录后的用例）。

- [ ] **Step 4: 在 `PBApiServer.py` 挂载点之前 include**

在 `app.mount("/app", StaticFiles(...))`（约 1006 行）之前添加：

```python
from api import boot  # noqa: E402
app.include_router(boot.router)
```

- [ ] **Step 5: 跑测试通过**

Run: `uv run --no-project --with pytest tests/test_boot_endpoint.py -v`
Expected: PASS ×2

- [ ] **Step 6: Commit**

```bash
git add api/boot.py PBApiServer.py tests/test_boot_endpoint.py
git commit -m "feat: add /api/boot.js runtime bootstrap endpoint"
```

---

### Task 5: 设计 token 与基础样式

**Files:**
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/base.css`

**Interfaces:**
- Produces: 全局 CSS 变量与基础重置；所有 SFC scoped 样式引用这些变量。变量名以 `frontend/root_login.html` 的 `:root` 块为准（实测值如下，执行时不必再查）：

```css
:root {
  --bg-page: #000000;
  --bg-panel: #111827;
  --bg-card: #111827;
  --border-subtle: #1e2736;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #4a5568;
  --accent: #4da6ff;
  --ok: #4ade80;
  --warn: #f59e0b;
  --err: #ff4b4b;
  --fs-xs: 11px; --fs-sm: 13px; --fs-base: 14px; --fs-md: 15px; --fs-lg: 18px; --fs-xl: 22px;
  --sp-xs: 4px; --sp-sm: 8px; --sp-md: 12px; --sp-lg: 20px;
  --input-h: 32px; --btn-h: 32px;
}
```

（色值取自 root_login/services_monitor 现有样式；若迁移页面时发现页面特有色值，追加到 tokens.css 并保持命名风格。）

`base.css` 只做重置与 body 基础样式（从 root_login.html 的 `* { box-sizing } / html,body {...}` 搬运）。

- [ ] **Step 1: 写两个 css 文件（如上）**
- [ ] **Step 2: 验证不破坏构建**

Run: `cd frontend && npm run build` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles
git commit -m "chore: add design tokens and base styles"
```

---

### Task 6: CI 前端门禁

**Files:**
- Create: `.github/workflows/frontend-ci.yml`

**Interfaces:**
- Produces: push/PR 触发的 `frontend` job：`npm ci → npm run typecheck → npm test → npm run build`

- [ ] **Step 1: 写 workflow**

```yaml
name: frontend-ci
on:
  push:
    paths: ['frontend/**', '.github/workflows/frontend-ci.yml']
  pull_request:
    paths: ['frontend/**', '.github/workflows/frontend-ci.yml']

jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: 本地等价验证**

Run: `cd frontend && npm run typecheck && npm test && npm run build`
Expected: 全部 PASS（与 CI 相同的命令序列）

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/frontend-ci.yml
git commit -m "ci: add frontend typecheck/test/build gate"
```

---

## Phase 1 — 试点迁移

### Task 7: 迁移 root_login（管线验证）

**Files:**
- Create: `frontend/src/pages/root_login/index.html`
- Create: `frontend/src/pages/root_login/main.ts`
- Create: `frontend/src/pages/root_login/App.vue`
- Modify: `api/auth.py:444-447`（login 页路由改为读 dist 产物；保留 `%%API_ORIGIN%%` 兼容逻辑不再需要——改为 boot.js）
- Test: `frontend/src/pages/root_login/App.test.ts`
- Delete: `frontend/root_login.html`（路由切换成功后）

**Interfaces:**
- Consumes: `getBoot()`、`createI18n()`、`tokens.css`
- Produces: 登录页 Vue 版，行为对齐旧页：POST 登录、成功后跳转主页面、显示版本号。登录端点从旧 `root_login.html` 的 JS 中读取（执行时 `sed -n '60,213p' frontend/root_login.html` 提取真实逻辑——表单字段 id、API 路径、成功跳转 URL 都以旧文件为准，不得虚构）

- [ ] **Step 1: 通读旧页面，列出行为清单**

Run: `sed -n '60,213p' frontend/root_login.html`
产出（写入 commit message 或 PR 描述）：表单字段、调用的 API、成功/失败行为、i18n key 引用。

- [ ] **Step 2: 写组件测试（TDD）**

`App.test.ts` 骨架（断言按 Step 1 的真实行为补全）：

```ts
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';

vi.mock('@/shared/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, redirect: '/' }),
}));

describe('root_login App', () => {
  it('renders login form with i18n text', () => {
    const wrapper = mount(App, { global: { stubs: { teleport: true } } });
    expect(wrapper.find('form').exists()).toBe(true);
  });
  it('submits credentials to the login endpoint', async () => {
    const wrapper = mount(App, { global: { stubs: { teleport: true } } });
    await wrapper.find('input[type=password]').setValue('pw');
    await wrapper.find('form').trigger('submit');
    const { apiFetch } = await import('@/shared/api');
    expect(apiFetch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 跑测试确认失败** → Run: `cd frontend && npm test -- root_login` → FAIL
- [ ] **Step 4: 实现 App.vue**——模板结构照抄旧 HTML 的 body（card/brand/field 类名），`<style scoped>` 从旧 `<style>` 块搬运（去掉已在 tokens.css 的变量定义）；逻辑为旧 JS 的 TypeScript 化（表单校验 → `apiFetch` → 成功 `window.location.href = redirect`，失败显示 `serverMsg(detail)`）
- [ ] **Step 5: main.ts 组装**

```ts
import { createApp } from 'vue';
import App from './App.vue';
import { createI18n } from '@/shared/i18n';
import '@/styles/tokens.css';
import '@/styles/base.css';

const lang = (localStorage.getItem('pbgui-lang') ?? 'en') as 'en' | 'zh';
const app = createApp(App);
app.use(createI18n(lang));
app.mount('#app');
```

index.html 在 `<head>` 引入 `<script src="/api/boot.js"></script>`（必须在 bundle 之前）与 `/app/i18n.js`（过渡期语言切换联动，执行时核对旧 i18n.js 的语言切换广播机制：`grep -n "addEventListener\|storage" frontend/i18n.js`）。

- [ ] **Step 6: 测试通过 + 构建通过** → `npm test -- root_login && npm run build`
- [ ] **Step 7: 切换后端路由**

`api/auth.py:444-447` 改为：

```python
    vue_path = Path(__file__).parent.parent / "frontend" / "dist" / "root_login" / "index.html"
    return FileResponse(
        vue_path,
        headers={"Cache-Control": "no-store"},
    )
```

（`FileResponse` 已有 import 则复用；构建产物必须在 repo 中吗？——**不提交 dist/**，因此路由需容错：dist 不存在时回退读旧 `root_login.html` 并注入 `%%API_ORIGIN%%`（保留原逻辑为 fallback 分支），CI/部署文档注明「部署前须 `cd frontend && npm run build`」。回退逻辑加一个 pytest 用例。）

- [ ] **Step 8: Python 侧验证**

Run: `uv run --no-project --with pytest -m pytest tests/ -k "login or boot" -v`
Expected: PASS（含新 fallback 用例）

- [ ] **Step 9: 手动冒烟（可选但推荐）**

本地起服务，访问登录页，确认视觉与行为一致，切换语言确认 i18n 生效。

- [ ] **Step 10: 删除旧文件并 commit**

```bash
git rm frontend/root_login.html
git add frontend/src/pages/root_login api/auth.py tests
git commit -m "feat: migrate root_login page to vue3"
```

---

### Task 8: services_monitor 迁移 — App 骨架与导航集成

**Files:**
- Create: `frontend/src/pages/services_monitor/index.html`、`main.ts`、`App.vue`
- Create: `frontend/src/pages/services_monitor/types.ts`（API 响应类型）
- Test: `frontend/src/pages/services_monitor/App.test.ts`

**Interfaces:**
- Consumes: Task 2/3/5 的 shared 层
- Produces（Task 9–14 依赖）: `App.vue` 提供页面骨架（顶部导航由 `/app/pbgui_nav.js` 注入，App 只渲染 `<div id="page-body">` 区域）；`types.ts` 导出 `ServiceStatus`、`Worker`、`CmcKey`、`CmcLease`、`MigrationStatus` 等接口（字段从旧 JS 的 `fetch` 消费处以实测为准：`grep -n "data\." frontend/services_monitor.html | head -50`）

- [ ] **Step 1: 通读旧页面结构**

Run: `grep -n "function \|async function \|window\.\w* = " frontend/services_monitor.html | head -60`
产出组件→旧函数映射表（如 `OverviewCards` ← `renderOverviewCards`；`WorkersPanel` ← `fetchWorkers/renderWorkers`；`CmcPoolPanel` ← `loadCmcPool/renderCmcPool`；`PbDataSettings` ← `renderPBDataSettings/savePBDataSettings`；`ApiServerSettings` ← `applySettings/renderVpsHosts/renderAlertRoutingSettings/saveApiServerSettings`；`MigrationPanel` ← `renderMigration*`）。映射表写入任务 PR 描述。

- [ ] **Step 2: 写 App 测试**（挂载后渲染 panel 容器骨架；mock `apiFetch` 返回最小 status 数据，断言渲染服务卡片列表）
- [ ] **Step 3: 实现 App.vue + main.ts + types.ts**（照 root_login 的组装模式；`API_BASE` 派生：`getBoot().origin + '/api/services'`；WS base：`origin.replace(/^http/, 'ws')`。CSS：旧页 `<style>` 主体搬入 App.vue 的 `<style>`（非 scoped，页面级布局），面板组件各自 scoped）
- [ ] **Step 4: 后端路由切换（带 dist 回退，同 Task 7 Step 7 模式）**——`api/services.py:2907` 的 `get_main_page` 改为 FileResponse(dist/services_monitor/index.html) + 旧 HTML fallback；pytest 用例：dist 存在→FileResponse；不存在→旧 HTML 注入路径仍工作
- [ ] **Step 5: `npm test -- services_monitor` + `npm run build` + `pytest -k services` 全绿**
- [ ] **Step 6: Commit** `git commit -m "feat: services_monitor vue skeleton with nav integration"`

> ⚠️ 从本任务起、直到 Task 14 完成，**旧 `frontend/services_monitor.html` 保持不动且仍在被 fallback 使用**——期间线上行为走旧页，直到 Task 14 删除。

### Task 9: services_monitor — OverviewCards + 服务控制（stop/start/restart 按钮）

**Files:**
- Create: `frontend/src/pages/services_monitor/components/OverviewCards.vue`
- Create: `frontend/src/shared/composables/usePolling.ts` + 测试
- Test: `frontend/src/pages/services_monitor/components/OverviewCards.test.ts`

**Interfaces:**
- Consumes: `types.ts` 的 `ServiceStatus`；`apiFetch`
- Produces: `usePolling(fn: () => Promise<void>, intervalMs: number): { start(): void; stop(): void }`（后续所有轮询面板复用）；`OverviewCards` props: `statuses: Record<string, ServiceStatus>`，emits: `action(svcId: string, action: 'start'|'stop'|'restart')`
- 行为对照：旧 `serviceStatusText/serviceActionText/renderServiceButtons`（i18n keys：`sysmon.running/stopped/restarting/...`，逐个从旧文件复制，勿凭记忆）

- [ ] **Step 1: usePolling TDD**（fake timers：start 后按 interval 调 fn；stop 后不再调；页面隐藏时暂停可选——旧页有此逻辑则照搬，`grep -n visibilitychange frontend/services_monitor.html`）
- [ ] **Step 2: OverviewCards TDD**（给定 statuses 渲染卡片名/状态/按钮；点击 emit action）
- [ ] **Step 3: 接入 App.vue，构建+测试全绿**
- [ ] **Step 4: Commit** `feat: services_monitor overview cards and service controls`

### Task 10: services_monitor — Workers 面板 + 日志视图

**Files:**
- Create: `components/WorkersPanel.vue`、`components/LogViewer.vue`
- Test: 对应 `.test.ts`

**Interfaces:**
- Produces: `WorkersPanel`（列表+stop/restart 确认对话框，用 `window.PBGuiDialogs.confirm`——该全局由旧 `/app/js/pbgui_dialogs.js` 提供，Vue 页同样 `<script src>` 引入它，勿重写）；`LogViewer`（WS 日志流，消费 `%%WS_BASE%%` 等价物 `getBoot().origin` 的 ws 变换）
- 行为对照：旧 `fetchWorkers/workerConfirm/workerStop/workerRestart`、log 渲染函数；i18n keys `sysmon.stopWorker/stopWorkerMsg/restartWorker/restartWorkerMsg`

- [ ] **Step 1: 组件测试（mock apiFetch + mock PBGuiDialogs）** → **Step 2: 实现** → **Step 3: 接入+全绿** → **Step 4: Commit** `feat: services_monitor workers panel and log viewer`

### Task 11: services_monitor — CMC Pool 面板（表格/密钥/租约/权限转移）

**Files:**
- Create: `components/CmcPoolPanel.vue`、`components/CmcKeyModal.vue`、`components/CmcAuthorityModal.vue`
- Test: 对应 `.test.ts`

**Interfaces:**
- Produces: `CmcPoolPanel` props `pool: CmcPool`、`leases: CmcLeases`；emits `refresh`；两个 modal 受控组件（`v-model:open` + 表单状态 emit submit）
- 行为对照：旧 `loadCmcPool/renderCmcPool/openCmcKeyModal/submitCmcKey/toggleSelectedCmcKey/deleteSelectedCmcKey/openCmcAuthorityModal/submitCmcAuthorityTransfer`；确认对话框文案用 `sysmon.deleteCmcKey*`、`sysmon.transferCmcAuthority*` 系列 key（上一 session 已全部入 json）
- 数据转义：所有服务端字符串经 `esc()` 或 Vue 默认插值（Vue 插值自动转义，优先直接插值；`v-html` 仅用于受控模板，禁止用于服务端数据）

- [ ] **Step 1: 测试** → **Step 2: 实现**（表格列头 i18n key：`sysmon.label/local/desired/...`）→ **Step 3: 接入+全绿** → **Step 4: Commit** `feat: services_monitor cmc pool panel`

### Task 12: services_monitor — PBData 设置标签页

**Files:**
- Create: `components/PbDataSettings.vue`、`components/MultiselectTags.vue`（通用 tag 多选，含 filter 输入）
- Test: 对应 `.test.ts`

**Interfaces:**
- Produces: `MultiselectTags` props `options: string[]`、`modelValue: string[]`，emits `update:modelValue`（复用于 Task 13 的 VPS hosts 选择）；`PbDataSettings` 消费 `GET/POST /settings/pbdata`（字段清单照旧 `applySettings/savePBDataSettings`），保存反馈用 `sysmon.errorPrefix`/`common.saved` 等 key
- 行为对照：旧 `renderPBDataSettings`（Users/Fetch Users/Executions Download/Log Level/Timers/每交易所 REST 暂停），文案 key 均已存在（`sysmon.users/fetchUsers/...`）

- [ ] **Step 1: MultiselectTags TDD**（点击切换 active、filter 过滤）→ **Step 2: PbDataSettings TDD**（load 填充表单、save 提交 payload 断言）→ **Step 3: 接入+全绿** → **Step 4: Commit** `feat: services_monitor pbdata settings tab`

### Task 13: services_monitor — API Server 设置 + CoinData 设置 + 监控阈值/警报路由

**Files:**
- Create: `components/ApiServerSettings.vue`、`components/MonitorThresholds.vue`、`components/AlertRouting.vue`、`components/CoinDataSettings.vue`
- Test: 对应 `.test.ts`

**Interfaces:**
- Produces: 四个受控组件；`ApiServerSettings` 组合 `MonitorThresholds`（props/emits `monitorConfig`）与 `AlertRouting`（props/emits `routing`）；表单字段与提交 payload 照旧 `applySettings/collectMonitorConfigFromForm/collectAlertRoutingFromForm/saveApiServerSettings`（13 个 alert routing id 逐一对照 `collectAlertRoutingFromForm` 的 `ids` 数组）
- 文案 key 全部已存在（`sysmon.bindAddress/port/vpsMonitoring/autoRestartServices/...`）

- [ ] **Step 1–4**: 每组件「测试→实现→接入全绿→commit」（可拆 4 个 commit：`feat: services_monitor apiserver settings` 等）

### Task 14: services_monitor — Migration 面板 + 收尾删除

**Files:**
- Create: `components/MigrationPanel.vue`
- Test: `MigrationPanel.test.ts`
- Delete: `frontend/services_monitor.html`
- Delete/Replace: `tests/ui/` 中引用 `services_monitor.html` 的 `_extract_function` 测试（`grep -rln services_monitor tests/` 定位：`tests/test_ini_apply_metadata.py`、`tests/test_services_pbcluster.py`、`tests/test_services_cmc_pool.py`、`tests/ui/test_archive_optimize_import_frontend.py`——逐个检查：纯 Python 逻辑测试保留并改读 Vue 源/新测试；纯前端逻辑测试删除，由 Vitest 组件测试替代）
- Modify: `api/services.py`（删除 fallback 分支，只保留 FileResponse dist）

**Interfaces:**
- Consumes: `usePolling`、`apiFetch`、migration API（`/migration/status|test|run`）
- 行为对照: 旧 `renderMigrationStatus/renderMigrationUnits/renderMigrationCrontab/renderMigrationStartScript/renderMigrationProcesses/testSystemdMigration/runSystemdMigration`；文案 key 已存在（`sysmon.systemdMigrationTitle/preflightResult/...`）

- [ ] **Step 1: MigrationPanel TDD**（status 渲染卡片/单元表/按钮；test/run 按钮调用 api 并展示结果弹窗）
- [ ] **Step 2: 实现 + 接入 + 全绿**
- [ ] **Step 3: 删除旧 HTML 与 fallback**（`git rm frontend/services_monitor.html`；`api/services.py` 清理；`pytest tests/test_ini_apply_metadata.py tests/test_services_pbcluster.py tests/test_services_cmc_pool.py tests/ui/test_archive_optimize_import_frontend.py -v` 处理失败用例）
- [ ] **Step 4: 手动冒烟**：本地跑服务，过一遍全部标签页（Log/Settings/Pool/迁移），切中英文
- [ ] **Step 5: Commit** `refactor: remove legacy services_monitor html in favor of vue page`

---

## Phase 2+ — 迁移 Playbook（供后续 session 逐页执行）

对剩余 33 页，每页执行同一 checklist（一页一个 PR/分支，按模块分组推进：dashboard 系 → market/coin 系 → VPS 系 → v7 系；v7_optimize 与 vps_manager 最后）：

1. `grep -n "function \|window\." frontend/<page>.html` → 组件映射表
2. 建 `src/pages/<page>/`，按本计划 Task 8–14 的模式拆面板组件；共享组件沉淀到 `src/shared/components/`（第三次复用时才抽，勿提前）
3. 每组件 TDD；页面级 `App.test.ts` 覆盖主要交互
4. 后端路由切 FileResponse(dist) + 旧文件 fallback；pytest 回退用例
5. 冒烟通过后 `git rm` 旧 HTML、删 fallback、替换旧 `_extract_function` 测试
6. `js/` 共享模块（dashboard_render、editor_shared 等）随最后一页迁移时 Vue 化，期间新旧双轨

**完成定义（DoD）**：`frontend/*.html`（旧页面）全部删除；`frontend/js/*.js` 中被 Vue 页替代者删除；CI 前端 job 绿；`tests/test_i18n.py` 持续绿（en/zh key 集合一致）。

**测试过滤语法（已验证，vitest 3.2.7 精确 pin）**：`npm test -- <filter>` 按 `test.dir`（src/）相对路径做子串匹配。页名与 dir 相对路径均可：
`npm test -- <page>`（如 `root_login`、`services_monitor`）、`npm test -- pages/<page>`、`npm test -- shared/<module>`。**不要**用仓库根前缀（`frontend/src/...`）——匹配为空会以 exit 1 失败。升级 vitest 前先用一个页名 filter 回归验证（契约注释见 `frontend/vite.config.ts`）。

---

## Self-Review 记录

- 共识覆盖：Q1 组件化→组件任务；Q2/Q9 TS strict→tsconfig+CI；Q5/6/7/8/10/11/12/13/14/15/16 分别对应 Task 1/1/7+8/4/5+12/14/1/1/1/6 与 Playbook ✅
- 占位符扫描：Task 7–13 中「行为对照旧函数 X」是有意设计——旧代码即规格说明，逐字复制其行为与 i18n key，而非虚构；所有 API 路径、key 名、字段清单都给了精确的 grep 定位命令 ✅
- 类型一致性：`BootInfo`（env.d.ts ↔ boot.ts ↔ api/boot.py payload）、`usePolling`（Task 9 定义，Task 10/14 消费）、`MultiselectTags`（Task 12 定义，Task 13 消费）签名一致 ✅
