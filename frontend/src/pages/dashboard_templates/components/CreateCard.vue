<script setup lang="ts">
/**
 * Legacy Card 3 (dashboard_templates.html): create dashboards from a
 * template.
 *
 * - Multi-user branch (effective users > 0): confirm createConfirm {count,
 *   template} once, then sequentially per user — GET /dashboards/{dashName}
 *   (dashName = entered name or the username); an existing config triggers
 *   the overwrite confirm (declined → skipped++), then
 *   POST /dashboards/from_template {template, name}. End message:
 *   createdCount + (skipped ? ', ' + skippedCount), ok/err by nCreated > 0,
 *   pbgui_dashboard_created iff nCreated > 0. Button disabled meanwhile.
 * - Single branch (no users): name required; overwrite confirm when the
 *   dashboard exists (declined → silent abort); success → createdName (ok),
 *   clear the input, post to the parent. Legacy quirk kept verbatim: the
 *   no-overwrite-path strings are literals, not i18n.
 * - Name placeholder (legacy updatePlaceholder): optionalDefaultUsername
 *   when effective users exist, required otherwise.
 */
import { computed, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import { dashboardsUrl, fromTemplateUrl } from '../config';
import { dialogsConfirm } from '../dialogs';
import type { DashboardConfigResponse, StatusResponse } from '../types';
import MultiSelect from './MultiSelect.vue';

const props = defineProps<{ templates: string[]; users: string[] }>();

const emit = defineEmits<{ created: [] }>();
const { t } = useI18n();

const tplSelect = ref('');
const userSel = ref<string[]>(['ALL']);
const nameValue = ref('');
const creating = ref(false);
const msg = ref('');
const msgType = ref<'ok' | 'err' | ''>('');
let msgTimer: number | undefined;

/** Legacy showMsg: set text + ok/err class, auto-clear after 3500 ms. */
function showMsg(text: string, type: 'ok' | 'err'): void {
  msg.value = text;
  msgType.value = type;
  window.clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => {
    msg.value = '';
    msgType.value = '';
  }, 3500);
}

/** Legacy getEffectiveUsers: ALL → every user, else selected ∩ users. */
const effectiveUsers = computed(() =>
  userSel.value.includes('ALL')
    ? [...props.users]
    : userSel.value.filter((u) => props.users.includes(u))
);

/** Legacy updatePlaceholder. */
const namePlaceholder = computed(() =>
  effectiveUsers.value.length > 0 ? t('dash.optionalDefaultUsername') : t('dash.required')
);

/** Legacy apiGet('/dashboards/' + name): any failure → cb(null)-like {}. */
async function getExisting(name: string): Promise<DashboardConfigResponse> {
  try {
    return await apiFetch<DashboardConfigResponse>(`${dashboardsUrl()}/${encodeURIComponent(name)}`);
  } catch {
    return {};
  }
}

/** Legacy apiPost('/dashboards/from_template'): ok → true, else false. */
async function createFromTemplate(template: string, name: string): Promise<boolean> {
  try {
    const res = await apiFetch<StatusResponse>(fromTemplateUrl(), {
      method: 'POST',
      body: JSON.stringify({ template, name }),
    });
    return res.status === 'ok';
  } catch {
    return false;
  }
}

/** Legacy overwrite confirm (per-user and single branches). */
function confirmOverwrite(name: string): Promise<boolean> {
  return dialogsConfirm({
    title: t('dash.overwriteDashboard'),
    message: t('dash.dashboardExists', { name }),
    detail: t('dash.overwriteConfirm'),
    confirmText: t('dash.overwrite'),
  });
}

async function create(): Promise<void> {
  const template = tplSelect.value.trim();
  if (!template) {
    showMsg(t('dash.selectATemplate'), 'err');
    return;
  }
  const effective = effectiveUsers.value;
  const nameInput = nameValue.value.trim();

  if (effective.length > 0) {
    const confirmed = await dialogsConfirm({
      title: t('dash.createDashboards'),
      message: t('dash.createConfirm', { count: effective.length, template }),
      confirmText: t('dash.create'),
    });
    if (!confirmed) return;
    creating.value = true;
    let nCreated = 0;
    let nSkipped = 0;
    for (const user of effective) {
      const dashName = nameInput || user;
      const existing = await getExisting(dashName);
      if (existing.config !== undefined) {
        if (!(await confirmOverwrite(dashName))) {
          nSkipped++;
          continue;
        }
      }
      if (await createFromTemplate(template, dashName)) nCreated++;
      else nSkipped++;
    }
    creating.value = false;
    const doneMsg =
      t('dash.createdCount', { count: nCreated }) +
      (nSkipped > 0 ? `, ${t('dash.skippedCount', { count: nSkipped })}` : '');
    showMsg(doneMsg, nCreated > 0 ? 'ok' : 'err');
    if (nCreated > 0) emit('created');
    return;
  }

  /* ── No users: single dashboard, name required ── */
  if (!nameInput) {
    showMsg(t('dash.dashboardNameRequired'), 'err');
    return;
  }
  creating.value = true;
  const existing = await getExisting(nameInput);
  if (existing.config !== undefined) {
    if (!(await confirmOverwrite(nameInput))) {
      creating.value = false;
      return;
    }
    const ok = await createFromTemplate(template, nameInput);
    creating.value = false;
    if (ok) {
      showMsg(t('dash.createdName', { name: nameInput }), 'ok');
      nameValue.value = '';
      emit('created');
    } else {
      showMsg(t('dash.errorCreatingDashboard'), 'err');
    }
    return;
  }
  const ok = await createFromTemplate(template, nameInput);
  creating.value = false;
  if (ok) {
    // Legacy quirk: literal (non-i18n) success/error strings in this branch.
    showMsg(`“${nameInput}” created`, 'ok');
    nameValue.value = '';
    emit('created');
  } else {
    showMsg('Error creating dashboard', 'err');
  }
}

onUnmounted(() => window.clearTimeout(msgTimer));
</script>

<template>
  <div class="tpl-card">
    <div class="tpl-card-title">{{ t('dash.createFromTemplate') }}</div>
    <div v-if="templates.length === 0" class="tpl-empty">{{ t('dash.saveTemplateFirst') }}</div>
    <template v-else>
      <div class="tpl-label">{{ t('dash.template') }}</div>
      <select id="tpl-select" v-model="tplSelect" class="tpl-select">
        <option value="">{{ t('dash.selectTemplate') }}</option>
        <option v-for="tpl in templates" :key="tpl" :value="tpl">{{ tpl }}</option>
      </select>

      <div class="tpl-label">{{ t('dash.users') }}</div>
      <div id="users-msel" style="margin-bottom:0.5rem">
        <MultiSelect uid="msel2" :options="users" v-model:selected="userSel" all-row count-label="dash.nUsers" />
      </div>

      <div class="tpl-label">{{ t('dash.dashboardName') }}</div>
      <input
        id="dash-name"
        v-model="nameValue"
        class="tpl-input"
        type="text"
        :placeholder="namePlaceholder"
        autocomplete="off"
      >

      <div class="action-row">
        <button id="btn-create" class="btn pbgui-action primary" :disabled="creating" @click="create">
          📋 {{ t('dash.createDashboards') }}
        </button>
      </div>
      <div id="create-msg" class="msg" :class="msgType">{{ msg }}</div>
    </template>
  </div>
</template>
