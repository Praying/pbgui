(function () {
  'use strict';

  function i18nT(key, params, fallback) {
    var i18n = (typeof window !== 'undefined') && window.PBGuiI18n;
    if (i18n && typeof i18n.t === 'function') return i18n.t(key, params);
    var text = fallback == null ? key : String(fallback);
    if (params) {
      text = text.replace(/\{(\w+)\}/g, function (m, name) {
        return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;
      });
    }
    return text;
  }

  var DIRECTIONS = [
    'Balanced (keep run scoring)',
    'More profit (risk can be higher)',
    'Safer (lower drawdowns)',
    'Smoother equity curve',
    'Fewer/shorter holds (less time in market)',
    'Lower exposure (safer sizing)'
  ];
  var DIRECTION_KEYS = {
    'Balanced (keep run scoring)': 'editor.preset.directionBalanced',
    'More profit (risk can be higher)': 'editor.preset.directionProfit',
    'Safer (lower drawdowns)': 'editor.preset.directionSafer',
    'Smoother equity curve': 'editor.preset.directionSmoother',
    'Fewer/shorter holds (less time in market)': 'editor.preset.directionFewerHolds',
    'Lower exposure (safer sizing)': 'editor.preset.directionLowerExposure'
  };
  var active = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeName(value, fallback) {
    var name = String(value || '').trim() || (fallback || 'optimize_refine');
    name = name.replace(/[ \/\\:*?"<>|\u0000]+/g, '_').replace(/^[._]+|[._]+$/g, '');
    return (name || fallback || 'optimize_refine').slice(0, 64);
  }

  function parseIntSafe(value, fallback) {
    var parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function injectStyles() {
    if (document.getElementById('opb-style')) return;
    var style = document.createElement('style');
    style.id = 'opb-style';
    style.textContent = '' +
      '.opb-overlay{position:fixed;inset:0;z-index:10000;background:rgba(5, 8, 14,.62);display:flex;align-items:center;justify-content:center;padding:24px;}' +
      '.opb-inline{height:100%;min-height:0;overflow:auto;padding:0;}' +
      '.opb-card{width:min(1180px,96vw);max-height:92vh;overflow:auto;background:var(--bg2,#171c29);color:var(--text,#e8ecf4);border:1px solid var(--border,#333f5c);border-radius:10px;box-shadow:0 20px 70px rgba(5, 8, 14,.55);padding:16px;}' +
      '.opb-card-inline{width:100%;max-height:none;min-height:100%;box-shadow:none;}' +
      '.opb-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;margin-bottom:10px;}' +
      '.opb-title{font-size:16px;font-weight:700;}' +
      '.opb-muted{color:var(--text-dim,#a3adc2);font-size:13px;line-height:1.45;}' +
      '.opb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px;}' +
      '.opb-field{display:flex;flex-direction:column;gap:5px;min-width:0;}' +
      '.opb-field-full{grid-column:1/-1;}' +
      '.opb-field label,.opb-label{font-size:11px;color:var(--text-dim,#a3adc2);text-transform:uppercase;letter-spacing:.04em;}' +
      '.opb-field input[type=text],.opb-field select{height:32px;background:var(--bg3,#232b3d);color:var(--text,#e8ecf4);border:1px solid var(--border,#333f5c);border-radius:6px;padding:0 10px;}' +
      '.opb-field input[type=range]{width:100%;accent-color:var(--accent,#72a0ee);}' +
      '.opb-check{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--text,#e8ecf4);}' +
      '.opb-check input{width:16px;height:16px;accent-color:var(--accent,#72a0ee);}' +
      '.opb-table{width:100%;border-collapse:collapse;font-size:12px;}' +
      '.opb-table th,.opb-table td{padding:6px 8px;border-bottom:1px solid var(--border,#333f5c);text-align:left;vertical-align:top;}' +
      '.opb-table th{color:var(--text,#e8ecf4);font-weight:700;background:var(--bg2,#171c29);}' +
      '.opb-placeholder{border:1px dashed var(--border,#333f5c);border-radius:8px;padding:12px;color:var(--text-dim,#a3adc2);}' +
      '.opb-code{margin:0;max-height:260px;overflow:auto;background:var(--bg,#0c1018);border:1px solid var(--border,#333f5c);border-radius:8px;padding:10px;color:var(--text,#e8ecf4);font-size:12px;}' +
      '.opb-details{border:1px solid var(--border,#333f5c);border-radius:8px;padding:10px;}' +
      '.opb-details summary{cursor:pointer;font-weight:700;}' +
      '.opb-buttons{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;}' +
      '.opb-btn{height:32px;border:1px solid var(--border,#333f5c);border-radius:7px;background:var(--bg3,#232b3d);color:var(--text,#e8ecf4);padding:0 12px;cursor:pointer;}' +
      '.opb-btn:hover{border-color:var(--accent,#72a0ee);}' +
      '.opb-btn-primary{background:var(--blue,var(--accent,#72a0ee));border-color:var(--blue,var(--accent,#72a0ee));color:#f2f5fb;}' +
      '.opb-btn:disabled{opacity:.55;cursor:not-allowed;}' +
      '.opb-status{min-height:18px;margin-top:8px;}' +
      '@media(max-width:780px){.opb-overlay{padding:8px;align-items:stretch;}.opb-card{max-height:calc(100vh - 16px);}.opb-grid{grid-template-columns:1fr;}}';
    document.head.appendChild(style);
  }

  function apiJson(url, token, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (String(token || '').trim()) headers.Authorization = 'Bearer ' + String(token).trim();
    return fetch(url, Object.assign({}, options, { headers: headers })).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          var detail = text || ('HTTP ' + res.status);
          try {
            var parsed = JSON.parse(text);
            detail = parsed.detail || detail;
          } catch (_err) {}
          throw new Error(detail);
        });
      }
      return res.json();
    });
  }

  function extractConfigSections(raw) {
    var out = {};
    ['backtest', 'bot', 'live', 'optimize', 'pbgui', 'coin_overrides'].forEach(function (key) {
      if (raw && Object.prototype.hasOwnProperty.call(raw, key)) out[key] = raw[key];
    });
    return out;
  }

  function optimizeApiBase(version) {
    return window.location.origin + '/api/optimize-' + (String(version || 'v7').toLowerCase() === 'v8' ? 'v8' : 'v7');
  }

  function backtestApiBase(version) {
    return window.location.origin + '/api/backtest-' + (String(version || 'v7').toLowerCase() === 'v8' ? 'v8' : 'v7');
  }

  function saveOptimizePresetConfig(token, name, config, version) {
    var encoded = encodeURIComponent(name);
    var apiBase = optimizeApiBase(version);
    return apiJson(apiBase + '/configs/' + encoded, token, {
      method: 'PUT',
      body: JSON.stringify(config)
    }).then(function () {
      return apiJson(apiBase + '/configs/' + encoded, token);
    }).then(function (saved) {
      if (!saved || !saved.config) throw new Error(i18nT('editor.preset.savedReloadFailed', null, 'Saved optimize config could not be reloaded.'));
      return saved.config;
    });
  }

  function queueOptimizePreset(token, name, version) {
    return apiJson(optimizeApiBase(version) + '/queue', token, {
      method: 'POST',
      body: JSON.stringify({ name: name })
    });
  }

  function openOptimizeSeedDraft(token, config, draftName, version) {
    var runtime = String(version || 'v7').toLowerCase() === 'v8' ? 'v8' : 'v7';
    return apiJson(backtestApiBase(runtime) + '/optimize-draft', token, {
      method: 'POST',
      body: JSON.stringify({ config: extractConfigSections(config) })
    }).then(function (draft) {
      var params = new URLSearchParams();
      params.set('opt_draft_id', draft && draft.draft_id ? draft.draft_id : '');
      if (draftName) params.set('draft_name', draftName);
      window.location.href = optimizeApiBase(runtime) + '/main_page?' + params.toString();
    });
  }

  function updateRangeFill(input) {
    if (!input) return;
    var min = Number(input.min || 0);
    var max = Number(input.max || 100);
    var val = Number(input.value || 0);
    var pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
    pct = Math.max(0, Math.min(100, pct));
    input.style.background = 'linear-gradient(90deg,var(--accent,#72a0ee) 0%,var(--accent,#72a0ee) ' + pct + '%,rgba(255,255,255,.18) ' + pct + '%,rgba(255,255,255,.18) 100%)';
  }

  function renderRows(root, rows, emptyText, columns) {
    if (!rows || !rows.length) {
      root.className = 'opb-placeholder';
      root.innerHTML = esc(emptyText);
      return;
    }
    root.className = '';
    var visibleRows = rows.slice(0, 140);
    var html = '<div style="overflow:auto;max-height:320px"><table class="opb-table"><thead><tr>';
    columns.forEach(function (column) { html += '<th>' + esc(column.label) + '</th>'; });
    html += '</tr></thead><tbody>';
    visibleRows.forEach(function (row) {
      html += '<tr>';
      columns.forEach(function (column) { html += '<td>' + esc(row[column.key] == null ? '' : row[column.key]) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (rows.length > visibleRows.length) html += '<div class="opb-muted" style="margin-top:6px">' + i18nT('editor.preset.showingFirst', { shown: visibleRows.length, total: rows.length }, 'Showing first ' + visibleRows.length + ' of ' + rows.length + ' rows.') + '</div>';
    root.innerHTML = html;
  }

  function scoringLabel(entry) {
    if (entry && typeof entry === 'object') {
      return entry.goal ? String(entry.metric || '') + ' (' + String(entry.goal || '') + ')' : String(entry.metric || '');
    }
    return String(entry == null ? '' : entry);
  }

  function notify(options, message, type) {
    if (typeof options.notify === 'function') options.notify(message, type || 'info');
  }

  function resolveMount(options) {
    var mount = options && (options.mount || options.mountEl || options.container);
    if (typeof mount === 'string') return document.getElementById(mount);
    return mount && mount.nodeType === 1 ? mount : null;
  }

  function closeActive(silent) {
    var previous = active;
    if (active && active.timer) window.clearTimeout(active.timer);
    if (active && active.root && active.root.parentNode) active.root.parentNode.removeChild(active.root);
    if (!active) {
      var overlay = document.getElementById('opb-overlay');
      if (overlay) overlay.remove();
    }
    active = null;
    if (!silent && previous && previous.options && typeof previous.options.onClose === 'function') previous.options.onClose();
  }

  function open(options) {
    options = options || {};
    if (typeof options.buildPreset !== 'function') throw new Error(i18nT('editor.preset.buildPresetRequired', null, 'buildPreset callback is required.'));
    closeActive(true);
    injectStyles();

    var defaultName = sanitizeName(options.defaultName || 'optimize_refine', 'optimize_refine');
    var mount = resolveMount(options);
    var directions = options.directions || DIRECTIONS;
    var directionOptions = directions.map(function (direction) {
      var key = DIRECTION_KEYS[direction];
      return '<option value="' + esc(direction) + '">' + esc(key ? i18nT(key, null, direction) : direction) + '</option>';
    }).join('');
    var root = document.createElement('div');
    root.id = mount ? 'opb-inline-root' : 'opb-overlay';
    root.className = mount ? 'opb-inline' : 'opb-overlay';
    if (!mount) {
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
    }
    root.innerHTML = '' +
      '<div class="opb-card' + (mount ? ' opb-card-inline' : '') + '">' +
        '<div class="opb-head"><div><div class="opb-title">' + i18nT('editor.preset.title', null, 'Create PBv7 Optimize Preset') + '</div><div class="opb-muted">' + esc(options.sourceLabel || i18nT('editor.preset.source', null, 'Source')) + (options.sourceName ? ': ' + esc(options.sourceName) : '') + '</div></div><button class="opb-btn" data-opb="close" type="button">' + esc(options.closeLabel || (mount ? i18nT('editor.preset.backToResults', null, 'Back to Results') : i18nT('common.close', null, 'Close'))) + '</button></div>' +
        '<p class="opb-muted">' + i18nT('editor.preset.intro', null, 'Create a follow-up Optimize preset with bounds tightened around this result config. Use it for focused fine-tuning instead of broad exploration.') + '</p>' +
        '<div class="opb-grid">' +
          '<div class="opb-field"><label>' + i18nT('editor.preset.goalLabel', null, 'Optimization goal') + '</label><select data-opb="direction">' + directionOptions + '</select></div>' +
          '<div class="opb-field"><label>' + i18nT('editor.preset.nameLabel', null, 'Preset name') + '</label><input data-opb="name" type="text" maxlength="64" value="' + esc(defaultName) + '"></div>' +
          '<div class="opb-field opb-field-full"><label class="opb-check"><input data-opb="only-near" type="checkbox" checked><span>' + i18nT('editor.preset.onlyNear', null, 'Only adjust parameters near optimize bounds') + '</span></label></div>' +
          '<div class="opb-field"><label>' + i18nT('editor.preset.boundsWindowLabel', null, 'Bounds window (%)') + '</label><input data-opb="bounds-window" type="range" min="0" max="100" step="5" value="0"><div class="opb-muted" data-opb="bounds-window-value">0%</div></div>' +
          '<div class="opb-field"><label>' + i18nT('editor.preset.riskAdjustLabel', null, 'Risk adjustment') + '</label><input data-opb="risk-adjust" type="range" min="-50" max="50" step="5" value="0"><div class="opb-muted" data-opb="risk-adjust-value">0</div></div>' +
          '<div class="opb-field opb-field-full"><div class="opb-muted" data-opb="bounds-hint">' + i18nT('editor.preset.boundsUnchanged', null, 'Bounds unchanged.') + '</div></div>' +
          '<div class="opb-field opb-field-full"><h4 style="margin:0">' + i18nT('editor.preset.summaryTitle', null, 'Preset summary') + '</h4><div data-opb="summary" class="opb-placeholder">' + i18nT('editor.preset.buildingPreview', null, 'Building preset preview...') + '</div></div>' +
          '<div class="opb-field opb-field-full"><details class="opb-details"><summary>' + i18nT('editor.preset.advancedPreview', null, 'Advanced preview details') + '</summary><div class="opb-grid"><div class="opb-field opb-field-full"><h4 style="margin:0">' + i18nT('editor.preset.plannedDefaults', null, 'Planned optimize defaults') + '</h4><pre data-opb="json" class="opb-code">' + i18nT('editor.preset.buildingPreview', null, 'Building preset preview...') + '</pre></div><div class="opb-field opb-field-full"><h4 style="margin:0">' + i18nT('editor.preset.boundsChangesPreview', null, 'Bounds changes preview') + '</h4><div data-opb="bounds" class="opb-placeholder">' + i18nT('editor.preset.noPreviewLoaded', null, 'No preview loaded.') + '</div></div></div></details></div>' +
          '<div class="opb-field opb-field-full"><div class="opb-buttons"><button class="opb-btn opb-btn-primary" data-opb="create" type="button">' + i18nT('editor.preset.createBtn', null, 'Create Optimize Preset') + '</button><button class="opb-btn" data-opb="queue" type="button">' + i18nT('editor.preset.createQueueBtn', null, 'Create & Queue') + '</button></div><div class="opb-status opb-muted" data-opb="status"></div></div>' +
        '</div>' +
      '</div>';
    if (mount) {
      mount.innerHTML = '';
      mount.appendChild(root);
    } else {
      document.body.appendChild(root);
    }

    var state = active = { root: root, seq: 0, timer: null, options: options };
    function q(name) { return root.querySelector('[data-opb="' + name + '"]'); }

    function updateLabels() {
      var windowPct = parseIntSafe(q('bounds-window').value, 0);
      var riskAdjust = parseIntSafe(q('risk-adjust').value, 0);
      q('bounds-window-value').textContent = String(windowPct) + '%';
      q('risk-adjust-value').textContent = String(riskAdjust);
      q('bounds-hint').textContent = windowPct === 0
        ? i18nT('editor.preset.boundsUnchanged', null, 'Bounds unchanged.')
        : i18nT('editor.preset.boundsWindowHint', { pct: windowPct }, 'Effective bounds window: +/-' + String(windowPct) + '% around selected values') + (q('only-near').checked ? i18nT('editor.preset.boundsWindowHintNear', null, ' for near-bound parameters only.') : '.');
      updateRangeFill(q('bounds-window'));
      updateRangeFill(q('risk-adjust'));
    }

    function buildBody(includeConfig) {
      var body = {
        include_config: !!includeConfig,
        preset: {
          preset_name: q('name').value.trim() || defaultName,
          only_adjust_near_bounds: !!q('only-near').checked,
          bounds_window_pct: parseIntSafe(q('bounds-window').value, 0),
          direction: q('direction').value,
          risk_adjust: parseIntSafe(q('risk-adjust').value, 0),
          show_near_bounds: false,
          expand_near_bounds: false,
          hide_hard_limited_near: false
        }
      };
      if (typeof options.extendRequest === 'function') {
        var extended = options.extendRequest(body, { includeConfig: !!includeConfig });
        if (extended) body = extended;
      }
      return body;
    }

    function renderSummary(payload) {
      var root = q('summary');
      if (!payload || !payload.ok) {
        root.className = 'opb-placeholder';
        root.innerHTML = i18nT('editor.preset.noPresetPreview', null, 'No preset preview available.');
        return;
      }
      var scoring = Array.isArray(payload.scoring) ? payload.scoring : [];
      var limits = Array.isArray(payload.limits) ? payload.limits : [];
      var rows = payload.bounds_preview_rows || [];
      var nearCount = parseIntSafe(payload.near_bounds_count || 0, 0);
      var rawDirection = payload.direction || q('direction').value;
      var directionKey = DIRECTION_KEYS[rawDirection];
      var directionLabel = directionKey ? i18nT(directionKey, null, rawDirection) : rawDirection;
      var summaryRows = [
        { label: i18nT('editor.preset.summaryName', null, 'Name'), value: payload.preset_name || q('name').value || defaultName },
        { label: i18nT('editor.preset.summaryGoal', null, 'Goal'), value: directionLabel },
        { label: i18nT('editor.preset.summaryBoundsScope', null, 'Bounds scope'), value: payload.only_adjust_near_bounds ? (i18nT('editor.preset.nearBoundOnly', null, 'near-bound parameters only') + (nearCount ? ' (' + nearCount + ')' : i18nT('editor.preset.noneDetected', null, ' (none detected)'))) : i18nT('editor.preset.allOptimizedParams', null, 'all optimized parameters') },
        { label: i18nT('editor.preset.summaryBoundsWindow', null, 'Bounds window'), value: (payload.window_pct || 0) > 0 ? ('+/-' + String(payload.window_pct) + '%') : i18nT('editor.preset.unchanged', null, 'unchanged') },
        { label: i18nT('editor.preset.summaryScoring', null, 'Scoring'), value: scoring.map(scoringLabel).filter(Boolean).join(', ') || i18nT('editor.preset.unchanged', null, 'unchanged') },
        { label: i18nT('editor.preset.summaryLimits', null, 'Limits'), value: i18nT('editor.preset.configured', { n: limits.length }, String(limits.length) + ' configured') },
        { label: i18nT('editor.preset.summaryBoundsChanges', null, 'Bounds changes'), value: String(rows.length) }
      ];
      var html = '<table class="opb-table"><tbody>';
      summaryRows.forEach(function (row) { html += '<tr><th>' + esc(row.label) + '</th><td>' + esc(row.value) + '</td></tr>'; });
      html += '</tbody></table>';
      root.className = '';
      root.innerHTML = html;
    }

    function renderPreview(payload) {
      if (!payload || !payload.ok) {
        renderSummary(null);
        q('json').textContent = i18nT('editor.preset.noPresetPreview', null, 'No preset preview available.');
        renderRows(q('bounds'), [], i18nT('editor.preset.noBoundsChanges', null, 'No bounds changes detected.'), []);
        return;
      }
      if (payload.preset_name) q('name').value = String(payload.preset_name);
      renderSummary(payload);
      q('json').textContent = JSON.stringify({ scoring: payload.scoring || [], limits: payload.limits || [] }, null, 2);
      renderRows(q('bounds'), payload.bounds_preview_rows || [], i18nT('editor.preset.noBoundsChanges', null, 'No bounds changes detected.'), [
        { key: 'param', label: i18nT('editor.preset.colParam', null, 'Param') },
        { key: 'change', label: i18nT('editor.preset.colChange', null, 'Change') },
        { key: 'before', label: i18nT('editor.preset.colBefore', null, 'Before') },
        { key: 'expand', label: i18nT('editor.preset.colExpand', null, 'Expand') },
        { key: 'window', label: i18nT('editor.preset.colWindow', null, 'Window') },
        { key: 'risk', label: i18nT('editor.preset.colRisk', null, 'Risk') },
        { key: 'result', label: i18nT('editor.preset.colResult', null, 'Result') },
        { key: 'expand_note', label: i18nT('editor.preset.colNote', null, 'Note') }
      ]);
    }

    function setWorking(working) {
      q('create').disabled = !!working;
      q('queue').disabled = !!working;
    }

    function loadPreview(includeConfig) {
      var seq = ++state.seq;
      q('status').textContent = includeConfig ? i18nT('editor.preset.buildingConfig', null, 'Building preset config...') : i18nT('editor.preset.buildingPreview', null, 'Building preset preview...');
      return options.buildPreset(buildBody(!!includeConfig)).then(function (payload) {
        if (seq === state.seq) {
          renderPreview(payload);
          q('status').textContent = '';
        }
        return payload;
      }).catch(function (err) {
        if (seq === state.seq) q('status').textContent = i18nT('editor.preset.previewFailed', { msg: err.message }, 'Preset preview failed: ' + err.message);
        throw err;
      });
    }

    function schedulePreview(delay) {
      if (state.timer) window.clearTimeout(state.timer);
      state.timer = window.setTimeout(function () {
        state.timer = null;
        loadPreview(false).catch(function () {});
      }, delay == null ? 250 : delay);
    }

    function createPreset(queueAfter) {
      setWorking(true);
      loadPreview(true).then(function (payload) {
        if (!payload || !payload.preset_config) throw new Error(i18nT('editor.preset.configNotGenerated', null, 'Preset config was not generated.'));
        var name = sanitizeName(payload.preset_name || q('name').value || defaultName, defaultName);
        q('name').value = name;
        if (typeof options.saveConfig !== 'function') throw new Error(i18nT('editor.preset.saveConfigRequired', null, 'saveConfig callback is required.'));
        q('status').textContent = i18nT('editor.preset.saving', null, 'Saving optimize preset...');
        return options.saveConfig(name, payload.preset_config).then(function (savedConfig) {
          notify(options, i18nT('editor.preset.created', { name: name }, 'Optimize preset created: ' + name + '.json'), 'ok');
          if (queueAfter) {
            if (typeof options.queueConfig !== 'function') throw new Error(i18nT('editor.preset.queueConfigRequired', null, 'queueConfig callback is required.'));
            q('status').textContent = i18nT('editor.preset.queueing', null, 'Queueing optimize preset...');
            return options.queueConfig(name).then(function (queueData) {
              var suffix = queueData && queueData.filename ? ' (' + queueData.filename + ')' : '';
              q('status').textContent = i18nT('editor.preset.queued', { name: name }, 'Optimize preset queued: ' + name + '.json') + suffix;
              notify(options, i18nT('editor.preset.queued', { name: name }, 'Optimize preset queued: ' + name + '.json'), 'ok');
              return savedConfig;
            });
          }
          if (typeof options.openOptimize === 'function') {
            q('status').textContent = i18nT('editor.preset.opening', null, 'Opening PBv7 Optimize...');
            return options.openOptimize(savedConfig, name);
          }
          q('status').textContent = i18nT('editor.preset.saved', { name: name }, 'Optimize preset saved: ' + name + '.json');
          return savedConfig;
        });
      }).catch(function (err) {
        q('status').textContent = i18nT('editor.preset.createFailed', { msg: err.message }, 'Create preset failed: ' + err.message);
        notify(options, i18nT('editor.preset.createFailed', { msg: err.message }, 'Create preset failed: ' + err.message), 'err');
      }).finally(function () {
        setWorking(false);
      });
    }

    q('close').addEventListener('click', function () { closeActive(false); });
    q('bounds-window').addEventListener('input', updateLabels);
    q('risk-adjust').addEventListener('input', updateLabels);
    ['bounds-window', 'risk-adjust', 'direction', 'only-near', 'name'].forEach(function (name) {
      q(name).addEventListener('change', function () {
        updateLabels();
        schedulePreview(0);
      });
    });
    q('create').addEventListener('click', function () { createPreset(false); });
    q('queue').addEventListener('click', function () { createPreset(true); });

    updateLabels();
    schedulePreview(0);
  }

  window.PBGuiOptimizePresetBuilder = {
    directions: DIRECTIONS.slice(),
    open: open,
    close: function () { closeActive(false); },
    sanitizeName: sanitizeName,
    saveOptimizePresetConfig: saveOptimizePresetConfig,
    queueOptimizePreset: queueOptimizePreset,
    openOptimizeSeedDraft: openOptimizeSeedDraft,
    extractConfigSections: extractConfigSections
  };
})();
