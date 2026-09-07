/* ============================================================
   SANDBOX-ADAPTER.JS — v01.35
   The compatibility layer for Sandbox. Its only job: take code that
   was NOT written with Nosirt in mind — pasted from an AI, uploaded as
   one or more files, or uploaded as a ZIP — and turn it into one
   self-contained HTML document that can run inside a sandboxed iframe,
   without the author ever having to call a special Nosirt API.

   Ported from the standalone adapter prototype. Fixed one real bug
   found in the prototype: the injected runtime bridge had a bare
   `try { ... }` with no `catch`/`finally`, which is invalid JS — since
   that string gets written directly into every adapted creation's
   <script> tag, EVERY creation built through this path would hit a
   syntax error the instant it tried to load. Fixed here.

   Security note: everything this file builds is only ever meant to be
   loaded into an iframe with sandbox="allow-scripts" and deliberately
   NO "allow-same-origin". That combination is what actually makes this
   safe — it gives the creation's code a unique, opaque origin with no
   access to Nosirt's cookies, localStorage, DOM, or same-origin fetches
   back to Nosirt's own backend. This file does NOT enforce that itself
   (it just builds a document) — whatever calls build() must render the
   result into a properly sandboxed iframe. See sandbox.js.
   ============================================================ */
window.SandboxAdapter = (() => {

  const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico|bmp|wav|mp3|ogg|m4a|mp4|webm|woff2?|ttf|otf)$/i;

  function classify(name, text) {
    const ext = (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
    if (/^html?$/.test(ext)) return 'html';
    if (/^m?js$/.test(ext)) return 'js';
    if (ext === 'css') return 'css';
    if (ext === 'json') return 'json';
    if (ASSET_RE.test(name)) return 'asset';
    if (text != null && /<(?:html|body|canvas|script|style)\b/i.test(text)) return 'html';
    return text != null ? 'js' : 'asset';
  }

  // Read-only compatibility report — informational only. This is NOT a
  // security boundary; it never blocks anything. The iframe sandbox is
  // the actual boundary (see the header comment). This just tells the
  // person what Sandbox noticed, so pasting something unusual isn't a
  // silent surprise.
  function inspect(code, files) {
    const all = [code || '', ...(files || []).filter(f => f.kind !== 'asset').map(f => f.text || '')].join('\n');
    const report = [];
    const add = (level, title, detail) => report.push({ level, title, detail });

    const hasJs = /(?:\bconst\b|\blet\b|\bvar\b|\bfunction\b|=>|addEventListener\s*\(|document\.|window\.)/.test(all);
    const hasCss = /(?:[.#]?[A-Za-z][\w-]*\s*\{[^}]*\}|<style[\s>])/s.test(all);
    const hasCanvas = /<canvas\b|getContext\s*\(/i.test(all);
    const hasNet = /\bfetch\s*\(|XMLHttpRequest|WebSocket/i.test(all);
    const hasExtScript = /<script[^>]+src\s*=/i.test(all);
    const hasModules = /<script[^>]+type\s*=\s*["']module|(?:^|\s)import\s+.*\s+from\s+['"]/.test(all);
    const hasDanger = /\beval\s*\(|new\s+Function\s*\(|document\.cookie/i.test(all);
    const hasStorageApi = /\blocalStorage\b|\bindexedDB\b/.test(all);

    add('good', 'Runs in an isolated sandbox', 'This creation runs in its own iframe with no access to Nosirt accounts, cookies, or data — regardless of what the code does.');
    if (hasJs) add('good', 'JavaScript detected', 'Will run inside the sandboxed runner as-is.');
    if (hasCss) add('good', 'CSS detected', 'Styles will be included in the adapted document.');
    if (hasCanvas) add('good', 'Canvas detected', 'Canvas-based games/graphics are supported.');
    if (files && files.length) add('good', 'Project files', `${files.length} file${files.length === 1 ? '' : 's'} imported.`);
    if (hasNet) add('warn', 'Network requests', 'This code makes network calls (fetch/XHR/WebSocket). It runs from a sandboxed origin, so it can\'t reach Nosirt\'s own backend or read Nosirt cookies — but it can still reach the open internet unless you\'re offline.');
    if (hasExtScript) add('warn', 'External script tags', 'References an external script URL. It may not load if that URL goes away, and Sandbox can\'t adapt code it doesn\'t control.');
    if (hasModules) add('warn', 'ES modules / imports', 'Modules are preserved as-is, but full npm/build-tool projects (React, Vite, bundlers) aren\'t supported yet — plain HTML/JS/CSS works best.');
    if (hasDanger) add('warn', 'Uses eval/Function/cookies', 'These still run fully isolated in the sandbox, so this is informational, not a warning about safety to you.');
    if (hasStorageApi) add('good', 'Uses its own storage', 'localStorage/indexedDB calls are scoped to the sandbox\'s own isolated origin — separate from Nosirt\'s and from every other creation\'s.');
    if (!hasJs && !/<(?:html|body|canvas|div|main|button|p|h1)\b/i.test(all) && !(files && files.length)) {
      add('warn', 'Nothing to run yet', 'Paste some HTML, JavaScript, or CSS, or upload a project.');
    }
    return report;
  }

  // Turns asset files into usable URLs. `persistentUrls`, if provided,
  // is a { filename: url } map of already-uploaded Storage URLs (used
  // when running a SAVED/PUBLISHED creation) — those take priority over
  // making fresh blob URLs, since blob URLs die on page reload and
  // can't be persisted at all.
  function assetUrls(files, persistentUrls) {
    const map = {};
    for (const f of (files || [])) {
      if (f.kind !== 'asset') continue;
      if (persistentUrls && persistentUrls[f.name]) { map[f.name] = persistentUrls[f.name]; continue; }
      if (f.blob) map[f.name] = URL.createObjectURL(f.blob);
    }
    return map;
  }

  function rewriteRefs(source, urlMap) {
    for (const [name, url] of Object.entries(urlMap)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      source = source.replace(new RegExp(`(["'(])(?:\\./)?${escaped}(["')])`, 'g'), `$1${url}$2`);
    }
    return source;
  }

  // Builds one self-contained HTML document from whatever was pasted or
  // uploaded — the actual "compatibility" step. No special API required
  // from the author's code; it just runs as normal HTML/JS/CSS.
  async function build(code, files = [], persistentUrls = null) {
    files = files || [];
    const urlMap = assetUrls(files, persistentUrls);
    const htmlFiles = files.filter(f => f.kind === 'html');
    const jsFiles = files.filter(f => f.kind === 'js');
    const cssFiles = files.filter(f => f.kind === 'css');

    let html = '', js = [], css = [];

    if (htmlFiles.length) {
      html = htmlFiles.map(f => f.text).join('\n');
      js.push(...[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]));
      css.push(...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]));
      html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    } else if ((code || '').trim()) {
      if (/<(?:!doctype|html|head|body)\b/i.test(code)) {
        html = code;
        js.push(...[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]));
        css.push(...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]));
        html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
      } else if (/<style[\s>]/i.test(code)) {
        css.push(code);
      } else {
        js.push(code);
      }
    }
    js.push(...jsFiles.map(f => f.text));
    css.push(...cssFiles.map(f => f.text));

    html = rewriteRefs(html, urlMap);
    const joinedJs = rewriteRefs(js.join('\n'), urlMap);
    const joinedCss = rewriteRefs(css.join('\n'), urlMap);

    const shell = html.trim() || '<main id="app"></main>';
    const head = `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>html,body{margin:0;padding:0;min-height:100%;font-family:system-ui,sans-serif}</style>` +
      `<style>${joinedCss.replace(/<\/style/gi, '<\\/style')}</style>`;

    // v01.35: fixed — the prototype had `try{ ... }` with no catch here,
    // which is a syntax error the moment the runner iframe tries to
    // parse it. Every adapted creation would have silently failed to
    // load at all. Also wrapped the whole user script in its own
    // try/catch so one bug in the pasted code produces a visible error
    // instead of a blank white iframe.
    const runtime = `<script>
window.SandboxHost = {
  notify: function(type, data) {
    try { parent.postMessage({ source: 'nosirt-sandbox', type: type, data: data }, '*'); }
    catch (e) {}
  }
};
addEventListener('error', function(e) {
  SandboxHost.notify('error', { message: e.message, line: e.lineno });
});
addEventListener('unhandledrejection', function(e) {
  SandboxHost.notify('error', { message: 'Unhandled promise rejection: ' + (e.reason && e.reason.message || e.reason) });
});
SandboxHost.notify('ready', {});
<\/script>`;

    const wrappedJs = `try {\n${joinedJs}\n} catch (e) {\n  if (window.SandboxHost) SandboxHost.notify('error', { message: String(e && e.stack || e) });\n  console.error(e);\n}`;
    const scriptTag = '<script>' + wrappedJs.replace(/<\/script/gi, '<\\/script>') + '<\\/script>';

    // v01.36 BUG FIX: this used to require a literal </head> and </body>
    // in the pasted/generated HTML to inject the CSS and JS into — if
    // either was missing (extremely common in quick AI-generated
    // snippets: no <head> at all, or an unclosed/omitted </body>), the
    // .replace() calls silently matched nothing, and the CSS — or the
    // user's entire script — never made it into the document at all.
    // The code would "select"/load but nothing would ever actually run,
    // with no error anywhere to explain why. Now falls back to just
    // appending wherever the expected tag is missing — browsers parse a
    // stray trailing <script>/<style> tag just fine regardless of
    // formal head/body structure, so this can no longer silently drop
    // anything.
    if (/<html\b/i.test(shell)) {
      let out = shell;
      out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, head + '</head>') : (head + out);
      out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, runtime + scriptTag + '</body>') : (out + runtime + scriptTag);
      return out;
    }
    return `<!doctype html><html><head>${head}</head><body>${shell}${runtime}${scriptTag}</body></html>`;
  }

  return { classify, inspect, build };
})();
