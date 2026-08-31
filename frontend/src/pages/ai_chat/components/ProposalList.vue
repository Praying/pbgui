<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
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
  <div v-if="proposals.length" class="grid max-h-[min(65dvh,720px)] min-h-[120px] resize-y content-start gap-2 overflow-y-auto px-4 pt-2">
    <div
      v-for="proposal in proposals"
      :key="proposal.proposal_id"
      class="flex flex-col items-start gap-2.5 rounded-lg border border-warning/35 bg-warning/14 p-2.5 md:flex-row"
    >
      <div class="min-w-0 flex-1">
        <div class="font-bold text-warning-soft">
          {{ proposalActionLabel(proposal.preview?.action, t) }}{{ proposal.preview?.name ? ': ' + String(proposal.preview.name) : '' }}
        </div>
        <div class="text-xs text-secondary">{{ proposalDetail(proposal.preview || {}, t) }}</div>
        <details class="mt-1.5 text-xs text-secondary">
          <summary class="cursor-pointer text-accent-soft">{{ reviewSummary(proposal.preview || {}) }}</summary>
          <template v-if="proposal.preview?.action === 'python_analysis'">
            <pre class="mt-1.5 h-[240px] min-h-[140px] resize-y overflow-auto rounded-md bg-deep p-2 whitespace-pre-wrap text-secondary">{{ proposalReviewText(proposal) }}</pre>
          </template>
          <template v-else>
            <div class="mt-1.5 grid h-[240px] min-h-[140px] resize-y content-start gap-1.5 overflow-auto rounded-md bg-deep p-2 font-mono text-[11px] leading-[1.4]">
              <template v-for="(change, index) in changes(proposal.preview || {})" :key="index">
                <div class="font-bold text-accent-soft">{{ String(change.path || '(root)') }}</div>
                <div class="rounded bg-danger/14 p-1 text-danger-soft">- {{ proposalDiffValue(change.before) }}</div>
                <div class="rounded bg-success/13 p-1 text-success-soft">+ {{ proposalDiffValue(change.after) }}</div>
              </template>
            </div>
            <details class="mt-1.5">
              <summary class="cursor-pointer text-accent-soft">{{ t('ai.proposal.rawJson') }}</summary>
              <pre class="mt-1.5 h-[240px] min-h-[140px] resize-y overflow-auto rounded-md bg-deep p-2 whitespace-pre-wrap text-secondary">{{ proposalReviewText(proposal) }}</pre>
            </details>
          </template>
        </details>
      </div>
      <div class="sticky bottom-0 flex w-full flex-wrap gap-1.5 bg-panel/95 p-1.5 md:w-auto">
        <Button
          type="button"
          @click="emit('resolve', proposal, false)"
        >{{ t('ai.proposal.reject') }}</Button>
        <Button
          type="button"
          variant="primary"
          @click="emit('resolve', proposal, true)"
        >{{ t('ai.proposal.reviewApprove') }}</Button>
      </div>
    </div>
  </div>
</template>
