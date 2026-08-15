import { describe, expect, it } from 'vitest';
import { widgetComponent } from '../../widgetRegistry';
import EmptyCell from './EmptyCell.vue';
import WidgetAdg from './WidgetAdg.vue';
import WidgetPnl from './WidgetPnl.vue';
import WidgetPpl from './WidgetPpl.vue';
import WidgetTop from './WidgetTop.vue';
import './register';

/* D-editor-4 replaces the D-editor-2 EmptyCell stubs for its four types
 * (widgetRegistry.ts contract); the remaining types stay stubs until their
 * tasks land. */

describe('D-editor-4 widget registration', () => {
  it('registers TOP, PNL, ADG and P+L (the on-disk literal, R11)', () => {
    expect(widgetComponent('TOP')).toBe(WidgetTop);
    expect(widgetComponent('PNL')).toBe(WidgetPnl);
    expect(widgetComponent('ADG')).toBe(WidgetAdg);
    expect(widgetComponent('P+L')).toBe(WidgetPpl);
  });

  it('leaves the other types on the EmptyCell stub', () => {
    expect(widgetComponent('INCOME')).toBe(EmptyCell);
    expect(widgetComponent('BALANCE')).toBe(EmptyCell);
    expect(widgetComponent('POSITIONS')).toBe(EmptyCell);
    expect(widgetComponent('ORDERS')).toBe(EmptyCell);
  });
});
