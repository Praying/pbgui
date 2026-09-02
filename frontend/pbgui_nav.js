/* pbgui_nav.js — Shared navigation bar for PBGui standalone FastAPI pages.
 *
 * HOW TO USE IN A NEW STANDALONE PAGE:
 *   1. Add an empty placeholder in your HTML body:        <nav id="topnav"></nav>
 *   2. Near the end of <body>, set config and include this script:
 *        <script>
 *          window.PBGUI_NAV_CONFIG = { subtitle: 'MY PAGE', current: 'page_key' };
 *        </script>
 *        <script src="/app/pbgui_nav.js"></script>
 *   3. The following globals must be set anywhere before this script runs:
 *        TOKEN, API_BASE, PBGUI_VERSION
 *
 * The 'current' value in PBGUI_NAV_CONFIG must match a 'page' key in NAV_GROUPS below.
 * The active nav group is highlighted automatically.
 *
 * Guide button: opens a page-local help overlay when the page exposes
 * `window.PBGUI_HELP_OPENER`; otherwise it navigates to the shared Help page.
 * About button: opens an in-page modal with version info and links.
 */
(function () {
  'use strict';

  var _restartEventSource = null;
  var _restartRetryTimer = null;
  var _restartPollTimer = null;
  var _restartStatus = {};
  var _aiDrawerLoading = false;
  var _aiContextProviders = {};
  var _aiPageActions = {};
  var _aiActionNavigationTarget = '';
  var _aiControlIds = new WeakMap();
  var _aiControlElements = {};
  var _aiControlSequence = 0;

  function aiContextText(value, limit) {
    var text = String(value == null ? '' : value).trim().replace(/[\x00-\x1f\x7f]/g, ' ');
    return text.slice(0, limit);
  }

  function aiContextSensitiveName(value) {
    return /(^|[._\s-])(password|passwd|secret|token|api[_ -]?key|private[_ -]?key|credential|session|cookie|log|ssh)([._\s-]|$)/i.test(String(value || ''));
  }

  function aiContextEntity(value) {
    if (!value || typeof value !== 'object') return null;
    var entity = {
      kind: aiContextText(value.kind, 128),
      version: aiContextText(value.version, 128),
      name: aiContextText(value.name, 128)
    };
    if (!entity.kind || !entity.name || aiContextSensitiveName(entity.kind)) return null;
    return entity;
  }

  function aiContextFocusedField(value) {
    if (!value || typeof value !== 'object') return null;
    var path = aiContextText(value.path, 256);
    var label = aiContextText(value.label, 256);
    if (!path || aiContextSensitiveName(path) || aiContextSensitiveName(label)) return null;
    var field = { path: path };
    if (label) field.label = label;
    var fieldValue = aiContextText(value.value, 256);
    var validation = aiContextText(value.validation, 256);
    if (fieldValue) field.value = fieldValue;
    if (validation) field.validation = validation;
    return field;
  }

  function aiPageAction(value) {
    if (!value || typeof value !== 'object' || typeof value.run !== 'function') return null;
    var id = aiContextText(value.id, 64);
    var entityKind = aiContextText(value.entity_kind, 128);
    if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(id) || !/^[A-Za-z0-9_.-]{1,128}$/.test(entityKind)) return null;
    return { id: id, entity_kind: entityKind, run: value.run };
  }

  function registerPageAction(registration) {
    var action = aiPageAction(registration);
    if (!action) return function () {};
    var key = action.id + ':' + action.entity_kind;
    _aiPageActions[key] = action;
    return function () { delete _aiPageActions[key]; };
  }

  function continuePageAction(url) {
    try {
      var target = new URL(String(url || ''), window.location.href);
      var apiOrigin = _getApiOrigin();
      if (target.origin !== window.location.origin && target.origin !== apiOrigin) return false;
      target.searchParams.set('pbgui_ai_action', '1');
      if (_aiActionNavigationTarget === target.href) return false;
      _aiActionNavigationTarget = target.href;
      window.location.assign(target.href);
    } catch (_) {}
    return false;
  }

  function aiControlVisible(element) {
    if (!element || !element.isConnected || element.disabled || element.hidden) return false;
    if (element.closest('#pbgui-ai-drawer,[aria-hidden="true"]')) return false;
    var style = window.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    var rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function aiControlSensitive(element, label) {
    var type = String(element.type || '').toLowerCase();
    if (type === 'password' || type === 'file') return true;
    var identity = [element.id, element.name, element.autocomplete, label].join(' ');
    if (/password|passwd|secret|token|api[_ -]?key|private[_ -]?key|credential|session|cookie/i.test(identity)) return true;
    if (element.closest('#pbgui-dialog-ovl,#pbgui-confirm-ovl,#confirm-ovl,#del-dash-dialog,.backup-confirm-overlay')) return true;
    var dialog = element.closest('[role="dialog"],[aria-modal="true"]');
    if (!dialog) return false;
    var dialogIdentity = [dialog.id, dialog.className, aiControlContext(element), dialog.getAttribute('aria-labelledby')].join(' ');
    return /confirm|delete|remove|rollback|join|repair|migrate|apply|authority|host[_ -]?key|sudo/i.test(dialogIdentity);
  }

  function aiSelectOptionAvailable(option) {
    return !!option && !option.disabled && !option.hidden
      && !(option.parentElement && option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled);
  }

  function aiControlLabel(element) {
    var label = element.getAttribute('aria-label') || element.getAttribute('title') || '';
    if (!label && element.labels && element.labels.length) label = element.labels[0].textContent;
    if (!label && element.tagName === 'INPUT') {
      var buttonType = ['button', 'submit', 'reset'].indexOf(String(element.type || '').toLowerCase()) >= 0;
      label = (buttonType ? element.value : element.placeholder) || element.name || element.id || '';
    }
    if (!label && (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable)) {
      label = element.placeholder || element.name || element.id || element.tagName;
    }
    if (!label) label = element.textContent || element.name || element.id || element.tagName;
    return aiContextText(label, 160).replace(/\s+/g, ' ');
  }

  function aiControlContext(element) {
    var shell = element.closest('[role="dialog"],[aria-modal="true"],.modal.open,.visible');
    if (!shell || shell.id === 'pbgui-ai-drawer') return '';
    var heading = shell.querySelector('h1,h2,h3,[id$="-title"],.modal-title,.floating-preview-title');
    return aiContextText(heading ? heading.textContent : shell.id, 160).replace(/\s+/g, ' ');
  }

  function aiControlId(element) {
    var id = _aiControlIds.get(element);
    if (!id) {
      _aiControlSequence += 1;
      id = 'control_' + _aiControlSequence;
      _aiControlIds.set(element, id);
    }
    return id;
  }

  function aiControlDescriptor(element) {
    var tag = String(element.tagName || '').toLowerCase();
    var type = String(element.type || '').toLowerCase();
    var role = String(element.getAttribute('role') || '').toLowerCase();
    var style = window.getComputedStyle(element);
    var explicitAction = element.hasAttribute('onclick')
      || typeof element.onclick === 'function'
      || element.hasAttribute('data-action')
      || (style && style.cursor === 'pointer')
      || (Number.isInteger(element.tabIndex) && element.tabIndex >= 0 && !['input', 'select', 'textarea'].includes(tag));
    var operations = [];
    if (tag === 'button' || tag === 'a' || role === 'button' || explicitAction || ['button', 'submit', 'reset', 'checkbox', 'radio'].indexOf(type) >= 0) {
      operations.push('activate');
    }
    if (tag === 'select' || tag === 'textarea' || element.isContentEditable || (tag === 'input' && operations.indexOf('activate') < 0)) {
      operations.push('set_value');
    }
    if (!operations.length) return null;
    if (tag === 'a') {
      try {
        if (new URL(element.href, window.location.href).origin !== window.location.origin) return null;
      } catch (_) { return null; }
    }
    var label = aiControlLabel(element);
    if (!label || aiControlSensitive(element, label)) return null;
    var descriptor = {
      id: aiControlId(element),
      role: tag === 'input' ? (type || 'input') : (role || tag),
      label: label,
      operations: operations
    };
    var controlContext = aiControlContext(element);
    if (controlContext) descriptor.context = controlContext;
    descriptor.name = controlContext ? controlContext + ' :: ' + label : label;
    if (tag === 'select') {
      descriptor.options = Array.from(element.options).filter(aiSelectOptionAvailable).slice(0, 128).map(function (option) {
        return { value: aiContextText(option.value, 160), label: aiContextText(option.textContent, 160) };
      }).filter(function (option) { return !!option.label; });
    }
    return descriptor;
  }

  function collectAIControls() {
    _aiControlElements = {};
    var candidates = [];
    var selector = 'body *';
    Array.from(document.querySelectorAll(selector)).forEach(function (element, index) {
      if (!aiControlVisible(element)) return;
      var descriptor = aiControlDescriptor(element);
      if (!descriptor) return;
      candidates.push({ element: element, descriptor: descriptor, index: index, priority: descriptor.context ? 0 : 1 });
    });
    candidates.sort(function (left, right) { return left.priority - right.priority || left.index - right.index; });
    return candidates.slice(0, 2048).map(function (candidate) {
      _aiControlElements[candidate.descriptor.id] = { element: candidate.element, descriptor: candidate.descriptor };
      return candidate.descriptor;
    });
  }

  function resolveAIControl(controlId, operation) {
    collectAIControls();
    var entry = _aiControlElements[String(controlId || '')];
    if (!entry || entry.descriptor.operations.indexOf(operation) < 0) throw new Error('PBGui control is no longer available');
    return entry.element;
  }

  function resolveAIControlByName(controlName, operation) {
    var requested = String(controlName || '').trim().toLowerCase();
    if (!requested) throw new Error('PBGui control name is required');
    collectAIControls();
    var matches = Object.keys(_aiControlElements).map(function (id) {
      return _aiControlElements[id];
    }).filter(function (entry) {
      var descriptor = entry.descriptor;
      return descriptor.operations.indexOf(operation) >= 0
        && (descriptor.name.toLowerCase() === requested || descriptor.label.toLowerCase() === requested);
    });
    if (matches.length !== 1) throw new Error(matches.length ? 'PBGui control name is ambiguous' : 'PBGui control is not available');
    return matches[0].element;
  }

  registerPageAction({
    id: 'activate',
    entity_kind: 'ui_control',
    run: function(controlId) {
      resolveAIControl(controlId, 'activate').click();
    }
  });
  registerPageAction({
    id: 'activate_by_label',
    entity_kind: 'ui_control_label',
    run: function(controlName) {
      resolveAIControlByName(controlName, 'activate').click();
    }
  });
  registerPageAction({
    id: 'set_value_by_label',
    entity_kind: 'ui_control_label',
    run: function(controlName, entity, payload) {
      var element = resolveAIControlByName(controlName, 'set_value');
      var value = String((payload || {}).value == null ? '' : payload.value);
      if (element.tagName === 'SELECT' && !Array.from(element.options).some(function (option) {
        return option.value === value && aiSelectOptionAvailable(option);
      })) {
        throw new Error('PBGui select option is no longer available');
      }
      if (element.isContentEditable) element.textContent = value;
      else element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  function collectAIPages() {
    var seen = {};
    var pages = [];
    (NAV_GROUPS || []).forEach(function (group) {
      (group.items || []).forEach(function (item) {
        var key = String(item.page || '');
        if (!key || seen[key] || !FASTAPI_PAGES[key]) return;
        seen[key] = true;
        pages.push({ key: key, title: aiContextText(item.label, 128) });
      });
    });
    return pages;
  }
  registerPageAction({
    id: 'set_value',
    entity_kind: 'ui_control',
    run: function(controlId, entity, payload) {
      var element = resolveAIControl(controlId, 'set_value');
      var value = String((payload || {}).value == null ? '' : payload.value);
      if (element.tagName === 'SELECT' && !Array.from(element.options).some(function (option) {
        return option.value === value && aiSelectOptionAvailable(option);
      })) {
        throw new Error('PBGui select option is no longer available');
      }
      if (element.isContentEditable) element.textContent = value;
      else element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  function collectAIContext(options) {
    options = options || {};
    var c = cfg();
    var controls = options.include_controls === false ? [] : collectAIControls();
    var context = {
      schema_version: 1,
      page_key: String(c.current || '').slice(0, 128),
      title: String(c.subtitle || '').slice(0, 128),
      guide_topic: String(GUIDE_TOPICS[c.current] || '').slice(0, 128),
      pages: collectAIPages(),
      entities: [],
      actions: Object.keys(_aiPageActions).sort().slice(0, 16).map(function (key) {
        return { id: _aiPageActions[key].id, entity_kind: _aiPageActions[key].entity_kind };
      }),
      controls: controls
    };
    Object.keys(_aiContextProviders).sort().forEach(function (id) {
      try {
        var value = _aiContextProviders[id]();
        if (!value || typeof value !== 'object') return;
        if (value.section && !context.section) context.section = aiContextText(value.section, 128);
        if (Array.isArray(value.entities)) {
          value.entities.slice(0, 8).forEach(function (entity) {
            var projected = aiContextEntity(entity);
            if (projected) context.entities.push(projected);
          });
        }
        if (value.focused_field && !context.focused_field) context.focused_field = aiContextFocusedField(value.focused_field);
      } catch (_) {}
    });
    context.entities = context.entities.slice(0, 8);
    while (context.controls.length && JSON.stringify(context).length > 256 * 1024) context.controls.pop();
    return context;
  }

  window.PBGuiAI = window.PBGuiAI || {};
  window.PBGuiAI.registerPageContext = function (registration) {
    if (!registration || typeof registration.id !== 'string' || typeof registration.getContext !== 'function') return function () {};
    var id = registration.id.slice(0, 64);
    _aiContextProviders[id] = registration.getContext;
    return function () { delete _aiContextProviders[id]; };
  };
  window.PBGuiAI.registerPageAction = registerPageAction;
  window.PBGuiAI.continuePageAction = continuePageAction;
  window.PBGuiAI.collectContext = collectAIContext;
  window.PBGuiAI.focusedField = function (allowlist) {
    var active = document.activeElement;
    var descriptor = active && allowlist && allowlist[active.id];
    if (!descriptor || active.type === 'password') return null;
    return aiContextFocusedField({
      path: descriptor.path,
      label: descriptor.label,
      value: active.value,
      validation: descriptor.validation
    });
  };
  if (typeof window.PBGUI_AI_PAGE_CONTEXT === 'function') {
    window.PBGuiAI.registerPageContext({ id: 'productive-page', getContext: window.PBGUI_AI_PAGE_CONTEXT });
  }
  (Array.isArray(window.PBGUI_AI_PAGE_ACTIONS) ? window.PBGUI_AI_PAGE_ACTIONS : []).forEach(registerPageAction);
  window.addEventListener('pbgui:ai-ui-action', function (event) {
    var request = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
    if (request.type !== 'page.perform_action') return;
    var target = request.target && typeof request.target === 'object' ? request.target : {};
    var payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
    var entity = payload.entity && typeof payload.entity === 'object' ? payload.entity : {};
    if (String(target.page_key || '') !== String(cfg().current || '')) {
      var route = FASTAPI_PAGES[String(target.page_key || '')];
      if (route) continuePageAction(_getApiOrigin() + route);
      return;
    }
    var key = String(payload.action || '') + ':' + String(entity.kind || '');
    var registration = _aiPageActions[key];
    if (!registration) return;
    var context = collectAIContext();
    var exposed = entity.kind === 'ui_control'
      ? context.controls.some(function (control) {
          return control.id === entity.name && control.operations.indexOf(payload.action) >= 0;
        })
      : entity.kind === 'ui_control_label'
      ? context.controls.some(function (control) {
          var requiredOperation = payload.action === 'activate_by_label' ? 'activate' : 'set_value';
          return (control.name === entity.name || control.label === entity.name)
            && control.operations.indexOf(requiredOperation) >= 0;
        })
      : context.entities.some(function (item) {
          return item.kind === entity.kind && item.name === entity.name;
        });
    if (!exposed) return;
    try {
      var result = registration.run(entity.name, entity, payload);
      if (result === false) return;
      event.preventDefault();
      if (result && typeof result.catch === 'function') {
        result.catch(function (error) { console.error('PBGui page action failed:', error); });
      }
    } catch (error) {
      event.preventDefault();
      console.error('PBGui page action failed:', error);
    }
  });

  function executeLocalPageAction(actionId, entity) {
    var registration = _aiPageActions[actionId + ':' + entity.kind];
    if (!registration) return false;
    return registration.run(entity.name, entity, { action: actionId, entity: entity }) !== false;
  }

  function tryLocalCommand(message) {
    var text = String(message || '').trim().toLowerCase();
    if (!text) return { handled: false };
    var context = collectAIContext();
    var logIntent = /\blog(?:fenster| window| panel)?\b/.test(text);
    var showIntent = /anzeigen|zeigen|oeffnen|öffnen|aufmachen|\bopen\b|\bshow\b/.test(text);
    if (logIntent && showIntent) {
      var logKinds = context.actions.filter(function (action) { return action.id === 'show_log'; }).map(function (action) { return action.entity_kind; });
      var logEntities = context.entities.filter(function (entity) { return logKinds.indexOf(entity.kind) >= 0; });
      if (logEntities.length === 1 && executeLocalPageAction('show_log', logEntities[0])) {
        return { handled: true, message: 'PBGui opened the requested log.' };
      }
    }
    var closeIntent = /schlie(?:ss|ß)en|schliess|schließ|zumachen|\bclose\b|\bhide\b/.test(text);
    if (closeIntent) {
      var closeControls = context.controls.filter(function (control) {
        if (control.operations.indexOf('activate') < 0) return false;
        var label = control.label.toLowerCase();
        return /close|schlie|×|✕|^x$/.test(label);
      });
      if (logIntent) {
        var logCloseControls = closeControls.filter(function (control) {
          return /log/.test((control.context || '').toLowerCase() + ' ' + control.label.toLowerCase());
        });
        if (logCloseControls.length) closeControls = logCloseControls;
      }
      if (closeControls.length === 1 && executeLocalPageAction('activate', { kind: 'ui_control', name: closeControls[0].id })) {
        return { handled: true, message: 'PBGui closed the requested window.' };
      }
    }
    var clickMatch = text.match(/^(?:bitte\s+)?(?:klick(?:e)?|click|drueck(?:e)?|drück(?:e)?|press)\s+(?:auf\s+)?(.+?)\s*[.!]?$/);
    if (clickMatch) {
      var requested = clickMatch[1].trim();
      if (/delete|remove|loesch|lösch|start|stop|restart|save|speicher|apply|approve|reject|confirm|bestaetig|bestätig|submit|queue|deploy|update|install|execute|panic|kill|clear finished|\brun\b/.test(requested)) {
        return { handled: false };
      }
      var controls = context.controls.filter(function (control) {
        return control.operations.indexOf('activate') >= 0 && control.label.toLowerCase() === requested;
      });
      if (controls.length === 1 && executeLocalPageAction('activate', { kind: 'ui_control', name: controls[0].id })) {
        return { handled: true, message: 'PBGui activated ' + controls[0].label + '.' };
      }
    }
    return { handled: false };
  }
  window.PBGuiAI.tryLocalCommand = tryLocalCommand;

  /* ── config (read at runtime so global vars are already set) ── */
  function cfg() {
    var c = window.PBGUI_NAV_CONFIG || {};
    return {
      token:    c.token    !== undefined ? c.token    : (window.TOKEN    || ''),
      authenticated: c.authenticated === true,
      apiBase:  c.apiBase  !== undefined ? c.apiBase  : (window.API_BASE || ''),
      version:  c.version  !== undefined ? c.version  : (window.PBGUI_VERSION || ''),
      serial:   c.serial   !== undefined ? c.serial   : (window.PBGUI_SERIAL  || ''),
      masterName: c.masterName !== undefined ? c.masterName : (window.PBGUI_MASTER_NAME || ''),
      subtitle: c.subtitle || 'PBGui',
      current:  c.current  || ''
    };
  }

  /* ── i18n helper: translate through PBGuiI18n when present, otherwise keep
     the English fallback (also used while dictionaries are being extended) ── */
  function navT(key, fallback, params) {
    var i18n = window.PBGuiI18n;
    if (i18n && typeof i18n.t === 'function') {
      var v = i18n.t(key, params);
      if (v !== key) return v;
    }
    var out = String(fallback);
    if (params) {
      out = out.replace(/\{(\w+)\}/g, function (m, name) {
        return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;
      });
    }
    return out;
  }

  function authOptions(token, options) {
    var opts = Object.assign({}, options || {});
    var headers = Object.assign({}, opts.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    opts.headers = headers;
    return opts;
  }

  /* ════════════════════════════════════
     NAV STRUCTURE
     ════════════════════════════════════ */
  var NAV_GROUPS = [
    { id: 'system', label: 'System', items: [
      { page: '/',                    icon: 'house',            label: 'Welcome'           },
      { page: 'system_api_keys',      icon: 'key',              label: 'API-Keys'          },
      { page: 'system_cluster',       icon: 'arrows-clockwise', label: 'Cluster Sync'      },
      { page: 'system_services',      icon: 'wrench',           label: 'PBGUI Services'    },
      { page: 'system_db_tools',      icon: 'database',         label: 'DB Tools'          },
      { page: 'system_vps_manager_fastapi', icon: 'desktop',    label: 'VPS Manager'       },
      { page: 'system_vps_monitor',   icon: 'chart-bar',        label: 'VPS Monitor'       },
      { page: 'system_logging',       icon: 'file-text',        label: 'Logging'           }
    ]},
    { id: 'information', label: 'Information', items: [
      { page: 'dashboards',           icon: 'chart-bar', label: 'Dashboards'          },
      { page: 'info_coin_data',       icon: 'database',  label: 'Coin Data'           },
      { page: 'info_market_data_fastapi', icon: 'desktop', label: 'Market Data'       },
      { page: 'info_balance_calc',    icon: 'wallet',     label: 'Balance Calculator' },
      { page: 'info_ai_chat',         icon: 'sparkle',    label: 'AI Chat'             },
      { page: 'help',                 icon: 'file-text',  label: 'Help'                }
    ]},
    { id: 'pbv7', label: 'PBv7', items: [
      { page: 'v7_run',               icon: 'play',      label: 'Run'               },
      { page: 'v7_backtest',          icon: 'backspace', label: 'Backtest'          },
      { page: 'v7_optimize',          icon: 'gear',      label: 'Optimize'          },
      { page: 'v7_strategy_explorer', icon: 'eye',       label: 'Strategy Explorer' },
      { page: 'v7_pareto_explorer',   icon: 'target',    label: 'Pareto Explorer'   }
    ]},
    { id: 'pbv8', label: 'PBv8', items: [
      { page: 'v8_run',               icon: 'play',      label: 'Run'               },
      { page: 'v8_backtest',          icon: 'backspace', label: 'Backtest'          },
      { page: 'v8_optimize',          icon: 'gear',      label: 'Optimize'          },
      { page: 'v8_strategy_explorer', icon: 'eye',       label: 'Strategy Explorer' },
      { page: 'v8_pareto_explorer',   icon: 'star',      label: 'Pareto Explorer'   }
    ]}
  ];

  /* ════════════════════════════════════
     CSS (injected into <head>)
     ════════════════════════════════════ */
  var NAV_CSS = [
    'html,body{height:100%;}',
    'body{padding:0!important;}',

    '#topnav{display:flex;align-items:center;height:52px;background:var(--surface-sidebar,#10141d);',
    'border-bottom:1px solid var(--border-subtle,#262f45);flex-shrink:0;position:relative;z-index:var(--z-navigation,200);',
    'padding:0 0.5rem;gap:0.25rem;user-select:none;}',

    '#nav-logo{display:flex;align-items:center;padding:0 0.75rem 0 0.25rem;',
    'flex-shrink:0;cursor:pointer;text-decoration:none;border-right:1px solid var(--border-subtle,#262f45);',
    'margin-right:0.25rem;height:100%;}',

    '.nav-group{position:relative;height:100%;display:flex;align-items:center;}',

    'button.nav-group-btn{display:flex;align-items:center;gap:0.3rem;padding:0.3rem 0.7rem;',
    'height:100%;background:transparent;border:none;border-radius:0;color:var(--text-secondary,#a3adc2);font-size:var(--fs-base,14px);',
    'font-weight:500;cursor:pointer;border-bottom:2px solid transparent;',
    'transition:color var(--motion-fast,.12s),border-color var(--motion-fast,.12s),background-color var(--motion-fast,.12s);white-space:nowrap;}',
    'button.nav-group-btn:hover:not(:disabled){color:var(--text-primary,#e8ecf4);background:rgba(255,255,255,.04);transform:none;}',
    '.nav-group-btn.active{color:var(--accent-soft,#96b9f4);border-bottom-color:var(--accent-soft,#96b9f4);}',
    '.nav-group-btn.disabled{opacity:.45;cursor:not-allowed;}',
    '.nav-group-btn.disabled:hover{color:var(--text-secondary,#a3adc2);background:transparent;border-bottom-color:transparent;}',

    '.nav-arrow{font-size:0.58rem;opacity:0.6;transition:transform .15s;}',
    '.nav-group.open .nav-arrow{transform:rotate(180deg);}',

    '.nav-dropdown{display:none;position:absolute;top:calc(100% + 1px);left:0;',
    'min-width:190px;background:var(--surface-card,#171c29);border:1px solid var(--border-default,#333f5c);',
    'border-radius:0 0 8px 8px;box-shadow:0 8px 24px rgba(8, 6, 10,.5);',
    'flex-direction:column;padding:0.3rem 0;z-index:var(--z-dropdown,300);}',
    '.nav-group.open .nav-dropdown{display:flex;}',
    'body.pbgui-help-open #topnav{z-index:3200;}',
    'body.pbgui-help-open #topnav .nav-group.open{z-index:3300;}',
    'body.pbgui-help-open #topnav .nav-dropdown{z-index:3301;}',

    '.nav-item{display:flex;align-items:center;gap:0.55rem;padding:0.42rem 1rem;',
    'color:var(--text-secondary,#a3adc2);font-size:var(--fs-base,14px);text-decoration:none;cursor:pointer;',
    'transition:background-color var(--motion-fast,.12s),color var(--motion-fast,.12s);white-space:nowrap;}',
    '.nav-item:hover{background:var(--surface-elevated,#232b3d);color:var(--text-primary,#e8ecf4);}',
    '.nav-item.current{color:var(--accent-soft,#96b9f4);font-weight:600;background:rgb(var(--accent-soft-rgb,150 185 244) / .07);cursor:default;}',
    '.nav-item-icon{display:inline-flex;align-items:center;justify-content:center;width:1.1rem;flex-shrink:0;opacity:.8;}',
    '.nav-item-icon svg{width:15px;height:15px;display:block;stroke:currentColor;}',
    '.nav-item:hover .nav-item-icon,.nav-item.current .nav-item-icon{opacity:1;}',

    '#nav-spacer{flex:1;}',

    '#nav-right{display:flex;align-items:center;gap:0.25rem;padding-right:0.5rem;}',
    '.nav-divider{width:1px;height:18px;background:var(--border-subtle,#262f45);margin:0 0.15rem;}',
    '#pbgui-master-pill{display:none;align-items:center;gap:0.35rem;max-width:240px;height:30px;',
    'padding:0 0.65rem;border:1px solid rgb(var(--accent-soft-rgb,150 185 244) / .22);border-radius:999px;',
    'background:rgb(var(--accent-soft-rgb,150 185 244) / .06);color:var(--text-primary,#e8ecf4);font-size:var(--fs-sm);white-space:nowrap;}',
    '#pbgui-master-pill.visible{display:inline-flex;}',
    '.pbgui-master-label{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted,#717b8e);}',
    '#pbgui-master-name{overflow:hidden;text-overflow:ellipsis;color:var(--text-primary,#e8ecf4);font-weight:600;}',
    '#pbgui-auth-mode-pill{display:none;align-items:center;height:30px;padding:0 .65rem;border-radius:999px;',
    'border:1px solid rgb(var(--danger-soft-rgb,238 141 132) / .5);background:rgb(var(--danger-deep-rgb,168 58 53) / .38);color:var(--danger-soft,#ee8d84);',
    'font-size:var(--fs-xs);font-weight:800;letter-spacing:.05em;white-space:nowrap;}',
    '#pbgui-auth-mode-pill.visible{display:inline-flex;}',
    '@media(max-width:920px){#pbgui-master-pill{display:none!important;}}',
    '@media(max-width:760px){#topnav{overflow-x:auto;overflow-y:hidden;}#nav-logo{width:42px;padding-right:5px;overflow:hidden;}#nav-spacer{display:none;}button.nav-group-btn{padding:.3rem .55rem;font-size:var(--fs-sm,13px);justify-content:center;}#nav-right{padding-right:0;gap:2px;flex-shrink:0;}#nav-right .nav-divider{display:none!important;}.nav-action-btn{min-height:40px;padding:0 .5rem;font-size:var(--fs-xs,11px);}.nav-action-btn.icon-only{width:40px;min-width:40px;}.nav-dropdown{position:fixed;top:53px;left:8px;right:8px;min-width:0;max-height:calc(100vh - 61px);overflow-y:auto;}}',
    '.nav-action-btn{display:flex;align-items:center;gap:0.35rem;padding:0.3rem 0.75rem;',
    'border-radius:6px;background:transparent;border:1px solid transparent;',
    'color:var(--text-muted,#717b8e);font-size:var(--fs-sm,13px);font-weight:500;cursor:pointer;',
    'transition:background-color var(--motion-fast,.12s),border-color var(--motion-fast,.12s),color var(--motion-fast,.12s);white-space:nowrap;height:32px;}',
    '.nav-action-btn:hover{background:rgba(255,255,255,.05);border-color:var(--border-default,#333f5c);color:var(--text-primary,#e8ecf4);}',
    '.nav-action-btn:focus-visible,.nav-group-btn:focus-visible,.nav-item:focus-visible{outline:2px solid var(--accent-soft,#96b9f4);outline-offset:2px;}',
    '.nav-action-btn.icon-only{justify-content:center;gap:0;padding:0;width:32px;min-width:32px;}',
    '.nav-action-btn svg{width:16px;height:16px;display:block;stroke:currentColor;flex-shrink:0;}',
    '.nav-action-btn.accent{color:var(--accent-soft,#96b9f4);border-color:rgb(var(--accent-soft-rgb,150 185 244) / .25);background:rgb(var(--accent-soft-rgb,150 185 244) / .04);}',
    '.nav-action-btn.accent:hover{background:rgb(var(--accent-soft-rgb,150 185 244) / .12);border-color:var(--accent-soft,#96b9f4);}',
    '.nav-action-btn.restart{color:var(--warning,#e0a458);border-color:rgb(var(--warning-rgb,224 164 88) / .3);background:rgb(var(--warning-rgb,224 164 88) / .06);display:none;}',
    '.nav-action-btn.restart:hover{background:rgb(var(--warning-rgb,224 164 88) / .15);border-color:var(--warning,#e0a458);}',
    '.nav-restart-dot{display:inline-block;width:7px;height:7px;border-radius:50%;',
    'background:var(--warning,#e0a458);margin-right:2px;animation:nav-blink 1.4s ease-in-out infinite;}',
    '@keyframes nav-blink{0%,100%{opacity:1;}50%{opacity:.3;}}',
    '.nav-action-btn.notify{color:var(--text-muted,#717b8e);}',
    '.nav-action-btn.notify:hover{color:var(--text-primary,#e8ecf4);}',
    '.nav-action-btn.alerts{color:var(--warning,#e0a458);border-color:rgb(var(--warning-rgb,224 164 88) / .24);background:rgb(var(--warning-rgb,224 164 88) / .05);display:inline-flex;}',
    '.nav-action-btn.alerts:hover{color:var(--warning-soft,#eec27e);border-color:rgb(var(--warning-rgb,224 164 88) / .45);background:rgb(var(--warning-rgb,224 164 88) / .12);}',
    '.nav-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 0.35rem;border-radius:999px;font-size:10px;font-weight:700;line-height:1;background:var(--bg-elevated,#232b3d);color:var(--text-primary,#e8ecf4);}',
    '.nav-badge.has-new{background:var(--danger-deep,#b91c1c);color:#f2f5fb;}',
    '.nav-action-btn.logout{color:var(--text-secondary,#a3adc2);}',
    '.nav-action-btn.logout:hover{color:var(--text-primary,#e8ecf4);}',

    /* notification log panel */
    '#pbgui-notify-panel{position:fixed;bottom:0;right:0;width:50%;height:40vh;min-width:240px;min-height:150px;',
    'background:var(--bg-panel,#171c29);border:1px solid var(--border-default,#333f5c);border-bottom:none;',
    'z-index:2500;display:none;flex-direction:column;overflow:hidden;border-radius:10px 10px 0 0;',
    'box-shadow:0 -12px 40px rgba(8, 6, 10,.45);}',
    '#pbgui-notify-panel.visible{display:flex;}',
    '#pbgui-notify-hdr{display:flex;align-items:center;justify-content:space-between;',
    'padding:6px 12px;background:var(--bg-elevated,#232b3d);border-bottom:1px solid var(--border-default,#333f5c);',
    'flex-shrink:0;cursor:move;user-select:none;}',
    '#pbgui-notify-title{font-size:var(--fs-sm,0.82rem);font-weight:600;color:var(--text-primary,#e8ecf4);}',
    '#pbgui-notify-close{background:none;border:none;color:var(--text-muted,#717b8e);cursor:pointer;font-size:var(--fs-lg,1.15rem);}',
    '#pbgui-notify-close:hover{color:var(--text-primary,#e8ecf4);}',
    '#pbgui-notify-target{flex:1;min-height:0;overflow:hidden;}',
    '#pbgui-alert-ovl{display:none;position:fixed;inset:0;background:var(--bg-backdrop,rgba(6, 5, 8,.72));z-index:3060;backdrop-filter:blur(2px);}',
    '#pbgui-alert-ovl.visible{display:flex;}',
    '#pbgui-alert-box{position:absolute;background:var(--bg-panel,#171c29);border:1px solid var(--border-default,#333f5c);border-radius:14px;box-shadow:0 20px 70px rgba(8, 6, 10,.9);overflow:hidden;width:min(880px,94vw);max-width:94vw;height:min(640px,78vh);max-height:90vh;min-width:320px;min-height:220px;display:flex;flex-direction:column;}',
    '#pbgui-alert-body{display:flex;flex-direction:column;gap:0.8rem;padding:1rem 1.1rem 1.1rem;min-height:0;}',
    '#pbgui-alert-toolbar{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;}',
    '#pbgui-alert-summary{font-size:var(--fs-sm);color:var(--text-secondary,#a3adc2);}',
    '#pbgui-alert-list{display:flex;flex-direction:column;gap:0.65rem;overflow:auto;min-height:0;padding-right:0.2rem;}',
    '.pbgui-alert-section-sep{height:1px;background:var(--border-subtle,#262f45);margin:0.35rem 0 0.2rem;}',
    '.pbgui-alert-history-title{font-size:var(--fs-xs);letter-spacing:0.05em;text-transform:uppercase;color:var(--text-muted,#717b8e);margin-top:0.2rem;}',
    '.pbgui-alert-item{border:1px solid var(--border-default,#333f5c);border-radius:10px;background:var(--bg-page,#0c1018);padding:0.8rem 0.9rem;display:grid;gap:0.45rem;}',
    '.pbgui-alert-item.new{border-color:rgb(var(--danger-rgb,229 97 92) / .45);}',
    '.pbgui-alert-item.history{background:var(--bg-page,#0c1018);border-color:var(--border-subtle,#262f45);}',
    '.pbgui-alert-head{display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem;}',
    '.pbgui-alert-title{font-size:var(--fs-base);font-weight:600;color:var(--text-primary,#e8ecf4);}',
    '.pbgui-alert-meta{display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;font-size:var(--fs-xs);color:var(--text-muted,#717b8e);}',
    '.pbgui-alert-pill{display:inline-flex;align-items:center;justify-content:center;padding:0.18rem 0.45rem;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;}',
    '.pbgui-alert-pill.new{background:rgb(var(--danger-rgb,229 97 92) / .18);color:var(--danger-soft,#ee8d84);}',
    '.pbgui-alert-pill.ack{background:rgb(var(--accent-soft-rgb,150 185 244) / .15);color:var(--accent-soft,#96b9f4);}',
    '.pbgui-alert-pill.kind{background:rgb(var(--text-secondary-rgb,148 163 184) / .12);color:var(--text-primary,#e8ecf4);}',
    '.pbgui-alert-details{font-size:var(--fs-sm);line-height:1.45;color:var(--text-secondary,#a3adc2);}',
    '.pbgui-alert-actions{display:flex;align-items:center;justify-content:flex-end;gap:0.5rem;}',
    '.pbgui-alert-empty{padding:1rem 0.2rem;color:var(--text-muted,#717b8e);font-size:var(--fs-sm);text-align:center;}',
    '.pbgui-alert-link{display:inline-flex;align-items:center;justify-content:center;height:var(--btn-h);padding:0 var(--sp-md);border-radius:8px;border:1px solid rgb(var(--accent-soft-rgb,150 185 244) / .25);font-size:var(--fs-base);font-weight:600;color:var(--text-primary,#e8ecf4);background:rgb(var(--accent-soft-rgb,150 185 244) / .08);cursor:pointer;transition:background .15s,border-color .15s,color .15s;text-decoration:none;}',
    '.pbgui-alert-link:hover{background:rgb(var(--accent-soft-rgb,150 185 244) / .16);border-color:var(--accent-soft,#96b9f4);}',
    '.pnr{position:absolute;z-index:2;}',
    '.pnr-n{top:-4px;left:6px;right:6px;height:8px;cursor:n-resize;}',
    '.pnr-s{bottom:-4px;left:6px;right:6px;height:8px;cursor:s-resize;}',
    '.pnr-w{left:-4px;top:6px;bottom:6px;width:8px;cursor:w-resize;}',
    '.pnr-e{right:-4px;top:6px;bottom:6px;width:8px;cursor:e-resize;}',
    '.pnr-nw{top:-4px;left:-4px;width:12px;height:12px;cursor:nw-resize;}',
    '.pnr-ne{top:-4px;right:-4px;width:12px;height:12px;cursor:ne-resize;}',
    '.pnr-sw{bottom:-4px;left:-4px;width:12px;height:12px;cursor:sw-resize;}',
    '.pnr-se{bottom:-4px;right:-4px;width:12px;height:12px;cursor:se-resize;}',

    /* about overlay */
    '#pbgui-about-ovl{display:none;position:fixed;inset:0;',
    'background:var(--bg-backdrop,rgba(6, 5, 8,.72));z-index:3000;align-items:center;justify-content:center;',
    'backdrop-filter:blur(2px);}',
    '#pbgui-about-ovl.visible{display:flex;}',
    '#pbgui-about-box{background:var(--bg-panel,#171c29);border:1px solid var(--border-default,#333f5c);border-radius:14px;',
    'box-shadow:0 20px 70px rgba(8, 6, 10,.9);overflow:hidden;width:min(440px,92vw);}',
    '.pbgui-ovl-header{display:flex;align-items:center;justify-content:space-between;',
    'padding:0.85rem 1.1rem;border-bottom:1px solid var(--border-subtle,#262f45);background:var(--surface-sidebar,#10141d);}',
    '.pbgui-ovl-title{font-size:var(--fs-md);font-weight:700;color:var(--text-primary,#e8ecf4);',
    'display:inline-flex;align-items:center;gap:0.45rem;}',
    '.pbgui-ovl-title svg{width:16px;height:16px;display:block;stroke:currentColor;flex-shrink:0;}',
    '.pbgui-ovl-close{background:transparent;border:none;color:var(--text-muted,#717b8e);font-size:var(--fs-lg);',
    'cursor:pointer;padding:0.2rem 0.35rem;border-radius:5px;line-height:1;',
    'transition:color .12s,background .12s;}',
    '.pbgui-ovl-close:hover{color:var(--text-primary,#e8ecf4);background:rgba(255,255,255,.06);}',
    '#pbgui-about-body{padding:2rem 2rem 1.5rem;text-align:center;}',
    '#pbgui-about-ver{font-size:var(--fs-xl);font-weight:800;color:var(--text-primary,#e8ecf4);margin-bottom:0.2rem;}',
    '#pbgui-about-serial{font-size:var(--fs-xs);color:var(--text-muted,#717b8e);margin-bottom:0.25rem;}',
    '#pbgui-about-tag{font-size:var(--fs-sm);color:var(--text-muted,#717b8e);letter-spacing:.06em;',
    'text-transform:uppercase;margin-bottom:1.5rem;}',
    '.pbgui-about-divider{width:100%;height:1px;',
    'background:linear-gradient(90deg,transparent,var(--border-default,#333f5c),transparent);margin:0 0 1.3rem;}',
    '.pbgui-about-links{display:flex;flex-direction:column;gap:0.6rem;margin-bottom:1.3rem;}',
    '.pbgui-about-link{display:flex;align-items:center;justify-content:center;gap:0.55rem;',
    'padding:0.55rem 1.2rem;border-radius:8px;text-decoration:none;font-size:var(--fs-sm);',
    'font-weight:600;transition:background-color var(--motion-fast,.12s),border-color var(--motion-fast,.12s),color var(--motion-fast,.12s);}',
    '.pbgui-about-link.kofi{background:rgba(255,94,20,.1);border:1px solid rgba(255,94,20,.35);color:#ff6a30;}',
    '.pbgui-about-link.kofi:hover{background:rgba(255,94,20,.2);border-color:#ff6a30;}',
    '.pbgui-about-link.github{background:rgb(var(--accent-soft-rgb,150 185 244) / .07);border:1px solid rgb(var(--accent-soft-rgb,150 185 244) / .25);color:var(--accent-soft,#96b9f4);}',
    '.pbgui-about-link.github:hover{background:rgb(var(--accent-soft-rgb,150 185 244) / .15);border-color:var(--accent-soft,#96b9f4);}',
    '.pbgui-about-link.readme{background:rgb(var(--success-rgb,70 200 143) / .07);border:1px solid rgb(var(--success-rgb,70 200 143) / .25);color:var(--success,#46c88f);}',
    '.pbgui-about-link.readme:hover{background:rgb(var(--success-rgb,70 200 143) / .15);border-color:var(--success,#46c88f);}',
    '#pbgui-about-footer{padding:0.75rem 2rem;border-top:1px solid var(--border-subtle,#262f45);',
    'text-align:center;font-size:var(--fs-xs);color:var(--text-disabled,#4d5c82);background:var(--bg-page,#0c1018);}',

    /* shared confirm overlay */
    '#pbgui-confirm-ovl{display:none;position:fixed;inset:0;background:var(--bg-backdrop,rgba(6, 5, 8,.72));',
    'z-index:7000;align-items:center;justify-content:center;backdrop-filter:blur(2px);}',
    '#pbgui-confirm-ovl.visible{display:flex;}',
    '#pbgui-confirm-box{background:var(--bg-panel,#171c29);border:1px solid var(--border-default,#333f5c);border-radius:14px;',
    'box-shadow:0 20px 70px rgba(8, 6, 10,.9);overflow:hidden;width:min(460px,92vw);}',
    '#pbgui-confirm-body{display:grid;gap:var(--sp-md);padding:var(--sp-lg);}',
    '#pbgui-confirm-msg{font-size:var(--fs-base);line-height:1.5;color:var(--text-primary,#e8ecf4);}',
    '#pbgui-confirm-detail{font-size:var(--fs-sm);line-height:1.45;color:var(--text-secondary,#a3adc2);}',
    '#pbgui-confirm-actions{display:flex;justify-content:flex-end;gap:var(--sp-sm);flex-wrap:wrap;}',
    '.pbgui-modal-btn{display:inline-flex;align-items:center;justify-content:center;height:var(--btn-h);',
    'padding:0 var(--sp-md);border-radius:8px;border:1px solid transparent;font-size:var(--fs-base);',
    'font-weight:600;cursor:pointer;transition:background .15s,border-color .15s,color .15s;}',
    '.pbgui-modal-btn.secondary{background:rgb(var(--accent-soft-rgb,150 185 244) / .08);border-color:rgb(var(--accent-soft-rgb,150 185 244) / .25);color:var(--text-primary,#e8ecf4);}',
    '.pbgui-modal-btn.secondary:hover{background:rgb(var(--accent-soft-rgb,150 185 244) / .16);border-color:var(--accent-soft,#96b9f4);}',
    '.pbgui-modal-btn.primary{background:var(--accent,#72a0ee);border-color:var(--accent,#72a0ee);color:var(--accent-contrast,#0a1220);}',
    '.pbgui-modal-btn.primary:hover{background:var(--accent-soft,#96b9f4);border-color:var(--accent-soft,#96b9f4);}',

    /* shared help overlay chrome */
    '#help-ovl.is-maximized{max-width:none;max-height:none;resize:none;}',
    '#help-ovl.is-maximized #help-drag-handle{cursor:default;pointer-events:none;}',
    '.ovl-tool{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;',
    'background:transparent;border:1px solid transparent;border-radius:4px;color:var(--text-muted,#717b8e);',
    'cursor:pointer;font-size:var(--fs-md);line-height:1;padding:0;transition:color .12s,background .12s,border-color .12s;}',
    '.ovl-tool[aria-pressed="true"]{color:var(--text-primary,#e8ecf4);border-color:rgb(var(--text-secondary-rgb,148 163 184) / .2);background:rgba(255,255,255,.06);}',
    '.ovl-tool:hover{color:var(--text-primary,#e8ecf4);border-color:rgb(var(--text-secondary-rgb,148 163 184) / .18);background:rgba(255,255,255,.06);}',

    /* page content wrapper — used when page wraps its content in #page-content */
    '#page-content{height:calc(100vh - 52px);overflow-y:auto;padding:20px;}'
  ].join('');

  /* ════════════════════════════════════
     BUILD
     ════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('pbgui-nav-css')) return;
    var s = document.createElement('style');
    s.id  = 'pbgui-nav-css';
    s.textContent = NAV_CSS;
    document.head.appendChild(s);
  }

  function buildNav() {
    var nav = document.getElementById('topnav');
    if (!nav) return;
    var c = cfg();
    var CURRENT = c.current;
    var navGroups = NAV_GROUPS.map(function (group) {
      return {
        id: group.id,
        label: group.label,
        items: group.items.slice()
      };
    });

    /* find which group contains the current page */
    var activeGroup = '';
    navGroups.forEach(function (g) {
      g.items.forEach(function (item) {
        if (item.page === CURRENT) activeGroup = g.id;
      });
    });

    var html = '';

    /* logo */
    html += '<a id="nav-logo" href="#" title="PBGui">'
          + '<svg width="112" height="36" viewBox="0 0 112 36" xmlns="http://www.w3.org/2000/svg">'
          + '<rect x="1" y="1" width="34" height="34" rx="7" style="fill:var(--bg-elevated,#2b2b2b);stroke:var(--accent-deep,#4fa8d3)" stroke-width="1.5"/>'
          + '<rect x="7" y="21" width="5" height="9" rx="1.5" style="fill:var(--accent-soft,#b6e1f7)"/>'
          + '<rect x="14.5" y="15" width="5" height="15" rx="1.5" style="fill:var(--accent,#8fcff2)"/>'
          + '<rect x="22" y="9" width="5" height="21" rx="1.5" style="fill:var(--accent-deep,#4fa8d3)"/>'
          + '<text x="42" y="15" style="font-family:var(--font-family,system-ui,sans-serif);fill:var(--text-primary,#f0f0f0)" font-size="13" font-weight="700" letter-spacing="0.3">PBGui</text>'
          + '<text x="42" y="28" style="font-family:var(--font-family,system-ui,sans-serif);fill:var(--accent,#8fcff2)" font-size="7.5" font-weight="400" letter-spacing="1.2">' + esc(window.PBGuiI18n ? PBGuiI18n.serverMsg(c.subtitle) : c.subtitle) + '</text>'
          + '</svg></a>';

    /* groups */
    navGroups.forEach(function (group) {
      var isActive = (group.id === activeGroup);
      html += '<div class="nav-group">';
      html += '<button class="nav-group-btn' + (isActive ? ' active' : '') + '" data-group="' + group.id + '"'
           + ' aria-expanded="false" aria-controls="nav-dropdown-' + group.id + '">';
      html += esc(navT('nav.' + group.id, group.label)) + ' <span class="nav-arrow">&#9660;</span></button>';
      html += '<div class="nav-dropdown" id="nav-dropdown-' + group.id + '" role="menu">';
      group.items.forEach(function (item) {
        var isCurrent = (item.page === CURRENT);
        var itemLabel = esc(navT('nav.page.' + item.page, item.label));
        var itemIcon = window.PBGuiIcons.create(item.icon, { size: 18 });
        if (isCurrent) {
          html += '<span class="nav-item current" role="menuitem" aria-current="page"><span class="nav-item-icon">' + itemIcon + '</span>' + itemLabel + '</span>';
        } else {
          html += '<a class="nav-item" role="menuitem" data-page="' + item.page + '"><span class="nav-item-icon">' + itemIcon + '</span>' + itemLabel + '</a>';
        }
      });
      html += '</div></div>';
    });

    /* spacer + right buttons */
    var notificationIcon = window.PBGuiIcons.create('bell', { size: 16 });
    var alertsIcon = window.PBGuiIcons.create('shield-warning', { size: 16 });
    var aiIcon = window.PBGuiIcons.create('sparkle', { size: 16 });
    var guideIcon = window.PBGuiIcons.create('book-open', { size: 16 });
    var aboutIcon = window.PBGuiIcons.create('info', { size: 16 });
    var logoutIcon = window.PBGuiIcons.create('sign-out', { size: 16 });
    html += '<div id="nav-spacer"></div>';
    html += '<div id="nav-right">'
          + '<span id="pbgui-auth-mode-pill" role="status">' + esc(navT('nav.no_login', 'NO LOGIN')) + '</span>'
          + '<span id="pbgui-master-pill"><span class="pbgui-master-label">' + esc(navT('nav.master', 'Master')) + '</span><span id="pbgui-master-name"></span></span>'
          + '<button class="nav-action-btn restart" id="pbgui-restart-btn"><span class="nav-restart-dot"></span>' + esc(navT('nav.restart', 'Restart')) + '</button>'
          + '<button class="nav-action-btn notify" id="pbgui-notify-btn" title="' + esc(navT('nav.notification_log', 'Notification log')) + '" aria-label="' + esc(navT('nav.notification_log', 'Notification log')) + '">' + notificationIcon + '</button>'
          + '<span class="nav-divider" aria-hidden="true"></span>'
          + '<button class="nav-action-btn alerts" id="pbgui-alert-btn" title="' + esc(navT('nav.vpsmonitor_alerts', 'VPSMonitor alerts')) + '" aria-label="' + esc(navT('nav.vpsmonitor_alerts', 'VPSMonitor alerts')) + '">' + alertsIcon + ' <span class="nav-badge" id="pbgui-alert-badge">0/0</span></button>'
          + '<button class="nav-action-btn accent" id="pbgui-ai-btn" title="' + esc(navT('nav.open_ai_assistant', 'Open AI assistant')) + '" aria-label="' + esc(navT('nav.open_ai_assistant', 'Open AI assistant')) + '" aria-expanded="false" aria-controls="pbgui-ai-drawer" style="display:none">' + aiIcon + ' ' + esc(navT('nav.ai', 'AI')) + '</button>'
          + '<button class="nav-action-btn" id="pbgui-lang-btn" title="' + esc(navT('nav.switch_language', 'Switch language')) + '">' + ((window.PBGuiI18n && window.PBGuiI18n.lang === 'zh') ? 'English' : '中文') + '</button>'
          + '<button class="nav-action-btn accent" id="pbgui-guide-btn">' + guideIcon + ' ' + esc(navT('nav.guide', 'Guide')) + '</button>'
          + '<button class="nav-action-btn" id="pbgui-about-btn">' + aboutIcon + ' ' + esc(navT('nav.about', 'About')) + '</button>'
          + '<button class="nav-action-btn icon-only logout" id="pbgui-logout-btn" title="' + esc(navT('nav.logout', 'Logout')) + '" aria-label="' + esc(navT('nav.logout', 'Logout')) + '">'
          +   logoutIcon
          + '</button>'
          + '</div>';

    nav.innerHTML = html;
    updateMasterName(c.masterName);
  }

  function updateMasterName(name) {
    var pill = document.getElementById('pbgui-master-pill');
    var value = document.getElementById('pbgui-master-name');
    if (!pill || !value) return;
    var masterName = String(name || '').trim();
    if (!masterName) {
      value.textContent = '';
      pill.title = '';
      pill.classList.remove('visible');
      return;
    }
    value.textContent = masterName;
    pill.title = navT('nav.master_of', 'Master: {name}', { name: masterName });
    pill.classList.add('visible');
  }

  /* ════════════════════════════════════
     NOTIFICATION LOG PANEL
     ════════════════════════════════════ */
  var _notifyViewer = null;
  var _navAlerts = { items: [], history: [], summary: { new_count: 0, ack_count: 0, total_active: 0 } };
  var _alertsTimer = null;
  var _navConfirmResolve = null;
  var _navConfirmReturnFocus = null;
  var _notifyHookTimer = null;

  function buildNotifyPanel() {
    if (document.getElementById('pbgui-notify-panel')) return;
    var d = document.createElement('div');
    d.id = 'pbgui-notify-panel';
    d.innerHTML =
      '<div class="pnr pnr-n" data-dir="n"></div>' +
      '<div class="pnr pnr-s" data-dir="s"></div>' +
      '<div class="pnr pnr-w" data-dir="w"></div>' +
      '<div class="pnr pnr-e" data-dir="e"></div>' +
      '<div class="pnr pnr-nw" data-dir="nw"></div>' +
      '<div class="pnr pnr-ne" data-dir="ne"></div>' +
      '<div class="pnr pnr-sw" data-dir="sw"></div>' +
      '<div class="pnr pnr-se" data-dir="se"></div>' +
      '<div id="pbgui-notify-hdr">' +
        '<span id="pbgui-notify-title">' + esc(navT('nav.notifications', 'Notifications')) + '</span>' +
        '<button id="pbgui-notify-close">\u2715</button>' +
      '</div>' +
      '<div id="pbgui-notify-target" style="flex:1;min-height:0;overflow:hidden"></div>';
    document.body.appendChild(d);
  }

  function _ensureLogViewer(cb) {
    if (typeof window.LogViewerPanel === 'function') { cb(); return; }
    var s = document.createElement('script');
    s.src = '/app/js/log_viewer_panel.js?v=30';
    s.onload = cb;
    s.onerror = function() { console.warn('Failed to load log_viewer_panel.js'); };
    document.head.appendChild(s);
  }

  function _getWsBase() {
    if (window.WS_BASE) return window.WS_BASE;
    var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + window.location.host;
  }

  function _getApiOrigin() {
    var c = cfg();
    var apiOrigin = '';
    if (c.apiBase) {
      var m = c.apiBase.match(/^(https?:\/\/[^/]+)/);
      if (m) apiOrigin = m[1];
    }
    return apiOrigin || window.location.origin;
  }

  function _notificationToken() {
    return cfg().token || window.TOKEN || window.API_TOKEN || '';
  }

  function _normalizeNotificationLevel(level) {
    var value = String(level || 'info').toLowerCase();
    if (value === 'success') return 'ok';
    if (value === 'error') return 'err';
    if (value === 'warning') return 'warn';
    return value || 'info';
  }

  function logUiNotification(message, level) {
    var text = String(message == null ? '' : message).trim();
    var token = _notificationToken();
    if (!text || !token) return;
    fetch(_getApiOrigin() + '/api/notify_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ msg: text, level: _normalizeNotificationLevel(level) })
    }).catch(function () {});
  }

  function _wrapTransientNotifier(name) {
    var fn = window[name];
    if (typeof fn !== 'function' || fn.__pbguiNotifyWrapped) return;
    var wrapped = function (message, level) {
      logUiNotification(message, level);
      return fn.apply(this, arguments);
    };
    wrapped.__pbguiNotifyWrapped = true;
    wrapped.__pbguiNotifyOriginal = fn;
    window[name] = wrapped;
  }

  function installNotificationHooks() {
    _wrapTransientNotifier('toast');
    _wrapTransientNotifier('showToast');
    if (_notifyHookTimer) return;
    var attempts = 0;
    _notifyHookTimer = window.setInterval(function () {
      attempts += 1;
      _wrapTransientNotifier('toast');
      _wrapTransientNotifier('showToast');
      if (attempts >= 20) {
        window.clearInterval(_notifyHookTimer);
        _notifyHookTimer = null;
      }
    }, 250);
    window.addEventListener('load', function () {
      _wrapTransientNotifier('toast');
      _wrapTransientNotifier('showToast');
    }, { once: true });
  }

  window.PBGuiNotify = window.PBGuiNotify || {};
  window.PBGuiNotify.log = logUiNotification;
  window.PBGuiNotify.installHooks = installNotificationHooks;

  function toggleNotifyPanel() {
    var panel = document.getElementById('pbgui-notify-panel');
    if (!panel) return;
    if (panel.classList.contains('visible')) {
      closeNotifyPanel();
      return;
    }
    _ensureLogViewer(function() {
      if (_notifyViewer) { _notifyViewer.close(); _notifyViewer = null; }
      _notifyViewer = new LogViewerPanel({
        containerId: 'pbgui-notify-target',
        wsBase: _getWsBase(),
        token: cfg().token,
        defaultHost: 'local',
        defaultFile: 'PBGui.log',
        presets: 'system',
        showRestart: false,
        height: '100%'
      });
      _notifyViewer.open();
      if (!panel.style.left) {
        panel.style.right = '0'; panel.style.bottom = '0';
        panel.style.left = ''; panel.style.top = '';
      }
      panel.classList.add('visible');
      _bindNotifyDrag(panel);
      _bindNotifyResize(panel);
    });
  }

  function closeNotifyPanel() {
    var panel = document.getElementById('pbgui-notify-panel');
    if (panel) panel.classList.remove('visible');
    if (_notifyViewer) { _notifyViewer.close(); _notifyViewer = null; }
  }

  function buildAlertOverlay() {
    if (document.getElementById('pbgui-alert-ovl')) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = ''
      + '<div id="pbgui-alert-ovl" aria-hidden="true">'
      +   '<div id="pbgui-alert-box" role="dialog" aria-modal="true" aria-labelledby="pbgui-alert-title">'
      +     '<div class="pnr pnr-n" data-dir="n"></div>'
      +     '<div class="pnr pnr-s" data-dir="s"></div>'
      +     '<div class="pnr pnr-w" data-dir="w"></div>'
      +     '<div class="pnr pnr-e" data-dir="e"></div>'
      +     '<div class="pnr pnr-nw" data-dir="nw"></div>'
      +     '<div class="pnr pnr-ne" data-dir="ne"></div>'
      +     '<div class="pnr pnr-sw" data-dir="sw"></div>'
      +     '<div class="pnr pnr-se" data-dir="se"></div>'
      +     '<div class="pbgui-ovl-header" id="pbgui-alert-hdr">'
      +       '<span class="pbgui-ovl-title" id="pbgui-alert-title">' + esc(navT('nav.alert_title', 'VPSMonitor Alerts')) + '</span>'
      +       '<button class="pbgui-ovl-close" id="pbgui-alert-close">&#x2715;</button>'
      +     '</div>'
      +     '<div id="pbgui-alert-body">'
      +       '<div id="pbgui-alert-toolbar">'
      +         '<div id="pbgui-alert-summary"></div>'
      +         '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">'
      +           '<button type="button" class="pbgui-modal-btn secondary" id="pbgui-alert-ack-all">' + esc(navT('nav.alert_ack_all', 'Ack all')) + '</button>'
      +           '<a class="pbgui-alert-link" id="pbgui-alert-open-monitor" href="#">' + esc(navT('nav.alert_open_monitor', 'Open VPS Monitor')) + '</a>'
      +         '</div>'
      +       '</div>'
      +       '<div id="pbgui-alert-list"></div>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(wrapper.firstChild);
    var ovl = document.getElementById('pbgui-alert-ovl');
    var box = document.getElementById('pbgui-alert-box');
    var closeBtn = document.getElementById('pbgui-alert-close');
    var ackAllBtn = document.getElementById('pbgui-alert-ack-all');
    if (closeBtn) closeBtn.addEventListener('click', closeAlertOverlay);
    if (ackAllBtn) ackAllBtn.addEventListener('click', function () { ackAllAlerts(); });
    if (box) {
      _bindPanelDrag(box, 'pbgui-alert-hdr', ['pbgui-alert-close']);
      _bindPanelResize(box, 320, 220);
    }
  }

  function closeAlertOverlay() {
    var ovl = document.getElementById('pbgui-alert-ovl');
    if (!ovl) return;
    ovl.classList.remove('visible');
    ovl.setAttribute('aria-hidden', 'true');
  }

  function openAlertOverlay() {
    buildAlertOverlay();
    renderAlertOverlay();
    var ovl = document.getElementById('pbgui-alert-ovl');
    var box = document.getElementById('pbgui-alert-box');
    if (!ovl) return;
    if (box && !box.dataset.positioned) {
      var width = Math.min(Math.max(Math.round(window.innerWidth * 0.78), 320), 880);
      var height = Math.min(Math.max(Math.round(window.innerHeight * 0.78), 220), 640);
      box.style.width = width + 'px';
      box.style.height = height + 'px';
      box.style.left = Math.max(16, Math.round((window.innerWidth - width) / 2)) + 'px';
      box.style.top = Math.max(16, Math.round((window.innerHeight - height) / 2)) + 'px';
      box.dataset.positioned = 'true';
    }
    ovl.classList.add('visible');
    ovl.setAttribute('aria-hidden', 'false');
  }

  function _alertKindLabel(kind) {
    var keyMap = {
      offline: 'nav.alert_kind_offline',
      service: 'nav.alert_kind_service',
      system: 'nav.alert_kind_system',
      instance: 'nav.alert_kind_instance'
    };
    return navT(keyMap[String(kind || '')] || 'nav.alert_kind_alert', 'Alert');
  }

  function _formatTs(ts) {
    var value = Number(ts || 0);
    if (!value) return 'n/a';
    try { return new Date(value * 1000).toLocaleString(); } catch (_) { return 'n/a'; }
  }

  function renderAlertOverlay() {
    var summaryEl = document.getElementById('pbgui-alert-summary');
    var listEl = document.getElementById('pbgui-alert-list');
    var openMonitor = document.getElementById('pbgui-alert-open-monitor');
    if (openMonitor) {
      openMonitor.onclick = function (e) {
        e.preventDefault();
        closeAlertOverlay();
        var c = cfg();
        var apiOrigin = '';
        if (c.apiBase) {
          var m = c.apiBase.match(/^(https?:\/\/[^/]+)/);
          if (m) apiOrigin = m[1];
        }
        if (!apiOrigin) apiOrigin = window.location.origin;
        var url = apiOrigin + '/api/vps/main_page';
        window.location.href = url;
      };
    }
    if (summaryEl) {
      var s = _navAlerts.summary || { new_count: 0, ack_count: 0, total_active: 0 };
      summaryEl.textContent = navT('nav.alert_summary', '{total} active alerts, {new} new, {ack} acknowledged', {
        total: s.total_active, new: s.new_count, ack: s.ack_count
      });
    }
    if (!listEl) return;
    var items = Array.isArray(_navAlerts.items) ? _navAlerts.items : [];
    var history = Array.isArray(_navAlerts.history) ? _navAlerts.history : [];
    var defaultAlertLabel = navT('nav.alert_item_default', 'Alert');
    var pillAck = navT('nav.alert_pill_ack', 'ACK');
    var pillNew = navT('nav.alert_pill_new', 'NEW');
    var pillDone = navT('nav.alert_done', 'DONE');
    var html = '';
    if (!items.length) {
      html += '<div class="pbgui-alert-empty">' + esc(navT('nav.alert_empty', 'No active VPSMonitor alerts.')) + '</div>';
    }
    items.forEach(function (item) {
      var ack = !!item.acknowledged;
      var host = esc(item.host || '');
      var title = esc(item.summary || defaultAlertLabel);
      var details = esc(item.details || '');
      html += '<div class="pbgui-alert-item' + (ack ? '' : ' new') + '">';
      html +=   '<div class="pbgui-alert-head">';
      html +=     '<div>';
      html +=       '<div class="pbgui-alert-title">' + title + '</div>';
      html +=       '<div class="pbgui-alert-meta">';
      html +=         '<span class="pbgui-alert-pill kind">' + esc(_alertKindLabel(item.kind)) + '</span>';
      html +=         '<span class="pbgui-alert-pill ' + (ack ? 'ack' : 'new') + '">' + (ack ? pillAck : pillNew) + '</span>';
      html +=         '<span>' + host + (item.name ? ' / ' + esc(item.name) : '') + '</span>';
      html +=         '<span>' + esc(navT('nav.alert_seen', 'Seen {ts}', { ts: _formatTs(item.first_seen_ts) })) + '</span>';
      html +=       '</div>';
      html +=     '</div>';
      if (!ack) {
        html +=   '<div class="pbgui-alert-actions"><button type="button" class="pbgui-modal-btn secondary" data-alert-ack="' + escAttr(item.id) + '">' + esc(navT('nav.alert_ack_btn', 'Ack')) + '</button></div>';
      }
      html +=   '</div>';
      html +=   '<div class="pbgui-alert-details">' + details + '</div>';
      html += '</div>';
    });
    if (history.length) {
      html += '<div class="pbgui-alert-section-sep"></div>';
      html += '<div class="pbgui-alert-history-title">' + esc(navT('nav.alert_history', 'History')) + '</div>';
      history.forEach(function (item) {
        var host = esc(item.host || '');
        var title = esc(item.summary || defaultAlertLabel);
        var details = esc(item.details || '');
        var seenTs = esc(_formatTs(item.first_seen_ts));
        var resolvedTs = esc(_formatTs(item.resolved_ts || item.last_seen_ts));
        html += '<div class="pbgui-alert-item history">';
        html +=   '<div class="pbgui-alert-head">';
        html +=     '<div>';
        html +=       '<div class="pbgui-alert-title">' + title + '</div>';
        html +=       '<div class="pbgui-alert-meta">';
        html +=         '<span class="pbgui-alert-pill kind">' + esc(_alertKindLabel(item.kind)) + '</span>';
        html +=         '<span class="pbgui-alert-pill ack">' + (item.acknowledged ? pillAck : pillDone) + '</span>';
        html +=         '<span>' + host + (item.name ? ' / ' + esc(item.name) : '') + '</span>';
        html +=         '<span>' + esc(navT('nav.alert_seen', 'Seen {ts}', { ts: seenTs })) + '</span>';
        html +=         '<span>' + esc(navT('nav.alert_resolved', 'Resolved {ts}', { ts: resolvedTs })) + '</span>';
        html +=       '</div>';
        html +=     '</div>';
        html +=   '</div>';
        html +=   '<div class="pbgui-alert-details">' + details + '</div>';
        html += '</div>';
      });
    }
    listEl.innerHTML = html;
    listEl.querySelectorAll('[data-alert-ack]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        ackAlert(btn.getAttribute('data-alert-ack') || '');
      });
    });
  }

  function updateAlertButton() {
    var btn = document.getElementById('pbgui-alert-btn');
    var badge = document.getElementById('pbgui-alert-badge');
    if (!btn || !badge) return;
    var summary = _navAlerts.summary || { new_count: 0, ack_count: 0, total_active: 0 };
    badge.textContent = String(summary.new_count || 0) + '/' + String(summary.ack_count || 0);
    badge.classList.toggle('has-new', !!summary.new_count);
  }

  function fetchAlerts() {
    var c = cfg();
    var apiOrigin = '';
    if (c.apiBase) {
      var m = c.apiBase.match(/^(https?:\/\/[^/]+)/);
      if (m) apiOrigin = m[1];
    }
    if (!apiOrigin) apiOrigin = window.location.origin;
    fetch(apiOrigin + '/api/vps/alerts', authOptions(c.token, { cache: 'no-store' }))
      .then(function (resp) {
        if (!resp.ok) throw new Error('alerts failed');
        return resp.json();
      })
      .then(function (data) {
        _navAlerts = data || { items: [], history: [], summary: { new_count: 0, ack_count: 0, total_active: 0 } };
        updateAlertButton();
        var ovl = document.getElementById('pbgui-alert-ovl');
        if (ovl && ovl.classList.contains('visible')) renderAlertOverlay();
      })
      .catch(function () {});
  }

  function scheduleAlerts() {
    clearInterval(_alertsTimer);
    _alertsTimer = setInterval(fetchAlerts, 10000);
  }

  function ackAlert(alertId) {
    var c = cfg();
    var apiOrigin = '';
    if (c.apiBase) {
      var m = c.apiBase.match(/^(https?:\/\/[^/]+)/);
      if (m) apiOrigin = m[1];
    }
    if (!apiOrigin) apiOrigin = window.location.origin;
    fetch(apiOrigin + '/api/vps/alerts/ack', authOptions(c.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: alertId })
    }))
      .then(function (resp) {
        if (!resp.ok) throw new Error('ack failed');
        return resp.json();
      })
      .then(function (data) {
        _navAlerts = data || _navAlerts;
        updateAlertButton();
        renderAlertOverlay();
      })
      .catch(function () {});
  }

  function ackAllAlerts() {
    var c = cfg();
    var apiOrigin = '';
    if (c.apiBase) {
      var m = c.apiBase.match(/^(https?:\/\/[^/]+)/);
      if (m) apiOrigin = m[1];
    }
    if (!apiOrigin) apiOrigin = window.location.origin;
    fetch(apiOrigin + '/api/vps/alerts/ack-all', authOptions(c.token, { method: 'POST' }))
      .then(function (resp) {
        if (!resp.ok) throw new Error('ack-all failed');
        return resp.json();
      })
      .then(function (data) {
        _navAlerts = data || _navAlerts;
        updateAlertButton();
        renderAlertOverlay();
      })
      .catch(function () {});
  }

  function _bindPanelDrag(panel, headerId, closeIds) {
    var hdr = document.getElementById(headerId);
    if (!hdr || hdr._dragBound) return;
    hdr._dragBound = true;
    var ignoreIds = Array.isArray(closeIds) ? closeIds : [];
    hdr.addEventListener('mousedown', function(e) {
      if (ignoreIds.indexOf(e.target.id) >= 0) return;
      var rect = panel.getBoundingClientRect();
      panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      var sX = e.clientX, sY = e.clientY, sL = rect.left, sT = rect.top;
      function onMove(e) {
        panel.style.left = (sL + e.clientX - sX) + 'px';
        panel.style.top  = (sT + e.clientY - sY) + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  function _bindPanelResize(panel, minWidth, minHeight) {
    if (panel._resizeBound) return;
    panel._resizeBound = true;
    var minW = Number(minWidth || 240);
    var minH = Number(minHeight || 150);
    panel.querySelectorAll('.pnr').forEach(function(handle) {
      handle.addEventListener('mousedown', function(e) {
        e.preventDefault(); e.stopPropagation();
        var dir = handle.dataset.dir;
        var rect = panel.getBoundingClientRect();
        panel.style.left = rect.left + 'px'; panel.style.top = rect.top + 'px';
        panel.style.right = 'auto'; panel.style.bottom = 'auto';
        panel.style.width = rect.width + 'px'; panel.style.height = rect.height + 'px';
        var sX = e.clientX, sY = e.clientY;
        var sL = rect.left, sT = rect.top, sW = rect.width, sH = rect.height;
        function onMove(e) {
          var dx = e.clientX - sX, dy = e.clientY - sY;
          var nL = sL, nT = sT, nW = sW, nH = sH;
          if (dir.indexOf('w') >= 0) { nL = sL + dx; nW = sW - dx; }
          if (dir.indexOf('e') >= 0) { nW = sW + dx; }
          if (dir.indexOf('n') >= 0) { nT = sT + dy; nH = sH - dy; }
          if (dir.indexOf('s') >= 0) { nH = sH + dy; }
          if (nW < minW) { if (dir.indexOf('w') >= 0) nL = sL + sW - minW; nW = minW; }
          if (nH < minH) { if (dir.indexOf('n') >= 0) nT = sT + sH - minH; nH = minH; }
          nL = Math.max(0, Math.min(nL, window.innerWidth - minW));
          nT = Math.max(0, Math.min(nT, window.innerHeight - minH));
          nW = Math.min(nW, window.innerWidth - nL);
          nH = Math.min(nH, window.innerHeight - nT);
          panel.style.left = nL + 'px'; panel.style.top = nT + 'px';
          panel.style.width = nW + 'px'; panel.style.height = nH + 'px';
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  function _bindNotifyDrag(panel) {
    _bindPanelDrag(panel, 'pbgui-notify-hdr', ['pbgui-notify-close']);
  }

  function _bindNotifyResize(panel) {
    _bindPanelResize(panel, 240, 150);
  }

  function buildAbout() {
    if (document.getElementById('pbgui-about-ovl')) return;
    var c = cfg();
    var ver    = esc(c.version || '');
    var serial = esc(c.serial  || '');
    var html = '<div id="pbgui-about-ovl">'
      + '<div id="pbgui-about-box">'
      +   '<div class="pbgui-ovl-header">'
      +     '<span class="pbgui-ovl-title">' + NAV_ACTION_ICONS.info + esc(navT('nav.about_pbgui', 'About PBGui')) + '</span>'
      +     '<button class="pbgui-ovl-close" id="pbgui-about-close">&#x2715;</button>'
      +   '</div>'
      +   '<div id="pbgui-about-body">'
      +     '<svg width="72" height="72" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" style="margin-bottom:1.1rem">'
      +       '<rect x="1" y="1" width="34" height="34" rx="7" style="fill:var(--bg-elevated,#2b2b2b);stroke:var(--accent-deep,#4fa8d3)" stroke-width="1.5"/>'
      +       '<rect x="7" y="21" width="5" height="9" rx="1.5" style="fill:var(--accent-soft,#b6e1f7)"/>'
      +       '<rect x="14.5" y="15" width="5" height="15" rx="1.5" style="fill:var(--accent,#8fcff2)"/>'
      +       '<rect x="22" y="9" width="5" height="21" rx="1.5" style="fill:var(--accent-deep,#4fa8d3)"/>'
      +     '</svg>'
      +     '<div id="pbgui-about-ver">PBGui ' + ver + '</div>'
      +     (serial ? '<div id="pbgui-about-serial">' + esc(navT('nav.api_serial', 'API Serial')) + ' ' + serial + '</div>' : '')
      +     '<div id="pbgui-about-tag">Passivbot GUI &mdash; by msei99</div>'
      +     '<div class="pbgui-about-divider"></div>'
      +     '<div class="pbgui-about-links">'
      +       '<a class="pbgui-about-link kofi" href="https://ko-fi.com/Y8Y216Q3QS" target="_blank" rel="noopener">&#9749; ' + esc(navT('nav.support_kofi', 'Support on Ko-fi')) + '</a>'
      +       '<a class="pbgui-about-link github" href="https://github.com/msei99/pbgui" target="_blank" rel="noopener">&#128279; ' + esc(navT('nav.github_repo', 'GitHub Repository')) + '</a>'
      +       '<a class="pbgui-about-link readme" href="https://github.com/msei99/pbgui#readme" target="_blank" rel="noopener">&#128196; ' + esc(navT('nav.readme', 'README')) + '</a>'
      +     '</div>'
      +   '</div>'
      +   '<div id="pbgui-about-footer">' + esc(navT('nav.about_footer', 'Open-source &bull; MIT License')) + '</div>'
      + '</div></div>';

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper.firstChild);
  }

  function buildConfirmOverlay() {
    if (document.getElementById('pbgui-confirm-ovl')) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = ''
      + '<div id="pbgui-confirm-ovl" aria-hidden="true">'
      +   '<div id="pbgui-confirm-box" role="dialog" aria-modal="true" aria-labelledby="pbgui-confirm-title">'
      +     '<div class="pbgui-ovl-header">'
      +       '<span class="pbgui-ovl-title" id="pbgui-confirm-title">' + esc(navT('common.confirmAction', 'Confirm action')) + '</span>'
      +       '<button class="pbgui-ovl-close" id="pbgui-confirm-close">&#x2715;</button>'
      +     '</div>'
      +     '<div id="pbgui-confirm-body">'
      +       '<div id="pbgui-confirm-msg"></div>'
      +       '<div id="pbgui-confirm-detail" hidden></div>'
      +       '<div id="pbgui-confirm-actions">'
      +         '<button type="button" class="pbgui-modal-btn secondary" id="pbgui-confirm-cancel">' + esc(navT('common.cancel', 'Cancel')) + '</button>'
      +         '<button type="button" class="pbgui-modal-btn primary" id="pbgui-confirm-accept">' + esc(navT('common.confirm', 'Confirm')) + '</button>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(wrapper.firstChild);

    var overlay = document.getElementById('pbgui-confirm-ovl');
    var closeBtn = document.getElementById('pbgui-confirm-close');
    var cancelBtn = document.getElementById('pbgui-confirm-cancel');
    var acceptBtn = document.getElementById('pbgui-confirm-accept');
    if (closeBtn) closeBtn.addEventListener('click', function () { closeNavConfirm(false); });
    if (cancelBtn) cancelBtn.addEventListener('click', function () { closeNavConfirm(false); });
    if (acceptBtn) acceptBtn.addEventListener('click', function () { closeNavConfirm(true); });
  }

  function closeNavConfirm(confirmed) {
    var overlay = document.getElementById('pbgui-confirm-ovl');
    if (overlay) {
      overlay.classList.remove('visible');
      overlay.setAttribute('aria-hidden', 'true');
    }
    var resolver = _navConfirmResolve;
    var returnFocus = _navConfirmReturnFocus;
    _navConfirmResolve = null;
    _navConfirmReturnFocus = null;
    if (returnFocus && typeof returnFocus.focus === 'function') {
      try { returnFocus.focus(); } catch (_) {}
    }
    if (typeof resolver === 'function') resolver(Boolean(confirmed));
  }

  function showNavConfirm(options) {
    options = options || {};
    buildConfirmOverlay();
    var overlay = document.getElementById('pbgui-confirm-ovl');
    var title = document.getElementById('pbgui-confirm-title');
    var message = document.getElementById('pbgui-confirm-msg');
    var detail = document.getElementById('pbgui-confirm-detail');
    var cancelBtn = document.getElementById('pbgui-confirm-cancel');
    var acceptBtn = document.getElementById('pbgui-confirm-accept');
    if (!overlay || !title || !message || !detail || !cancelBtn || !acceptBtn) {
      logUiNotification(navT('nav.confirm_unavailable', 'Confirmation dialog unavailable. Reload the page and try again.'), 'err');
      return Promise.resolve(false);
    }

    if (typeof _navConfirmResolve === 'function') {
      var previousResolve = _navConfirmResolve;
      _navConfirmResolve = null;
      previousResolve(false);
    }

    title.textContent = String(options.title || navT('common.confirmAction', 'Confirm action'));
    message.textContent = String(options.message || navT('common.areYouSure', 'Are you sure?'));
    acceptBtn.textContent = String(options.confirmText || navT('common.confirm', 'Confirm'));
    cancelBtn.textContent = String(options.cancelText || navT('common.cancel', 'Cancel'));
    var detailText = String(options.detail || '').trim();
    detail.textContent = detailText;
    detail.hidden = !detailText;
    _navConfirmReturnFocus = document.activeElement;

    return new Promise(function (resolve) {
      _navConfirmResolve = resolve;
      overlay.classList.add('visible');
      overlay.setAttribute('aria-hidden', 'false');
      acceptBtn.focus();
    });
  }

  /* ════════════════════════════════════
     FASTAPI DIRECT ROUTES
     Pages served directly by FastAPI.
     Key = nav page id, value = path under the API origin.
     ════════════════════════════════════ */
  var FASTAPI_PAGES = {
    '/':                 '/api/auth/main_page',
    'dashboards':        '/api/dashboard/main_page',
    'info_coin_data':    '/api/coin-data/main_page',
    'info_market_data_fastapi': '/api/market-data/main_page',
    'info_ai_chat':      '/api/ai/main_page',
    'system_api_keys':   '/api/api-keys/main_page',
    'system_cluster':    '/api/cluster/main_page',
    'system_vps_manager_fastapi': '/api/vps-manager/main_page',
    'system_logging':     '/api/logging/main_page',
    'system_vps_monitor': '/api/vps/main_page',
    'system_services':    '/api/services/main_page',
    'system_db_tools':    '/api/db-tools/main_page',
    'system_profit_sweep': '/api/profit-sweep/main_page',
    'help':               '/api/help/main_page',
    'v7_run':             '/api/v7/main_page',
    'v7_backtest':        '/api/backtest-v7/main_page',
    'v7_optimize':        '/api/optimize-v7/main_page',
    'v7_pareto_explorer': '/api/pareto-explorer/main_page',
    'v7_strategy_explorer': '/api/strategy-explorer/main_page',
    'info_balance_calc':  '/api/balance-calc/main_page',
    'v8_run':             '/api/v8/main_page',
    'v8_backtest':        '/api/backtest-v8/main_page',
    'v8_optimize':        '/api/optimize-v8/main_page',
    'v8_strategy_explorer': '/api/strategy-explorer-v8/main_page',
    'v8_pareto_explorer': '/api/pareto-explorer/main_page?optimize_version=v8'
  };

  /* Every registered page must resolve to an existing EN/DE shared-help topic. */
  var GUIDE_TOPICS = {
    '/':                           '19_welcome',
    'dashboards':                  '33_dashboard',
    'info_coin_data':              '27_coin_data',
    'info_market_data_fastapi':    '26_market_data',
    'info_ai_chat':                 '45_ai_chat',
    'system_api_keys':             '20_api_keys',
    'system_cluster':              '39_cluster_sync',
    'system_vps_manager_fastapi':  '32_vps_manager',
    'system_logging':              '31_logging',
    'system_vps_monitor':          '29_vps_monitor',
    'system_services':             '23_services_overview',
    'system_db_tools':             '41_db_tools',
    'system_profit_sweep':         '46_profit_sweep',
    'help':                        '00_overview',
    'v7_run':                      '34_pbv7_run',
    'v7_backtest':                 '35_pbv7_backtest',
    'v7_optimize':                 '36_pbv7_optimize',
    'v7_pareto_explorer':          '37_pareto_explorer',
    'v7_strategy_explorer':        '00_strategy_explorer_help',
    'info_balance_calc':           '38_balance_calc',
    'v8_run':                      '44_pbv8_run',
    'v8_backtest':                 '42_pbv8_backtest',
    'v8_optimize':                 '43_pbv8_optimize',
    'v8_strategy_explorer':        '00_strategy_explorer_help',
    'v8_pareto_explorer':          '37_pareto_explorer'
  };

  function syncHelpOverlayState() {
    var legacyHelpOvl = document.getElementById('help-ovl');
    var sharedHelpOvl = document.getElementById('pbgui-shared-help-ovl');
    var isVisible = !!(
      (legacyHelpOvl && legacyHelpOvl.classList.contains('visible')) ||
      (sharedHelpOvl && sharedHelpOvl.classList.contains('visible'))
    );
    document.body.classList.toggle('pbgui-help-open', isVisible);
  }

  function ensureSharedHelpOverlay() {
    var helpOvl = document.getElementById('help-ovl');
    if (!helpOvl) {
      syncHelpOverlayState();
      return null;
    }

    var actions = helpOvl.querySelector('.ovl-header-actions');
    var closeBtn = document.getElementById('help-close') || helpOvl.querySelector('.ovl-close');
    var maxBtn = document.getElementById('help-maximize') || helpOvl.querySelector('.ovl-tool[data-role="maximize"]');

    if (actions && !maxBtn) {
      maxBtn = document.createElement('button');
      maxBtn.type = 'button';
      maxBtn.id = 'help-maximize';
      maxBtn.className = 'ovl-tool';
      maxBtn.setAttribute('data-role', 'maximize');
      maxBtn.setAttribute('aria-pressed', 'false');
      maxBtn.setAttribute('title', navT('nav.fit_window', 'Fit to browser window'));
      maxBtn.textContent = '⛶';
      if (closeBtn && closeBtn.parentNode === actions) actions.insertBefore(maxBtn, closeBtn);
      else actions.appendChild(maxBtn);
    }

    function syncMaximizeButton() {
      if (!maxBtn) return;
      var isMaximized = helpOvl.classList.contains('is-maximized');
      maxBtn.setAttribute('aria-pressed', isMaximized ? 'true' : 'false');
      maxBtn.setAttribute('title', isMaximized ? navT('nav.restore_window', 'Restore window size') : navT('nav.fit_window', 'Fit to browser window'));
      maxBtn.textContent = isMaximized ? '❐' : '⛶';
    }

    function setMaximized(nextValue) {
      var shouldMaximize = !!nextValue;
      var isMaximized = helpOvl.classList.contains('is-maximized');
      if (shouldMaximize === isMaximized) {
        syncMaximizeButton();
        return;
      }
      if (shouldMaximize) {
        helpOvl._pbguiHelpRestoreBounds = {
          left: helpOvl.style.left || '',
          top: helpOvl.style.top || '',
          right: helpOvl.style.right || '',
          bottom: helpOvl.style.bottom || '',
          width: helpOvl.style.width || '',
          height: helpOvl.style.height || '',
          transform: helpOvl.style.transform || ''
        };
        helpOvl.classList.add('is-maximized');
        if (window.innerWidth <= 720) {
          helpOvl.style.left = '7px';
          helpOvl.style.top = '59px';
          helpOvl.style.right = '7px';
          helpOvl.style.bottom = '7px';
        } else {
          helpOvl.style.left = '12px';
          helpOvl.style.top = '64px';
          helpOvl.style.right = '12px';
          helpOvl.style.bottom = '12px';
        }
        helpOvl.style.width = 'auto';
        helpOvl.style.height = 'auto';
        helpOvl.style.transform = 'none';
      } else {
        helpOvl.classList.remove('is-maximized');
        var saved = helpOvl._pbguiHelpRestoreBounds || {};
        helpOvl.style.left = saved.left || '';
        helpOvl.style.top = saved.top || '';
        helpOvl.style.right = saved.right || '';
        helpOvl.style.bottom = saved.bottom || '';
        helpOvl.style.width = saved.width || '';
        helpOvl.style.height = saved.height || '';
        helpOvl.style.transform = saved.transform || '';
      }
      syncMaximizeButton();
    }

    if (maxBtn && !maxBtn.dataset.pbguiHelpMaxBound) {
      maxBtn.dataset.pbguiHelpMaxBound = '1';
      maxBtn.addEventListener('click', function (event) {
        event.preventDefault();
        setMaximized(!helpOvl.classList.contains('is-maximized'));
      });
    }

    if (!helpOvl.dataset.pbguiHelpStateObserved) {
      helpOvl.dataset.pbguiHelpStateObserved = '1';
      new MutationObserver(function () {
        syncHelpOverlayState();
      }).observe(helpOvl, { attributes: true, attributeFilter: ['class'] });
    }

    syncMaximizeButton();
    syncHelpOverlayState();
    return helpOvl;
  }

  /* ════════════════════════════════════
     EVENT HANDLERS
     ════════════════════════════════════ */
  function setupHandlers() {
    var c = cfg();
    var TOKEN   = c.token;
    var guideTopic = GUIDE_TOPICS[c.current] || '00_overview';
    installNotificationHooks();

    /* Derive API origin (scheme + host + port) from apiBase or current location */
    var apiOrigin = '';
    if (c.apiBase) {
      var m = c.apiBase.match(/^(https?:\/\/[^/]+)/);
      if (m) apiOrigin = m[1];
    }
    if (!apiOrigin) {
      apiOrigin = window.location.origin;
    }

    function navTo(page) {
      if (!page) return;

      /* Direct FastAPI page */
      if (FASTAPI_PAGES[page] && apiOrigin) {
        var faUrl = apiOrigin + FASTAPI_PAGES[page];
        window.location.href = faUrl;
        return;
      }

      console.warn('[pbgui_nav] Unknown PBGui page "' + page + '".');
      logUiNotification(navT('nav.nav_unavailable', 'Navigation unavailable - page is not registered.'), 'warn');
      var msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999;background:rgb(27 25 29 / .97);border:1px solid rgb(229 96 92 / .45);color:#ee8d84;padding:.6rem 1.2rem;border-radius:8px;font-size:.85rem;pointer-events:none;';
      msg.textContent = navT('nav.nav_unavailable_body', 'Navigation unavailable — page is not registered.');
      document.body.appendChild(msg);
      setTimeout(function() { msg.remove(); }, 4000);
    }

    /* nav item clicks */
    document.querySelectorAll('.nav-item[data-page]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        navTo(el.getAttribute('data-page'));
      });
    });

    /* Group dropdown toggles keep the active button and menu state in sync. */
    var openNavGroupButton = null;
    function closeOpenNavGroup(restoreFocus) {
      document.querySelectorAll('.nav-group.open').forEach(function (groupElement) {
        groupElement.classList.remove('open');
      });
      document.querySelectorAll('.nav-group-btn[aria-expanded="true"]').forEach(function (groupButton) {
        groupButton.setAttribute('aria-expanded', 'false');
      });
      if (restoreFocus && openNavGroupButton) openNavGroupButton.focus();
      openNavGroupButton = null;
    }

    document.querySelectorAll('.nav-group-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var grp = btn.closest('.nav-group');
        var wasOpen = grp.classList.contains('open');
        closeOpenNavGroup(false);
        if (!wasOpen) {
          grp.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
          openNavGroupButton = btn;
        }
      });
      btn.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (event.key === 'ArrowDown' && !btn.closest('.nav-group').classList.contains('open')) btn.click();
          else btn.click();
          var firstMenuItem = btn.closest('.nav-group').querySelector('.nav-item[data-page]');
          if (event.key === 'ArrowDown' && firstMenuItem) firstMenuItem.focus();
        }
      });
    });

    document.querySelectorAll('.nav-item[data-page]').forEach(function (item) {
      item.setAttribute('tabindex', '0');
      item.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          item.click();
        }
      });
    });

    /* close dropdowns on outside click */
    document.addEventListener('click', function () {
      closeOpenNavGroup(false);
    });

    /* logo click → navigate to Welcome */
    var logo = document.getElementById('nav-logo');
    if (logo) logo.addEventListener('click', function (e) { e.preventDefault(); navTo('/'); });

    ensureSharedHelpOverlay();

    /* Guide button → keep the current page and lazy-load the shared Help overlay. */
    var guideBtn = document.getElementById('pbgui-guide-btn');
    if (guideBtn) guideBtn.addEventListener('click', function () {
      var opener = window.PBGUI_HELP_OPENER;
      if (typeof opener === 'function') {
        ensureSharedHelpOverlay();
        opener();
        ensureSharedHelpOverlay();
        return;
      }
      if (window.PBGuiSharedHelp && typeof window.PBGuiSharedHelp.open === 'function') {
        window.PBGuiSharedHelp.open(guideTopic, { token: TOKEN });
        return;
      }

      guideBtn.disabled = true;
      var script = document.createElement('script');
      script.src = '/app/js/shared_help_overlay.js?v=8';
      script.onload = function () {
        guideBtn.disabled = false;
        if (window.PBGuiSharedHelp && typeof window.PBGuiSharedHelp.open === 'function') {
          window.PBGuiSharedHelp.open(guideTopic, { token: TOKEN });
          return;
        }
        navTo('help');
      };
      script.onerror = function () {
        guideBtn.disabled = false;
        navTo('help');
      };
      document.head.appendChild(script);
    });

    /* Notify button → open inline floating log panel */
    var notifyBtn = document.getElementById('pbgui-notify-btn');
    if (notifyBtn) notifyBtn.addEventListener('click', function () { toggleNotifyPanel(); });
    var notifyClose = document.getElementById('pbgui-notify-close');
    if (notifyClose) notifyClose.addEventListener('click', function () { closeNotifyPanel(); });
    buildAlertOverlay();
    var alertBtn = document.getElementById('pbgui-alert-btn');
    if (alertBtn) alertBtn.addEventListener('click', function () { openAlertOverlay(); });
    fetchAlerts();
    scheduleAlerts();

    var aiBtn = document.getElementById('pbgui-ai-btn');
    if (aiBtn) aiBtn.addEventListener('click', function () {
      if (window.PBGuiAI && typeof window.PBGuiAI.toggle === 'function') {
        window.PBGuiAI.toggle();
        return;
      }
      if (_aiDrawerLoading) return;
      _aiDrawerLoading = true;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/app/css/ai_drawer.css?v=13';
      document.head.appendChild(link);
      var script = document.createElement('script');
      script.src = '/app/js/ai_drawer.js?v=31';
      script.onload = function () { _aiDrawerLoading = false; if (window.PBGuiAI && window.PBGuiAI.open) window.PBGuiAI.open(); };
      script.onerror = function () { _aiDrawerLoading = false; };
      document.head.appendChild(script);
    });
    var pendingAIAction = new URL(window.location.href).searchParams.get('pbgui_ai_action') === '1';
    if (aiBtn && pendingAIAction) {
      var cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('pbgui_ai_action');
      window.history.replaceState(window.history.state, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      aiBtn.click();
    } else if (aiBtn) {
      var aiUserInteracted = false;
      aiBtn.addEventListener('click', function (event) {
        if (event.isTrusted) aiUserInteracted = true;
      });
      fetch(_getApiOrigin() + '/api/ai/preferences', {
        credentials: 'same-origin',
        cache: 'no-store'
      }).then(function (response) {
        if (!response.ok) return null;
        return response.json();
      }).then(function (preferences) {
        if (preferences && preferences.drawer_open === true && !aiUserInteracted) aiBtn.click();
      }).catch(function () {});
    }

    /* About button → show overlay */
    var aboutBtn = document.getElementById('pbgui-about-btn');
    var aboutOvl = document.getElementById('pbgui-about-ovl');
    var aboutClose = document.getElementById('pbgui-about-close');
    if (aboutBtn && aboutOvl) {
      aboutBtn.addEventListener('click', function () { aboutOvl.classList.add('visible'); });
      if (aboutClose) aboutClose.addEventListener('click', function () { aboutOvl.classList.remove('visible'); });
    }

    var logoutBtn = document.getElementById('pbgui-logout-btn');
    if (logoutBtn) {
      logoutBtn.style.display = (TOKEN || c.authenticated) ? 'inline-flex' : 'none';
      logoutBtn.addEventListener('click', function () { performLogout(); });
    }

    /* Language switcher → persist choice, reload to re-render the page */
    var langBtn = document.getElementById('pbgui-lang-btn');
    if (langBtn) {
      langBtn.addEventListener('click', function () {
        var i18n = window.PBGuiI18n;
        if (i18n && typeof i18n.setLang === 'function') {
          i18n.setLang(i18n.lang === 'zh' ? 'en' : 'zh');
        }
      });
    }

    /* Esc key closes about overlay */
    document.addEventListener('keydown', function (e) {
      var confirmOvl = document.getElementById('pbgui-confirm-ovl');
      if (e.key === 'Escape') {
        if (openNavGroupButton) {
          closeOpenNavGroup(true);
          return;
        }
        if (confirmOvl && confirmOvl.classList.contains('visible')) {
          closeNavConfirm(false);
          return;
        }
        var alertOvl = document.getElementById('pbgui-alert-ovl');
        if (alertOvl && alertOvl.classList.contains('visible')) {
          closeAlertOverlay();
          return;
        }
        if (aboutOvl) aboutOvl.classList.remove('visible');
      }
      if (e.key === 'Enter' && confirmOvl && confirmOvl.classList.contains('visible')) {
        if (e.target && e.target.id === 'pbgui-confirm-cancel') return;
        e.preventDefault();
        closeNavConfirm(true);
      }
    });

    /* Restart button */
    var restartBtn = document.getElementById('pbgui-restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', function () {
        var blocked = restartBtn.getAttribute('data-restart-blocked') === '1';
        var blockReason = restartBtn.getAttribute('data-restart-block-reason') || '';
        if (blocked) {
          showNavConfirm({
            title: navT('nav.restart_blocked', 'Restart blocked'),
            message: navT('nav.restart_blocked_msg', 'PBGui services cannot restart while protected work is still running.'),
            detail: blockReason || navT('nav.restart_blocked_wait', 'Wait until the active VPS task finishes or is marked interrupted.'),
            confirmText: navT('common.ok', 'OK'),
            cancelText: '',
            hideCancel: true
          });
          return;
        }
        var restartServices = Array.isArray(_restartStatus.restart_services) ? _restartStatus.restart_services : [];
        var restartLabels = restartServices.map(function (item) {
          return String((item || {}).label || (item || {}).service || '').trim();
        }).filter(Boolean);
        var restartDetail = restartLabels.length
          ? navT('nav.restart_outdated', 'Outdated services: {list}. The API server restarts last and the page reconnects automatically.', { list: restartLabels.join(', ') })
          : navT('nav.restart_auto', 'The API server restarts and the page reconnects automatically.');
        showNavConfirm({
          title: navT('nav.restart_services_title', 'Restart PBGui services'),
          message: navT('nav.restart_services_msg', 'Restart all PBGui services running outdated code?'),
          detail: restartDetail,
          confirmText: navT('nav.restart', 'Restart')
        }).then(function (confirmed) {
          if (!confirmed) return;
          var c2 = cfg();
          var origin2 = '';
          if (c2.apiBase) { var m2 = c2.apiBase.match(/^(https?:\/\/[^/]+)/); if (m2) origin2 = m2[1]; }
          if (!origin2) origin2 = window.location.origin;
          restartBtn.disabled = true;
          restartBtn.classList.add('disabled');
          restartBtn.innerHTML = '<span class="nav-restart-dot"></span>' + esc(navT('nav.restarting', 'Restarting...'));
          fetch(origin2 + '/api/server-restart', authOptions(c2.token, {
            method: 'POST',
            credentials: 'same-origin'
          })).then(function(resp) {
            if (!resp.ok) {
              return resp.json().catch(function () { return {}; }).then(function (data) {
                var detail = (data && data.detail) ? String(data.detail) : navT('nav.restart_failed_default', 'Restart failed.');
                throw new Error(detail);
              });
            }
            return resp.json().catch(function () { return {}; });
          }).then(function(data) {
            showRestartOverlay(origin2, c2.token, data && Array.isArray(data.restart_services) ? data.restart_services : []);
          }).catch(function(err) {
            restartBtn.disabled = false;
            restartBtn.classList.remove('disabled');
            restartBtn.innerHTML = '<span class="nav-restart-dot"></span>' + esc(navT('nav.restart', 'Restart'));
            fetchRestartStatus(c2.token, origin2);
            showNavConfirm({
              title: navT('nav.restart_failed', 'Restart failed'),
              message: navT('nav.restart_rejected', 'The PBGui service restart request was rejected.'),
              detail: err && err.message ? err.message : navT('nav.restart_failed_default', 'Restart failed.'),
              confirmText: navT('common.ok', 'OK'),
              cancelText: '',
              hideCancel: true
            });
          });
        });
      });
    }

    function startRestartStatusWatch() {
      stopRestartStatusWatch();
      fetchRestartStatus(TOKEN, apiOrigin);
      _restartPollTimer = setInterval(function () { fetchRestartStatus(TOKEN, apiOrigin); }, 30000);
      setupRestartSSE(TOKEN, apiOrigin);
    }
    startRestartStatusWatch();
    window.addEventListener('pagehide', stopRestartStatusWatch);
    window.addEventListener('pageshow', function (event) {
      if (event && event.persisted) startRestartStatusWatch();
    });
  }

  function showRestartOverlay(origin, token, requestedServices) {
    /* Remove any existing overlay first */
    var existing = document.getElementById('pbgui-restart-overlay');
    if (existing) existing.remove();

    var ov = document.createElement('div');
    ov.id = 'pbgui-restart-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgb(19 17 20 / .94);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;font-family:var(--font-family,system-ui,sans-serif);';
    ov.innerHTML =
      '<div style="color:var(--text-primary,#e8ecf4);font-size:1.1rem;font-weight:600;">' + esc(navT('nav.restarting_services', 'Restarting PBGui Services\u2026')) + '</div>' +
      '<div id="pbgui-restart-status" style="color:var(--text-muted,#717b8e);font-size:0.85rem;">' + esc(navT('nav.waiting_services', 'Waiting for services\u2026')) + '</div>';
    document.body.appendChild(ov);

    var attempts = 0;
    var maxAttempts = 60;
    var remainingRestartRequested = false;
    var requestedRestartServices = {};
    (requestedServices || []).forEach(function (item) {
      var label = typeof item === 'string' ? item : String((item || {}).label || (item || {}).service || '');
      if (label) requestedRestartServices[label] = true;
    });
    var statusEl = document.getElementById('pbgui-restart-status');
    var apiBase = (origin || window.location.origin);

    function probe() {
      attempts++;
      if (statusEl) statusEl.textContent = navT('nav.reconnecting', 'Reconnecting\u2026 ({done}/{total})', { done: attempts, total: maxAttempts });
      fetch(apiBase + '/api/server-status', authOptions(token, { cache: 'no-store', credentials: 'same-origin' }))
        .then(function (r) {
          if (!r.ok) throw new Error('status unavailable');
          return r.json();
        })
        .then(function (data) {
          if (!data || data.needs_restart) {
            var newlyDiscovered = data && Array.isArray(data.restart_services)
              ? data.restart_services.filter(function (item) {
                  var label = String((item || {}).label || (item || {}).service || '');
                  return label && !requestedRestartServices[label];
                })
              : [];
            if (data && !remainingRestartRequested && data.service_restart_required && !data.api_restart_required && newlyDiscovered.length) {
              remainingRestartRequested = true;
              newlyDiscovered.forEach(function (item) {
                var label = String((item || {}).label || (item || {}).service || '');
                if (label) requestedRestartServices[label] = true;
              });
              if (statusEl) statusEl.textContent = navT('nav.restarting_remaining', 'Restarting remaining outdated services...');
              fetch(apiBase + '/api/server-restart', authOptions(token, {
                method: 'POST',
                credentials: 'same-origin'
              })).then(function (response) {
                if (response.ok) return;
                return response.json().catch(function () { return {}; }).then(function (payload) {
                  throw new Error((payload && payload.detail) ? String(payload.detail) : 'remaining service restart failed');
                });
              }).then(function () {
                attempts = 0;
                setTimeout(probe, 2000);
              }).catch(function (error) {
                _overlayFail(navT('nav.restart_remaining_failed', 'Could not restart remaining services: {error}', { error: (error && error.message ? error.message : 'unknown error') }));
              });
              return;
            }
            if (attempts < maxAttempts) setTimeout(probe, 2000); else _overlayFail();
            return;
          }
          window.location.reload();
        })
        .catch(function () {
          if (attempts < maxAttempts) setTimeout(probe, 2000); else _overlayFail();
        });
    }

    function _overlayFail(message) {
      if (statusEl) statusEl.textContent = message || navT('nav.services_not_current', 'Services did not become current \u2014 please refresh and inspect service status.');
      if (!document.getElementById('pbgui-restart-reload')) {
        var reloadButton = document.createElement('button');
        reloadButton.id = 'pbgui-restart-reload';
        reloadButton.type = 'button';
        reloadButton.textContent = navT('nav.reload_page', 'Reload page');
        reloadButton.style.cssText = 'border:1px solid #334155;border-radius:6px;background:#172033;color:#e2e8f0;padding:.55rem .9rem;cursor:pointer;';
        reloadButton.addEventListener('click', function () { window.location.reload(); });
        ov.appendChild(reloadButton);
      }
    }

    /* First probe after PBGUI_RESTART_DELAY (3s) + a small buffer */
    setTimeout(probe, 4000);
  }

  function updateRestartButtonState(state) {
    _restartStatus = state || {};
    if (state && state.master_name !== undefined) updateMasterName(state.master_name);
    updateAuthModeState(state && state.auth ? state.auth : {});
    var btn = document.getElementById('pbgui-restart-btn');
    if (!btn) return;
    var visible = !!(state && state.needs_restart);
    var blocked = state && state.restart_blocked !== undefined
      ? !!state.restart_blocked
      : btn.getAttribute('data-restart-blocked') === '1';
    var reason = state && state.restart_block_reason !== undefined
      ? String(state.restart_block_reason || '')
      : (btn.getAttribute('data-restart-block-reason') || '');
    var services = state && Array.isArray(state.restart_services) ? state.restart_services : [];
    var serviceLabels = services.map(function (item) {
      return String((item || {}).label || (item || {}).service || '').trim();
    }).filter(Boolean);
    btn.style.display = visible ? 'flex' : 'none';
    btn.setAttribute('data-restart-blocked', blocked ? '1' : '0');
    btn.setAttribute('data-restart-block-reason', reason);
    btn.disabled = false;
    btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
    btn.classList.toggle('disabled', blocked);
    btn.innerHTML = '<span class="nav-restart-dot"></span>' + esc(navT('nav.restart', 'Restart')) + (serviceLabels.length ? ' (' + serviceLabels.length + ')' : '');
    btn.title = blocked
      ? navT('nav.restart_blocked_title', 'Restart blocked: {reason}', { reason: (reason || navT('nav.restart_blocked_default', 'Protected PBGui work is still running.')) })
      : (navT('nav.restart_outdated_title', 'Restart outdated PBGui services') + (serviceLabels.length ? ': ' + serviceLabels.join(', ') : ''));
  }

  function updateAuthModeState(auth) {
    var pill = document.getElementById('pbgui-auth-mode-pill');
    if (!pill) return;
    var disabled = !!(auth && auth.disabled);
    pill.classList.toggle('visible', disabled);
    if (!disabled) {
      pill.title = '';
      return;
    }
    var bindHost = String(auth.bind_host || navT('nav.configured_interface', 'configured interface'));
    pill.title = auth.wildcard_bind
      ? navT('nav.auth_disabled_any', 'Authentication disabled. Anyone who can reach the PBGui API port has full access.')
      : navT('nav.auth_disabled_host', 'Authentication disabled on {host}. Anyone who can reach this address has full access.', { host: bindHost });
  }

  function fetchRestartStatus(token, apiOrigin) {
    if (!apiOrigin) return;
    fetch(apiOrigin + '/api/server-status', authOptions(token, { cache: 'no-store' }))
      .then(function (resp) {
        if (!resp.ok) throw new Error('server-status failed');
        return resp.json();
      })
      .then(function (data) {
        updateRestartButtonState(data || {});
      })
      .catch(function () {});
  }

  function setupRestartSSE(token, apiOrigin) {
    if (!apiOrigin) return;
    if (_restartEventSource) _restartEventSource.close();
    var url = apiOrigin + '/api/server-status/stream';
    var es = new EventSource(url, { withCredentials: true });
    _restartEventSource = es;
    es.onmessage = function (e) {
      try {
        var data = JSON.parse(e.data);
        updateRestartButtonState(data || {});
      } catch (_) {}
    };
    es.onerror = function () {
      if (_restartEventSource !== es) return;
      es.close();
      _restartEventSource = null;
      fetchRestartStatus(token, apiOrigin);
      if (_restartRetryTimer) clearTimeout(_restartRetryTimer);
      _restartRetryTimer = setTimeout(function() {
        _restartRetryTimer = null;
        setupRestartSSE(token, apiOrigin);
      }, 15000);
    };
  }

  function stopRestartStatusWatch() {
    if (_restartEventSource) {
      _restartEventSource.close();
      _restartEventSource = null;
    }
    if (_restartRetryTimer) {
      clearTimeout(_restartRetryTimer);
      _restartRetryTimer = null;
    }
    if (_restartPollTimer) {
      clearInterval(_restartPollTimer);
      _restartPollTimer = null;
    }
  }

  /* ── html escape helper ── */
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    return esc(s).replace(/'/g, '&#39;');
  }

  /* ════════════════════════════════════
     TOKEN KEEP-ALIVE & 401 REDIRECT
     ════════════════════════════════════ */

  /* Redirect to the standalone root login when token is invalid/expired. */
  var _authRedirecting = false;
  function replaceTopLocation(url) {
    try {
      if (window.top) {
        window.top.location.replace(url);
        return;
      }
    } catch (e) {
      /* Fall back when a browser blocks top-level access. */
    }
    window.location.replace(url);
  }

  function redirectToLogin() {
    if (_authRedirecting) return;
    _authRedirecting = true;
    if (_refreshTimer) {
      clearInterval(_refreshTimer);
      _refreshTimer = null;
    }
    var c = cfg();
    var origin = '';
    if (c.apiBase) {
      var match = String(c.apiBase).match(/^(https?:\/\/[^/]+)/);
      if (match) origin = match[1];
    }
    if (!origin) origin = window.location.origin;
    var url = new URL(origin + '/');
    replaceTopLocation(url.toString());
  }

  function performLogout() {
    var c = cfg();
    var origin = '';
    if (c.apiBase) {
      var match = String(c.apiBase).match(/^(https?:\/\/[^/]+)/);
      if (match) origin = match[1];
    }
    if (!origin) origin = window.location.origin;

    fetch(origin + '/api/auth/logout', authOptions(c.token, {
      method: 'POST',
      credentials: 'same-origin'
    })).finally(function () {
      redirectToLogin();
    });
  }

  /* Periodically call /api/token-refresh to extend token expiry.
     Interval: 30 minutes.  If the refresh itself returns 401 we redirect. */
  var _refreshTimer = null;
  var _authCheckPending = false;
  function tokenRefreshUrl() {
    var apiRoot = '';
    if (window.API_BASE) {
      var m = String(window.API_BASE).match(/^(https?:\/\/[^/]+)/);
      apiRoot = m ? m[1] : '';
    }
    return apiRoot + '/api/token-refresh';
  }

  function confirmTokenStillValid() {
    if (_authCheckPending) return;
    var c = cfg();
    _authCheckPending = true;
    _origFetch(tokenRefreshUrl(), authOptions(c.token, { method: 'POST' }))
      .then(function (r) {
        if (r.status === 401) {
          redirectToLogin();
          return;
        }
        _authCheckPending = false;
      })
      .catch(function () { _authCheckPending = false; });
  }

  function startTokenRefresh() {
    if (_refreshTimer) return;
    var c = cfg();
    function doRefresh() {
      if (_authRedirecting) return;
      _origFetch(tokenRefreshUrl(), authOptions(c.token, { method: 'POST' }))
        .then(function (r) {
          if (r.status === 401) { redirectToLogin(); return; }
          if (r.ok) { var ai = document.getElementById('pbgui-ai-btn'); if (ai) ai.style.display = 'inline-flex'; }
        })
        .catch(function () { /* network error — ignore, will retry next cycle */ });
    }
    doRefresh();  /* immediate first refresh on page load */
    _refreshTimer = setInterval(doRefresh, 30 * 60 * 1000);  /* every 30 min */
  }

  /* Global 401 interceptor — confirm the session token is actually invalid before
     redirecting, so one transient background 401 does not drop the whole page. */
  var _origFetch = window.fetch;
  window.fetch = function () {
    return _origFetch.apply(this, arguments).then(function (response) {
      if (response.status === 401) {
        confirmTokenStillValid();
      }
      return response;
    });
  };

  /* ════════════════════════════════════
     INIT
     ════════════════════════════════════ */
  function init() {
    injectCSS();
    buildNav();
    buildNotifyPanel();
    buildAbout();
    buildConfirmOverlay();
    setupHandlers();
    startTokenRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose overlay helper so other scripts on the same page (e.g. services_monitor.html)
     can call it without requiring closure access to this IIFE. */
  window.showRestartOverlay = showRestartOverlay;
  window.PBGuiConfirm = showNavConfirm;

}());
