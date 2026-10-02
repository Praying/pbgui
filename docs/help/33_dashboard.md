# Dashboard

The **Dashboard** page is a fixed live operating view for Passivbot accounts. It uses one approved layout so the most important data is visible immediately and every user sees the same information hierarchy.

## Layout

The page is organized in this order:

1. **Balance** — total balance, unrealized PnL, total equity and account rows.
2. **Performance** — Daily PnL and ADG charts side by side.
3. **Risk & execution** — all currently open positions in a full-width table.
4. **Activity** — income history and top symbols side by side.

The layout is responsive. The two-column sections stack on narrow screens while the full-width sections remain reachable.

## Live updates

The page connects to the dashboard live-update channel. Balance and positions also use their existing live polling paths. Updates replace the affected widget only; the page does not reload or reset the current scroll position.

The overview header provides shared **Users**, **Period**, and **Mode** controls. Users and the selected period are applied to every widget that supports them; the chart mode is applied to the PnL and ADG charts together. These controls change the displayed data without changing the fixed page layout.

## Fixed behavior

The page no longer provides **New Dashboard**, dashboard selection, custom layout editing, deletion, or template management. The fixed overview is the only dashboard presentation and does not write a user-created dashboard configuration.

Use **Guide** in the page navigation for this topic. A browser refresh is safe and returns to the same Dashboard route.
