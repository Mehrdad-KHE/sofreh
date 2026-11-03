import vm from 'node:vm';

/**
 * Lightweight, zero-dependency DOM harness that parses the real HTML preview files
 * (`apps/customer-mobile/preview/index.html` and `apps/cook-mobile/preview/index.html`),
 * executes their inline <script> unmodified against a live `http://127.0.0.1:<port>` backend
 * using Node's real `fetch`, and supports real `.click()`, `.dispatchEvent()`, and DOM queries.
 */
export function mountPreviewHtmlInVm(
  htmlString,
  { apiBase, urlPath = '/preview/customer', geolocationMock = undefined } = {}
) {
  const elementsById = new Map();
  let allElements = [];
  const docListeners = new Map();
  const winListeners = new Map();

  class MockElement {
    constructor(tagName, id = '', attrs = {}) {
      this.tagName = String(tagName || 'DIV').toUpperCase();
      this.id = id;
      this.attributes = { ...attrs };
      if (id) this.attributes.id = id;
      this.value = attrs.value ?? '';
      this.checked = Boolean(attrs.checked);
      this.disabled = Object.prototype.hasOwnProperty.call(attrs, 'disabled');
      this.hidden = Object.prototype.hasOwnProperty.call(attrs, 'hidden');
      this.style = {};
      if (attrs.style) {
        for (const part of String(attrs.style).split(';')) {
          const [k, v] = part.split(':').map((s) => (s ? s.trim() : ''));
          if (k && v) this.style[k] = v;
        }
      }
      this._textContent = '';
      this._innerHTML = '';
      this._childElements = [];
      this.listeners = new Map();
    }

    get textContent() {
      return this._textContent || this._innerHTML.replace(/<[^>]+>/g, '');
    }

    set textContent(val) {
      this._textContent = String(val ?? '');
      this._innerHTML = this._textContent;
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(val) {
      unregisterChildElements(this._childElements);
      this._childElements = [];
      this._innerHTML = String(val ?? '');
      this._textContent = '';
      parseAndRegisterInnerElements(this._innerHTML, this._childElements);
    }

    getAttribute(name) {
      return this.attributes[name] ?? null;
    }

    setAttribute(name, val) {
      this.attributes[name] = String(val);
      if (name === 'id') {
        this.id = String(val);
        elementsById.set(this.id, this);
      }
      if (name === 'hidden') {
        this.hidden = true;
      }
    }

    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'hidden') {
        this.hidden = false;
      }
    }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, []);
      }
      this.listeners.get(type).push(fn);
    }

    dispatchEvent(event) {
      const evt = {
        preventDefault() {},
        stopPropagation() {},
        target: this,
        ...event
      };
      const fns = [...(this.listeners.get(typeFromEvent(evt)) || [])];
      for (const fn of fns) {
        fn.call(this, evt);
      }
    }

    click() {
      if (this.disabled) return;
      this.dispatchEvent({ type: 'click', target: this });
    }
  }

  function typeFromEvent(event) {
    return event && event.type ? event.type : 'click';
  }

  function unregisterChildElements(children) {
    if (!Array.isArray(children) || children.length === 0) return;
    const removeSet = new Set();
    const collect = (list) => {
      for (const ch of list) {
        removeSet.add(ch);
        if (Array.isArray(ch._childElements) && ch._childElements.length > 0) {
          collect(ch._childElements);
        }
      }
    };
    collect(children);
    for (const ch of removeSet) {
      if (ch.id && elementsById.get(ch.id) === ch) {
        elementsById.delete(ch.id);
      }
    }
    allElements = allElements.filter((el) => !removeSet.has(el));
  }

  function parseAttributes(attrString) {
    const attrs = {};
    const attrRegex = /([a-zA-Z0-9_-]+)(?:="([^"]*)")?/g;
    let m;
    while ((m = attrRegex.exec(attrString)) !== null) {
      const key = m[1];
      if (
        key === 'type' ||
        key === 'id' ||
        key === 'class' ||
        key === 'value' ||
        key === 'style' ||
        key === 'hidden' ||
        key.startsWith('data-') ||
        key.startsWith('aria-') ||
        key === 'disabled' ||
        key === 'checked' ||
        key === 'lang' ||
        key === 'dir'
      ) {
        attrs[key] = m[2] !== undefined ? m[2] : '';
      }
    }
    return attrs;
  }

  function parseAndRegisterInnerElements(fragmentHtml, ownerBucket = null) {
    const tagRegex = /<([a-zA-Z0-9]+)\s+([^>]*?)>/g;
    let match;
    while ((match = tagRegex.exec(fragmentHtml)) !== null) {
      const tag = match[1];
      const attrStr = match[2];
      const attrs = parseAttributes(attrStr);
      const id = attrs.id || '';
      const el = new MockElement(tag, id, attrs);
      if (id) {
        elementsById.set(id, el);
      }
      allElements.push(el);
      if (Array.isArray(ownerBucket)) {
        ownerBucket.push(el);
      }
    }
  }

  const markupOnlyHtml = htmlString
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  parseAndRegisterInnerElements(markupOnlyHtml);

  const documentElement = {
    lang: 'en-CA',
    dir: 'ltr',
    attributes: {},
    setAttribute(name, val) {
      this.attributes[name] = String(val);
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
  };

  function matchesBracketSelector(el, selector) {
    const attrMatches = [...selector.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)];
    if (attrMatches.length === 0) return false;
    for (const m of attrMatches) {
      const attrName = m[1];
      const expectedVal = m[2];
      const actualVal = el.getAttribute(attrName);
      if (actualVal === null || actualVal === undefined) return false;
      if (expectedVal !== undefined && String(actualVal) !== expectedVal) return false;
    }
    return true;
  }

  const document = {
    documentElement,
    body: new MockElement('BODY', 'body', {}),
    getElementById(id) {
      if (!elementsById.has(id)) {
        const created = new MockElement('DIV', id, { id });
        elementsById.set(id, created);
        allElements.push(created);
      }
      return elementsById.get(id);
    },
    querySelectorAll(selector) {
      const byKey = new Map();
      for (const el of allElements) {
        if (matchesBracketSelector(el, selector)) {
          const key =
            el.id ||
            `${el.tagName}:${JSON.stringify(el.attributes)}`;
          byKey.set(key, el);
        }
      }
      return [...byKey.values()];
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    dispatchEvent(event) {
      const evt = { preventDefault() {}, stopPropagation() {}, ...event };
      const fns = docListeners.get(typeFromEvent(evt)) || [];
      for (const fn of fns) {
        fn.call(document, evt);
      }
    }
  };

  let pendingFetchCount = 0;
  const fetchHistory = [];
  const trackedFetch = async (...args) => {
    pendingFetchCount += 1;
    fetchHistory.push({
      url: String(args[0] || ''),
      options: args[1] || {}
    });
    try {
      return await fetch(...args);
    } finally {
      pendingFetchCount -= 1;
    }
  };

  const [cleanPathname, rawQuery] = String(urlPath).split('?');
  const mergedParams = new URLSearchParams(rawQuery || '');
  if (!mergedParams.has('apiBase') && apiBase) {
    mergedParams.set('apiBase', apiBase);
  }

  const navigatorObj =
    geolocationMock === null
      ? {}
      : geolocationMock !== undefined
        ? { geolocation: geolocationMock }
        : {};

  const windowObj = {
    __SOFREH_API_BASE__: apiBase,
    location: {
      origin: apiBase,
      search: `?${mergedParams.toString()}`,
      pathname: cleanPathname || '/preview/customer'
    },
    navigator: navigatorObj,
    document,
    fetch: trackedFetch,
    URLSearchParams,
    console,
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    dispatchEvent(event) {
      const evt = { preventDefault() {}, stopPropagation() {}, ...event };
      const fns = winListeners.get(typeFromEvent(evt)) || [];
      for (const fn of fns) {
        fn.call(windowObj, evt);
      }
    }
  };

  const context = vm.createContext({
    window: windowObj,
    navigator: navigatorObj,
    document,
    fetch: trackedFetch,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout
  });

  const scriptMatches = [...htmlString.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  if (scriptMatches.length === 0) {
    throw new Error('No inline <script> found in preview HTML');
  }
  const inlineScript = scriptMatches[scriptMatches.length - 1][1];
  vm.runInContext(inlineScript, context);

  async function waitForNetworkIdle(timeoutMs = 3000) {
    const start = Date.now();
    // Wait at least one microtask tick
    await new Promise((r) => setTimeout(r, 15));
    while (pendingFetchCount > 0 && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 15));
    }
    await new Promise((r) => setTimeout(r, 15));
  }

  return {
    window: windowObj,
    document,
    fetchHistory,
    getElementById: (id) => document.getElementById(id),
    querySelectorAll: (sel) => document.querySelectorAll(sel),
    waitForNetworkIdle
  };
}
