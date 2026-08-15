import { describe, expect, it } from 'vitest';
import { widgetComponent } from '../../widgetRegistry';
import WidgetAdg from './WidgetAdg.vue';
import WidgetBalance from './WidgetBalance.vue';
import WidgetIncome from './WidgetIncome.vue';
import WidgetOrders from './WidgetOrders.vue';
import WidgetPnl from './WidgetPnl.vue';
import WidgetPpl from './WidgetPpl.vue';
import WidgetPositions from './WidgetPositions.vue';
import WidgetTop from './WidgetTop.vue';
import './register';

/* D-editor-4 replaced TOP/PNL/ADG/P+L; D-editor-5 replaced BALANCE and
 * POSITIONS; D-editor-6 replaced ORDERS; D-editor-7 replaces INCOME — the
 * last EmptyCell stub (all 8 renderable types are now real widgets). */

describe('D-editor-7 widget registration', () => {
  it('registers every renderable widget — no EmptyCell stubs remain', () => {
    expect(widgetComponent('INCOME')).toBe(WidgetIncome);
    expect(widgetComponent('ORDERS')).toBe(WidgetOrders);
    expect(widgetComponent('BALANCE')).toBe(WidgetBalance);
    expect(widgetComponent('POSITIONS')).toBe(WidgetPositions);
    expect(widgetComponent('TOP')).toBe(WidgetTop);
    expect(widgetComponent('PNL')).toBe(WidgetPnl);
    expect(widgetComponent('ADG')).toBe(WidgetAdg);
    expect(widgetComponent('P+L')).toBe(WidgetPpl);
  });
});
