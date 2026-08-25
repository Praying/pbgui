<script setup lang="ts">
/*
 * The mapping editor — legacy .tradfi-editor-shell (market_data_main.html
 * :3168-3217): the eight fields + invert toggle, the mode note (:3172,
 * text set at :6427/:6461-6463), read-only xyz while editing a row
 * (:6458) and the cancel/save actions (:9725-9729).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import {
  fieldLabelClass,
  noteClass,
  panelHeadClass,
  settingsFieldClass,
  settingsToggleClass,
} from '../../lib/uiClasses';
import type { UseTradfiMap } from '../../composables/useTradfiMap';

const props = defineProps<{
  map: UseTradfiMap;
}>();

const { t } = useI18n();

const modeText = computed<string>(() => {
  const mode = props.map.editorMode.value;
  if (mode.kind === 'saved') return t('market.editingSavedMapping', { coin: mode.coin });
  if (mode.kind === 'json') return t('market.editingFromMappingJson', { coin: mode.coin });
  return t('market.selectRowToEdit');
});

const editor = props.map.editor; // reactive field object — binds directly
</script>

<template>
  <div class="tradfi-editor-shell mt-3 grid gap-3 border-t border-secondary/12 pt-3" :hidden="!map.editorOpen.value || undefined">
    <div :class="panelHeadClass">
      <div>
        <h3>{{ t('market.mappingEditor') }}</h3>
        <p :class="noteClass" id="tradfi-editor-mode">{{ modeText }}</p>
      </div>
    </div>
    <div class="tradfi-editor-grid grid items-start gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.xyzCoin') }}</span>
        <Input
          id="tradfi-editor-xyz-coin"
          v-model="editor.xyzCoin"
          type="text"
          placeholder="e.g. TSLA"
          :readonly="map.xyzReadOnly.value"
         />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.canonicalType') }}</span>
        <SelectRoot v-model="editor.canonicalType">
          <SelectTrigger id="tradfi-editor-canonical-type">
            <span>{{ editor.canonicalType }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="value in map.optionLists.value.canonicalTypes" :key="value" :value="value">
              {{ value }}
            </SelectItem>
          </SelectContent>
        </SelectRoot>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.status') }}</span>
        <SelectRoot v-model="editor.status">
          <SelectTrigger id="tradfi-editor-status">
            <span>{{ editor.status }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="value in map.optionLists.value.statuses" :key="value" :value="value">
              {{ value }}
            </SelectItem>
          </SelectContent>
        </SelectRoot>
      </label>
      <label :class="[settingsFieldClass, 'tradfi-editor-span-2 col-span-2']">
        <span :class="fieldLabelClass">{{ t('market.description') }}</span>
        <Input
          id="tradfi-editor-description"
          v-model="editor.description"
          type="text"
          placeholder="Human-readable symbol name"
         />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.tiingoEquityTicker') }}</span>
        <Input
          id="tradfi-editor-tiingo-ticker"
          v-model="editor.tiingoTicker"
          type="text"
          placeholder="e.g. TSLA"
         />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.tiingoFxTicker') }}</span>
        <Input
          id="tradfi-editor-tiingo-fx-ticker"
          v-model="editor.tiingoFxTicker"
          type="text"
          placeholder="e.g. XAUUSD"
         />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.startDate') }}</span>
        <Input
          id="tradfi-editor-tiingo-start-date"
          v-model="editor.tiingoStartDate"
          type="text"
          placeholder="YYYY-MM-DD"
         />
      </label>
      <label :class="[settingsFieldClass, 'tradfi-editor-full col-span-full']">
        <span :class="fieldLabelClass">{{ t('market.note') }}</span>
        <Input id="tradfi-editor-note" v-model="editor.note" type="text" placeholder="Optional note" />
      </label>
    </div>
    <label :class="[settingsToggleClass, 'cursor-pointer']">
      <Checkbox id="tradfi-editor-tiingo-fx-invert" v-model="editor.fxInvert" />
      <span>{{ t('market.invertFxQuote') }}</span>
    </label>
    <div class="tradfi-editor-actions flex flex-wrap gap-2">
      <Button variant="info" id="btn-tradfi-cancel" type="button" @click="map.cancelEditor()">
        {{ t('common.cancel') }}
      </Button>
      <Button variant="primary" id="btn-tradfi-save" type="button" @click="map.saveMapping()">
        {{ t('common.save') }}
      </Button>
    </div>
  </div>
</template>
