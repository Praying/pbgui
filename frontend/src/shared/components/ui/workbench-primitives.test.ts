import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import {
  ActionGroup,
  ChartFrame,
  FormSection,
  MetricBlock,
  PageToolbar,
  PanelHeader,
  StatusBadge,
} from './workbench-primitives';

describe('workbench composition primitives', () => {
  it('renders a panel heading with optional description and actions', () => {
    const wrapper = mount(PanelHeader, {
      props: { title: 'Runtime services', description: 'Manage local workers.' },
      slots: { actions: '<button type="button">Refresh</button>' },
    });

    expect(wrapper.get('h2').text()).toBe('Runtime services');
    expect(wrapper.get('p').text()).toBe('Manage local workers.');
    expect(wrapper.get('button').text()).toBe('Refresh');
  });

  it('groups actions with a labelled toolbar and priority data attributes', () => {
    const wrapper = mount(ActionGroup, {
      props: { label: 'Panel actions', priority: 'primary' },
      slots: {
        default: '<button>Run</button><button>Export</button>',
      },
    });

    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Panel actions');
    expect(wrapper.get('[role="group"]').attributes('data-action-priority')).toBe('primary');
    expect(wrapper.get('button').text()).toBe('Run');
  });

  it('provides a sticky page toolbar with context and action regions', () => {
    const wrapper = mount(PageToolbar, {
      props: { label: 'Backtest controls' },
      slots: {
        context: '<input aria-label="Filter" />',
        default: '<button>New config</button>',
      },
    });

    expect(wrapper.get('[role="toolbar"]').attributes('aria-label')).toBe('Backtest controls');
    expect(wrapper.get('input').attributes('aria-label')).toBe('Filter');
    expect(wrapper.get('button').text()).toBe('New config');
  });

  it('exposes a semantic status badge without converting user text to markup', () => {
    const wrapper = mount(StatusBadge, {
      props: { tone: 'success', label: 'Connected' },
    });

    expect(wrapper.get('[role="status"]').attributes('data-tone')).toBe('success');
    expect(wrapper.get('[role="status"]').text()).toBe('Connected');
  });

  it('frames chart content with title, state and labelled region', () => {
    const wrapper = mount(ChartFrame, {
      props: { title: 'CPU history', state: 'ready' },
      slots: { default: '<svg data-testid="chart" />' },
    });

    expect(wrapper.get('[data-chart-frame="ready"]').attributes('aria-label')).toBe('CPU history');
    expect(wrapper.get('h3').text()).toBe('CPU history');
    expect(wrapper.find('[data-testid="chart"]').exists()).toBe(true);
  });

  it('renders a compact metric with semantic tone and supporting detail', () => {
    const wrapper = mount(MetricBlock, {
      props: { label: 'CPU', value: '23%', detail: 'host-a', tone: 'warning' },
    });

    expect(wrapper.get('dl').attributes('data-tone')).toBe('warning');
    expect(wrapper.get('dt').text()).toBe('CPU');
    expect(wrapper.get('dd').text()).toContain('23%');
    expect(wrapper.text()).toContain('host-a');
  });

  it('groups form fields under a labelled section with optional guidance', () => {
    const wrapper = mount(FormSection, {
      props: { title: 'Connection', description: 'Configure the remote endpoint.' },
      slots: { default: '<input aria-label="Host" />' },
    });

    expect(wrapper.get('fieldset').attributes('aria-describedby')).toBeTruthy();
    expect(wrapper.get('legend').text()).toBe('Connection');
    expect(wrapper.get('input').attributes('aria-label')).toBe('Host');
  });
});
