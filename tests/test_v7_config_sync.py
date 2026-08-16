"""Regression tests for legacy sync removal and frontend rendering safety."""

import asyncio
import subprocess
import textwrap
from pathlib import Path

from tests.i18n_helpers import NODE_I18N_STUB, assert_text_present


ROOT = Path(__file__).resolve().parents[1]


_I18N_INTERPOLATE = (
    "PBGuiI18n.t = (function (base) {\n"
    " return function (key, params) {\n"
    " var value = base(key);\n"
    " if (!params) return value;\n"
    " return String(value).replace(/\\{(\\w+)\\}/g, function (match, name) {\n"
    " return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;\n"
    " });\n"
    " };\n"
    "})(PBGuiI18n.t);\n"
)

_I18N_T_ALIAS = "function t(key, params) { return window.PBGuiI18n.t(key, params); }\n"


def _read(relative_path: str) -> str:
    """Return a repository file as text."""

    return (ROOT / relative_path).read_text(encoding="utf-8")


def _extract_js_function(source: str, name: str) -> str:
    """Extract one named JavaScript function from an HTML source file."""
    marker = f"function {name}("
    start = source.find(marker)
    assert start >= 0, f"Could not find JavaScript function {name!r}"
    if source[max(0, start - 6):start] == "async ":
        start -= 6
    brace_start = source.find("{", start)
    depth = 0
    quote = None
    escaped = False
    for index in range(brace_start, len(source)):
        char = source[index]
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in ("'", '"', "`"):
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    raise AssertionError(f"Could not extract complete JavaScript function {name!r}")


def _run_frontend_node(relative_path: str, function_names: list[str], bootstrap: str, assertions: str) -> None:
    """Run Node assertions against selected inline frontend functions."""
    source = _read(relative_path)
    functions = "\n\n".join(_extract_js_function(source, name) for name in function_names)
    script = textwrap.dedent(
        f"""
        const assert = require('node:assert/strict');
        function encodeText(value) {{
          return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }}
        {bootstrap}
        {functions}
        {assertions}
        """
    )
    script = NODE_I18N_STUB + _I18N_INTERPOLATE + _I18N_T_ALIAS + script
    result = subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True, check=False)
    assert result.returncode == 0, f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"


def test_legacy_worker_modules_are_not_present() -> None:
    """Ensure deleted legacy worker modules stay removed."""

    assert not (ROOT / "master" / "file_sync.py").exists()
    assert not (ROOT / "master" / "v7_config_sync.py").exists()
    assert not (ROOT / "frontend" / "js" / "api_sync_status.js").exists()


def test_api_startup_does_not_create_legacy_sync_workers() -> None:
    """Ensure PBApiServer does not initialize deleted sync workers."""

    source = _read("PBApiServer.py")
    forbidden = [
        "FileSyncWorker",
        "V7ConfigSyncWorker",
        "init_file_sync",
        "file_sync.start_watchers",
        "v7_sync.start_watchers",
    ]
    for needle in forbidden:
        assert needle not in source


def test_api_key_ssh_sync_routes_are_removed() -> None:
    """Ensure direct API-key SSH sync endpoints and UI are absent."""

    api_source = _read("api/api_keys.py")
    ui_source = _read("frontend/api_keys_editor.html")
    vps_source = _read("frontend/vps_manager.html")
    for source in (api_source, ui_source, vps_source):
        assert "/sync/push-ssh" not in source
        assert "/sync/ssh-status" not in source
        assert "/sync/ssh-retention" not in source
        assert "Advanced API Sync" not in source
    assert "_file_sync_worker" not in api_source
    assert "createApiSyncStatusController" not in ui_source
    assert "createApiSyncStatusController" not in vps_source


def test_v7_routes_do_not_use_legacy_sftp_config_writes() -> None:
    """Ensure V7 save/delete paths do not restore the removed SFTP transport."""

    source = _read("api/v7_instances.py")
    forbidden = [
        "remote_path_join",
        "remote_shell_path",
        "_open_sftp",
        "SFTP_RETRY_ATTEMPTS",
        "SFTP_RETRY_DELAY",
        "rm -rf",
    ]
    for needle in forbidden:
        assert needle not in source
    assert "cluster_sync" in source


def test_v7_sync_hook_returns_cluster_handoff(tmp_path, monkeypatch) -> None:
    """Ensure the legacy V7 sync hook no longer requires SSH state."""

    import api.v7_instances as v7_instances

    monkeypatch.setattr(v7_instances, "PBGDIR", str(tmp_path))
    instance_dir = tmp_path / "data" / "run_v7" / "demo"
    instance_dir.mkdir(parents=True)
    (instance_dir / "config.json").write_text("{}", encoding="utf-8")

    result = asyncio.run(v7_instances._ssh_sync_instance("demo"))

    assert result["cluster_sync"] is True
    assert result["pending"] is True
    assert result["direct"] is False
    assert result["hosts"] == {}


def test_v7_sync_hook_uses_bounded_direct_activation(tmp_path, monkeypatch) -> None:
    """A current V7 operation gets one four-second direct activation attempt."""

    import api.v7_instances as v7_instances

    monkeypatch.setattr(v7_instances, "PBGDIR", str(tmp_path))
    instance_dir = tmp_path / "data" / "run_v7" / "demo"
    instance_dir.mkdir(parents=True)
    (instance_dir / "config.json").write_text("{}", encoding="utf-8")
    operation = {"op": "UPSERT_CONFIG", "instance": "demo"}
    calls: list[tuple[Path, dict, int]] = []

    def activate(cluster_root: Path, pushed_operation: dict, *, timeout: int) -> dict:
        calls.append((cluster_root, pushed_operation, timeout))
        return {
            "ok": True,
            "direct": True,
            "pbname": "runner-a",
            "materialization": {"ok": True},
        }

    monkeypatch.setattr(v7_instances, "push_v7_activation", activate)

    result = asyncio.run(v7_instances._ssh_sync_instance("demo", operation))

    assert calls == [(tmp_path / "data" / "cluster", operation, 4)]
    assert result["ok"] == 1
    assert result["direct"] is True
    assert result["hosts"] == {"runner-a": {"success": True}}


def test_api_key_rows_use_data_attributes_instead_of_inline_javascript() -> None:
    """API-key usernames are never compiled as row or button JavaScript."""
    source = _read("frontend/api_keys_editor.html")

    assert 'data-user-name="' in source
    assert 'data-user-action="edit"' in source
    assert 'data-user-action="delete"' in source
    assert 'onclick="editUser(' not in source
    assert 'onclick="event.stopPropagation();editUser(' not in source
    assert 'onclick="event.stopPropagation();confirmDelete(' not in source
    assert 'onkeydown="handleRowKey(' not in source
    assert 'userTableBody.addEventListener("click"' in source
    assert 'userTableBody.addEventListener("keydown"' in source


def test_api_key_attribute_encoding_blocks_context_breakout() -> None:
    """API-key data attributes encode entities, quotes, tags, and backslashes."""
    _run_frontend_node(
        "frontend/api_keys_editor.html",
        ["escapeAttr"],
        "",
        r"""
        const payloads = [
          '<img src=x onerror=alert(1)>',
          '\"><svg onload=alert(1)>',
          "');alert(1);//",
          "\\');alert(1);//",
          '&apos;);alert(1);//',
          'line1\nline2'
        ];
        payloads.forEach(function(payload) {
          const encoded = escapeAttr(payload);
          assert.equal(encoded.includes('<'), false);
          assert.equal(encoded.includes('>'), false);
          assert.equal(encoded.includes('"'), false);
          assert.equal(encoded.includes("'"), false);
        });
        assert.match(escapeAttr('&apos;'), /&amp;apos;/);
        """,
    )


def test_api_key_delegated_actions_preserve_click_and_keyboard_behavior() -> None:
    """Delegated API-key events retain row, edit, delete, and keyboard actions."""
    bootstrap = r"""
        const calls = [];
        const tbody = { contains: function() { return true; } };
        global.document = { getElementById: function() { return tbody; } };
        function editUser(name) { calls.push(['edit', name]); }
        function confirmDelete(name) { calls.push(['delete', name]); }
    """
    assertions = r"""
        const row = { dataset: { userName: "alice');attack();//" } };
        function eventFor(action, key) {
          const actionEl = action ? { dataset: { userAction: action } } : null;
          return {
            key: key || '', stopped: false, prevented: false,
            stopPropagation: function() { this.stopped = true; },
            preventDefault: function() { this.prevented = true; },
            target: {
              nextElementSibling: null, previousElementSibling: null,
              closest: function(selector) {
                if (selector === 'button') return null;
                if (selector === 'tr[data-user-name]') return row;
                if (selector === '[data-user-action]') return actionEl;
                return null;
              }
            }
          };
        }
        handleUserTableClick(eventFor(''));
        handleUserTableClick(eventFor('edit'));
        handleUserTableClick(eventFor('delete'));
        const keyEvent = eventFor('', 'Enter');
        handleUserTableKeydown(keyEvent);
        assert.deepEqual(calls, [
          ['edit', row.dataset.userName], ['edit', row.dataset.userName],
          ['delete', row.dataset.userName], ['edit', row.dataset.userName]
        ]);
        assert.equal(keyEvent.prevented, true);
    """
    _run_frontend_node(
        "frontend/api_keys_editor.html",
        ["handleRowKey", "handleUserTableClick", "handleUserTableKeydown"],
        bootstrap,
        assertions,
    )


def test_hl_expiry_preview_sends_unsaved_key_only_in_post_body() -> None:
    """The browser never places a Hyperliquid private key in the expiry URL."""
    source = _read("frontend/api_keys_editor.html")
    assert "?private_key=" not in source

    bootstrap = r"""
        let unsavedKey = '0x-private-preview-key';
        const calls = [];
        const button = { disabled: false, textContent: '' };
        global.document = { getElementById: function() { return button; } };
        const editingName = 'alice name';
        const hlExpiryData = {};
        function getMaskedFieldValue() { return unsavedKey; }
        async function apiFetch(url, options) { calls.push([url, options || {}]); return { status: 'ok' }; }
        function renderUserTable() {}
        function updateHLExpiryInline() {}
    """
    assertions = r"""
        (async function() {
          await checkSingleHLExpiry();
          unsavedKey = '';
          await checkSingleHLExpiry();
          assert.equal(calls[0][0], '/alice%20name/hl-expiry');
          assert.equal(calls[0][0].includes('private'), false);
          assert.equal(calls[0][1].method, 'POST');
          assert.deepEqual(JSON.parse(calls[0][1].body), { private_key: '0x-private-preview-key' });
          assert.equal(calls[1][0], '/alice%20name/hl-expiry');
          assert.deepEqual(calls[1][1], {});
        }()).catch(function(error) { console.error(error); process.exitCode = 1; });
    """
    _run_frontend_node(
        "frontend/api_keys_editor.html",
        ["checkSingleHLExpiry"],
        bootstrap,
        assertions,
    )


def test_jobs_monitor_escapes_job_data_and_uses_delegated_actions() -> None:
    """Main job cards preserve markup while treating all job fields as text."""
    bootstrap = r"""
        global.document = {
          createElement: function() {
            let text = '';
            return {
              set textContent(value) { text = String(value == null ? '' : value); },
              get innerHTML() { return encodeText(text); }
            };
          }
        };
        const expandedJobs = new Set();
        const expandedDownloaderJobs = new Set();
        const downloaderLogCache = new Map();
        function calculateProgress() { return 42; }
        function formatJobDuration() { return '1m 02s'; }
        function formatBytes(value) { return String(value || 0) + ' B'; }
        function formatTimestamp(value) { return String(value || ''); }
        function fmtDayCompact(value) { return String(value || ''); }
        function renderDownloaderDetails() { return ''; }
    """
    assertions = r"""
        const attack = '<img src=x onerror=globalThis.pwned=true>';
        const idAttack = '&apos;);globalThis.pwned=true;//\\\n' + attack;
        const job = {
          id: idAttack,
          type: attack,
          status: attack,
          updated_ts: attack,
          error: attack,
          payload: { coins: [attack], start_day: attack, end_day: attack },
          progress: {
            coin: attack, chunk_start: attack, chunk_end: attack,
            stage: attack, mode: attack, step: attack, total: 1,
            downloaded_total: 1, skipped_existing_total: 1, failed_total: 1
          }
        };
        const active = renderActiveJob(job);
        const history = renderJob(job);
        [active, history].forEach(function(html) {
          assert.equal(html.includes('<img'), false);
          assert.equal(html.includes('onclick='), false);
          assert.match(html, /data-job-action=/);
          assert.match(html, /&lt;img/);
          assert.match(html, /&amp;apos;/);
        });
    """
    _run_frontend_node(
        "frontend/jobs_monitor.html",
        ["escapeHtml", "escapeAttr", "renderActiveJob", "renderJob"],
        bootstrap,
        assertions,
    )


def test_jobs_monitor_delegation_preserves_all_job_actions() -> None:
    """Delegated job buttons dispatch every existing action with the raw job ID."""
    bootstrap = r"""
        const calls = [];
        function runJob(id) { calls.push(['run', id]); }
        function showJobDetails(id) { calls.push(['view', id]); }
        function showLog(id) { calls.push(['log', id]); }
        function cancelJob(id) { calls.push(['cancel', id]); }
        function retryJob(id) { calls.push(['retry', id]); }
        function requeueJob(id) { calls.push(['requeue', id]); }
        function deleteJob(id) { calls.push(['delete', id]); }
        function toggleExpander(id) { calls.push(['toggle', id]); }
    """
    assertions = r"""
        const id = "job');attack();//";
        ['run','view','log','cancel','retry','requeue','delete','toggle'].forEach(function(action) {
          handleJobActionClick({ target: { closest: function() { return { dataset: { jobAction: action, jobId: id } }; } } });
        });
        assert.deepEqual(calls, [
          ['run',id], ['view',id], ['log',id], ['cancel',id],
          ['retry',id], ['requeue',id], ['delete',id], ['toggle',id]
        ]);
    """
    _run_frontend_node(
        "frontend/jobs_monitor.html",
        ["handleJobActionClick"],
        bootstrap,
        assertions,
    )


def test_hyperliquid_job_monitor_escapes_jobs_and_error_messages() -> None:
    """Embedded job cards and API errors cannot become executable markup.

    Re-pointed at the Vue sources with the hl_data_actions migration: the
    job cards render every field through text interpolation (the Vue
    equivalent of the legacy escHtml/escAttr wrappers), so the contract is
    that no raw-HTML sink exists in the card/modal components.
    """
    page = ROOT / "frontend" / "src" / "pages" / "hl_data_actions"
    for name in (
        "components/ActiveJobCard.vue",
        "components/HistoryJobCard.vue",
        "components/JobMonitorCard.vue",
        "components/JobModal.vue",
        "App.vue",
    ):
        source = (page / name).read_text(encoding="utf-8")
        assert "v-html" not in source, name
        assert ".innerHTML" not in source, name
    # job fields interpolate as text ({{ job.error }} etc.), never as markup
    active = (page / "components/ActiveJobCard.vue").read_text(encoding="utf-8")
    assert "{{ job.id }}" in active
    assert "{{ job.status }}" in active
    history = (page / "components/HistoryJobCard.vue").read_text(encoding="utf-8")
    assert "{{ job.error }}" in history
    # API error messages render through the same interpolation
    monitor_card = (page / "components/JobMonitorCard.vue").read_text(encoding="utf-8")
    assert "monitor.historyError.value" in monitor_card


def test_hyperliquid_success_message_keeps_existing_structure_without_inner_html() -> None:
    """Queued-job success messages retain strong, break, and small elements safely.

    Re-pointed at the Vue sources: lib/queuedMessage.ts builds structured
    parts (no markup strings) and App.vue renders the strong/br/small
    elements statically around interpolated text.
    """
    page = ROOT / "frontend" / "src" / "pages" / "hl_data_actions"
    parts_lib = (page / "lib" / "queuedMessage.ts").read_text(encoding="utf-8")
    app = (page / "App.vue").read_text(encoding="utf-8")
    store = (page / "composables" / "useHldaSections.ts").read_text(encoding="utf-8")

    assert ".innerHTML" not in parts_lib
    assert ".innerHTML" not in app
    assert "<strong>" in app
    assert "<br" in app
    assert "<small" in app
    assert "buildQueuedMessageParts" in store
    assert ".parts.jobId" in app  # the strong element renders the job id part


def test_xss_hardening_preserves_job_and_api_key_visual_contract() -> None:
    """Security changes retain the existing classes, labels, and button order."""
    api_keys = _read("frontend/api_keys_editor.html")
    jobs = _extract_js_function(_read("frontend/jobs_monitor.html"), "renderActiveJob")
    history = _extract_js_function(_read("frontend/jobs_monitor.html"), "renderJob")
    hl_page = ROOT / "frontend" / "src" / "pages" / "hl_data_actions"
    hl_jobs = (hl_page / "components/ActiveJobCard.vue").read_text(encoding="utf-8")  # renderActiveJob successor

    assert 'class="btn btn-sm btn-info" data-user-action="edit"' in api_keys
    assert_text_present(api_keys, "Edit")
    assert 'class="btn btn-sm btn-danger" data-user-action="delete"' in api_keys
    assert_text_present(api_keys, "Delete")
    assert jobs.index('data-job-action="run"') < jobs.index('data-job-action="view"') < jobs.index('data-job-action="log"') < jobs.index('data-job-action="cancel"')
    assert history.index('data-job-action="view"') < history.index('data-job-action="log"') < history.index('data-job-action="retry"') < history.index('data-job-action="requeue"') < history.index('data-job-action="delete"')
    assert 'class="job-card"' in jobs
    assert 'class="progress-bar"' in jobs
    assert '"hlda-jc"' in hl_jobs
    assert '"hlda-pb"' in hl_jobs
