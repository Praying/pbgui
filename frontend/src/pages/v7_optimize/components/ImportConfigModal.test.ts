import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { pickSelectOption } from '@/shared/testing/select';
import ImportConfigModal from './ImportConfigModal.vue';

const baseProps = {
  open: true,
  archives: [{ name: 'archive-2025', optimize_configs: 3 }],
  configs: [{ name: 'mean-revert-v4', path: '/archive/mean-revert-v4.json' }],
  archiveName: 'archive-2025',
  busy: false,
};

function mountModal(props: Partial<typeof baseProps> = {}) {
  return mount(ImportConfigModal, {
    props: { ...baseProps, ...props },
    global: { plugins: [createI18n('en')] },
  });
}

describe('ImportConfigModal', () => {
  it('renders the titled dialog with the source switch and the paste/file fields by default', () => {
    const wrapper = mountModal();

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes('aria-labelledby')).toBe('opt-import-title');
    expect(wrapper.get('#opt-import-title').text()).toBe('Import Optimize Config');
    // the header hint keeps the title block from collapsing to one bare line
    expect(wrapper.get('header p').text()).toContain('Load a config');

    // source switch: two pill tabs, local active on open
    const tabs = wrapper.findAll('.opt-source-tabs button');
    expect(tabs.map((tab) => tab.text())).toEqual(['Paste / File', 'Backtest Archive']);
    expect(tabs[0]!.classes()).toContain('active');

    // local tab fields: name, file picker, paste area — with their labels
    expect(wrapper.find('input[type="file"]').exists()).toBe(true);
    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.text()).toContain('Config name');
    expect(wrapper.text()).toContain('JSON file');
    expect(wrapper.text()).toContain('Paste JSON');
    expect(wrapper.text()).not.toContain('Name conflict');
  });

  it('imports valid pasted JSON through the local flow', async () => {
    const wrapper = mountModal();

    await wrapper.get('textarea').setValue('{"name": "draft", "backtest": {}}');
    await wrapper.get('footer button:last-child').trigger('click');

    const emitted = wrapper.emitted('localImport');
    expect(emitted).toHaveLength(1);
    expect(emitted![0]).toEqual([{ name: 'draft', backtest: {} }, '']);
  });

  it('keeps the import button inert and surfaces an alert for invalid JSON', async () => {
    const wrapper = mountModal();

    await wrapper.get('textarea').setValue('not json');
    await wrapper.get('footer button:last-child').trigger('click');

    expect(wrapper.emitted('localImport')).toBeUndefined();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text().length).toBeGreaterThan(0);
    expect(alert.classes()).toContain('text-danger-soft');
  });

  it('imports an archived config with the selected collision policy', async () => {
    const wrapper = mountModal();

    await wrapper.findAll('.opt-source-tabs button')[1]!.trigger('click');
    expect(wrapper.text()).toContain('Name conflict');

    const archiveTrigger = '[role="dialog"] [aria-label="Backtest Archive"]';
    await pickSelectOption(wrapper, archiveTrigger, 'archive-2025 (3)');

    const configTrigger = '[role="dialog"] [aria-label="Archived config"]';
    await pickSelectOption(wrapper, configTrigger, 'mean-revert-v4');

    const collisionTrigger = '[role="dialog"] [aria-label="Name conflict"]';
    await pickSelectOption(wrapper, collisionTrigger, 'Import as Copy');

    await wrapper.get('footer button:last-child').trigger('click');

    expect(wrapper.emitted('archiveImport')![0]).toEqual([
      'archive-2025',
      '/archive/mean-revert-v4.json',
      '',
      'copy',
    ]);
  });

  it('refuses the archive flow until a config is chosen', async () => {
    const wrapper = mountModal();

    await wrapper.findAll('.opt-source-tabs button')[1]!.trigger('click');
    await wrapper.get('footer button:last-child').trigger('click');

    expect(wrapper.emitted('archiveImport')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toContain('Choose an archived Optimize config first');
  });
});
