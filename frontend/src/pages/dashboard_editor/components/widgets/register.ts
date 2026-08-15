/**
 * D-editor-4 widget registration — replaces the D-editor-2 EmptyCell stubs
 * for TOP, PNL, ADG and P+L (widgetRegistry.ts contract). Imported once by
 * main.ts; the remaining types stay stubs until D-editor-5..7 register.
 */
import { registerWidget } from '../../widgetRegistry';
import WidgetAdg from './WidgetAdg.vue';
import WidgetPnl from './WidgetPnl.vue';
import WidgetPpl from './WidgetPpl.vue';
import WidgetTop from './WidgetTop.vue';

registerWidget('TOP', WidgetTop);
registerWidget('PNL', WidgetPnl);
registerWidget('ADG', WidgetAdg);
registerWidget('P+L', WidgetPpl);
