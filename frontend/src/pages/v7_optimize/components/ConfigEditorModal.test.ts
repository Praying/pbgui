import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { openSelect, pickSelectOption, selectOptionTexts } from '@/shared/testing/select';
import { buildEditorDraft } from '../lib/configModel';
import ConfigEditorModal from './ConfigEditorModal.vue';
import en from '../../../../i18n/en.json';
import zh from '../../../../i18n/zh.json';

describe('ConfigEditorModal', () => {
  it('edits structured general, bot, bounds, scoring, suite and raw sections', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      bot: { long: { n_positions: 3 }, short: {} },
      optimize: { bounds: { long_n_positions: [1, 8] }, scoring: [{ metric: 'adg', goal: 'max' }] },
      pbgui: { suite: { enabled: false, scenarios: [] } },
    }, 'v7', 'demo');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '' },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.find('[data-tab="general"]').exists()).toBe(true);
    expect(wrapper.find('.opt-editor-header__icon').exists()).toBe(true);
    expect(wrapper.findAll('.opt-editor-section')).toHaveLength(4);
    expect(wrapper.find('.opt-editor-footer').exists()).toBe(true);
    expect(wrapper.find('[data-tab="bounds"]').exists()).toBe(true);
    await wrapper.find('[data-tab="bounds"]').trigger('click');
    expect(wrapper.text()).toContain('long_n_positions');
    await wrapper.find('[data-tab="raw"]').trigger('click');
    expect(wrapper.find('textarea.opt-json').exists()).toBe(true);
  });

  it('emits the complete draft on save', async () => {
    const draft = buildEditorDraft({ backtest: { exchanges: ['bybit'] }, bot: {}, optimize: {} }, 'v8', 'demo');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '' },
      global: { plugins: [createI18n('en')] },
    });
    await wrapper.find('button[data-save="config"]').trigger('click');
    expect(wrapper.emitted('save')?.[0]?.[1]).toBe(false);
  });

  it('folds an open Suite scenario draft before saving', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'], suite_enabled: true, scenarios: [{ label: 'old-label' }] },
      optimize: {},
    }, 'v8', 'suite-draft');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '' },
      global: { plugins: [createI18n('en')] },
    });
    await wrapper.find('[data-tab="suite"]').trigger('click');
    await wrapper.find('[data-test="suite-edit-0"]').trigger('click');
    await wrapper.find('[data-test="suite-sc-label"]').setValue('saved-without-done');
    await wrapper.find('button[data-save="config"]').trigger('click');

    const saved = wrapper.emitted('save')?.[0]?.[0] as typeof draft;
    expect(saved.suite.scenarios[0]?.label).toBe('saved-without-done');
  });
  it('covers legacy market, optimizer, seed and fixed-bound controls', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'], btc_collateral_cap: 0.25 },
      live: { strategy_kind: 'recursive_grid', minimum_coin_age_days: 30 },
      optimize: {
        backend: 'pymoo',
        bounds: { long_n_positions: [1, 8, 1] },
        fixed_params: ['long_n_positions'],
        pymoo: { algorithm: 'nsga2' },
      },
      pbgui: { optimize_seed_mode: 'path', optimize_seed_path: '/tmp/seeds' },
    }, 'v7', 'demo');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '', hslModes: ['pside', 'unified'], backendOptions: ['pymoo', 'deap'] },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.find('[data-field="btc-collateral-cap"]').exists()).toBe(true);
    await wrapper.find('[data-tab="optimizer"]').trigger('click');
    expect(wrapper.find('[data-field="seed-path"]').exists()).toBe(true);
    expect(wrapper.find('[data-field="pymoo-json"]').exists()).toBe(true);
    await wrapper.find('[data-tab="bounds"]').trigger('click');
    expect(wrapper.find('[data-field="bound-step-long_n_positions"]').exists()).toBe(true);
    expect(wrapper.find('[data-field="bound-fixed-long_n_positions"]').exists()).toBe(true);
  });

  it('exposes advanced pymoo, objective scenario, and runtime override controls', async () => {
    const draft = buildEditorDraft({
      bot: { long: {}, short: {} },
      backtest: { exchanges: ['bybit'], suite_enabled: true, scenarios: [{ label: 'bull' }] },
      optimize: {
        backend: 'pymoo',
        scoring: [{ metric: 'adg', goal: 'max' }, { metric: 'drawdown', goal: 'min' }],
        objective_scenario: 'bull',
        population_size: 120,
        pymoo: {
          algorithm: 'nsga3',
          shared: { crossover_eta: 25, crossover_prob_var: 0.6, mutation_eta: 18, mutation_prob_var: 0.2, eliminate_duplicates: true },
          algorithms: { nsga3: { ref_dirs: { method: 'uniform', n_partitions: 4 } } },
        },
      },
      pbgui: { optimize_runtime: { overrides: { 'bot.long.hsl_enabled': true, 'bot.long.hsl_no_restart_drawdown_threshold': 0.9 } } },
    }, 'v8', 'advanced');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '', backendOptions: ['pymoo', 'deap'] },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.find('[data-tab="optimizer"]').trigger('click');
    expect(wrapper.find('[data-field="pymoo-algorithm"]').exists()).toBe(true);
    expect(wrapper.find('[data-field="pymoo-ref-dir-method"]').exists()).toBe(true);
    expect(wrapper.find('[data-field="pymoo-ref-dir-partitions"]').exists()).toBe(true);
    await wrapper.find('[data-field="pymoo-ref-dir-partitions"]').setValue('6');
    await pickSelectOption(wrapper, '[data-field="pymoo-population-mode"]', 'auto');

    await wrapper.find('[data-tab="objectives"]').trigger('click');
    expect(wrapper.find('[data-field="objective-scenario"]').exists()).toBe(true);
    await pickSelectOption(wrapper, '[data-field="objective-scenario"]', 'suite aggregate');

    await wrapper.find('[data-tab="runtime"]').trigger('click');
    expect(wrapper.find('[data-field="runtime-bot-long-hsl-enabled"]').exists()).toBe(true);
    await wrapper.find('[data-field="runtime-bot-long-hsl-enabled"]').trigger('click'); // starts checked → unchecks
    await wrapper.find('button[data-save="config"]').trigger('click');

    const saved = wrapper.emitted('save')?.[0]?.[0] as typeof draft;
    expect(saved.optimize.population_size).toBeNull();
    expect((saved.optimize.pymoo as Record<string, unknown>).algorithm).toBe('nsga3');
    expect(((saved.optimize.pymoo as Record<string, unknown>).algorithms as Record<string, unknown>).nsga3).toMatchObject({ ref_dirs: { method: 'uniform', n_partitions: 6 } });
    expect(saved.optimize.objective_scenario).toBeNull();
    expect(saved.runtimeOverrides['bot.long.hsl_enabled']).toBe(false);
  });

  it('migrates optimizer backend fields and removes inactive backend values', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      optimize: {
        backend: 'deap',
        population_size: 240,
        offspring_multiplier: 1.5,
        crossover_probability: 0.65,
        mutation_probability: 0.3,
        mutation_indpb: 0.12,
        crossover_eta: 24,
        mutation_eta: 18,
      },
    }, 'v7', 'backend-migration');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '', backendOptions: ['pymoo', 'deap'] },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.find('[data-tab="optimizer"]').trigger('click');
    await pickSelectOption(wrapper, '[data-field="optimizer-backend"]', 'pymoo');
    await wrapper.find('button[data-save="config"]').trigger('click');

    const saved = wrapper.emitted('save')?.[0]?.[0] as typeof draft;
    expect(saved.optimize).toMatchObject({
      backend: 'pymoo',
      population_size: 240,
      pymoo: { shared: { crossover_eta: 24, crossover_prob_var: 0.65, mutation_eta: 18, mutation_prob_var: 0.12 } },
    });
    expect(saved.optimize.offspring_multiplier).toBeUndefined();
    expect(saved.optimize.crossover_probability).toBeUndefined();
    expect(saved.optimize.mutation_probability).toBeUndefined();
    expect(saved.optimize.mutation_indpb).toBeUndefined();
    expect(saved.optimize.crossover_eta).toBeUndefined();
    expect(saved.optimize.mutation_eta).toBeUndefined();
  });

  it('uses runtime DEAP defaults when migrating back from pymoo', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      optimize: {
        backend: 'pymoo',
        population_size: null,
        pymoo: { shared: { crossover_eta: 25, mutation_eta: 18, mutation_prob_var: 'auto' } },
      },
    }, 'v7', 'backend-defaults');
    const wrapper = mount(ConfigEditorModal, {
      props: {
        open: true, draft, version: 'v7', error: '', backendOptions: ['pymoo', 'deap'],
        optimizeDefaults: { offspring_multiplier: 2, crossover_probability: 0.61, mutation_probability: 0.31, mutation_indpb: 0.09 },
      },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.find('[data-tab="optimizer"]').trigger('click');
    await pickSelectOption(wrapper, '[data-field="optimizer-backend"]', 'deap');
    await wrapper.find('button[data-save="config"]').trigger('click');

    const saved = wrapper.emitted('save')?.[0]?.[0] as typeof draft;
    expect(saved.optimize).toMatchObject({
      backend: 'deap',
      population_size: 500,
      offspring_multiplier: 2,
      crossover_probability: 0.61,
      mutation_probability: 0.31,
      mutation_indpb: 0.09,
      crossover_eta: 25,
      mutation_eta: 18,
    });
    expect(saved.optimize.pymoo).toBeUndefined();
  });

  it('renders and saves unknown optimize parameters with their original types', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      optimize: {
        backend: 'pymoo',
        custom_boolean: true,
        custom_number: 12.5,
        custom_string: 'alpha',
        custom_json: { nested: [1, 2] },
        custom_null: null,
      },
    }, 'v8', 'extra-params');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '' },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.find('[data-tab="optimizer"]').trigger('click');
    expect(wrapper.find('[data-extra-param="custom_boolean"][role="checkbox"]').exists()).toBe(true);
    expect(wrapper.find('[data-extra-param="custom_number"][type="number"]').exists()).toBe(true);
    expect(wrapper.find('[data-extra-param="custom_string"][type="text"]').exists()).toBe(true);
    expect(wrapper.find('textarea[data-extra-param="custom_json"]').exists()).toBe(true);
    expect(wrapper.find('[data-extra-param="custom_null"][type="text"]').exists()).toBe(true);
    expect(wrapper.find('[data-extra-param="iters"]').exists()).toBe(false);

    await wrapper.find('[data-extra-param="custom_boolean"]').trigger('click'); // starts true → false
    await wrapper.find('[data-extra-param="custom_number"]').setValue('42');
    await wrapper.find('[data-extra-param="custom_string"]').setValue('beta');
    await wrapper.find('textarea[data-extra-param="custom_json"]').setValue('{"nested":[3]}');
    await wrapper.find('[data-extra-param="custom_null"]').setValue('null');
    await wrapper.find('button[data-save="config"]').trigger('click');

    const saved = wrapper.emitted('save')?.[0]?.[0] as typeof draft;
    expect(saved.optimize).toMatchObject({
      custom_boolean: false,
      custom_number: 42,
      custom_string: 'beta',
      custom_json: { nested: [3] },
      custom_null: null,
    });
  });

  it('does not apply PB8 suite-scenario validation to PB7 configs', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      optimize: { scoring: [{ metric: 'adg', scenario: 'legacy-value' }], limits: [] },
    }, 'v7', 'pb7-scenario');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '' },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.find('button[data-save="config"]').trigger('click');
    expect(wrapper.emitted('save')).toHaveLength(1);
  });

  it('blocks PB8 scenario settings that require an enabled suite', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      optimize: { scoring: [{ metric: 'adg', scenario: null }], limits: [] },
    }, 'v8', 'invalid-scenario');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '' },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.find('button[data-save="config"]').trigger('click');
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.text()).toContain('Scoring Scenario and Aggregate require Suite mode.');
  });

  it('renders PB8 OHLCV start-date controls and keeps PB7 date input ordinary', async () => {
    const pb8Draft = buildEditorDraft({ backtest: { exchanges: ['bybit'], start_date: '2024-01-01' }, bot: {}, optimize: {} }, 'v8', 'pb8');
    const requestStartDate = vi.fn().mockResolvedValue({ job_id: 'job-1', status: 'queued' });
    const pb8Wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft: pb8Draft, version: 'v8', error: '', startOhlcvLookup: requestStartDate },
      global: { plugins: [createI18n('en')] },
    });
    expect(pb8Wrapper.find('[data-test="ohlcv-start-date-controls"]').exists()).toBe(true);
    expect(pb8Wrapper.find('[data-test="ohlcv-start-first"]').exists()).toBe(true);
    await pb8Wrapper.find('[data-test="ohlcv-start-first"]').trigger('click');
    expect(requestStartDate).toHaveBeenCalledOnce();

    const pb7Draft = buildEditorDraft({ backtest: { exchanges: ['bybit'], start_date: '2024-01-01' }, bot: {}, optimize: {} }, 'v7', 'pb7');
    const pb7Wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft: pb7Draft, version: 'v7', error: '' },
      global: { plugins: [createI18n('en')] },
    });
    expect(pb7Wrapper.find('[data-test="ohlcv-start-date-controls"]').exists()).toBe(false);
  });

  it('unlocks OHLCV start-date controls after a completed job', async () => {
    const draft = buildEditorDraft({ backtest: { exchanges: ['bybit'], start_date: '2024-01-01' }, optimize: {} }, 'v8', 'lookup');
    const wrapper = mount(ConfigEditorModal, {
      props: {
        open: true,
        draft,
        version: 'v8',
        error: '',
        startOhlcvLookup: vi.fn().mockResolvedValue({ job_id: 'job-1', status: 'queued' }),
        loadOhlcvLookup: vi.fn().mockResolvedValue({
          job_id: 'job-1',
          status: 'completed',
          result: { start_date_options: { earliest: { available: true, start_date: '2023-02-01' } } },
        }),
      },
      global: { plugins: [createI18n('en')] },
    });
    await wrapper.find('[data-test="ohlcv-start-first"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="ohlcv-start-first"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-test="ohlcv-start-all"]').attributes('disabled')).toBeUndefined();
  });

  it('previews and applies PB8 scenario training windows through the modal callback', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'], start_date: '2020-01-01', end_date: '2024-12-31' },
      bot: { long: { risk: { n_positions: 3 } }, short: {} },
      optimize: { bounds: { bot: { long: { risk: { n_positions: [1, 8], total_wallet_exposure_limit: [1, 12] } } } } },
      live: { approved_coins: { long: ['BTCUSDT'], short: [] } },
    }, 'v8', 'generator');
    const previewScenarioTemplate = vi.fn().mockResolvedValue({
      template: 'rolling_windows',
      training_scenarios: [{ label: 'train_01', start_date: '2022-01-01', end_date: '2022-03-31' }],
      holdout_scenarios: [],
      reducer: { default: 'mean' },
      provenance: { template: 'rolling_windows', holdout_scenarios: [] },
    });
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '', previewScenarioTemplate },
      global: { plugins: [createI18n('en')] },
    });
    await wrapper.find('[data-tab="suite"]').trigger('click');
    await wrapper.find('[data-test="suite-generator-preview"]').trigger('click');
    expect(previewScenarioTemplate).toHaveBeenCalledOnce();
    await flushPromises();
    expect(wrapper.find('[data-test="suite-generator-apply"]').exists()).toBe(true);
    await wrapper.find('[data-test="suite-generator-apply"]').trigger('click');
    expect(wrapper.text()).toContain('train_01');
  });

  it('edits PB8 fine-tune and polish runtime settings', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      optimize: { seed: 7 },
      pbgui: { optimize_runtime: { fine_tune_params: ['long.risk'], polish_percentage: 0.15, polish_bounds_mode: 'clamp' } },
    }, 'v8', 'polish');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '' },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.find('[data-tab="runtime"]').trigger('click');
    expect(wrapper.find('[data-field="fine-tune-params"]').exists()).toBe(true);
    await wrapper.find('[data-field="fine-tune-params"]').setValue('long.risk, short.strategy');
    await wrapper.find('[data-field="polish-percentage"]').setValue('30');
    await pickSelectOption(wrapper, '[data-field="polish-bounds-mode"]', 'override-tunable');
    await wrapper.find('button[data-save="config"]').trigger('click');

    const saved = wrapper.emitted('save')?.[0]?.[0] as typeof draft;
    expect(saved.pbgui.optimize_runtime).toMatchObject({
      fine_tune_params: ['long.risk', 'short.strategy'],
      polish_percentage: 0.3,
      polish_bounds_mode: 'override-tunable',
    });
  });

  it('emits the current unsaved draft for OHLCV readiness checks', async () => {
    const draft = buildEditorDraft({ backtest: { exchanges: ['bybit'] }, optimize: {} }, 'v7', 'preflight');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '' },
      global: { plugins: [createI18n('en')] },
    });
    await wrapper.find('[data-action="preflight"]').trigger('click');
    expect(wrapper.emitted('preflight')?.[0]?.[0]).toMatchObject({ name: 'preflight', exchanges: ['bybit'] });
  });

  it('round trips array-based enable overrides', async () => {
    const draft = buildEditorDraft({ backtest: { exchanges: ['bybit'] }, optimize: { enable_overrides: ['mirror_short_from_long'] } }, 'v7', 'overrides');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '' },
      global: { plugins: [createI18n('en')] },
    });
    await wrapper.find('button[data-save="config"]').trigger('click');
    const saved = wrapper.emitted('save')?.[0]?.[0] as typeof draft;
    expect(saved.optimize.enable_overrides).toEqual(['mirror_short_from_long']);
  });

  it('drops strategy-incompatible optimizer overrides on load and save (v1.98.36)', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      live: { strategy_kind: 'neat' },
      optimize: { enable_overrides: ['lossless_close_trailing', 'forward_tp_grid', 'mirror_short_from_long'] },
    }, 'v8', 'overrides');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '' },
      global: { plugins: [createI18n('en')] },
    });
    // 加载即过滤：textarea 反映剩余项
    await wrapper.find('[data-tab="optimizer"]').trigger('click');
    expect((wrapper.find('[data-field="enable-overrides"]').element as HTMLTextAreaElement).value.trim())
      .toBe(JSON.stringify(['mirror_short_from_long'], null, 2).trim());
    await wrapper.find('button[data-save="config"]').trigger('click');
    const saved = wrapper.emitted('save')?.[0]?.[0] as typeof draft;
    expect(saved.optimize.enable_overrides).toEqual(['mirror_short_from_long']);
  });

  it('uses runtime pymoo options and resolves auto to NSGA-III for four objectives', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      optimize: {
        backend: 'pymoo',
        scoring: [{ metric: 'a' }, { metric: 'b' }, { metric: 'c' }, { metric: 'd' }],
        pymoo: { algorithm: 'auto', algorithms: { nsga3: { ref_dirs: { method: 'das_dennis', n_partitions: 'auto' } } } },
      },
    }, 'v8', 'auto-nsga3');
    const wrapper = mount(ConfigEditorModal, {
      props: {
        open: true, draft, version: 'v8', error: '',
        pymooAlgorithmOptions: ['auto', 'nsga2', 'nsga3'],
        pymooRefDirMethodOptions: ['das_dennis', 'incremental'],
      },
      global: { plugins: [createI18n('en')] },
    });
    await wrapper.find('[data-tab="optimizer"]').trigger('click');
    await openSelect(wrapper, '[data-field="pymoo-ref-dir-method"]');
    expect(selectOptionTexts()).toContain('incremental');
    expect(wrapper.find('[data-field="pymoo-ref-dir-partitions-mode"]').text()).toBe('auto');
  });

  it('renders exchange checkboxes with fallback options and supports select all / deselect all / toggling', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: [] },
      bot: {},
      optimize: {},
    }, 'v7', 'empty-exchanges');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '', exchangeOptions: [] },
      global: { plugins: [createI18n('en')] },
    });

    // Default exchanges fallback rendered
    expect(wrapper.text()).toContain('exchanges');
    expect(wrapper.text()).toContain('0 / 7');
    expect(wrapper.text()).toContain('binance');
    expect(wrapper.text()).toContain('bybit');
    expect(wrapper.text()).toContain('hyperliquid');

    // Select all
    const selectAllBtn = wrapper.findAll('button').find((b) => b.text().toLowerCase().includes('select all'));
    expect(selectAllBtn?.exists()).toBe(true);
    await selectAllBtn!.trigger('click');
    expect(wrapper.text()).toContain('7 / 7');

    // Deselect all
    const deselectAllBtn = wrapper.findAll('button').find((b) => b.text().toLowerCase().includes('deselect all'));
    expect(deselectAllBtn?.exists()).toBe(true);
    await deselectAllBtn!.trigger('click');
    expect(wrapper.text()).toContain('0 / 7');

    // Toggle single exchange chip
    const binanceLabel = wrapper.findAll('label').find((l) => l.text().includes('binance'));
    expect(binanceLabel?.exists()).toBe(true);
    const binanceCheckbox = binanceLabel?.find('[data-slot="checkbox"]');
    expect(binanceCheckbox?.exists()).toBe(true);
    await binanceLabel!.trigger('click');
    expect(wrapper.text()).toContain('1 / 7');
  });

  it('renders localized parameter tooltips on the editor labels', async () => {
    const draft = buildEditorDraft({ backtest: { exchanges: ['bybit'] }, bot: {}, optimize: {} }, 'v8', 'tips');
    const wrapperEn = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '' },
      global: { plugins: [createI18n('en')] },
    });
    const enTip = wrapperEn.findAll('[data-tip]').find((el) => el.text() === 'starting_balance');
    expect(enTip?.exists()).toBe(true);
    expect(enTip?.attributes('data-tip')).toBe(en['v7optimize.tip.starting_balance'] as string);
    // the delegated tooltip layer is mounted inside the modal
    expect(wrapperEn.find('#data-tip-tooltip').exists()).toBe(true);
    wrapperEn.unmount();

    const wrapperZh = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v8', error: '' },
      global: { plugins: [createI18n('zh')] },
    });
    const zhTip = wrapperZh.findAll('[data-tip]').find((el) => el.text() === 'starting_balance');
    expect(zhTip?.attributes('data-tip')).toBe(zh['v7optimize.tip.starting_balance'] as string);
    wrapperZh.unmount();
  });

  it('shows localized tooltips for bounds parameters across key shapes', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      bot: {},
      optimize: {
        bounds: {
          long_n_positions: [1, 8, 1],
          'short.risk.total_wallet_exposure_limit': [0, 1, 0.1],
          'bot.long.unstuck.threshold': [0.4, 0.9, 0.001],
          long_unknown_future_param: [0, 1],
        },
      },
    }, 'v7', 'bound-tips');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '' },
      global: { plugins: [createI18n('en')] },
    });
    await wrapper.find('[data-tab="bounds"]').trigger('click');

    const codeFor = (name: string) => wrapper.findAll('code').find((el) => el.text().trim() === name);

    // PB7 flat key: long_n_positions displays as the full key, tip resolves via base n_positions
    expect(codeFor('long_n_positions')?.attributes('data-tip')).toBe(en['v7optimize.tip.bound.n_positions'] as string);
    // PB8 nested key (short side): short.risk.total_wallet_exposure_limit
    expect(codeFor('total_wallet_exposure_limit')?.attributes('data-tip')).toBe(en['v7optimize.tip.bound.risk.total_wallet_exposure_limit'] as string);
    // bot.-prefixed nested key: bot.long.unstuck.threshold
    expect(codeFor('threshold')?.attributes('data-tip')).toBe(en['v7optimize.tip.bound.unstuck.threshold'] as string);
    // unknown params keep the plain full-key title and no tooltip attribute
    expect(codeFor('long_unknown_future_param')?.attributes('data-tip')).toBeUndefined();
    expect(codeFor('long_unknown_future_param')?.attributes('title')).toBe('long_unknown_future_param');
    wrapper.unmount();

    const wrapperZh = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '' },
      global: { plugins: [createI18n('zh')] },
    });
    await wrapperZh.find('[data-tab="bounds"]').trigger('click');
    const zhNpos = wrapperZh.findAll('code').find((el) => el.text().trim() === 'long_n_positions');
    expect(zhNpos?.attributes('data-tip')).toBe(zh['v7optimize.tip.bound.n_positions'] as string);
    wrapperZh.unmount();
  });

  it('filters bounds by category with semantic color classes', async () => {
    const draft = buildEditorDraft({
      backtest: { exchanges: ['bybit'] },
      bot: {},
      optimize: {
        bounds: {
          long_n_positions: [1, 8, 1],
          'short.risk.total_wallet_exposure_limit': [0, 1, 0.1],
          'bot.long.unstuck.threshold': [0.4, 0.9, 0.001],
        },
        fixed_params: ['long_n_positions'],
      },
    }, 'v7', 'filter-test');
    const wrapper = mount(ConfigEditorModal, {
      props: { open: true, draft, version: 'v7', error: '' },
      global: { plugins: [createI18n('en')] },
    });
    await wrapper.find('[data-tab="bounds"]').trigger('click');

    const filterAll = wrapper.find('[data-test="bound-filter-all"]');
    const filterLong = wrapper.find('[data-test="bound-filter-long"]');
    const filterShort = wrapper.find('[data-test="bound-filter-short"]');
    const filterFixed = wrapper.find('[data-test="bound-filter-fixed"]');

    expect(filterAll.exists()).toBe(true);
    expect(filterLong.exists()).toBe(true);
    expect(filterShort.exists()).toBe(true);
    expect(filterFixed.exists()).toBe(true);

    // Initial state: "all" is active with ice-blue accent styling
    expect(filterAll.classes()).toContain('text-accent-soft');
    expect(filterAll.classes()).toContain('bg-accent/15');

    // Click "long": activates green success styling and filters rows
    await filterLong.trigger('click');
    expect(filterLong.classes()).toContain('text-success-soft');
    expect(filterLong.classes()).toContain('bg-success/15');
    expect(wrapper.text()).toContain('long_n_positions');
    expect(wrapper.text()).toContain('threshold');
    expect(wrapper.text()).not.toContain('total_wallet_exposure_limit');

    // Click "short": activates coral-red danger styling and filters rows
    await filterShort.trigger('click');
    expect(filterShort.classes()).toContain('text-danger-soft');
    expect(filterShort.classes()).toContain('bg-danger/15');
    expect(wrapper.text()).toContain('total_wallet_exposure_limit');
    expect(wrapper.text()).not.toContain('long_n_positions');

    // Click "fixed": activates warm amber warning styling and filters rows
    await filterFixed.trigger('click');
    expect(filterFixed.classes()).toContain('text-warning-soft');
    expect(filterFixed.classes()).toContain('bg-warning/15');
    expect(wrapper.text()).toContain('long_n_positions');
    expect(wrapper.text()).not.toContain('total_wallet_exposure_limit');

    // Click "all" again
    await filterAll.trigger('click');
    expect(filterAll.classes()).toContain('text-accent-soft');
  });

  it('keeps every v7optimize.tip.* key referenced by the editor sources in both dictionaries', () => {
    const roots = [
      join(__dirname, '..'),
      join(__dirname, '../../../shared/suiteEditor'),
    ];
    const keyPattern = /'(v7optimize\.tip\.[A-Za-z0-9_.]+)'/g;
    const used = new Set<string>();
    for (const root of roots) {
      for (const file of collectFiles(root)) {
        for (const match of readFileSync(file, 'utf8').matchAll(keyPattern)) used.add(match[1]!);
      }
    }
    expect(used.size).toBeGreaterThan(50);
    const missingEn = [...used].filter((key) => !(key in en));
    const missingZh = [...used].filter((key) => !(key in zh));
    expect(missingEn).toEqual([]);
    expect(missingZh).toEqual([]);
  });
});

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') files.push(...collectFiles(full));
    } else if (entry.endsWith('.vue') && !entry.endsWith('.test.vue')) files.push(full);
  }
  return files;
}
