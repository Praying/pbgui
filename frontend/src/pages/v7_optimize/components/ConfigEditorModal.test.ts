import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { openSelect, pickSelectOption, selectOptionTexts } from '@/shared/testing/select';
import { buildEditorDraft } from '../lib/configModel';
import ConfigEditorModal from './ConfigEditorModal.vue';

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
    expect((wrapper.find('[data-field="pymoo-effective-algorithm"]').element as HTMLInputElement).value).toBe('nsga3');
    await openSelect(wrapper, '[data-field="pymoo-ref-dir-method"]');
    expect(selectOptionTexts()).toContain('incremental');
    expect(wrapper.find('[data-field="pymoo-ref-dir-partitions-mode"]').text()).toBe('auto');
  });

});
