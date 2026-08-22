import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import MigrationPanel from './MigrationPanel.vue';
import type { MigrationStatus } from '../types';

/** Realistic GET /migration/status payload (legacy renderMigrationStatus input). */
const MIGRATION_STATUS: MigrationStatus = {
  migration_needed: true,
  user: 'quran',
  uid: 501,
  pbgui_dir: '/opt/pbgui',
  pbgui_python: '/usr/bin/python3',
  systemd_unit_dir: '/home/quran/.config/systemd/user',
  pb7dir: '',
  warnings: ['legacy ini autostart found'],
  missing_default_units: [{ service: 'pbcluster', unit: 'pbgui-pbcluster.service', exists: false, enabled: false }],
  not_ready_default_units: [{ service: 'pbdata', unit: 'pbgui-pbdata.service', exists: true, enabled: false, state: 'inactive' }],
  systemd_units: [
    { service: 'pbcluster', unit: 'pbgui-pbcluster.service', exists: false, enabled: false },
    { service: 'pbdata', unit: 'pbgui-pbdata.service', exists: true, enabled: false, state: 'inactive' },
  ],
  legacy_crontab: { entries: ['*/5 * * * * /opt/pbgui/start.sh'] },
  legacy_start_sh: { exists: true, path: '/opt/pbgui/start.sh' },
  processes: [{ service: 'pbdata', pid: 1234, username: 'quran', current: true, cmdline: 'python pbdata.py' }],
};

function mountPanel(props: { status?: MigrationStatus | null; loading?: boolean; busy?: 'test' | 'run' | null } = {}) {
  return mount(MigrationPanel, {
    props: { status: null, loading: false, busy: null, ...props },
    global: { plugins: [createI18n('en')] },
  });
}

describe('MigrationPanel ctrl strip (legacy migration panel markup)', () => {
  it('renders the title, meta dot/label and refresh button', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    expect(wrapper.find('.ctrl-title').text()).toBe('Migration');
    expect(wrapper.find('.status-dot').classes()).toContain('warn');
    expect(wrapper.find('.status-label').text()).toBe('Needed');
    expect(wrapper.find('button.ctrl-btn').text()).toBe('Refresh');
    expect(wrapper.find('button.ctrl-btn svg').exists()).toBe(true);
  });

  it('shows the ready dot/label when nothing needs migration', () => {
    const wrapper = mountPanel({
      status: { ...MIGRATION_STATUS, migration_needed: false, warnings: [] },
    });

    expect(wrapper.find('.status-dot').classes()).toContain('running');
    expect(wrapper.find('.status-label').text()).toBe('Ready');
  });

  it('shows the not-loaded label with an unclassed dot before the first load', () => {
    const wrapper = mountPanel();

    expect(wrapper.find('.status-dot').classes()).not.toContain('warn');
    expect(wrapper.find('.status-dot').classes()).not.toContain('running');
    expect(wrapper.find('.status-label').text()).toBe('Not loaded');
  });

  it('emits refresh from the ctrl-strip button (legacy loadMigrationStatus(true))', async () => {
    const wrapper = mountPanel();

    await wrapper.find('button.ctrl-btn').trigger('click');
    expect(wrapper.emitted('refresh')).toHaveLength(1);
  });
});

describe('MigrationPanel short-circuit states (legacy renderMigrationStatus)', () => {
  it('shows the loading placeholder when no status has arrived', () => {
    const wrapper = mountPanel();

    expect(wrapper.find('#migration-wrap').text()).toBe('Loading migration status...');
    expect(wrapper.find('.migration-hero').exists()).toBe(false);
  });

  it('shows the loading placeholder during a forced reload', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS, loading: true });

    expect(wrapper.find('#migration-wrap').text()).toBe('Loading migration status...');
    expect(wrapper.find('.migration-hero').exists()).toBe(false);
  });

  it('renders the restart-retry card for _restart_pending without user', () => {
    const wrapper = mountPanel({ status: { _restart_pending: true } });

    expect(wrapper.find('.migration-ok').text()).toContain('Migration completed. API restart is in progress');
    expect(wrapper.find('.migration-hero').exists()).toBe(false);
  });

  it('renders the error card for _error payloads', () => {
    const wrapper = mountPanel({ status: { _error: 'connection refused' } });

    expect(wrapper.find('.migration-warn').text()).toBe('Failed to load migration status: connection refused');
    expect(wrapper.find('.migration-hero').exists()).toBe(false);
  });
});

describe('MigrationPanel hero and info cards (legacy renderMigrationStatus)', () => {
  it('renders the hero title and description', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    expect(wrapper.find('.migration-title').text()).toBe('Systemd user services migration');
    expect(wrapper.find('.migration-desc').text()).toContain('Move this PBGui master');
  });

  it('renders the six info cards with the legacy fallbacks', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    const cards = wrapper.findAll('.migration-card');
    expect(cards).toHaveLength(6);
    const info = cards.map((c) => ({
      label: c.find('.migration-label').text(),
      value: c.find('.migration-value').text(),
    }));
    expect(info[0]).toEqual({ label: 'Status', value: 'Needed' });
    expect(info[1]).toEqual({ label: 'User', value: 'quran (uid 501)' });
    expect(info[2]).toEqual({ label: 'PBGui directory', value: '/opt/pbgui' });
    expect(info[3]).toEqual({ label: 'Python', value: '/usr/bin/python3' });
    expect(info[4]).toEqual({ label: 'Unit directory', value: '/home/quran/.config/systemd/user' });
    expect(info[5]).toEqual({ label: 'PB7', value: 'not configured' });
  });

  it('renders the PB7 directory when configured', () => {
    const wrapper = mountPanel({ status: { ...MIGRATION_STATUS, pb7dir: '/opt/pb7' } });

    const pb7 = wrapper.findAll('.migration-card').at(-1)!;
    expect(pb7.find('.migration-value').text()).toBe('/opt/pb7');
  });

  it('renders the status card badge with the meta class mapping', () => {
    expect(mountPanel({ status: MIGRATION_STATUS }).find('.migration-card .migration-badge').classes()).toContain('warn');
    expect(mountPanel({ status: { ...MIGRATION_STATUS, migration_needed: false, warnings: [] } }).find('.migration-card .migration-badge').classes()).toContain('ok');
    expect(mountPanel({ status: { _error: 'x' } }).find('.migration-hero').exists()).toBe(false);
  });
});

describe('MigrationPanel preflight section (legacy renderMigrationStatus warnings)', () => {
  it('renders the available-migration warning when migration_needed', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    const preflight = wrapper.find('.migration-section');
    expect(preflight.find('.migration-section-title').text()).toBe('Preflight result');
    expect(preflight.findAll('.migration-warn')[0]!.text()).toBe('Systemd migration is available for this master.');
  });

  it('renders the ok result when already managed', () => {
    const wrapper = mountPanel({ status: { ...MIGRATION_STATUS, migration_needed: false, warnings: [] } });

    const preflight = wrapper.find('.migration-section');
    expect(preflight.find('.migration-ok').text()).toBe('This master is already managed by systemd user services.');
  });

  it('lists missing required units joined by unit or service', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    const text = wrapper.find('.migration-section').text();
    expect(text).toContain('Missing required units: pbgui-pbcluster.service');
  });

  it('lists not-ready required units with enabled/disabled and state', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    const text = wrapper.find('.migration-section').text();
    expect(text).toContain('Not-ready required units: pbgui-pbdata.service (Disabled, inactive)');
  });

  it('uses the unknown state fallback in not-ready rows', () => {
    const wrapper = mountPanel({
      status: {
        ...MIGRATION_STATUS,
        not_ready_default_units: [{ service: 'pbdata', unit: 'pbgui-pbdata.service', exists: true, enabled: true }],
      },
    });

    expect(wrapper.find('.migration-section').text()).toContain('pbgui-pbdata.service (Enabled, unknown)');
  });

  it('renders each payload warning in its own migration-warn block', () => {
    const wrapper = mountPanel({ status: { ...MIGRATION_STATUS, warnings: ['w1', 'w2'] } });

    const warns = wrapper.find('.migration-section').findAll('.migration-warn').map((w) => w.text());
    expect(warns).toEqual([
      'Systemd migration is available for this master.',
      'Missing required units: pbgui-pbcluster.service',
      'Not-ready required units: pbgui-pbdata.service (Disabled, inactive)',
      'w1',
      'w2',
    ]);
  });
});

describe('MigrationPanel units/crontab/start-script/processes tables (legacy render* helpers)', () => {
  it('renders the systemd units table with legacy badges and fallbacks', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });
    const sections = wrapper.findAll('.migration-section');

    const units = sections[1]!;
    expect(units.find('.migration-section-title').text()).toBe('Systemd units');
    expect(units.find('table thead').text()).toBe('ServiceUnitInstalledEnabledState');
    const rows = units.findAll('tbody tr');
    expect(rows[0]!.findAll('td').map((td) => td.text())).toEqual(['pbcluster', 'pbgui-pbcluster.service', 'missing', 'no', 'unknown']);
    expect(rows[0]!.find('.migration-badge.err').text()).toBe('missing');
    expect(rows[0]!.find('.migration-badge.warn').text()).toBe('no');
    expect(rows[1]!.findAll('td').map((td) => td.text())).toEqual(['pbdata', 'pbgui-pbdata.service', 'yes', 'no', 'inactive']);
  });

  it('shows the no-units note for an empty units payload', () => {
    const wrapper = mountPanel({ status: { ...MIGRATION_STATUS, systemd_units: [] } });

    expect(wrapper.find('.migration-section:nth-child(4) .migration-note').text()).toBe(
      'No PBGui systemd units were reported.'
    );
  });

  it('renders the crontab warning with the entry table', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    const crontab = wrapper.find('.migration-section:nth-child(5)');
    expect(crontab.find('.migration-section-title').text()).toBe('Legacy crontab autostart');
    expect(crontab.find('.migration-warn').text()).toContain('Legacy crontab autostart entries will be removed');
    expect(crontab.find('tbody').text()).toBe('*/5 * * * * /opt/pbgui/start.sh');
  });

  it('shows the ok note when there are no crontab entries', () => {
    const wrapper = mountPanel({ status: { ...MIGRATION_STATUS, legacy_crontab: { entries: [] } } });

    expect(wrapper.find('.migration-section:nth-child(5) .migration-ok').text()).toBe(
      'No legacy PBGui crontab autostart entries were detected.'
    );
  });

  it('renders the start-script warning with the path', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    const script = wrapper.find('.migration-section:nth-child(6)');
    expect(script.find('.migration-section-title').text()).toBe('Legacy start script');
    expect(script.find('.migration-warn').text()).toContain('Legacy start.sh will be deleted automatically');
    expect(script.find('.migration-warn').text()).toContain('/opt/pbgui/start.sh');
  });

  it('shows the ok note when no start script exists', () => {
    const wrapper = mountPanel({ status: { ...MIGRATION_STATUS, legacy_start_sh: { exists: false } } });

    expect(wrapper.find('.migration-section:nth-child(6) .migration-ok').text()).toBe('No legacy start.sh was detected.');
  });

  it('renders the processes table with the hardcoded PID header', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    const processes = wrapper.find('.migration-section:nth-child(7)');
    expect(processes.find('.migration-section-title').text()).toBe('Detected PBGui processes');
    expect(processes.find('thead').text()).toBe('ServicePIDUserCurrent APICommand');
    expect(processes.find('tbody tr').findAll('td').map((td) => td.text())).toEqual([
      'pbdata',
      '1234',
      'quran',
      'yes',
      'python pbdata.py',
    ]);
    expect(processes.find('.migration-badge.warn').text()).toBe('yes');
  });

  it('shows the note when no processes were detected', () => {
    const wrapper = mountPanel({ status: { ...MIGRATION_STATUS, processes: [] } });

    expect(wrapper.find('.migration-section:nth-child(7) .migration-note').text()).toBe(
      'No PBGui daemon processes were detected by the preflight scan.'
    );
  });
});

describe('MigrationPanel action buttons (legacy testSystemdMigration/runSystemdMigration buttons)', () => {
  it('renders Test migration and Migrate with the apiRestartNote', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    const actions = wrapper.find('.migration-actions');
    expect(actions.find('#migration-test-btn').text()).toBe('Test migration');
    expect(actions.find('#migration-run-btn').text()).toBe('Migrate this master to systemd');
    expect(actions.find('.migration-note').text()).toContain('The API server will restart');
  });

  it('disables the run button when migration is not needed', () => {
    const wrapper = mountPanel({ status: { ...MIGRATION_STATUS, migration_needed: false } });

    expect((wrapper.find('#migration-run-btn').element as HTMLButtonElement).disabled).toBe(true);
    expect((wrapper.find('#migration-test-btn').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables and relabels the test button while busy=test', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS, busy: 'test' });

    const btn = wrapper.find('#migration-test-btn');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    expect(btn.text()).toBe('Testing...');
    expect((wrapper.find('#migration-run-btn').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables and relabels the run button while busy=run', () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS, busy: 'run' });

    const btn = wrapper.find('#migration-run-btn');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    expect(btn.text()).toBe('Migrating...');
  });

  it('emits test and run events from the buttons', async () => {
    const wrapper = mountPanel({ status: MIGRATION_STATUS });

    await wrapper.find('#migration-test-btn').trigger('click');
    await wrapper.find('#migration-run-btn').trigger('click');
    expect(wrapper.emitted('test')).toHaveLength(1);
    expect(wrapper.emitted('run')).toHaveLength(1);
  });

  it('does not emit run from a disabled run button', async () => {
    const wrapper = mountPanel({ status: { ...MIGRATION_STATUS, migration_needed: false } });

    await wrapper.find('#migration-run-btn').trigger('click');
    expect(wrapper.emitted('run')).toBeUndefined();
  });
});
