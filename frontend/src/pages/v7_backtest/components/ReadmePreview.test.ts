import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ReadmePreview from './ReadmePreview.vue';

/*
 * ReadmePreview — the archive score-preview README renderer
 * (renderArchiveReadmeMarkdown :6294-6345) as safe template output:
 * NO v-html anywhere, links render only with scheme-whitelisted hrefs.
 */

enableAutoUnmount(afterEach);

function mountPreview(markdown: string, remoteBase = '') {
  return mount(ReadmePreview, { props: { markdown, remoteBase }, global: { plugins: [createI18n('en')] } });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ReadmePreview', () => {
  it('renders headings, paragraphs, bullets, code blocks and tables', () => {
    const wrapper = mountPreview('# Title\n\nSome **bold** text\n- one\n- two\n\n```\nlet x = 1\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(wrapper.find('h1').text()).toBe('Title');
    expect(wrapper.find('p').html()).toContain('<strong>bold</strong>');
    expect(wrapper.findAll('ul li')).toHaveLength(2);
    expect(wrapper.find('pre code').text()).toBe('let x = 1');
    expect(wrapper.findAll('table td')).toHaveLength(2);
  });

  it('renders safe links with target=_blank and drops hostile schemes', () => {
    const wrapper = mountPreview('[ok](https://example.com) [bad](javascript:alert(1))');
    const links = wrapper.findAll('a');
    expect(links).toHaveLength(2);
    expect(links[0]!.attributes('href')).toBe('https://example.com');
    expect(links[0]!.attributes('target')).toBe('_blank');
    // legacy renders an inert '#' anchor for non-whitelisted schemes (:6252)
    expect(links[1]!.attributes('href')).toBe('#');
  });

  it('renders images only with whitelisted sources', () => {
    const wrapper = mountPreview('![ok](https://example.com/l.png) ![bad](javascript:alert(1))');
    const images = wrapper.findAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]!.attributes('src')).toBe('https://example.com/l.png');
  });

  it('maps pbgui relative links to the remote tree base', () => {
    const wrapper = mountPreview('[results](./pbgui/backtests.json)', 'https://github.com/o/r');
    expect(wrapper.find('a').attributes('href')).toBe('https://github.com/o/r/tree/main/pbgui/backtests.json');
  });

  it('escapes raw html payloads (renders as text, never elements)', () => {
    const wrapper = mountPreview('<img src=x onerror=alert(1)>');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('p').text()).toContain('<img src=x onerror=alert(1)>');
  });
});
