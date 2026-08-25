import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import MonitorThresholds from './MonitorThresholds.vue';

/** Legacy renderMonitorSettingsFields groups (contract: field order + prefixes). */
const GROUPS = [
  {
    title: 'Server Monitor',
    prefix: 'server',
    fields: ['mem', 'swap', 'disk', 'cpu'],
    labels: ['Mem', 'Swap', 'Disk', 'CPU'],
  },
  {
    title: 'V7 Monitor',
    prefix: 'v7',
    fields: ['mem', 'swap', 'cpu', 'error', 'traceback'],
    labels: ['Mem', 'Swap', 'CPU', 'Error', 'Traceback'],
  },
] as const;

/** The exact 18 ids legacy collectMonitorConfigFromForm walks, in order. */
const ALL_FIELD_IDS: string[] = GROUPS.flatMap((g) =>
  g.fields.flatMap((f) => [`${f}_warning_${g.prefix}`, `${f}_error_${g.prefix}`])
);

function mountThresholds(monitorConfig: Record<string, string> = {}) {
  return mount(MonitorThresholds, {
    props: { monitorConfig },
    global: { plugins: [createI18n('en')] },
  });
}

describe('MonitorThresholds rendering (legacy renderMonitorSettingsFields)', () => {
  it('renders the two legacy group titles in order', () => {
    const wrapper = mountThresholds();

    expect(wrapper.findAll('.monitor-group-title').map((el) => el.text())).toEqual([
      'Server Monitor',
      'V7 Monitor',
    ]);
  });

  it('renders exactly the 18 legacy monitor inputs with mc- prefixed ids', () => {
    const wrapper = mountThresholds();

    const ids = wrapper.findAll('input').map((el) => el.attributes('id'));
    expect(ids).toEqual(ALL_FIELD_IDS.map((f) => `mc-${f}`));
    expect(wrapper.findAll('input')).toHaveLength(18);
  });

  it('renders every input as number with step=any (legacy markup)', () => {
    const wrapper = mountThresholds();

    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('type')).toBe('number');
      expect(input.attributes('step')).toBe('any');
      expect(input.attributes('data-slot')).toBe('input');
    }
  });

  it('labels each field "<Label> warn" / "<Label> err" inside its group', () => {
    const wrapper = mountThresholds();

    for (const [groupIndex, group] of GROUPS.entries()) {
      const groupEl = wrapper.findAll('.monitor-group')[groupIndex]!;
      const labels = groupEl.findAll('.monitor-label').map((el) => el.text());
      const expected = group.fields.flatMap((field, fieldIndex) => [
        `${group.labels[fieldIndex]} warn`,
        `${group.labels[fieldIndex]} err`,
      ]);
      expect(labels).toEqual(expected);
    }
  });

  it('renders the configured value for keys present in the payload', () => {
    const wrapper = mountThresholds({
      mem_warning_server: '85',
      traceback_error_v7: '3.5',
      cpu_error_server: '100',
    });

    expect((wrapper.find('#mc-mem_warning_server').element as HTMLInputElement).value).toBe('85');
    expect((wrapper.find('#mc-traceback_error_v7').element as HTMLInputElement).value).toBe('3.5');
    expect((wrapper.find('#mc-cpu_error_server').element as HTMLInputElement).value).toBe('100');
  });

  it('defaults missing keys to 0 (legacy monitorData[key] !== undefined ? … : 0)', () => {
    const wrapper = mountThresholds({ mem_warning_server: '85' });

    for (const id of ALL_FIELD_IDS.filter((f) => f !== 'mem_warning_server')) {
      expect((wrapper.find(`#mc-${id}`).element as HTMLInputElement).value, id).toBe('0');
    }
  });
});

describe('MonitorThresholds editing (emit chain for collectMonitorConfigFromForm)', () => {
  it('emits update:monitorConfig with the typed value added immutably', async () => {
    const original = { mem_warning_server: '80', cpu_error_v7: '2' };
    const wrapper = mountThresholds(original);

    await wrapper.find('#mc-mem_warning_server').setValue('85');

    const emitted = wrapper.emitted('update:monitorConfig');
    expect(emitted).toHaveLength(1);
    expect(emitted![0]).toEqual([{ mem_warning_server: '85', cpu_error_v7: '2' }]);
    expect(emitted![0]![0]).not.toBe(original); // new object, prop untouched
    expect(original.mem_warning_server).toBe('80');
  });

  it('emits the raw empty string when a field is cleared (legacy NaN → 0 at collect)', async () => {
    const wrapper = mountThresholds({ disk_warning_server: '90' });

    await wrapper.find('#mc-disk_warning_server').setValue('');

    expect(wrapper.emitted('update:monitorConfig')![0]).toEqual([{ disk_warning_server: '' }]);
  });

  it('emits keys it was not seeded with (fields render 0 until edited)', async () => {
    const wrapper = mountThresholds({});

    await wrapper.find('#mc-swap_error_v7').setValue('7');

    expect(wrapper.emitted('update:monitorConfig')![0]).toEqual([{ swap_error_v7: '7' }]);
  });
});
