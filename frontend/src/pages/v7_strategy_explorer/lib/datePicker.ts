/**
 * The legacy floating date-picker — a verbatim port of the window.__dp
 * installer (:874-992). Kept as an imperative window global because the
 * calendar renders inline onclick handlers (window.__dp.pm() etc.); the
 * Vue templates trigger it through data-dp attributes exactly like the
 * legacy markup (:221, :332).
 */

interface DatePickerApi {
  show(id: string, anchor: HTMLElement | null): void;
  hide(): void;
  pm(): void;
  nm(): void;
  sm(m: number): void;
  sy(y: number): void;
  tm(): void;
  ty(): void;
  today(): void;
  pick(day: number): void;
}

type DpWindow = Window & { __dp?: DatePickerApi; PBGuiI18n?: { t(key: string, params?: Record<string, unknown>): string } };

export function installDatePicker(): void {
  const w = window as DpWindow;
  if (w.__dp) return;
  const t = (key: string, params?: Record<string, unknown>) => w.PBGuiI18n?.t(key, params) ?? key;
  let _id: string | null = null;
  let _y = 0;
  let _m = 0;
  let _anchor: HTMLElement | null = null;
  let _menu = '';
  const MN = [
    t('v7explore.monthJanuary'), t('v7explore.monthFebruary'), t('v7explore.monthMarch'), t('v7explore.monthApril'),
    t('v7explore.monthMay'), t('v7explore.monthJune'), t('v7explore.monthJuly'), t('v7explore.monthAugust'),
    t('v7explore.monthSeptember'), t('v7explore.monthOctober'), t('v7explore.monthNovember'), t('v7explore.monthDecember'),
  ];
  const cssId = '__dp_css';
  if (!document.getElementById(cssId)) {
    const s = document.createElement('style');
    s.id = cssId;
    s.textContent =
      '#__dp .dp-day:hover{background:rgba(255,255,255,.15)!important}' +
      '#__dp .dp-day{transition:background .1s}' +
      '#__dp .dp-nav:hover{background:rgba(255,255,255,.15)!important}' +
      '#__dp .dp-nav{transition:background .1s;border-radius:4px}' +
      '#__dp .dp-ctl{transition:background .1s,border-color .1s;border-radius:4px}' +
      '#__dp .dp-ctl:hover{background:rgba(255,255,255,.08)!important;border-color:var(--accent,#72a0ee)!important}' +
      '#__dp .dp-dd{position:absolute;top:calc(100% + 4px);z-index:2;display:none;background:var(--bg3,#232b3d);border:1px solid var(--border,#333f5c);border-radius:6px;box-shadow:0 8px 18px rgba(5, 8, 14,.55);max-height:220px;overflow:auto;padding:4px}' +
      '#__dp .dp-dd.open{display:block}' +
      '#__dp .dp-dd-item{display:block;width:100%;text-align:left;background:transparent;border:none;color:var(--text,#e8ecf4);font-size:var(--fs-xs);padding:6px 8px;border-radius:4px;cursor:pointer}' +
      '#__dp .dp-dd-item:hover{background:rgba(255,255,255,.10)!important}' +
      '#__dp .dp-dd-item.selected{background:var(--accent,#72a0ee);color:#f2f5fb}' +
      '#__dp .dp-foot:hover{background:rgba(255,255,255,.15)!important}' +
      '#__dp .dp-foot{transition:background .1s;border-radius:4px}';
    document.head.appendChild(s);
  }
  function _el(): HTMLElement {
    let e = document.getElementById('__dp');
    if (!e) {
      e = document.createElement('div');
      e.id = '__dp';
      e.style.cssText =
        'display:none;position:fixed;z-index:99999;background:var(--bg2,#171c29);border:1px solid var(--border,#333f5c);border-radius:8px;padding:10px 12px;box-shadow:0 6px 24px rgba(5, 8, 14,.7);user-select:none;min-width:220px;color-scheme:dark';
      document.body.appendChild(e);
      document.addEventListener(
        'pointerdown',
        (ev) => {
          if (!_id) return;
          const target = ev.target as HTMLElement | null;
          const b = target?.closest ? target.closest('[data-dp]') : null;
          if (b && b.getAttribute('data-dp') === _id) return;
          if (!e!.contains(ev.target as Node)) _hide();
        },
        true
      );
      window.addEventListener('resize', _reposition, { passive: true });
    }
    return e;
  }
  function _shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
    let nextY = y;
    let nextM = m + delta;
    while (nextM < 0) {
      nextM += 12;
      nextY--;
    }
    while (nextM > 11) {
      nextM -= 12;
      nextY++;
    }
    return { y: nextY, m: nextM };
  }
  function _yearMenu(): string {
    const cur = new Date().getFullYear();
    let html = '';
    for (let y = 2010; y <= cur + 2; y++)
      html += '<button type="button" class="dp-dd-item' + (y === _y ? ' selected' : '') + '" onclick="window.__dp.sy(' + y + ')">' + y + '</button>';
    return html;
  }
  function _monthMenu(): string {
    let html = '';
    for (let i = 0; i < 12; i++)
      html += '<button type="button" class="dp-dd-item' + (i === _m ? ' selected' : '') + '" onclick="window.__dp.sm(' + i + ')">' + MN[i] + '</button>';
    return html;
  }
  function _render(): void {
    const e = _el();
    const d1 = new Date(_y, _m, 1);
    const dim = new Date(_y, _m + 1, 0).getDate();
    const sdow = (d1.getDay() + 6) % 7;
    const td = new Date();
    const inp = _id ? document.getElementById(_id) : null;
    const sv = inp ? (inp as HTMLInputElement).value : '';
    const sel = sv ? new Date(sv + 'T00:00:00') : null;
    const selOk = sel && !isNaN(sel.getTime());
    const prevMonth = _shiftMonth(_y, _m, -1);
    const nextMonth = _shiftMonth(_y, _m, 1);
    void prevMonth;
    void nextMonth;
    const btnS = 'background:none;border:none;color:var(--text,#e8ecf4);cursor:pointer;font-size:1.3em;padding:0 6px;line-height:1';
    const ctlS =
      'background:var(--bg3,#232b3d);border:1px solid var(--border,#333f5c);color:var(--text,#e8ecf4);border-radius:4px;padding:2px 6px;font-size:var(--fs-xs);cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px';
    let h =
      '<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px">' +
      '<button type="button" class="dp-nav" onclick="window.__dp.pm()" style="' +
      btnS +
      '">&#8249;</button>' +
      '<div style="position:relative;flex:1"><button type="button" class="dp-ctl" onclick="window.__dp.tm()" style="' +
      ctlS +
      ';width:100%">' +
      MN[_m] +
      '<span style="font-size:10px;opacity:.8">▾</span></button><div class="dp-dd' +
      (_menu === 'month' ? ' open' : '') +
      '" style="left:0;right:auto;min-width:140px">' +
      _monthMenu() +
      '</div></div>' +
      '<div style="position:relative;width:72px"><button type="button" class="dp-ctl" onclick="window.__dp.ty()" style="' +
      ctlS +
      ';width:100%">' +
      _y +
      '<span style="font-size:10px;opacity:.8">▾</span></button><div class="dp-dd' +
      (_menu === 'year' ? ' open' : '') +
      '" style="right:0;left:auto;min-width:72px">' +
      _yearMenu() +
      '</div></div>' +
      '<button type="button" class="dp-nav" onclick="window.__dp.nm()" style="' +
      btnS +
      '">&#8250;</button></div>';
    h += '<div style="display:grid;grid-template-columns:repeat(7,30px);gap:2px;text-align:center">';
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d) => {
      h += '<div style="color:var(--text-dim,#a3adc2);font-size:var(--fs-xs);padding-bottom:4px">' + d + '</div>';
    });
    for (let i = 0; i < sdow; i++) h += '<div></div>';
    for (let day = 1; day <= dim; day++) {
      const isT = td.getFullYear() === _y && td.getMonth() === _m && td.getDate() === day;
      const isS = !!selOk && sel!.getFullYear() === _y && sel!.getMonth() === _m && sel!.getDate() === day;
      const bg = isS ? 'var(--accent,#72a0ee)' : isT ? 'rgba(255,255,255,.12)' : 'transparent';
      h +=
        '<div class="dp-day" onclick="window.__dp.pick(' +
        day +
        ')" style="cursor:pointer;border-radius:4px;padding:4px 0;background:' +
        bg +
        ';color:var(--text,#e8ecf4);font-weight:' +
        (isS || isT ? '600' : '400') +
        ';font-size:var(--fs-sm)">' +
        day +
        '</div>';
    }
    h +=
      '</div><div style="margin-top:8px;display:flex;justify-content:space-between"><button type="button" class="dp-foot" onclick="window.__dp.hide()" style="background:none;border:none;color:var(--text-dim,#a3adc2);cursor:pointer;font-size:var(--fs-xs);padding:2px 6px;border-radius:4px">' +
      t('common.close') +
      '</button><button type="button" class="dp-foot" onclick="window.__dp.today()" style="background:none;border:none;color:var(--accent,#72a0ee);cursor:pointer;font-size:var(--fs-xs);padding:2px 6px;border-radius:4px">' +
      t('v7explore.today') +
      '</button></div>';
    e.innerHTML = h;
    _reposition();
  }
  function _reposition(): void {
    if (_id && _anchor) _pos(_anchor);
  }
  function _pos(anchor: HTMLElement): void {
    const e = _el();
    e.style.display = 'block';
    const r = anchor.getBoundingClientRect();
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const ew = e.offsetWidth || 240;
    const eh = e.offsetHeight || 290;
    let left = r.left;
    let top = r.bottom + 4;
    if (left + ew > sw - 8) left = sw - ew - 8;
    if (top + eh > sh - 8) top = r.top - eh - 4;
    e.style.left = left + 'px';
    e.style.top = top + 'px';
  }
  function _hide(): void {
    _el().style.display = 'none';
    _id = null;
    _anchor = null;
    _menu = '';
  }
  function _pick(day: number): void {
    const val = _y + '-' + String(_m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    const inp = _id ? (document.getElementById(_id) as HTMLInputElement | null) : null;
    if (inp) {
      inp.value = val;
      inp.dataset.prev = val;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    _hide();
  }
  w.__dp = {
    show(id: string, anchor: HTMLElement | null) {
      const e = _el();
      if (_id === id && e.style.display !== 'none') {
        _hide();
        return;
      }
      _id = id;
      _anchor = anchor;
      _menu = '';
      const inp = document.getElementById(id) as HTMLInputElement | null;
      const v = inp ? inp.value : '';
      const d = v ? new Date(v + 'T00:00:00') : new Date();
      if (isNaN(d.getTime())) d.setTime(Date.now());
      _y = d.getFullYear();
      _m = d.getMonth();
      _render();
      _pos(anchor || e);
    },
    hide: _hide,
    pm() {
      const prev = _shiftMonth(_y, _m, -1);
      _y = prev.y;
      _m = prev.m;
      _render();
    },
    nm() {
      const next = _shiftMonth(_y, _m, 1);
      _y = next.y;
      _m = next.m;
      _menu = '';
      _render();
    },
    sm(m: number) {
      _m = m;
      _menu = '';
      _render();
    },
    sy(y: number) {
      _y = y;
      _menu = '';
      _render();
    },
    tm() {
      _menu = _menu === 'month' ? '' : 'month';
      _render();
    },
    ty() {
      _menu = _menu === 'year' ? '' : 'year';
      _render();
    },
    today() {
      const d = new Date();
      _y = d.getFullYear();
      _m = d.getMonth();
      _menu = '';
      _pick(d.getDate());
    },
    pick: _pick,
  };
}
