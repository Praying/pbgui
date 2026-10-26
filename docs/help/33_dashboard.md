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

Use **Guide** in the page navigation for this topic. A browser refresh is safe and returns to the same Dashboard route. Main navigation, local scripts and help requests retain the application mount prefix. Guide opens over the current page rather than replacing it.

## PnL values

Daily PnL uses green for profit and red for loss. Missing or invalid values appear as unlabelled gaps, not zero. Real zero values display `0.00` at the baseline. Cumulative mode sums available valid days and resumes after a gap; it does not imply complete history. After cumulative overflow, the remaining cumulative values stay unavailable while valid daily values remain visible.

Verify these cases with synthetic API responses in an isolated fixture server, never by corrupting account history or creating a real trade. Check bar/line switching and automatic updates while preserving the selected period, user and zoom.

## Positions and chart windows

**Manage** opens a draggable, resizable positions dialog. Escape closes the active config preview first and returns focus to its trigger; closing Manage returns focus to its opener. Tab and Shift+Tab remain within the active dialog. Outside clicks do not dismiss it. Updates preserve selections, tabs, scroll and edits.

Orders charts reserve space for Entry and Price labels. Automatic updates must preserve manual pan and zoom rather than repeatedly fitting the chart.

## Exchange limitations

- Bitunix and WEEX PB8 accounts use PB8's read-only clients in bounded, isolated processes for account snapshots. Bitunix performance covers fill-derived realized PnL and fees, not complete funding-income parity. Direct **Market close** remains disabled until each exchange's close-order contract has been separately verified. Panic, Graceful Stop and Take Profit Only update bot configuration instead.
- Bitget UTA perpetual balance is the USDT wallet balance, not multi-asset equity. Private WebSockets remain disabled for Classic and UTA in this rollout; chart positions and orders use full REST snapshots every five seconds. Other account views depend on PBData polling. UTA direct **Market close** is disabled; verified Classic mode remains supported, and unknown account mode blocks the action.
