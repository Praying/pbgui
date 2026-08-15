import { describe, expect, it } from 'vitest';
import { widgetComponent } from '../../widgetRegistry';
import EmptyCell from './EmptyCell.vue';
import WidgetAdg from './WidgetAdg.vue';
import WidgetBalance from './WidgetBalance.vue';
import WidgetPnl from './WidgetPnl.vue';
import WidgetPpl from './WidgetPpl.vue';
import WidgetPositions from './WidgetPositions.vue';
import WidgetTop from './WidgetTop.vue';
import './register';

/* D-editor-4 replaced TOP/PNL/ADG/P+L; D-editor-5 replaces BALANCE and
 * POSITIONS. INCOME and ORDERS stay stubs until D-editor-6/7. */

describe('D-editor-5 widget registration', () => {
  it('registers BALANCE and POSITIONS on top of the D-editor-4 set', () => {
    expect(widgetComponent('BALANCE')).toBe(WidgetBalance);
    expect(widgetComponent('POSITIONS')).toBe(WidgetPositions);
    expect(widgetComponent('TOP')).toBe(WidgetTop);
    expect(widgetComponent('PNL')).toBe(WidgetPnl);
    expect(widgetComponent('ADG')).toBe(WidgetAdg);
    expect(widgetComponent('P+L')).toBe(WidgetPpl);
  });

  it('leaves INCOME and ORDERS on the EmptyCell stub', () => {
    expect(widgetComponent('INCOME')).toBe(EmptyCell);
    expect(widgetComponent('ORDERS')).toBe(EmptyCell);
  });
});
