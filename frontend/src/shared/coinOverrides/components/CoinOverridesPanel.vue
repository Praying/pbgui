<script setup lang="ts">
/**
 * Coin Overrides panel — the Vue port of the coin_overrides_editor.js render
 * half (_covRender :796-862, the coin/param pickers :864-1036, _covEditHtml
 * :1160-1290 and _covInputHtml :1346-1367). State lives in the shared
 * useCoinOverrides store (props.store) so v7_edit and the future backtest
 * editor (M-v7-9) share one implementation. All text renders through Vue
 * interpolations — the legacy innerHTML string builder is gone (XSS class
 * R1); the badge tooltip renders text rows instead of data-tooltip HTML.
 */
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CoinOverridesStore } from '../useCoinOverrides';
import { badgeSummary, flattenForAllowed, getNested, paramIsAllowed } from '../coinOvModel';

const props = defineProps<{ store: CoinOverridesStore }>();

const { t } = useI18n();
const store = props.store;

const expanded = ref(false);
const coinFilter = ref('');
const coinDropdownOpen = ref(false);
/** Per-section add-parameter rows: { parameter, value } keyed by section. */
const paramPick = reactive<Record<string, { parameter: string; value: string }>>({});
const paramDropdown = ref('');
const tooltip = ref<{ coin: string; rows: [string, string][] } | null>(null);

const sortedCoins = computed(() => Object.keys(store.overrides).sort());
const overrideCount = computed(() => sortedCoins.value.length);

const coinOptions = computed(() => {
  const rawFilter = coinFilter.value.trim();
  const filter = rawFilter.toUpperCase();
  const shown: string[] = [];
  for (const coin of store.availableCoins.value) {
    if (store.overrides[coin]) continue;
    if (filter && !coin.toUpperCase().includes(filter)) continue;
    shown.push(coin);
    if (shown.length > 200) break;
  }
  if (!shown.length && filter) {
    const custom = store.contextAware.value ? rawFilter : filter;
    if (!store.overrides[custom]) shown.push(custom);
  }
  return shown;
});

interface EditSection {
  key: 'bot.long' | 'bot.short' | 'live';
  label: string;
  color: string;
  path: readonly string[];
}

const editSections = computed<EditSection[]>(() => [
  { key: 'bot.long', label: t('editor.overrides.botLong'), color: 'var(--green)', path: ['bot', 'long'] },
  { key: 'bot.short', label: t('editor.overrides.botShort'), color: 'var(--red)', path: ['bot', 'short'] },
  { key: 'live', label: t('editor.overrides.live'), color: 'var(--blue)', path: ['live'] },
]);

function sectionAllowed(section: EditSection): Record<string, unknown> {
  return (getNested(store.allowedParams.value, section.path) ?? {}) as Record<string, unknown>;
}

function sectionParams(section: EditSection): string[] {
  const data = store.editCoin.value ? store.overrides[store.editCoin.value] : undefined;
  const allowed = sectionAllowed(section);
  const sectionData = flattenForAllowed(getNested(data, section.path) ?? {}, allowed);
  return Object.keys(sectionData).sort();
}

function unusedParams(section: EditSection): string[] {
  const allowed = sectionAllowed(section);
  const existing = new Set(sectionParams(section));
  return Object.keys(allowed)
    .filter((key) => paramIsAllowed(allowed[key]) && !existing.has(key))
    .sort();
}

function pick(section: EditSection): { parameter: string; value: string } {
  if (!paramPick[section.key]) paramPick[section.key] = { parameter: '', value: '' };
  return paramPick[section.key]!;
}

function addParam(section: EditSection): void {
  const row = pick(section);
  store.addParam(section.key, row.parameter.trim(), row.value.trim());
}

function inputMode(section: EditSection, param: string): 'forced-mode' | 'boolean' | 'text' {
  const allowed = sectionAllowed(section);
  if (param === 'forced_mode_long' || param === 'forced_mode_short') return 'forced-mode';
  const metadata = allowed[param];
  if (metadata && typeof metadata === 'object' && (metadata as { type?: unknown }).type === 'boolean') {
    return 'boolean';
  }
  return 'text';
}

const FORCED_MODES = ['normal', 'graceful_stop', 'manual', 'panic', 'tp_only'];

const unsupportedInline = computed(() => {
  const coin = store.editCoin.value;
  const data = coin ? store.overrides[coin] : undefined;
  if (!data) return [];
  const allowed = store.allowedParams.value ?? {};
  const unsupported: string[] = [];
  for (const section of editSections.value) {
    const values = flattenForAllowed(getNested(data, section.path) ?? {}, sectionAllowed(section));
    for (const key of Object.keys(values)) {
      if (!Object.prototype.hasOwnProperty.call(sectionAllowed(section), key)) {
        unsupported.push(section.key + '.' + key);
      }
    }
  }
  void allowed;
  return unsupported.sort();
});

const allowedParamCount = computed(() => {
  const count = (value: unknown): number => {
    if (value === true) return 1;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    const record = value as Record<string, unknown>;
    if (record.type || Object.prototype.hasOwnProperty.call(record, 'default')) return 1;
    return Object.keys(record).reduce((total, key) => total + count(record[key]), 0);
  };
  return count(store.allowedParams.value);
});

function coinLabel(coin: string): string {
  return store.marketLabels.value[coin] || coin;
}

function showTooltip(coin: string): void {
  const data = store.overrides[coin] ?? {};
  const rows: [string, string][] = [];
  for (const section of editSections.value) {
    const flat = flattenForAllowed(getNested(data, section.path) ?? {}, sectionAllowed(section));
    for (const key of Object.keys(flat).sort()) {
      const value = flat[key];
      rows.push([key, typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)]);
    }
  }
  if (data.override_config_path) rows.push(['file', String(data.override_config_path)]);
  tooltip.value = rows.length ? { coin, rows } : null;
}

function hideTooltip(): void {
  tooltip.value = null;
}

function editCoin(coin: string): void {
  if (store.editCoin.value === coin) {
    store.closeEdit();
    return;
  }
  store.editCoinStart(coin);
}

function removeParam(section: EditSection, param: string): void {
  store.removeParam(section.key, param);
}

function onFilePaste(side: 'long' | 'short', event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text') ?? '';
  const result = store.filterPaste(side, text);
  if (!result) return;
  event.preventDefault();
  store.fileValues[side] = result.text;
  const messages: Record<string, string> = {
    extractedPaste: t('editor.overrides.extractedPaste', { side }),
    filteredPaste: t('editor.overrides.filteredPaste', { n: 1 }),
    extractedFilteredPaste: t('editor.overrides.extractedFilteredPaste', { side, n: 1 }),
  };
  emit('notify', messages[result.messageKey]!, 'info');
}

const emit = defineEmits<{ (e: 'notify', msg: string, kind: 'err' | 'info'): void }>();
</script>

<template>
  <div class="expander" id="exp-coin-ov" :class="{ open: expanded || overrideCount > 0 }">
    <div class="expander-header" @click="expanded = !expanded">
      <span class="arrow">&#x25B6;</span> {{ t('editor.overrides.title') }}
      <span v-if="overrideCount > 0" style="color: var(--text-dim); font-size: var(--fs-xs); margin-left: 6px"
        >({{ t('editor.overrides.coinCount', { n: overrideCount, s: overrideCount > 1 ? 's' : '' }) }})</span
      >
    </div>
    <div class="expander-body">
      <!-- Summary table (:813-834) -->
      <table v-if="overrideCount > 0" class="tbl" style="font-size: var(--fs-sm)">
        <thead>
          <tr>
            <th>{{ t('editor.overrides.coin') }}</th>
            <th>{{ t('editor.overrides.overrides') }}</th>
            <th style="width: 100px">{{ t('editor.overrides.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="coin in sortedCoins"
            :key="coin"
            :style="store.editCoin.value === coin ? 'background:rgb(var(--accent-rgb) / .06)' : undefined"
          >
            <td style="font-weight: 600" :title="coin">{{ coinLabel(coin) }}</td>
            <td>
              <span
                class="cov-badge"
                @mouseover="showTooltip(coin)"
                @mouseout="hideTooltip"
              >{{ badgeSummary(store.overrides[coin] ?? {}) }}</span>
            </td>
            <td>
              <button type="button" class="act-btn" @click="editCoin(coin)">
                {{ store.editCoin.value === coin ? t('editor.overrides.editing') : t('editor.overrides.edit') }}
              </button>
              <button type="button" class="act-btn act-btn-danger" @click="store.removeCoin(coin)">&#x00D7;</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Badge tooltip (text-only port of #cov-tooltip) -->
      <div v-if="tooltip" class="cov-tt-tbl" style="max-width: 480px">
        <div v-for="[key, value] in tooltip.rows" :key="tooltip.coin + key" class="cov-tt-row">
          <span class="cov-tt-key">{{ key }}</span>
          <span>{{ value }}</span>
        </div>
      </div>

      <!-- Add coin (:836-842) -->
      <div class="form-group" style="margin-top: var(--sp-sm); max-width: 300px">
        <label>
          <span data-tip="Select a coin to add per-coin overrides.&#10;Type to search the list.">{{ t('editor.overrides.addCoin') }}</span>
        </label>
        <div class="ms-wrap" id="cov-coin-picker" @focusin="coinDropdownOpen = true" @focusout="coinDropdownOpen = false">
          <input
            id="cov-coin-input"
            v-model="coinFilter"
            class="ms-input"
            :placeholder="t('editor.overrides.typeToSearch')"
            autocomplete="off"
            @keydown.enter.prevent="coinOptions.length ? store.pickCoin(coinOptions[0]!) : undefined"
          />
          <div id="cov-coin-dd" class="ms-dropdown" :class="{ open: coinDropdownOpen }">
            <div
              v-for="coin in coinOptions"
              :key="coin"
              class="ms-option"
              @mousedown.prevent="store.pickCoin(coin)"
            >{{ coinLabel(coin) }}<template v-if="!store.availableCoins.value.includes(coin)"> {{ t('editor.overrides.custom') }}</template></div>
          </div>
        </div>
      </div>

      <!-- Edit area (:1160-1290) -->
      <div
        v-if="store.editCoin.value"
        style="border: 1px solid var(--accent); border-radius: 6px; padding: var(--sp-md); margin-top: var(--sp-sm); background: rgb(var(--accent-rgb) / 0.03)"
      >
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-sm)">
          <span style="font-size: var(--fs-sm); font-weight: 600; color: var(--accent)"
            >{{ t('editor.overrides.editCoin', { coin: store.editCoin.value }) }}</span
          >
          <button type="button" class="act-btn" @click="store.closeEdit()">{{ t('editor.overrides.done') }}</button>
        </div>

        <div v-if="store.allowedParams.value === null" style="margin-bottom: var(--sp-sm); color: var(--text-dim); font-size: var(--fs-sm)">
          {{ t('editor.overrides.loadingParams') }}
        </div>
        <div v-else-if="store.allowedParamsError.value" style="margin-bottom: var(--sp-sm); color: var(--red); font-size: var(--fs-sm)">
          {{ t('editor.overrides.paramsUnavailable', { msg: store.allowedParamsError.value }) }}
        </div>
        <div v-else-if="allowedParamCount === 0" style="margin-bottom: var(--sp-sm); color: var(--text-dim); font-size: var(--fs-sm)">
          {{ t('editor.overrides.noInlineParams') }}
        </div>
        <div v-if="unsupportedInline.length" style="margin-bottom: var(--sp-sm); color: var(--red); font-size: var(--fs-sm)">
          {{ t('editor.overrides.unsupportedInline', { params: unsupportedInline.join(', ') }) }}
        </div>

        <!-- Bot Long / Bot Short / Live sections (:1184-1241) -->
        <div
          v-for="section in editSections"
          :key="section.key"
          style="margin-bottom: var(--sp-sm); padding-bottom: var(--sp-sm); border-bottom: 1px solid var(--border)"
        >
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-xs)">
            <span style="font-weight: 600; font-size: var(--fs-sm)" :style="{ color: section.color }">{{ section.label }}</span>
          </div>

          <table v-if="sectionParams(section).length" class="tbl" style="font-size: var(--fs-xs); margin-bottom: var(--sp-xs)">
            <thead>
              <tr>
                <th>{{ t('editor.overrides.parameter') }}</th>
                <th>{{ t('editor.overrides.value') }}</th>
                <th style="width: 40px"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="param in sectionParams(section)" :key="section.key + param">
                <td>{{ param }}</td>
                <td>
                  <select
                    v-if="inputMode(section, param) === 'forced-mode'"
                    v-model="store.inlineValues[section.key + '.' + param]"
                    class="cov-param-input cov-param-select"
                  >
                    <option v-for="mode in FORCED_MODES" :key="mode" :value="mode">{{ mode }}</option>
                  </select>
                  <select
                    v-else-if="inputMode(section, param) === 'boolean'"
                    v-model="store.inlineValues[section.key + '.' + param]"
                    class="cov-param-input cov-param-select"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                  <input v-else v-model="store.inlineValues[section.key + '.' + param]" type="text" class="cov-param-input" />
                </td>
                <td>
                  <button type="button" class="act-btn act-btn-danger" @click="removeParam(section, param)">&#x00D7;</button>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Add parameter (:1222-1238) -->
          <div v-if="unusedParams(section).length" class="form-row cols-4" style="align-items: end; margin-bottom: 0">
            <div class="form-group" style="grid-column: span 2">
              <label>{{ t('editor.overrides.parameter') }}</label>
              <div class="ms-wrap" @focusin="paramDropdown = section.key" @focusout="paramDropdown = ''">
                <input
                  v-model="pick(section).parameter"
                  class="ms-input"
                  :placeholder="t('editor.overrides.typeToSearch')"
                  autocomplete="off"
                  @keydown.enter.prevent="addParam(section)"
                />
                <div class="ms-dropdown" :class="{ open: paramDropdown === section.key }">
                  <div
                    v-for="param in unusedParams(section).filter((p) => p.toLowerCase().includes(pick(section).parameter.trim().toLowerCase()))"
                    :key="param"
                    class="ms-option"
                    @mousedown.prevent="pick(section).parameter = param"
                  >{{ param }}</div>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>{{ t('editor.overrides.value') }}</label>
              <input v-model="pick(section).value" type="text" placeholder="0.5" @keydown.enter.prevent="addParam(section)" />
            </div>
            <div class="form-group">
              <button type="button" class="act-btn" style="height: var(--input-h)" @click="addParam(section)">
                {{ t('editor.overrides.add') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Config File (:1243-1286) -->
        <div style="margin-top: var(--sp-xs)">
          <div
            style="display: flex; align-items: center; gap: var(--sp-sm); margin-bottom: var(--sp-xs); cursor: pointer"
            @click="store.fileValues.open = !store.fileValues.open"
          >
            <span
              class="arrow"
              style="font-size: var(--fs-xs); color: var(--text-dim); display: inline-block"
              :style="{ transform: store.fileValues.open ? 'rotate(90deg)' : 'none' }"
              >&#x25B6;</span
            >
            <span style="font-size: var(--fs-sm); font-weight: 600; color: var(--text-dim)">{{ t('editor.overrides.configFile') }}</span>
            <span style="font-size: var(--fs-xs); color: var(--text-dim)"
              >{{ t('editor.overrides.configFileHint', { coin: store.editCoin.value }) }}</span
            >
          </div>
          <div v-show="store.fileValues.open">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-sm)">
              <div class="form-group">
                <label style="color: var(--green)">long</label>
                <textarea
                  v-model="store.fileValues.long"
                  rows="12"
                  class="json-editor cov-cfg-ta"
                  :class="{ 'cov-json-invalid': store.fileSideError('long') }"
                  @paste="onFilePaste('long', $event)"
                ></textarea>
                <div v-if="store.fileSideError('long')" class="cov-json-status error" aria-live="polite">
                  {{ store.fileSideError('long') }}
                </div>
              </div>
              <div class="form-group">
                <label style="color: var(--red)">short</label>
                <textarea
                  v-model="store.fileValues.short"
                  rows="12"
                  class="json-editor cov-cfg-ta"
                  :class="{ 'cov-json-invalid': store.fileSideError('short') }"
                  @paste="onFilePaste('short', $event)"
                ></textarea>
                <div v-if="store.fileSideError('short')" class="cov-json-status error" aria-live="polite">
                  {{ store.fileSideError('short') }}
                </div>
              </div>
            </div>
            <span style="font-size: var(--fs-xs); color: var(--text-dim); margin-top: 2px; display: block">
              {{ t('editor.overrides.savedAs', { coin: store.editCoin.value }) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
