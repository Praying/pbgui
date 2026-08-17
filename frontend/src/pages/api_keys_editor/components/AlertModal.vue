<script setup lang="ts">
/*
 * Toast container + alert modal (:1044-1056 markup, showToast :2270-2299,
 * closeAlertModal :2301-2303) — success/info toasts bottom-right, error and
 * warning messages open the modal instead.
 */
import { injectToasts } from '../composables/useToasts';

const toasts = injectToasts();
</script>

<template>
  <div id="toastContainer">
    <div v-for="toast in toasts.toasts.value" :key="toast.id" class="toast show" :class="toast.kind">
      {{ toast.message }}
    </div>
  </div>

  <div id="alertModalOverlay" class="alert-modal-overlay" v-show="toasts.alert.value.visible">
    <div id="alertModalBox" class="alert-modal" :class="toasts.alert.value.kind">
      <div id="alertModalTitle" class="alert-modal-title">{{ toasts.alert.value.title }}</div>
      <div id="alertModalBody" class="alert-modal-body">{{ toasts.alert.value.message }}</div>
      <div class="alert-modal-footer">
        <button class="btn btn-primary" @click="toasts.closeAlert()">OK</button>
      </div>
    </div>
  </div>
</template>
