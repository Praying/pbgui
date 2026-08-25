<script setup lang="ts">
/**
 * Movie Builder stage (:324-372) — config grid (engine/side/start/step/
 * duration/frames/visible/folder), Generate/Stop buttons (:340),
 * result panel with frame metrics and tables (renderMovieDetails
 * :2526-2539, movieRows :2254-2259), and the MP4 export panel with
 * presets, advanced settings and the download link (:347-365).
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { deepGet, fmt } from '../lib/format';
import MoviePlot from './MoviePlot.vue';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import type { useMovie } from '../composables/useMovie';
import type { FillEvent } from '../types';

type Movie = ReturnType<typeof useMovie>;

const props = defineProps<{ store: ExplorerStore; movie: Movie }>();
const { t } = useI18n();
const store = props.store;
const movie = props.movie;

const plotRef = ref<{ stepMovieFrame(direction: number): boolean } | null>(null);
defineExpose({ stepMovieFrame: (direction: number) => plotRef.value?.stepMovieFrame(direction) ?? false });

const ENGINE_OPTIONS_V7 = [
  { value: 'local_simulation', labelKey: 'v7explore.pbguiSimulation' },
  { value: 'pb7_engine', labelKey: 'v7explore.pb7BacktestEngine' },
  { value: 'pb7_fills', labelKey: 'v7explore.pb7FillsCsv' },
];
const STEP_OPTIONS = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
  { value: '1440', label: '1d' },
];
const FFMPEG_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow'];

function openDatePicker(id: string, el: HTMLElement): void {
  (window as unknown as { __dp?: { show(id: string, anchor: HTMLElement | null): void } }).__dp?.show(id, el);
}

const sideKey = computed(() => store.selectedMovieSideKey());
const sideEvents = computed<FillEvent[]>(() => deepGet<FillEvent[]>(store.lastMovieData.value, ['events', sideKey.value], []));
const frames = computed(() => store.lastMovieData.value?.frames || []);
const engineLabel = computed(() => {
  const engine = store.lastMovieData.value?.engine;
  return store.adapter.isV8 && (engine === 'pb8_engine' || engine === 'pb8_native_replay') ? 'PB8 Native Replay' : engine || '-';
});
const meta = () => store.lastMovieData.value?.metadata || {};

interface FrameRow {
  index: number | string;
  time: string;
  close: string;
  entryOrders: number;
  closeOrders: number;
}
function frameRows(): FrameRow[] {
  return (frames.value.slice(0, 500) as NonNullable<typeof frames.value>).map((frame) => ({
    index: frame.index ?? 0,
    time: String(frame.timestamp),
    close: fmt(deepGet<number>(frame, ['candle', 'close'], 0), 8),
    entryOrders: deepGet<number>(frame, [sideKey.value, 'summary', 'entry_orders'], 0),
    closeOrders: deepGet<number>(frame, [sideKey.value, 'summary', 'close_orders'], 0),
  }));
}
interface FillRow {
  idx: number;
  time: string;
  event: string;
  qty: string;
  price: string;
  posSize: string;
}
function fillRows(): FillRow[] {
  return (sideEvents.value.slice(0, 500) as FillEvent[]).map((ev, idx) => ({
    idx: idx + 1,
    time: String(ev.timestamp || ev.time || ev.date || '-'),
    event: String(ev.event || ev.type || ev.order_type || '-'),
    qty: fmt(ev.qty, 8),
    price: fmt(ev.price, 8),
    posSize: fmt(ev.pos_size, 8),
  }));
}

function onStepChange(): void {
  store.invalidateMovieRequest();
  store.syncMovieDurationOptions();
  store.updateMovieDurationFrames();
}
function onDurationChange(): void {
  store.invalidateMovieRequest();
  store.updateMovieDurationFrames();
}
function onFramesInput(): void {
  store.invalidateMovieRequest();
  if (store.controls.movieDuration !== 'Custom (Frames)') store.controls.movieDuration = 'Custom (Frames)';
}
function onVisibleInput(): void {
  store.invalidateMovieRequest();
}

/* Trigger labels for the listbox selects — the legacy <select> showed the
   selected <option>'s TEXT; the reka trigger renders the label from the
   model explicitly (the option list is lazily mounted). */
const movieEngineLabel = computed(() => {
  if (store.adapter.isV8 || store.controls.movieEngine === 'pb8_engine') return t('v7explore.simModePb8Replay');
  const opt = ENGINE_OPTIONS_V7.find((o) => o.value === store.controls.movieEngine);
  return opt ? t(opt.labelKey) : store.controls.movieEngine;
});
const movieSideLabel = computed(() => t('v7explore.' + store.controls.movieSide));
const movieStepLabel = computed(() => STEP_OPTIONS.find((s) => s.value === store.controls.movieStep)?.label ?? store.controls.movieStep);
const exportPresetLabel = computed(() => {
  const key = store.controls.exportPreset.toLowerCase();
  return ['fast', 'balanced', 'quality', 'custom'].includes(key) ? t('v7explore.' + key) : store.controls.exportPreset;
});
const exportCodecLabel = computed(() => {
  if (!movie.exportCodecs.value.length) return store.controls.exportCodec === 'auto' ? t('v7explore.autoDetectBest') : store.controls.exportCodec;
  return movie.exportCodecs.value.find((c) => c.id === store.controls.exportCodec)?.label || store.controls.exportCodec;
});
</script>

<template>
  <section id="stage-movie" :class="store.controls.stage === 'movie' ? 'active block' : 'hidden'">
    <div class="flex flex-col gap-3">
      <section class="pbgui-card border border-border-default rounded-xl bg-panel p-3.5">
        <h3 class="m-0 mb-2.5">{{ t('v7explore.movieBuilderConfig') }}</h3>
        <p class="text-secondary" id="movie-status">{{ t('v7explore.buildReplayFrames') }}</p>
        <div class="grid grid-cols-[repeat(4,minmax(0,1fr))] items-end gap-3 max-[1250px]:grid-cols-[1fr]">
          <div class="flex flex-col gap-1">
            <Label id="movie-engine-label" for="movie-engine-select" :data-tip="store.adapter.isV8 ? t('v7explore.movieEngineV8Tip') : t('v7explore.movieEngineTip')">{{ t('v7explore.movieEngine') }}</Label>
            <SelectRoot v-if="store.adapter.isV8" v-model="store.controls.movieEngine" @update:model-value="store.invalidateMovieRequest()">
              <SelectTrigger id="movie-engine-select" aria-labelledby="movie-engine-label">
                <span>{{ movieEngineLabel }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pb8_engine">{{ t('v7explore.simModePb8Replay') }}</SelectItem>
              </SelectContent>
            </SelectRoot>
            <SelectRoot v-else v-model="store.controls.movieEngine" @update:model-value="store.invalidateMovieRequest()">
              <SelectTrigger id="movie-engine-select" aria-labelledby="movie-engine-label">
                <span>{{ movieEngineLabel }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="engine in ENGINE_OPTIONS_V7" :key="engine.value" :value="engine.value">{{ t(engine.labelKey) }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
          <div class="flex flex-col gap-1">
            <Label id="movie-side-label" for="movie-side-select" :data-tip="t('v7explore.sideTip')">{{ t('v7explore.side') }}</Label>
            <SelectRoot v-model="store.controls.movieSide" @update:model-value="store.invalidateMovieRequest()">
              <SelectTrigger id="movie-side-select" aria-labelledby="movie-side-label">
                <span>{{ movieSideLabel }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{{ t('v7explore.auto') }}</SelectItem>
                <SelectItem value="long">{{ t('v7explore.long') }}</SelectItem>
                <SelectItem value="short">{{ t('v7explore.short') }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
          <div class="flex flex-col gap-1">
            <Label for="movie-start-date-input" :data-tip="t('v7explore.movieStartDateTip')">{{ t('v7explore.startDate') }}</Label>
            <div style="position:relative">
              <Input id="movie-start-date-input" v-model="store.controls.movieStartDate" type="text" placeholder="YYYY-MM-DD" style="padding-right:28px" @change="store.invalidateMovieRequest()" />
              <!-- ui-migration: blocked — legacy window.__dp datepicker bridge (lib/datePicker.ts); the trigger stays raw -->
              <button type="button" data-dp="movie-start-date-input" title="Open calendar" style="position:absolute;right:2px;top:50%;transform:translateY(-50%);background:transparent;border:none;color:var(--text);padding:0 3px;font-size:var(--fs-sm);line-height:1;cursor:pointer" @click="openDatePicker('movie-start-date-input', $event.currentTarget as HTMLElement)">&#x1F4C5;</button>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <Label for="movie-start-time-input" :data-tip="t('v7explore.movieStartTimeTip')">{{ t('v7explore.startTime') }}</Label>
            <Input id="movie-start-time-input" v-model="store.controls.movieStartTime" type="time" @change="store.invalidateMovieRequest()" />
          </div>
          <div class="flex flex-col gap-1">
            <Label id="movie-step-label" for="movie-step-select" :data-tip="t('v7explore.stepSizeTip')">{{ t('v7explore.stepSize') }}</Label>
            <SelectRoot v-model="store.controls.movieStep" @update:model-value="onStepChange">
              <SelectTrigger id="movie-step-select" aria-labelledby="movie-step-label">
                <span>{{ movieStepLabel }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="step in STEP_OPTIONS" :key="step.value" :value="step.value">{{ step.label }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
          <div class="flex flex-col gap-1">
            <Label id="movie-duration-label" for="movie-duration-select" :data-tip="t('v7explore.durationTip')">{{ t('v7explore.duration') }}</Label>
            <SelectRoot v-model="store.controls.movieDuration" @update:model-value="onDurationChange">
              <SelectTrigger id="movie-duration-select" aria-labelledby="movie-duration-label">
                <span>{{ store.controls.movieDuration }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in store.movieDurationOptionList.value" :key="option.value" :value="option.value">{{ option.value }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
          <div class="flex flex-col gap-1">
            <Label for="movie-frames-input" :data-tip="t('v7explore.framesTip')">{{ t('v7explore.frames') }}</Label>
            <Input id="movie-frames-input" v-model.number="store.controls.movieFrames" type="number" min="10" max="20000" step="1" @input="onFramesInput" />
          </div>
          <div class="flex flex-col gap-1">
            <Label for="movie-visible-input" :data-tip="t('v7explore.visibleCandlesTip')">{{ t('v7explore.visibleCandles') }}</Label>
            <Input id="movie-visible-input" v-model.number="store.controls.movieVisible" type="number" min="10" max="500" step="5" @input="onVisibleInput" />
          </div>
          <div class="flex flex-col gap-1" v-if="!store.adapter.isV8">
            <Label id="movie-result-label" for="movie-pb7-folder" :data-tip="t('v7explore.movieResultFolderTip')">{{ t('v7explore.pb7BacktestFolder') }}</Label>
            <Input id="movie-pb7-folder" v-model="store.controls.moviePb7Folder" type="text" placeholder="/path/to/backtest/result" />
          </div>
          <div class="flex flex-col gap-1"><Label class="invisible" aria-hidden="true">&nbsp;</Label><Button class="action-btn" variant="info" id="btn-build-movie" type="button" :disabled="movie.building.value" @click="movie.buildMovieFrames()">{{ movie.building.value ? t('v7explore.generatingMovie') : t('v7explore.generateMovie') }}</Button></div>
          <div class="flex flex-col gap-1"><Label class="invisible" aria-hidden="true">&nbsp;</Label><Button class="action-btn" variant="danger" id="btn-stop-movie" type="button" :disabled="!movie.building.value && !movie.exporting.value" @click="movie.stopMovieBuilder()">{{ t('v7explore.stopMovieBuilder') }}</Button></div>
        </div>
      </section>
      <section class="pbgui-card border border-border-default rounded-xl bg-panel p-3.5">
        <h3 class="m-0 mb-2.5">{{ t('v7explore.movieBuilderResult') }}</h3>
        <div id="movie-output" class="text-secondary">
          <span v-if="movie.outputMessage.value !== null" class="text-secondary">{{ movie.outputMessage.value }}</span>
          <template v-else>{{ t('v7explore.generateMovieHint') }}</template>
        </div>
        <div id="movie-progress" class="mt-2.5" :class="movie.progress.value.pct >= 0 ? 'block' : 'hidden'">
          <div class="h-2.5 overflow-hidden rounded-full border border-border-default bg-page"><div id="movie-progress-fill" class="h-full w-0 bg-[linear-gradient(90deg,var(--accent),var(--success))] transition-[width] duration-200 ease-[ease]" :style="{ width: movie.progress.value.pct + '%' }"></div></div>
          <div id="movie-progress-text" class="mt-1.5 text-secondary text-sm">{{ movie.progress.value.message || t('v7explore.waiting') }}</div>
        </div>
        <div class="mt-3 p-3 border border-border-default rounded-md bg-white/[0.025]">
          <div class="grid grid-cols-[repeat(4,minmax(0,1fr))] items-end gap-3 max-[1250px]:grid-cols-[1fr]">
            <div class="flex flex-col gap-1">
              <Label id="movie-export-preset-label" for="movie-export-preset" :data-tip="t('v7explore.exportPresetTip')">{{ t('v7explore.exportPreset') }}</Label>
              <SelectRoot v-model="store.controls.exportPreset" @update:model-value="store.invalidateMovieRequest(); movie.applyExportPreset(store.controls.exportPreset)">
                <SelectTrigger id="movie-export-preset" aria-labelledby="movie-export-preset-label">
                  <span>{{ exportPresetLabel }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fast">{{ t('v7explore.fast') }}</SelectItem>
                  <SelectItem value="Balanced">{{ t('v7explore.balanced') }}</SelectItem>
                  <SelectItem value="Quality">{{ t('v7explore.quality') }}</SelectItem>
                  <SelectItem value="Custom">{{ t('v7explore.custom') }}</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
            <div class="flex flex-col gap-1"><Label class="invisible" aria-hidden="true">&nbsp;</Label><Button class="action-btn" variant="info" id="btn-export-movie" type="button" :disabled="movie.exporting.value" @click="movie.exportMovieMp4()">{{ movie.exporting.value ? t('v7explore.exportingMp4') : t('v7explore.exportMp4') }}</Button></div>
            <div class="flex flex-col gap-1"><label class="text-secondary text-xs uppercase tracking-[0.04em]">&nbsp;</label><a v-if="movie.download.value" id="movie-export-download" class="inline-flex min-h-9 items-center justify-center border border-success/45 rounded-sm px-3 py-0 text-success no-underline" :href="movie.download.value.url" :download="movie.download.value.filename">{{ movie.download.value.label }}</a></div>
          </div>
          <p class="text-secondary" id="movie-export-info">{{ movie.exportInfo.value || t('v7explore.exportDirectlyHint') }}</p>
          <details class="mt-2">
            <summary>{{ t('v7explore.advancedExportSettings') }}</summary>
            <div class="grid grid-cols-[repeat(4,minmax(0,1fr))] items-end gap-3 max-[1250px]:grid-cols-[1fr]" style="margin-top:var(--sp-sm)">
              <div class="flex flex-col gap-1">
                <Label id="movie-export-codec-label" for="movie-export-codec" :data-tip="t('v7explore.videoCodecTip')">{{ t('v7explore.videoCodec') }}</Label>
                <SelectRoot v-model="store.controls.exportCodec" @update:model-value="store.invalidateMovieRequest(); movie.markExportCustom()">
                  <SelectTrigger id="movie-export-codec" aria-labelledby="movie-export-codec-label">
                    <span>{{ exportCodecLabel }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-if="!movie.exportCodecs.value.length" value="auto">{{ t('v7explore.autoDetectBest') }}</SelectItem>
                    <SelectItem v-for="codec in movie.exportCodecs.value" :key="codec.id" :value="codec.id">{{ codec.label || codec.id }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
              <div class="flex flex-col gap-1"><Label for="movie-export-width" :data-tip="t('v7explore.widthTip')">{{ t('v7explore.width') }}</Label><Input id="movie-export-width" v-model.number="store.controls.exportWidth" type="number" min="640" max="3840" step="20" @change="store.invalidateMovieRequest(); movie.markExportCustom()" /></div>
              <div class="flex flex-col gap-1"><Label for="movie-export-height" :data-tip="t('v7explore.heightTip')">{{ t('v7explore.height') }}</Label><Input id="movie-export-height" v-model.number="store.controls.exportHeight" type="number" min="360" max="2160" step="20" @change="store.invalidateMovieRequest(); movie.markExportCustom()" /></div>
              <div class="flex flex-col gap-1"><Label for="movie-export-scale" :data-tip="t('v7explore.scaleTip')">{{ t('v7explore.scale') }}</Label><Input id="movie-export-scale" v-model.number="store.controls.exportScale" type="number" min="1" max="4" step="1" @change="store.invalidateMovieRequest(); movie.markExportCustom()" /></div>
              <div class="flex flex-col gap-1"><Label for="movie-export-crf" :data-tip="t('v7explore.crfQualityTip')">{{ t('v7explore.crfQuality') }}</Label><Input id="movie-export-crf" v-model.number="store.controls.exportCrf" type="number" min="0" max="51" step="1" @change="store.invalidateMovieRequest(); movie.markExportCustom()" /></div>
              <div class="flex flex-col gap-1">
                <Label id="movie-export-ffmpeg-preset-label" for="movie-export-ffmpeg-preset" :data-tip="t('v7explore.ffmpegPresetTip')">{{ t('v7explore.ffmpegPreset') }}</Label>
                <SelectRoot v-model="store.controls.exportFfmpegPreset" @update:model-value="store.invalidateMovieRequest(); movie.markExportCustom()">
                  <SelectTrigger id="movie-export-ffmpeg-preset" aria-labelledby="movie-export-ffmpeg-preset-label">
                    <span>{{ store.controls.exportFfmpegPreset }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="preset in FFMPEG_PRESETS" :key="preset" :value="preset">{{ preset }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
          </details>
        </div>
        <div class="grid grid-cols-[minmax(420px,2fr)_minmax(320px,1fr)] items-start gap-3 max-[1250px]:grid-cols-[1fr]" style="margin-top:var(--sp-md)">
          <div><MoviePlot ref="plotRef" :store="store" :movie="movie" /></div>
          <div id="movie-frame-details">
            <div class="grid gap-3" style="grid-template-columns:1fr 1fr;margin-bottom:12px">
              <div class="min-w-0 rounded-lg border border-border-default bg-elevated p-3"><div class="text-secondary text-xs uppercase tracking-[0.05em]">{{ t('v7explore.frames') }}</div><div class="mt-1 truncate text-lg font-bold">{{ frames.length }}</div></div>
              <div class="min-w-0 rounded-lg border border-border-default bg-elevated p-3"><div class="text-secondary text-xs uppercase tracking-[0.05em]">{{ t('v7explore.fills') }}</div><div class="mt-1 truncate text-lg font-bold">{{ sideEvents.length }}</div></div>
            </div>
            <p class="text-secondary">{{ t('v7explore.movieEngineMarketLine', { engine: engineLabel, exchange: meta().exchange || '', coin: meta().coin || '' }) }}</p>
            <h4 class="m-0 mb-2.5 mt-4 text-secondary">{{ t('v7explore.frames') }}</h4>
            <table v-if="frameRows().length" class="orders">
              <thead><tr><th>#</th><th>Time</th><th>Close</th><th>Entry Orders</th><th>Close Orders</th></tr></thead>
              <tbody><tr v-for="row in frameRows()" :key="String(row.index) + row.time"><td>{{ row.index }}</td><td>{{ row.time }}</td><td>{{ row.close }}</td><td>{{ row.entryOrders }}</td><td>{{ row.closeOrders }}</td></tr></tbody>
            </table>
            <table v-else class="orders"><tbody><tr><td class="text-secondary" style="text-align:left">{{ t('v7explore.noFrames') }}</td></tr></tbody></table>
            <h4 class="m-0 mb-2.5 mt-4 text-secondary">{{ t('v7explore.fills') }}</h4>
            <table v-if="fillRows().length" class="orders">
              <thead><tr><th>#</th><th>Time</th><th>Event</th><th>Qty</th><th>Price</th><th>Pos Size</th></tr></thead>
              <tbody><tr v-for="row in fillRows()" :key="row.idx"><td>{{ row.idx }}</td><td>{{ row.time }}</td><td>{{ row.event }}</td><td>{{ row.qty }}</td><td>{{ row.price }}</td><td>{{ row.posSize }}</td></tr></tbody>
            </table>
            <table v-else class="orders"><tbody><tr><td class="text-secondary" style="text-align:left">{{ t('v7explore.noFills') }}</td></tr></tbody></table>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
