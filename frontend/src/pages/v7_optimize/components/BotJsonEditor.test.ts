import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import BotJsonEditor from './BotJsonEditor.vue';

describe('BotJsonEditor', () => {
  it('highlights neutralized and review blocks while preserving editable JSON', async () => {
    const wrapper = mount(BotJsonEditor, {
      props: {
        modelValue: '{\n  "hsl": {\n    "enabled": true\n  }\n}',
        status: { hsl: 'neutralized' },
        label: 'Bot long JSON',
      },
    });

    expect(wrapper.find('[data-status="neutralized"]').exists()).toBe(true);
    expect(wrapper.find('textarea').element.value).toContain('"enabled": true');
    await wrapper.find('textarea').setValue('{}');
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toBe('{}');
  });
});
