/*
 * Result popup dialog, ported from the legacy _resultPopup + _logUiNotification
 * of frontend/services_monitor.html. Imperative DOM (appended to <body>,
 * reused across calls) so every panel task can raise the same popup the old
 * page showed; the modal CSS lives in App.vue's page-level style block.
 */
import { apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import { createI18n, detectLang } from '@/shared/i18n';

/** Standalone translator — the popup is raised outside any component tree. */
const t = createI18n(detectLang()).global.t;

/** Legacy _logUiNotification: fire-and-forget POST to the server-side notification log. */
function logUiNotification(message: string, level: 'ok' | 'err'): void {
  const text = message.trim();
  if (!text || !getBoot().token) return;
  void apiFetch('/api/notify_log', {
    method: 'POST',
    body: JSON.stringify({ msg: text, level }),
  }).catch(() => {});
}

export interface ResultPopupOptions {
  title: string;
  message: string;
  /** Monospace detail body; empty string hides the section (legacy truthiness). */
  output: string;
  isOk: boolean;
  /** Legacy hideFoot: success toasts omit the OK footer. */
  hideFoot?: boolean;
}

export function showResultPopup({ title, message, output, isOk, hideFoot = false }: ResultPopupOptions): void {
  logUiNotification(`${title || t('sysmon.notice')}: ${message || ''}`, isOk ? 'ok' : 'err');

  let existing = document.getElementById('result-modal') as HTMLDivElement | null;
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'result-modal';
    existing.className = 'result-modal';
    existing.style.top = '60px';
    existing.style.left = `${Math.max(20, (window.innerWidth - 720) / 2)}px`;
    document.body.appendChild(existing);
  }
  const modal = existing;
  modal.replaceChildren(); // legacy rebuilt the inner HTML on every call

  const header = document.createElement('div');
  header.className = 'result-modal-header';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'result-modal-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => modal.remove());
  header.append(heading, closeBtn);

  const status = document.createElement('div');
  status.className = `result-modal-status ${isOk ? 'ok' : 'fail'}`;
  status.textContent = `${isOk ? '✅' : '❌'} ${message}`;

  modal.append(header, status);
  if (output) {
    const body = document.createElement('div');
    body.className = 'result-modal-body';
    body.textContent = output;
    modal.append(body);
  }
  if (!hideFoot) {
    const footer = document.createElement('div');
    footer.className = 'result-modal-footer';
    const okBtn = document.createElement('button');
    okBtn.textContent = t('common.ok');
    okBtn.addEventListener('click', () => modal.remove());
    footer.append(okBtn);
    modal.append(footer);
  }

  attachHeaderDrag(modal, header);
}

/** Legacy popup drag: grab the header to move the modal around. */
function attachHeaderDrag(modal: HTMLElement, header: HTMLElement): void {
  let dx = 0;
  let dy = 0;
  let dragging = false;
  const onMove = (ev: MouseEvent): void => {
    if (!dragging) return;
    modal.style.left = `${ev.clientX - dx}px`;
    modal.style.top = `${ev.clientY - dy}px`;
  };
  const onUp = (): void => {
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  header.addEventListener('mousedown', (ev) => {
    if ((ev.target as HTMLElement).closest('.result-modal-close')) return;
    dragging = true;
    dx = ev.clientX - modal.getBoundingClientRect().left;
    dy = ev.clientY - modal.getBoundingClientRect().top;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
