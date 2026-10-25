<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { PhShieldWarning } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import PbIcon from '@/shared/components/PbIcon.vue';
import { proposalActionLabel, proposalDetail, proposalReviewText, proposalDiffValue, type AiProposal, type ProposalChange } from '../lib/proposal';

interface ProposalListProps {
  proposals: AiProposal[];
}

defineProps<ProposalListProps>();

const emit = defineEmits<{
  resolve: [proposal: AiProposal, approve: boolean];
}>();

const { t } = useI18n();

function reviewSummary(preview: { action?: string }): string {
  return preview.action === 'python_analysis' ? t('ai.proposal.reviewCode') : t('ai.proposal.reviewChanges');
}

function changes(preview: { changes?: ProposalChange[] }): ProposalChange[] {
  return preview.changes || [];
}
</script>

<template>
  <!-- Rendered in MessageList's #tail slot: each card continues the reply
       that requested it, so it scrolls with the conversation. -->
  <div v-if="proposals.length" class="mb-3 grid gap-2.5" data-test="proposal-list">
    <article
      v-for="proposal in proposals"
      :key="proposal.proposal_id"
      class="overflow-hidden rounded-lg border border-warning/35 bg-warning/8"
      :data-proposal-id="proposal.proposal_id"
    >
      <div class="flex items-start gap-2.5 px-3.5 pt-3 pb-2.5">
        <PbIcon :icon="PhShieldWarning" :size="18" class="mt-0.5 shrink-0 text-warning-soft" />
        <div class="min-w-0 flex-1">
          <div class="text-micro font-semibold uppercase tracking-label text-warning-soft">{{ t('ai.proposal.awaitingApproval') }}</div>
          <div class="mt-0.5 font-semibold text-primary wrap-anywhere">
            {{ proposalActionLabel(proposal.preview?.action, t) }}{{ proposal.preview?.name ? ': ' + String(proposal.preview.name) : '' }}
          </div>
          <div class="text-xs text-secondary">{{ proposalDetail(proposal.preview || {}, t) }}</div>
          <details class="mt-2 text-xs text-secondary">
            <summary class="cursor-pointer text-accent-soft transition-colors hover:text-accent">{{ reviewSummary(proposal.preview || {}) }}</summary>
            <template v-if="proposal.preview?.action === 'python_analysis'">
              <pre class="mt-1.5 h-[240px] min-h-[140px] resize-y overflow-auto rounded-md bg-deep p-2 whitespace-pre-wrap text-secondary">{{ proposalReviewText(proposal) }}</pre>
            </template>
            <template v-else>
              <div class="mt-1.5 grid h-[240px] min-h-[140px] resize-y content-start gap-1.5 overflow-auto rounded-md bg-deep p-2 font-mono text-micro leading-[1.4]">
                <template v-for="(change, index) in changes(proposal.preview || {})" :key="index">
                  <div class="font-bold text-accent-soft">{{ String(change.path || '(root)') }}</div>
                  <div class="rounded bg-danger/14 p-1 text-danger-soft">- {{ proposalDiffValue(change.before) }}</div>
                  <div class="rounded bg-success/13 p-1 text-success-soft">+ {{ proposalDiffValue(change.after) }}</div>
                </template>
              </div>
              <details class="mt-1.5">
                <summary class="cursor-pointer text-accent-soft transition-colors hover:text-accent">{{ t('ai.proposal.rawJson') }}</summary>
                <pre class="mt-1.5 h-[240px] min-h-[140px] resize-y overflow-auto rounded-md bg-deep p-2 whitespace-pre-wrap text-secondary">{{ proposalReviewText(proposal) }}</pre>
              </details>
            </template>
          </details>
        </div>
      </div>
      <div class="flex flex-wrap justify-end gap-2 border-t border-warning/20 bg-panel/60 px-3.5 py-2">
        <Button
          type="button"
          size="sm"
          @click="emit('resolve', proposal, false)"
        >{{ t('ai.proposal.reject') }}</Button>
        <Button
          type="button"
          size="sm"
          variant="primary"
          @click="emit('resolve', proposal, true)"
        >{{ t('ai.proposal.reviewApprove') }}</Button>
      </div>
    </article>
  </div>
</template>
