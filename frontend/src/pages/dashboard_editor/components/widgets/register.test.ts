import { describe, expect, it } from 'vitest';
import { widgetComponent } from '../../widgetRegistry';
import EmptyCell from './EmptyCell.vue';
import WidgetAdg from './WidgetAdg.vue';
import WidgetBalance from './WidgetBalance.vue';
import WidgetOrders from './WidgetOrders.vue';
import WidgetPnl from './WidgetPnl.vue';
import WidgetPpl from './WidgetPpl.vue';
import WidgetPositions from './WidgetPositions.vue';
import WidgetTop from './WidgetTop.vue';
import './register';

/* D-editor-4 replaced TOP/PNL/ADG/P+L; D-editor-5 replaced BALANCE and
 * POSITIONS; D-editor-6 replaces ORDERS. INCOME stays stubbed until D-7. */

describe('D-editor-6 widget registration', () => {
  it('registers ORDERS on top of the D-editor-4/5 set', () => {
    expect(widgetComponent('ORDERS')).toBe(WidgetOrders);
    expect(widgetComponent('BALANCE')).toBe(WidgetBalance);
    expect(widgetComponent('POSITIONS')).toBe(WidgetPositions);
    expect(widgetComponent('TOP')).toBe(WidgetTop);
    expect(widgetComponent('PNL')).toBe(WidgetPnl);
    expect(widgetComponent('ADG')).toBe(WidgetAdg);
    expect(widgetComponent('P+L')).toBe(WidgetPpl);
  });

  it('leaves INCOME on the EmptyCell stub', () => {
    expect(widgetComponent('INCOME')).toBe(EmptyCell);
  });
});
