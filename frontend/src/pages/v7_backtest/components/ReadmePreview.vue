<script setup lang="ts">
/**
 * ReadmePreview — the archive score-preview README renderer
 * (renderArchiveReadmeMarkdown :6294-6345 + renderMarkdownInline
 * :6256-6271) rendered from typed tokens. NO v-html anywhere (R1):
 * raw markdown renders as text, links only carry scheme-whitelisted
 * hrefs (safeMarkdownHref), relative pbgui/ links map to the archive's
 * remote tree URL (:6239-6248).
 */
import { computed } from 'vue';
import { parseReadme, type MdInline } from '../lib/readmePreview';

const props = withDefaults(
  defineProps<{
    markdown: string;
    /** The archive's remote browser base (archiveRemoteBrowserUrl). */
    remoteBase?: string;
  }>(),
  { remoteBase: '' }
);

const blocks = computed(() => parseReadme(props.markdown, props.remoteBase));

function flatText(nodes: readonly MdInline[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text' || node.kind === 'code') return node.text;
      if (node.kind === 'strong') return flatText(node.nodes);
      if (node.kind === 'link') return node.text;
      return node.alt;
    })
    .join('');
}
</script>

<template>
  <div class="readme-preview" data-test="readme-preview">
    <template v-for="(block, i) in blocks" :key="i">
      <h1 v-if="block.kind === 'heading' && block.level === 1"><template v-for="(node, j) in block.nodes" :key="j"><template v-if="node.kind === 'strong'"><strong>{{ flatText(node.nodes) }}</strong></template><code v-else-if="node.kind === 'code'">{{ node.text }}</code><a v-else-if="node.kind === 'link' && node.href" :href="node.href" target="_blank" rel="noopener">{{ node.text }}</a><a v-else-if="node.kind === 'link'" href="#" @click.prevent>{{ node.text }}</a><span v-else>{{ node.kind === 'text' ? node.text : node.kind === 'image' ? node.alt : '' }}</span></template></h1>
      <h2 v-else-if="block.kind === 'heading' && block.level === 2"><template v-for="(node, j) in block.nodes" :key="j"><template v-if="node.kind === 'strong'"><strong>{{ flatText(node.nodes) }}</strong></template><code v-else-if="node.kind === 'code'">{{ node.text }}</code><a v-else-if="node.kind === 'link' && node.href" :href="node.href" target="_blank" rel="noopener">{{ node.text }}</a><a v-else-if="node.kind === 'link'" href="#" @click.prevent>{{ node.text }}</a><span v-else>{{ node.kind === 'text' ? node.text : node.kind === 'image' ? node.alt : '' }}</span></template></h2>
      <h3 v-else-if="block.kind === 'heading'"><template v-for="(node, j) in block.nodes" :key="j"><template v-if="node.kind === 'strong'"><strong>{{ flatText(node.nodes) }}</strong></template><code v-else-if="node.kind === 'code'">{{ node.text }}</code><a v-else-if="node.kind === 'link' && node.href" :href="node.href" target="_blank" rel="noopener">{{ node.text }}</a><a v-else-if="node.kind === 'link'" href="#" @click.prevent>{{ node.text }}</a><span v-else>{{ node.kind === 'text' ? node.text : node.kind === 'image' ? node.alt : '' }}</span></template></h3>
      <p v-else-if="block.kind === 'paragraph'">
        <template v-for="(node, j) in block.nodes" :key="j">
          <strong v-if="node.kind === 'strong'">{{ flatText(node.nodes) }}</strong>
          <code v-else-if="node.kind === 'code'">{{ node.text }}</code>
          <a v-else-if="node.kind === 'link' && node.href" :href="node.href" target="_blank" rel="noopener">{{ node.text }}</a>
          <a v-else-if="node.kind === 'link'" href="#" :title="'This relative README link works on GitHub after push.'" @click.prevent>{{ node.text }}</a>
          <img v-else-if="node.kind === 'image' && node.src" :src="node.src" :alt="node.alt" style="max-width: 100%" />
          <span v-else>{{ node.kind === 'text' ? node.text : node.kind === 'image' ? node.alt : '' }}</span>
        </template>
      </p>
      <ul v-else-if="block.kind === 'list'">
        <li v-for="(item, j) in block.items" :key="j">
          <template v-for="(node, k) in item" :key="k">
            <strong v-if="node.kind === 'strong'">{{ flatText(node.nodes) }}</strong>
            <code v-else-if="node.kind === 'code'">{{ node.text }}</code>
            <a v-else-if="node.kind === 'link' && node.href" :href="node.href" target="_blank" rel="noopener">{{ node.text }}</a>
            <a v-else-if="node.kind === 'link'" href="#" @click.prevent>{{ node.text }}</a>
            <img v-else-if="node.kind === 'image' && node.src" :src="node.src" :alt="node.alt" style="max-width: 100%" />
            <span v-else>{{ node.kind === 'text' ? node.text : node.kind === 'image' ? node.alt : '' }}</span>
          </template>
        </li>
      </ul>
      <pre v-else-if="block.kind === 'code'"><code>{{ block.lines.join('\n') }}</code></pre>
      <div v-else-if="block.kind === 'table'" class="md-table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="(cell, j) in block.header" :key="j">
                <template v-for="(node, k) in cell" :key="k"><code v-if="node.kind === 'code'">{{ node.text }}</code><a v-else-if="node.kind === 'link' && node.href" :href="node.href" target="_blank" rel="noopener">{{ node.text }}</a><span v-else>{{ node.kind === 'text' ? node.text : node.kind === 'image' ? node.alt : node.kind === 'strong' ? flatText(node.nodes) : '' }}</span></template>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, j) in block.body" :key="j">
              <td v-for="(cell, k) in row" :key="k">
                <template v-for="(node, m) in cell" :key="m"><code v-if="node.kind === 'code'">{{ node.text }}</code><a v-else-if="node.kind === 'link' && node.href" :href="node.href" target="_blank" rel="noopener">{{ node.text }}</a><span v-else>{{ node.kind === 'text' ? node.text : node.kind === 'image' ? node.alt : node.kind === 'strong' ? flatText(node.nodes) : '' }}</span></template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
