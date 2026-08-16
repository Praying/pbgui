import { computed, ref, type ComputedRef, type Ref } from 'vue';

/*
 * Baseline dirty tracking — legacy setSettingsBaseline/syncSettingsDirtyState
 * (market_data_main.html:5535-5549) and updateSaveSettingsButton's inputs
 * (:5528-5533):
 *
 *   - the baseline is the serialized current request captured after load/save;
 *   - dirty ⇔ the serialized current request differs from the baseline;
 *   - no baseline yet (before the first load) → never dirty (:5542-5546).
 *
 * Deviation (documented): legacy recomputed isDirty only from event handlers
 * (:9614-9626, syncSettingsSelectionFromDom(true), …); the port derives it
 * reactively from the same serialization, so the save button can never go
 * stale between an edit and its legacy sync call site.
 */

export interface UseSettingsBaselineOptions {
  /** Serialized current request (JSON.stringify of collectSettingsRequest). */
  collect(): string;
}

export interface UseSettingsBaseline {
  /** The serialized baseline; '' before the first load (:5536, :5542). */
  baselineRequest: Ref<string>;
  /** syncSettingsDirtyState (:5541-5549) as a derived value. */
  isDirty: ComputedRef<boolean>;
  /** setSettingsBaseline (:5535-5539) — snapshot the current request. */
  setBaseline(): void;
}

export function useSettingsBaseline(options: UseSettingsBaselineOptions): UseSettingsBaseline {
  const baselineRequest = ref('');

  const isDirty = computed(
    () => baselineRequest.value !== '' && options.collect() !== baselineRequest.value // :5547
  );

  function setBaseline(): void {
    baselineRequest.value = options.collect(); // :5536
  }

  return { baselineRequest, isDirty, setBaseline };
}
