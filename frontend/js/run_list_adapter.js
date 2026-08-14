;(function () {
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

  function create(version) {
    var isV8 = String(version || '').toLowerCase() === 'v8';
    return {
      version: isV8 ? 'v8' : 'v7',
      isV8: isV8,
      label: isV8 ? 'PB8' : 'PB7',
      navSubtitle: i18nT('editor.run.navSubtitle', { version: isV8 ? '8' : '7' }, isV8 ? 'PBv8 RUN' : 'PBv7 RUN'),
      navCurrent: isV8 ? 'v8_run' : 'v7_run',
      websocketPath: isV8 ? '/api/v8/ws/v8' : '/api/v7/ws/v7',
      supportsBackups: true,
      supportsForcedModes: !isV8,
      supportsConversion: !isV8,
      configureUi: function () {
        document.title = i18nT('editor.run.title', { version: isV8 ? '8' : '7' }, (isV8 ? 'PBv8' : 'PBv7') + ' Run');
        document.querySelectorAll(isV8 ? '[data-v7-only]' : '[data-v8-only]').forEach(function(element) {
          element.hidden = true;
        });
        var addButton = document.getElementById('add-instance-btn');
        if (addButton) addButton.textContent = i18nT(isV8 ? 'editor.run.addInstanceP8' : 'editor.run.addInstance', null, '\u2795 Add ' + (isV8 ? 'PB8 Instance' : 'Instance'));
      }
    };
  }

  window.PBGuiRunListAdapter = { create: create };
}());
