import { describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { useSettingsBaseline } from './useSettingsBaseline';

/* Baseline dirty tracking — legacy setSettingsBaseline/syncSettingsDirtyState
   (market_data_main.html:5535-5549): a serialized snapshot of
   collectSettingsRequest; dirty = current serialization differs. */

describe('useSettingsBaseline (:5535-5549)', () => {
  it('starts clean with an empty baseline (:5542-5546)', () => {
    const { baselineRequest, isDirty } = useSettingsBaseline({ collect: () => '{"a":1}' });
    expect(baselineRequest.value).toBe('');
    expect(isDirty.value).toBe(false);
  });

  it('never reports dirty before a baseline exists, even when state changes (:5542-5546)', () => {
    const value = ref('x');
    const { isDirty } = useSettingsBaseline({ collect: () => value.value });
    value.value = 'y';
    expect(isDirty.value).toBe(false);
  });

  it('captures the current request on setBaseline and reports clean (:5535-5539)', () => {
    const value = ref('x');
    const { isDirty, setBaseline, baselineRequest } = useSettingsBaseline({ collect: () => value.value });
    setBaseline();
    expect(baselineRequest.value).toBe('x');
    expect(isDirty.value).toBe(false);
  });

  it('flips dirty on any change and back clean on revert (:5547)', () => {
    const value = ref('x');
    const { isDirty, setBaseline } = useSettingsBaseline({ collect: () => value.value });
    setBaseline();
    value.value = 'y';
    expect(isDirty.value).toBe(true);
    value.value = 'x';
    expect(isDirty.value).toBe(false);
  });

  it('re-baselines onto the edited state after save (:8942 setSettingsBaseline)', () => {
    const value = ref('x');
    const { isDirty, setBaseline } = useSettingsBaseline({ collect: () => value.value });
    setBaseline();
    value.value = 'y';
    expect(isDirty.value).toBe(true);
    setBaseline();
    expect(isDirty.value).toBe(false);
  });

  it('recomputes reactively (no explicit sync call needed)', async () => {
    const value = ref('x');
    const { isDirty, setBaseline } = useSettingsBaseline({ collect: () => value.value });
    setBaseline();
    value.value = 'y';
    await nextTick();
    expect(isDirty.value).toBe(true);
  });

  it('collect is only read through the computed (no eager calls at creation)', () => {
    const collect = vi.fn(() => 'x');
    useSettingsBaseline({ collect });
    expect(collect).not.toHaveBeenCalled();
  });
});
