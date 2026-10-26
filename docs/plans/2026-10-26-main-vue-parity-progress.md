# Main merge / Vue parity execution checkpoint

This is a partial execution record, not completion or commit approval.

## Git baseline

- Branch: `feature/frontend-vue3-migration`.
- HEAD: `f1ffa245c2ab1e0c516df8a10690986e3cb37459`.
- Merge target: `fff921e6241e9a23810549fb7257ef9a07c77937`.
- Incoming releases: v2.09.5 through v2.09.10 (six commits).
- Started with a clean tree. `git merge --no-ff --no-commit` is in progress; conflict hunks were reconciled and staged. Do not rerun the merge, abort it, commit it, or push without approval.

## Adaptation ledger

| Area | State | Implementation / remaining work |
| --- | --- | --- |
| API page serving | Implemented | Retained Vue-first / Vue-only routes; mounted legacy fallback and script-safe replacements; Jobs remains a single Vue-only route. |
| Backend/runtime releases | Merged, not fully validated | Upstream lifecycle, cluster I/O, loop storage/GPU replacement and Vast changes are present. Run complete isolated API/runtime coverage after fixing collection blockers. |
| Dashboard PNL | Implemented, focused tests passed | `frontend/src/pages/dashboard_editor/lib/plotlyLayouts.ts` preserves null/nonfinite gaps and real zero labels without changing ADG. Actual browser SVG acceptance remains pending. |
| Service lifecycle | Implemented, focused tests passed | `services_monitor/types.ts`, `status.ts`, OverviewCards tests cover transitional/unknown action gates and failure details. VPS Monitor parity remains pending. |
| Logging | Partially adapted, focused tests passed | View query restoration, numeric validation, independent scope locks, bounded requests and draft-preserving automatic synchronization. Further check nested log navigation and uncertain save outcomes. |
| Shared UI | Partially adapted, focused tests passed | `navigationHref.ts`, WorkbenchRail and WorkspaceHeader mount local links. Modal default forbids backdrop dismissal; focusTrap/useEscapeClose arbitrate their active owners. Mixed Reka/manual layers and real Guide/menu checks remain pending. |
| Shared assets | Updated | Vue index.html consumers now reference Guide v11 and Dialogs v12. Legacy nav retains the Jev transfer-preview dependency before loading its drawer. |
| Market Data Settings | Pending | Adapt useSettings/request/baseline/component loading gates, exchange ownership, missing saved coins, deadlines and edit/save reconciliation. |
| Optimize Settings / Vast | Pending | Settings validation/loading/draft retention; reviewed loop_ids on rental end, 409, per-job ownership, uncertain Stop and collection recovery. |
| CMC pool | Pending | Parent-owned lock spanning confirmation, DELETE and awaited fresh snapshot; stale/deleted-ID guards and automatic synchronization. |
| VPS Manager / HL Limits | Pending | Logging request_id and no reconnect replay; onboarding/password/detail/history generations, timeouts, cached-data retention and dialog-safe feedback. |
| Backtest / Strategy / Coin / Run | Pending audit and adaptation | Exact loop result handoff and return context, partial compare failures, cached strategy recovery/edit protection, movie callback cancellation, keyed Coin Data state and Run action guards. |
| PB8 AI Loops Vue | Not implemented | Current Optimize still has configs/queue/results/paretos only. Add native Vue Config/Queue/Results/Knowledge/Instructions/template/report workflows against merged loop APIs; no legacy DOM/iframe bridge. |
| Orders / position windows | Pending | Pixel-aware chart clearance and preserved manual viewport; actual movable/resizable dialog and nested focus regression checks. |
| Documentation / serial | Partial | EN/DE Dashboard guide keeps the fixed overview with applicable upstream data limits; ZH Logging added. Other relevant ZH guides and new UI translations need review. Serial is 3433; increment again after further API/startup edits. |

## Verification evidence and blockers

- Pre-adaptation frontend baseline: 401 suites, 4766 tests passed.
- Focused adapted Vue suites: 64 tests passed (PNL, Logging, OverviewCards).
- Shared interaction / modal consumer suites: 17 suites, 162 tests passed.
- Preserved Vue routes and Market Data snapshot contracts: 73 tests passed.
- Mounted legacy navigation harness: passed after reconciling Guide fallback and required icon/transfer-preview fixtures.
- `pnpm run typecheck` and `pnpm run build`: passed before final asset-reference refresh; rerun final build.
- Full backend attempt: stopped during collection at ten errors. Several tests replace `sys.modules['PBCoinData']` with mocks missing the new `get_hyperliquid_hip3_alias` contract; Playwright is absent from the project environment. Do not bypass these with runtime/live flags.
- Pytest was installed into the existing `.venv` because it was absent; no project dependency manifest or system Python was changed.
- Full frontend was rerun after moving the resolver out of the widely mocked boot module; inspect the terminal result before reporting its status.
- GitNexus CLI runner identity was verified and indexes refreshed with `--index-only --pdg`. MCP retained an older cache, so use the exact verified CLI, not cached MCP completeness claims. Analyzer warning boundaries and final detect-changes truncation must be disclosed.
- No screenshots, production actions, remote host operations, service restarts, commits or pushes were performed.
