;(function () {
  'use strict';

  /* i18n helper: translate via PBGuiI18n, fall back to the English original. */
  function _helpT(key, fallback, params) {
    var F = window.PBGuiI18n;
    if (F && typeof F.t === 'function') {
      var v = F.t(key, params);
      return v === key ? fallback : v;
    }
    return fallback;
  }

  /* Help content language: stored choice wins, otherwise follow the browser
     (zh* → ZH), like the GUI i18n auto-select; junk stored values count as
     no preference. */
  function _defaultHelpLang() {
    var stored = '';
    try { stored = localStorage.getItem('help-lang') || ''; } catch (e) { /* private mode */ }
    if (stored === 'EN' || stored === 'DE' || stored === 'ZH') return stored;
    try {
      var nav = String(navigator.language || navigator.userLanguage || '').toLowerCase();
      if (nav.indexOf('zh') === 0) return 'ZH';
    } catch (e) { /* ignore */ }
    return 'EN';
  }

  var state = {
    token: '',
    lang: _defaultHelpLang(),
    topics: [],
    selectedIndex: 0,
    loaded: false,
    topicCache: {},
    rawHtml: null,
    pendingAnchor: '',
    searchMarks: [],
    searchIndex: -1,
    searchTimer: null,
    globalMode: false,
    currentKeyword: 'overview',
    depsPromise: null,
    indexRequestSeq: 0,
    topicRequestSeq: 0
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-shared-help-src="' + src.replace(/"/g, '&quot;') + '"]');
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve();
        } else {
          existing.addEventListener('load', function () { resolve(); }, { once: true });
          existing.addEventListener('error', function () { reject(new Error('Failed to load ' + src)); }, { once: true });
        }
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.sharedHelpSrc = src;
      script.addEventListener('load', function () {
        script.dataset.loaded = '1';
        resolve();
      }, { once: true });
      script.addEventListener('error', function () {
        reject(new Error('Failed to load ' + src));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  function ensureDeps() {
    if (window.marked && window.DOMPurify) return Promise.resolve();
    if (state.depsPromise) return state.depsPromise;
    state.depsPromise = Promise.resolve()
      .then(function () {
        if (window.marked) return;
        return loadScript('/app/vendor/marked.min.js?v=1');
      })
      .then(function () {
        if (window.DOMPurify) return;
        return loadScript('/app/vendor/purify.min.js?v=1');
      })
      .then(function () {
        if (window.marked) window.marked.setOptions({ gfm: true, breaks: true });
      });
    return state.depsPromise;
  }

  function authHeaders() {
    return state.token ? { 'Authorization': 'Bearer ' + state.token } : {};
  }

  function injectCss() {
    if (document.getElementById('pbgui-shared-help-css')) return;
    var style = document.createElement('style');
    style.id = 'pbgui-shared-help-css';
    style.textContent = [
      '#pbgui-shared-help-ovl{display:none;position:fixed;inset:0;z-index:3065;pointer-events:none;}',
      '#pbgui-shared-help-ovl.visible{display:block;}',
      '#pbgui-shared-help-box{display:flex;flex-direction:column;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(900px,95vw);height:min(700px,90vh);min-width:480px;min-height:300px;background:#171c29;border:1px solid #333f5c;border-radius:12px;box-shadow:0 20px 70px rgba(5, 8, 14,.9);overflow:hidden;resize:both;pointer-events:auto;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e8ecf4;}',
      '#pbgui-shared-help-box.is-maximized{top:64px;left:12px;right:12px;bottom:12px;width:auto;height:auto;transform:none;max-width:none;max-height:none;resize:none;border-radius:14px;}',
      '#pbgui-shared-help-box,#pbgui-shared-help-box *{box-sizing:border-box;}',
      '#pbgui-shared-help-box button,#pbgui-shared-help-box input,#pbgui-shared-help-box label{font:inherit;letter-spacing:normal;text-transform:none;}',
      '#pbgui-shared-help-box button:hover{transform:none;}',
      '#pbgui-shared-help-drag{position:absolute;top:0;left:0;right:48px;height:46px;cursor:move;z-index:2;}',
      '#pbgui-shared-help-box.is-maximized #pbgui-shared-help-drag{cursor:default;pointer-events:none;}',
      '#pbgui-shared-help-box .ovl-header{display:flex;align-items:center;justify-content:space-between;padding:.85rem 1.1rem .85rem 1.25rem;border-bottom:1px solid #262f45;flex-shrink:0;background:#10141d;}',
      '#pbgui-shared-help-box .ovl-header-title{font-size:15px;font-weight:700;color:#e8ecf4;display:flex;align-items:center;gap:.5rem;}',
      '#pbgui-shared-help-box .ovl-header-actions{display:flex;align-items:center;gap:.5rem;position:relative;z-index:3;}',
      '#pbgui-shared-help-box .lang-pill{display:flex;border:1px solid #333f5c;border-radius:6px;overflow:hidden;flex-shrink:0;}',
      '#pbgui-shared-help-box .lang-pill button{background:transparent;border:none;color:#717b8e;font-size:11px;font-weight:600;letter-spacing:.05em;padding:.2rem .55rem;cursor:pointer;transition:all .12s;}',
      '#pbgui-shared-help-box .lang-pill button.active{background:#1e3a5f;color:#96b9f4;}',
      '#pbgui-shared-help-box .lang-pill button:hover:not(.active){background:rgba(255,255,255,.04);color:#e8ecf4;}',
      '#pbgui-shared-help-box .ovl-tool,#pbgui-shared-help-box .ovl-close{background:transparent;border:1px solid transparent;color:#717b8e;font-size:15px;cursor:pointer;width:28px;height:28px;padding:0;border-radius:4px;line-height:1;display:inline-flex;align-items:center;justify-content:center;transition:color .12s,background .12s,border-color .12s;}',
      '#pbgui-shared-help-box .ovl-tool[aria-pressed="true"]{color:#e8ecf4;border-color:rgba(162, 156, 166,.2);background:rgba(255,255,255,.06);}',
      '#pbgui-shared-help-box .ovl-tool:hover,#pbgui-shared-help-box .ovl-close:hover{color:#e8ecf4;border-color:rgba(162, 156, 166,.18);background:rgba(255,255,255,.06);}',
      '#pbgui-shared-help-body{display:flex;flex:1;overflow:hidden;}',
      '#pbgui-shared-help-toc{width:230px;min-width:170px;flex-shrink:0;border-right:1px solid #262f45;overflow-y:auto;padding:.5rem 0;background:#0c1018;}',
      '#pbgui-shared-help-toc-filter{width:calc(100% - 1.2rem);margin:0 .6rem .4rem;background:#171c29;color:#e8ecf4;border:1px solid #333f5c;border-radius:5px;padding:.35rem .5rem;font-size:13px;outline:none;}',
      '#pbgui-shared-help-search{background:#171c29;color:#e8ecf4;border:1px solid #333f5c;border-radius:5px;padding:.28rem .5rem;font-size:13px;outline:none;width:170px;}',
      '#pbgui-shared-help-toc-filter:focus,#pbgui-shared-help-search:focus{border-color:#4d5c82;}',
      '#pbgui-shared-help-toc-filter::placeholder,#pbgui-shared-help-search::placeholder{color:#4d5c82;}',
      '.pbgui-shared-help-toc-item{display:block;padding:.42rem .9rem;color:#a3adc2;font-size:13px;cursor:pointer;border-left:3px solid transparent;transition:all .1s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.pbgui-shared-help-toc-item:hover{background:rgba(99,179,237,.08);color:#e8ecf4;}',
      '.pbgui-shared-help-toc-item.active{background:rgba(99,179,237,.12);border-left-color:#96b9f4;color:#96b9f4;font-weight:600;}',
      '#pbgui-shared-help-content{flex:1;min-width:0;overflow:auto;padding:1.2rem 1.3rem 1.4rem;line-height:1.7;color:#e8ecf4;}',
      '#pbgui-shared-help-content h1,#pbgui-shared-help-content h2,#pbgui-shared-help-content h3{color:#f2f5fb;margin:0 0 .75rem;}',
      '#pbgui-shared-help-content p,#pbgui-shared-help-content ul,#pbgui-shared-help-content ol,#pbgui-shared-help-content pre,#pbgui-shared-help-content blockquote,#pbgui-shared-help-content table{margin:0 0 .9rem;}',
      '#pbgui-shared-help-content a{color:#96b9f4;text-decoration:none;}','#pbgui-shared-help-content a:hover{text-decoration:underline;}',
      '#pbgui-shared-help-content code{background:#171c29;color:#f6ad55;padding:.1em .35em;border-radius:3px;font-size:11px;font-family:"Fira Code","Consolas",monospace;}',
      '#pbgui-shared-help-content pre{background:#0c1018;border:1px solid #333f5c;border-radius:6px;padding:.9rem 1rem;overflow-x:auto;}',
      '#pbgui-shared-help-content pre code{background:none;padding:0;color:#a0aec0;font-size:13px;}',
      '#pbgui-shared-help-content ul,#pbgui-shared-help-content ol{padding-left:1.5rem;}',
      '#pbgui-shared-help-content blockquote{border-left:3px solid #96b9f4;padding:.4rem .9rem;background:rgba(99,179,237,.05);border-radius:0 5px 5px 0;color:#a3adc2;}',
      '#pbgui-shared-help-content table{border-collapse:collapse;width:100%;}',
      '#pbgui-shared-help-content th,#pbgui-shared-help-content td{border:1px solid #333f5c;padding:.4rem .7rem;text-align:left;font-size:13px;}',
      '#pbgui-shared-help-content th{background:#171c29;color:#e8ecf4;font-weight:600;}',
      '.pbgui-shared-help-loading{color:#4d5c82;font-style:italic;padding:2rem;text-align:center;}',
      '#pbgui-shared-help-search-wrap{display:flex;align-items:center;gap:3px;}',
      '.pbgui-shared-help-snav{background:#171c29;border:1px solid #333f5c;border-radius:3px;color:#a3adc2;cursor:pointer;font-size:11px;padding:2px 5px;line-height:1.4;transition:color .1s,border-color .1s;}',
      '.pbgui-shared-help-snav:hover{color:#e8ecf4;border-color:#4d5c82;}',
      '#pbgui-shared-help-search-count{font-size:11px;color:#717b8e;white-space:nowrap;min-width:44px;text-align:left;}',
      '#pbgui-shared-help-content mark{background:rgba(255,200,0,.2);color:#fcd34d;border-radius:2px;}',
      '#pbgui-shared-help-content mark.current{background:rgba(251,146,60,.45);color:#fef08a;outline:1px solid #f59e0b;}',
      '#pbgui-shared-help-search-global-lbl{display:flex;align-items:center;gap:3px;color:#a3adc2;font-size:11px;font-weight:400;cursor:pointer;white-space:nowrap;user-select:none;}',
      '#pbgui-shared-help-search-global-lbl input[type=checkbox]{accent-color:#72a0ee;cursor:pointer;margin:0;}',
      '.pbgui-shared-help-gs-results{display:flex;flex-direction:column;gap:8px;padding:4px 0;}',
      '.pbgui-shared-help-gs-item{background:#171c29;border:1px solid #333f5c;border-radius:6px;padding:10px 14px;cursor:pointer;transition:border-color .15s;}',
      '.pbgui-shared-help-gs-item:hover{border-color:#4d5c82;}',
      '.pbgui-shared-help-gs-topic{color:#93c5fd;font-weight:600;font-size:13px;margin-bottom:5px;}',
      '.pbgui-shared-help-gs-snip{color:#a3adc2;font-size:11px;line-height:1.55;overflow:hidden;text-overflow:ellipsis;}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureDom() {
    injectCss();
    if (document.getElementById('pbgui-shared-help-ovl')) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = ''
      + '<div id="pbgui-shared-help-ovl" aria-hidden="true">'
      +   '<div id="pbgui-shared-help-box" role="dialog" aria-modal="true" aria-labelledby="pbgui-shared-help-title">'
      +     '<div id="pbgui-shared-help-drag"></div>'
      +     '<div class="ovl-header">'
      +       '<div class="ovl-header-title" id="pbgui-shared-help-title">&#128218; ' + _helpT('shared.help.title', 'Guide & Help') + '</div>'
      +       '<div class="ovl-header-actions">'
      +         '<div id="pbgui-shared-help-search-wrap">'
      +           '<input id="pbgui-shared-help-search" type="text" placeholder="' + _helpT('shared.help.searchInTopic', 'Search in topic...') + '" autocomplete="off">'
      +           '<button class="pbgui-shared-help-snav" id="pbgui-shared-help-search-up" title="' + _helpT('shared.help.prevMatch', 'Previous match (Shift+Enter)') + '">&#9650;</button>'
      +           '<button class="pbgui-shared-help-snav" id="pbgui-shared-help-search-dn" title="' + _helpT('shared.help.nextMatch', 'Next match (Enter)') + '">&#9660;</button>'
      +           '<span id="pbgui-shared-help-search-count"></span>'
      +           '<label id="pbgui-shared-help-search-global-lbl" title="' + _helpT('shared.help.searchAllTitle', 'Search across all topics') + '"><input type="checkbox" id="pbgui-shared-help-search-global"> ' + _helpT('common.all', 'All') + '</label>'
      +         '</div>'
      +         '<div style="width:1px;height:16px;background:#333f5c;flex-shrink:0;"></div>'
      +         '<div class="lang-pill">'
      +           '<button id="pbgui-shared-help-lang-en" type="button">EN</button>'
      +           '<button id="pbgui-shared-help-lang-de" type="button">DE</button>'
      +           '<button id="pbgui-shared-help-lang-zh" type="button" title="中文 (简体中文)">中文</button>'
      +         '</div>'
      +         '<button class="ovl-tool" id="pbgui-shared-help-maximize" title="' + _helpT('nav.fit_window', 'Fit to browser window') + '" aria-pressed="false">⛶</button>'
      +         '<button class="ovl-close" id="pbgui-shared-help-close" aria-label="' + _helpT('common.close', 'Close') + '">&#x2715;</button>'
      +       '</div>'
      +     '</div>'
      +     '<div id="pbgui-shared-help-body">'
      +       '<div id="pbgui-shared-help-toc">'
      +         '<input id="pbgui-shared-help-toc-filter" type="text" placeholder="' + _helpT('shared.help.filterTopics', 'Filter topics...') + '" autocomplete="off">'
      +         '<div id="pbgui-shared-help-toc-list"></div>'
      +       '</div>'
      +       '<div id="pbgui-shared-help-content"><div class="pbgui-shared-help-loading">' + _helpT('shared.help.loadingTopics', 'Loading help topics...') + '</div></div>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(wrapper.firstChild);
    bindDom();
  }

  function dom(id) { return document.getElementById(id); }

  function renderMarkdown(md) {
    return window.DOMPurify.sanitize(window.marked.parse(String(md || '')));
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function stripHtml(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function slugifyText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  function scrollToAnchor(anchor) {
    anchor = String(anchor || '').replace(/^#/, '').trim();
    if (!anchor) return;
    var content = dom('pbgui-shared-help-content');
    if (!content) return;
    var target = window.CSS && typeof window.CSS.escape === 'function'
      ? content.querySelector('#' + window.CSS.escape(anchor))
      : document.getElementById(anchor);
    if (target && !content.contains(target)) target = null;
    if (!target) {
      Array.prototype.slice.call(content.querySelectorAll('h1,h2,h3,h4')).some(function (heading) {
        if (slugifyText(heading.textContent) === anchor) {
          target = heading;
          return true;
        }
        return false;
      });
    }
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function syncLangButtons() {
    dom('pbgui-shared-help-lang-en').classList.toggle('active', state.lang === 'EN');
    dom('pbgui-shared-help-lang-de').classList.toggle('active', state.lang === 'DE');
    dom('pbgui-shared-help-lang-zh').classList.toggle('active', state.lang === 'ZH');
  }

  function updateSearchCount() {
    dom('pbgui-shared-help-search-count').textContent = state.searchMarks.length
      ? (state.searchIndex + 1) + '/' + state.searchMarks.length
      : (dom('pbgui-shared-help-search').value.trim() ? _helpT('shared.help.zeroFound', '0 found') : '');
  }

  function gotoMark(index) {
    if (!state.searchMarks.length) return;
    if (state.searchIndex >= 0 && state.searchIndex < state.searchMarks.length) {
      state.searchMarks[state.searchIndex].classList.remove('current');
    }
    state.searchIndex = ((index % state.searchMarks.length) + state.searchMarks.length) % state.searchMarks.length;
    state.searchMarks[state.searchIndex].classList.add('current');
    state.searchMarks[state.searchIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateSearchCount();
  }

  function clearSearch() {
    if (state.rawHtml !== null) dom('pbgui-shared-help-content').innerHTML = state.rawHtml;
    state.searchMarks = [];
    state.searchIndex = -1;
    dom('pbgui-shared-help-search-count').textContent = '';
  }

  function applySearch(term) {
    if (state.rawHtml === null) return;
    if (!term) {
      clearSearch();
      return;
    }
    var expr;
    try { expr = new RegExp('(' + escapeRegExp(term) + ')', 'gi'); } catch (_) { return; }
    dom('pbgui-shared-help-content').innerHTML = state.rawHtml.replace(/(<[^>]+>)|([^<]+)/g, function (_, tag, text) {
      if (tag) return tag;
      return text.replace(expr, function (match) { return '<mark>' + match + '</mark>'; });
    });
    state.searchMarks = Array.prototype.slice.call(dom('pbgui-shared-help-content').querySelectorAll('mark'));
    updateSearchCount();
    if (state.searchMarks.length) gotoMark(0);
  }

  function ensureTopicCached(index, callback) {
    if (state.topicCache[index] !== undefined) {
      callback(state.topicCache[index]);
      return;
    }
    var topic = state.topics[index];
    if (!topic) {
      callback('');
      return;
    }
    fetch('/api/help/content?file=' + encodeURIComponent(topic.file) + '&lang=' + state.lang, { headers: authHeaders() })
      .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
      .then(function (data) {
        state.topicCache[index] = renderMarkdown(data.content || '');
        callback(state.topicCache[index]);
      })
      .catch(function () {
        state.topicCache[index] = '';
        callback('');
      });
  }

  function renderGlobalResults(term, results) {
    var expr;
    try { expr = new RegExp('(' + escapeRegExp(term) + ')', 'gi'); } catch (_) { return; }
    if (!results.length) {
      dom('pbgui-shared-help-content').innerHTML = '<p style="color:#717b8e;padding:8px 0;">' + _helpT('shared.help.noResults', 'No results found.') + '</p>';
      dom('pbgui-shared-help-search-count').textContent = _helpT('shared.help.zeroFound', '0 found');
      return;
    }
    dom('pbgui-shared-help-search-count').textContent = results.length === 1
      ? _helpT('shared.help.resultTopic', results.length + ' topic', { count: results.length })
      : _helpT('shared.help.resultTopics', results.length + ' topics', { count: results.length });
    var html = '<div class="pbgui-shared-help-gs-results">';
    results.forEach(function (result) {
      html += '<div class="pbgui-shared-help-gs-item" data-idx="' + result.idx + '">';
      html += '<div class="pbgui-shared-help-gs-topic">' + result.title + '</div>';
      result.snippets.forEach(function (snippet) {
        html += '<div class="pbgui-shared-help-gs-snip">...' + snippet.replace(expr, '<mark>$1</mark>') + '...</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    dom('pbgui-shared-help-content').innerHTML = html;
    Array.prototype.slice.call(dom('pbgui-shared-help-content').querySelectorAll('.pbgui-shared-help-gs-item')).forEach(function (item) {
      item.addEventListener('click', function () {
        var idx = parseInt(item.getAttribute('data-idx'), 10);
        dom('pbgui-shared-help-search-global').checked = false;
        state.globalMode = false;
        dom('pbgui-shared-help-search').placeholder = _helpT('shared.help.searchInTopic', 'Search in topic...');
        loadTopic(idx);
      });
    });
  }

  function showGlobalResults(term) {
    if (!term) {
      dom('pbgui-shared-help-content').innerHTML = '<p style="color:#717b8e;padding:8px 0;">' + _helpT('shared.help.searchPrompt', 'Type a search term to find across all topics.') + '</p>';
      dom('pbgui-shared-help-search-count').textContent = '';
      return;
    }
    var expr;
    try { expr = new RegExp(escapeRegExp(term), 'gi'); } catch (_) { return; }
    dom('pbgui-shared-help-content').innerHTML = '<div class="pbgui-shared-help-loading">' + _helpT('shared.help.searching', 'Searching...') + '</div>';
    var pending = state.topics.length;
    var results = [];
    if (!pending) {
      dom('pbgui-shared-help-content').innerHTML = '<p style="color:#717b8e;padding:8px 0;">' + _helpT('shared.help.noResults', 'No results found.') + '</p>';
      return;
    }
    state.topics.forEach(function (topic, index) {
      ensureTopicCached(index, function (html) {
        var text = stripHtml(html);
        var matches = [];
        var match;
        expr.lastIndex = 0;
        while ((match = expr.exec(text)) !== null) {
          matches.push(match.index);
          if (matches.length >= 3) break;
        }
        if (matches.length) {
          results.push({
            idx: index,
            title: topic.title,
            snippets: matches.map(function (position) {
              return text.slice(Math.max(0, position - 55), Math.min(text.length, position + 80));
            })
          });
        }
        pending -= 1;
        if (!pending) renderGlobalResults(term, results);
      });
    });
  }

  function renderToc() {
    var filter = dom('pbgui-shared-help-toc-filter').value.trim().toLowerCase();
    var list = dom('pbgui-shared-help-toc-list');
    list.innerHTML = '';
    state.topics.forEach(function (topic, index) {
      if (filter && topic.title.toLowerCase().indexOf(filter) === -1) return;
      var item = document.createElement('div');
      item.className = 'pbgui-shared-help-toc-item' + (index === state.selectedIndex ? ' active' : '');
      item.textContent = topic.title;
      item.addEventListener('click', function () { loadTopic(index); });
      list.appendChild(item);
    });
  }

  function loadTopic(index, options) {
    options = options || {};
    var requestSeq = ++state.topicRequestSeq;
    state.selectedIndex = index;
    renderToc();
    var topic = state.topics[index];
    if (!topic) return;
    state.rawHtml = null;
    state.searchMarks = [];
    state.searchIndex = -1;
    dom('pbgui-shared-help-search-count').textContent = '';
    dom('pbgui-shared-help-content').innerHTML = '<div class="pbgui-shared-help-loading">' + _helpT('common.loading', 'Loading...') + '</div>';
    fetch('/api/help/content?file=' + encodeURIComponent(topic.file) + '&lang=' + state.lang, { headers: authHeaders() })
      .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
      .then(function (data) {
        if (requestSeq !== state.topicRequestSeq) return;
        var anchor = options.anchor || state.pendingAnchor;
        state.rawHtml = renderMarkdown(data.content || '');
        state.topicCache[index] = state.rawHtml;
        dom('pbgui-shared-help-content').innerHTML = state.rawHtml;
        dom('pbgui-shared-help-content').scrollTop = 0;
        if (dom('pbgui-shared-help-search').value.trim() && !state.globalMode) {
          applySearch(dom('pbgui-shared-help-search').value.trim());
        }
        state.pendingAnchor = '';
        window.setTimeout(function () { scrollToAnchor(anchor); }, 0);
      })
      .catch(function () {
        if (requestSeq !== state.topicRequestSeq) return;
        dom('pbgui-shared-help-content').innerHTML = '<div class="pbgui-shared-help-loading">' + _helpT('shared.help.loadFailed', 'Failed to load content.') + '</div>';
      });
  }

  function loadHelpIndex(keyword, anchor) {
    var requestSeq = ++state.indexRequestSeq;
    state.topicRequestSeq += 1;
    state.currentKeyword = String(keyword || 'overview');
    state.pendingAnchor = String(anchor || '');
    dom('pbgui-shared-help-toc-list').innerHTML = '<div class="pbgui-shared-help-loading">' + _helpT('common.loading', 'Loading...') + '</div>';
    fetch('/api/help/index?lang=' + state.lang, { headers: authHeaders() })
      .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
      .then(function (data) {
        if (requestSeq !== state.indexRequestSeq) return;
        state.topics = data || [];
        renderToc();
        if (!state.topics.length) {
          dom('pbgui-shared-help-content').innerHTML = '<div class="pbgui-shared-help-loading">' + _helpT('shared.help.noTopics', 'No help topics found.') + '</div>';
          return;
        }
        var startIndex = 0;
        var kw = state.currentKeyword.toLowerCase();
        for (var i = 0; i < state.topics.length; i += 1) {
          var file = String(state.topics[i].file || '').toLowerCase();
          var title = String(state.topics[i].title || '').toLowerCase();
          if (title.indexOf(kw) !== -1 || file.indexOf(kw) !== -1) {
            startIndex = i;
            break;
          }
        }
        state.loaded = true;
        loadTopic(startIndex, { anchor: state.pendingAnchor });
      })
      .catch(function () {
        if (requestSeq !== state.indexRequestSeq) return;
        dom('pbgui-shared-help-toc-list').innerHTML = '<div class="pbgui-shared-help-loading">' + _helpT('shared.help.topicsFailed', 'Failed to load topics.') + '</div>';
        dom('pbgui-shared-help-content').innerHTML = '<div class="pbgui-shared-help-loading">' + _helpT('shared.help.loadFailed', 'Failed to load content.') + '</div>';
      });
  }

  function setLang(lang) {
    if (state.lang === lang) return;
    state.lang = lang;
    localStorage.setItem('help-lang', state.lang);
    state.topicCache = {};
    state.selectedIndex = 0;
    syncLangButtons();
    loadHelpIndex(state.currentKeyword, state.pendingAnchor);
  }

  function bindDrag() {
    var drag = dom('pbgui-shared-help-drag');
    var box = dom('pbgui-shared-help-box');
    drag.addEventListener('mousedown', function (event) {
      if (window.innerWidth <= 720 || box.classList.contains('is-maximized')) return;
      event.preventDefault();
      var rect = box.getBoundingClientRect();
      box.style.transform = 'none';
      box.style.left = rect.left + 'px';
      box.style.top = rect.top + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';
      var startX = event.clientX;
      var startY = event.clientY;
      var boxLeft = rect.left;
      var boxTop = rect.top;
      function onMove(moveEvent) {
        box.style.left = (boxLeft + moveEvent.clientX - startX) + 'px';
        box.style.top = (boxTop + moveEvent.clientY - startY) + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function bindMaximize() {
    dom('pbgui-shared-help-maximize').addEventListener('click', function (event) {
      event.preventDefault();
      var box = dom('pbgui-shared-help-box');
      var next = !box.classList.contains('is-maximized');
      box.classList.toggle('is-maximized', next);
      dom('pbgui-shared-help-maximize').setAttribute('aria-pressed', next ? 'true' : 'false');
      dom('pbgui-shared-help-maximize').textContent = next ? '❐' : '⛶';
      dom('pbgui-shared-help-maximize').setAttribute('title', next ? _helpT('nav.restore_window', 'Restore window size') : _helpT('nav.fit_window', 'Fit to browser window'));
    });
  }

  function bindDom() {
    dom('pbgui-shared-help-close').addEventListener('click', closeHelp);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && dom('pbgui-shared-help-ovl').classList.contains('visible')) closeHelp();
    });
    dom('pbgui-shared-help-toc-filter').addEventListener('input', renderToc);
    dom('pbgui-shared-help-lang-en').addEventListener('click', function () { setLang('EN'); });
    dom('pbgui-shared-help-lang-de').addEventListener('click', function () { setLang('DE'); });
    dom('pbgui-shared-help-lang-zh').addEventListener('click', function () { setLang('ZH'); });
    dom('pbgui-shared-help-search').addEventListener('input', function () {
      if (state.searchTimer) clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(function () {
        var term = dom('pbgui-shared-help-search').value.trim();
        if (state.globalMode) showGlobalResults(term);
        else applySearch(term);
      }, 260);
    });
    dom('pbgui-shared-help-search').addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !state.globalMode) {
        event.preventDefault();
        gotoMark(state.searchIndex + (event.shiftKey ? -1 : 1));
      }
      if (event.key === 'Escape') {
        dom('pbgui-shared-help-search').value = '';
        if (state.globalMode) showGlobalResults('');
        else clearSearch();
      }
    });
    dom('pbgui-shared-help-search-up').addEventListener('click', function () { gotoMark(state.searchIndex - 1); });
    dom('pbgui-shared-help-search-dn').addEventListener('click', function () { gotoMark(state.searchIndex + 1); });
    dom('pbgui-shared-help-search-global').addEventListener('change', function () {
      state.globalMode = dom('pbgui-shared-help-search-global').checked;
      dom('pbgui-shared-help-search').placeholder = state.globalMode ? _helpT('shared.help.searchAllTopics', 'Search all topics...') : _helpT('shared.help.searchInTopic', 'Search in topic...');
      var term = dom('pbgui-shared-help-search').value.trim();
      if (state.globalMode) showGlobalResults(term);
      else {
        if (state.rawHtml !== null) {
          dom('pbgui-shared-help-content').innerHTML = state.rawHtml;
          state.searchMarks = [];
          state.searchIndex = -1;
          dom('pbgui-shared-help-search-count').textContent = '';
        }
        if (term) applySearch(term);
      }
    });
    bindDrag();
    bindMaximize();
  }

  function openHelp(keyword, options) {
    options = options || {};
    var anchor = options.anchor ? '#' + options.anchor.replace(/^#/, '') : '';
    var topicParam = keyword ? '?topic=' + encodeURIComponent(keyword) : '';
    window.location.href = '/api/help/main_page' + topicParam + anchor;
    return Promise.resolve();
  }

  function closeHelp() {
    var overlay = dom('pbgui-shared-help-ovl');
    if (!overlay) return;
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pbgui-help-open');
  }

  window.PBGuiSharedHelp = {
    open: openHelp,
    close: closeHelp,
    ensure: function () { ensureDom(); return ensureDeps(); }
  };
}());
