import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

let fixtureId = 0;
const source = (file) =>
  fs.readFile(new URL(`../source/js/${file}`, import.meta.url), "utf8");
const moduleUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const loadTwikoo = async () => {
  let code = await source("plugins/twikoo.js");
  for (const name of ["loadScript", "whenVisibleOrIdle"]) {
    code = code.replace(
      `"../utils/${name}.js"`,
      JSON.stringify(moduleUrl(await source(`utils/${name}.js`))),
    );
  }
  return (await import(`${moduleUrl(code)}#${fixtureId++}`)).default;
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

const fixture = (t) => {
  const saved = Object.fromEntries(
    ["document", "window", "location", "IntersectionObserver"].map((key) => [
      key,
      globalThis[key],
    ]),
  );
  t.after(() => Object.assign(globalThis, saved));
  const scripts = [];
  const observers = [];
  const calls = [];
  const wrapper = {
    isConnected: true,
    dataset: {
      twikooSrc: `/twikoo-${fixtureId}.js`,
      twikooEnv: "https://comments.example",
      twikooRegion: "ap-shanghai",
    },
  };
  const status = { hidden: false, textContent: "" };
  const retry = new EventTarget();
  retry.hidden = true;
  const container = {
    isConnected: true,
    setAttribute(key, value) {
      this[key] = value;
    },
    replaceChildren(child) {
      this.child = child;
      child.isConnected = true;
    },
  };
  wrapper.querySelector = (selector) =>
    ({
      "[data-comment-status]": status,
      "[data-comment-retry]": retry,
      "[data-twikoo-mount]": container,
    })[selector];
  globalThis.document = Object.assign(new EventTarget(), {
    readyState: "complete",
    baseURI: "https://blog.example/",
    querySelector: () => wrapper,
    createElement: () => ({ remove() {} }),
    head: {
      appendChild(script) {
        scripts.push(script);
      },
    },
  });
  globalThis.location = { pathname: "/first/" };
  globalThis.window = Object.assign(new EventTarget(), {
    i18n: { comments_loading: "Loading", comments_load_failed: "Failed" },
    twikoo: {
      async init(options) {
        calls.push(options);
        // Vue replaces the target passed to Twikoo, leaving its parent intact.
        options.el.isConnected = false;
      },
    },
  });
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  };
  return { wrapper, container, status, retry, scripts, observers, calls };
};

test("Twikoo waits for visibility and survives Vue replacing its mount target", async (t) => {
  const initTwikoo = await loadTwikoo();
  const f = fixture(t);
  const page = new AbortController();
  initTwikoo({ signal: page.signal });
  assert.equal(f.scripts.length, 0);
  f.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(f.scripts.length, 1);
  f.scripts[0].onload();
  await flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].path, "/first/");
  assert.equal(f.calls[0].region, "ap-shanghai");
  assert.equal(f.status.hidden, true);
  assert.equal(f.container["aria-busy"], "false");
  page.abort();
  initTwikoo({ signal: new AbortController().signal });
  assert.equal(f.calls.length, 1);
  assert.equal(f.observers.length, 1);
});

test("navigation while the vendor is loading never mounts the departed page", async (t) => {
  const initTwikoo = await loadTwikoo();
  const f = fixture(t);
  const page = new AbortController();
  initTwikoo({ signal: page.signal });
  f.observers[0].callback([{ isIntersecting: true }]);
  page.abort();
  f.container.isConnected = false;
  f.scripts[0].onload();
  await flush();
  assert.equal(f.calls.length, 0);
});

test("Twikoo loads after a stationary visit and reuses its SDK on another page", async (t) => {
  const initTwikoo = await loadTwikoo();
  const f = fixture(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const page = new AbortController();
  initTwikoo({ signal: page.signal });
  t.mock.timers.tick(2999);
  assert.equal(f.scripts.length, 0);
  t.mock.timers.tick(1);
  assert.equal(f.scripts.length, 1);
  f.scripts[0].onload();
  await flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.status.hidden, true);
  f.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(f.calls.length, 1);
  page.abort();

  const nextContainer = { ...f.container };
  document.querySelector = () => ({
    ...f.wrapper,
    querySelector: (selector) =>
      selector === "[data-twikoo-mount]"
        ? nextContainer
        : f.wrapper.querySelector(selector),
  });
  location.pathname = "/second/";
  initTwikoo({ signal: new AbortController().signal });
  t.mock.timers.tick(3000);
  await flush();
  assert.equal(f.scripts.length, 1);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].path, "/second/");
});

test("a scope refresh shares pending initialization and a failed mount can retry", async (t) => {
  const initTwikoo = await loadTwikoo();
  const f = fixture(t);
  t.mock.method(console, "error", () => {});
  const page = new AbortController();
  initTwikoo({ signal: page.signal });
  f.observers[0].callback([{ isIntersecting: true }]);
  page.abort();
  initTwikoo({ signal: new AbortController().signal });
  f.observers[1].callback([{ isIntersecting: true }]);
  assert.equal(f.scripts.length, 1);
  let attempts = 0;
  window.twikoo.init = async () => {
    if (++attempts === 1) throw new Error("Initialization failed");
  };
  f.scripts[0].onload();
  await flush();
  assert.equal(f.status.textContent, "Failed");
  assert.equal(f.retry.hidden, false);
  f.retry.dispatchEvent(new Event("click"));
  await flush();
  assert.equal(attempts, 2);
  assert.equal(f.scripts.length, 1);
  assert.equal(f.status.hidden, true);
});

test("Artalk and Waline destroy mounted instances on page abort and follow color-mode events", async (t) => {
  const initComments = await loadTwikoo();
  const f = fixture(t);
  const windowTarget = new EventTarget();
  Object.assign(windowTarget, f.window || globalThis.window);
  let destroyed = 0;
  let darkStates = [];
  windowTarget.Artalk = {
    init(options) {
      f.calls.push(options);
      return {
        setDarkMode(dark) {
          darkStates.push(dark);
        },
        destroy() {
          destroyed++;
        },
      };
    },
  };
  globalThis.window = windowTarget;
  f.wrapper.dataset = {
    commentProvider: "artalk",
    artalkSrc: `/artalk-${fixtureId}.js`,
    artalkCss: `/artalk-${fixtureId}.css`,
    artalkServer: "https://artalk.example",
    artalkSite: "Demo",
  };

  const page = new AbortController();
  initComments({ signal: page.signal });
  f.observers[0].callback([{ isIntersecting: true }]);
  const artalkScript = f.scripts.find((el) => el.src?.includes("/artalk-"));
  artalkScript.onload();
  await flush();

  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].server, "https://artalk.example");
  assert.equal(f.calls[0].site, "Demo");
  windowTarget.dispatchEvent(
    new CustomEvent("redefine:color-mode", { detail: { isDark: true } }),
  );
  assert.deepEqual(darkStates, [true]);
  page.abort();
  assert.equal(destroyed, 1);
});

test("Giscus supports eager loading and per-container bootstrap scripts", async (t) => {
  const initComments = await loadTwikoo();
  const f = fixture(t);
  const appendedScripts = [];
  globalThis.document.createElement = (tag) => {
    if (tag === "div") {
      return {
        appendChild(child) {
          appendedScripts.push(child);
        },
      };
    }
    return {
      attributes: {},
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
      remove() {},
    };
  };
  f.wrapper.dataset = {
    commentProvider: "giscus",
    giscusSrc: "https://giscus.app/client.js",
    giscusRepo: "owner/repo",
    giscusRepoId: "R_1",
    giscusCategory: "General",
    giscusCategoryId: "DIC_1",
    giscusStrict: "0",
    giscusReactionsEnabled: "0",
    giscusEmitMetadata: "0",
    giscusLoading: "eager",
  };

  const page = new AbortController();
  initComments({ signal: page.signal });
  assert.equal(f.observers.length, 0);
  assert.equal(appendedScripts.length, 1);
  assert.equal(appendedScripts[0].attributes["data-strict"], "0");
  assert.equal(appendedScripts[0].attributes["data-reactions-enabled"], "0");
  assert.equal(appendedScripts[0].attributes["data-emit-metadata"], "0");
  appendedScripts[0].onload();
  await flush();
  assert.equal(f.status.hidden, true);
});
