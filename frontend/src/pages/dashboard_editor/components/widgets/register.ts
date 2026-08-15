/**
 * Widget registration — replaces the D-editor-2 EmptyCell stubs as the tasks
 * land (widgetRegistry.ts contract). Imported once by main.ts.
 * D-editor-4: TOP, PNL, ADG, P+L. D-editor-5: BALANCE, POSITIONS.
 * D-editor-6: ORDERS. INCOME (D-editor-7) stays stubbed.
 */
import { registerWidget } from '../../widgetRegistry';
import WidgetAdg from './WidgetAdg.vue';
import WidgetBalance from './WidgetBalance.vue';
import WidgetOrders from './WidgetOrders.vue';
import WidgetPnl from './WidgetPnl.vue';
import WidgetPpl from './WidgetPpl.vue';
import WidgetPositions from './WidgetPositions.vue';
import WidgetTop from './WidgetTop.vue';

registerWidget('TOP', WidgetTop);
registerWidget('PNL', WidgetPnl);
registerWidget('ADG', WidgetAdg);
registerWidget('P+L', WidgetPpl);
registerWidget('BALANCE', WidgetBalance);
registerWidget('POSITIONS', WidgetPositions);
registerWidget('ORDERS', WidgetOrders);
