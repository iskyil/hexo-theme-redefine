import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  themeAssetUrl,
  themeScriptUrl,
} = require("../scripts/utils/asset-url.js");
const { version } = require("../package.json");
let moduleId = 0;
const loadFresh = async (file) => {
  const source = await fs.readFile(
    new URL(`../source/js/utils/${file}`, import.meta.url),
    "utf8",
  );
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${moduleId++}`
  );
};

test("lazy and template assets preserve subdirectory, development, and CDN URLs", () => {
  const context = {
    theme: { cdn: { enable: false }, developer: { enable: false } },
    url_for: (file) => `/blog/${file}`,
  };
  assert.equal(
    themeScriptUrl("libs/Typed.min.js", context),
    "/blog/js/build/libs/Typed.min.js",
  );
  assert.equal(
    themeAssetUrl("css/build/theme.css", context),
    "/blog/css/build/theme.css",
  );
  context.theme.developer.enable = true;
  assert.equal(
    themeScriptUrl("libs/Typed.min.js", context),
    "/blog/js/libs/Typed.min.js",
  );
  context.theme.developer.enable = false;
  context.theme.cdn = { enable: true, provider: "jsdelivr" };
  assert.equal(
    themeScriptUrl("libs/Typed.min.js", context),
    `https://cdn.jsdelivr.net/npm/hexo-theme-redefine@${version}/source/js/build/libs/Typed.min.js`,
  );
  context.theme.cdn = {
    enable: true,
    provider: "custom",
    custom_url: "https://assets.example/:version/:path",
  };
  assert.equal(
    themeScriptUrl("libs/Typed.min.js", context),
    `https://assets.example/${version}/js/build/libs/Typed.min.js`,
  );
  context.theme.developer.enable = true;
  assert.equal(
    themeScriptUrl("libs/Typed.min.js", context),
    "/blog/js/libs/Typed.min.js",
  );
  context.theme.developer.enable = false;
  context.theme.cdn = { enable: true, provider: "custom", custom_url: null };
  assert.equal(
    themeScriptUrl("libs/Typed.min.js", context),
    `https://registry.npmmirror.com/hexo-theme-redefine/${version}/files/source/js/build/libs/Typed.min.js`,
  );
});

const fakeDocument = (t) => {
  const elements = [];
  const previous = globalThis.document;
  globalThis.document = {
    baseURI: "https://blog.example/posts/test/",
    createElement: () => ({
      remove() {
        this.removed = true;
      },
    }),
    head: {
      appendChild(element) {
        elements.push(element);
      },
    },
  };
  t.after(() => {
    globalThis.document = previous;
  });
  return elements;
};

test("concurrent script loads and later visits reuse one completed load", async (t) => {
  const elements = fakeDocument(t);
  const { loadScriptOnce } = await loadFresh("loadScript.js");
  const first = loadScriptOnce("/vendor.js");
  assert.equal(loadScriptOnce("https://blog.example/vendor.js"), first);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].async, true);
  elements[0].onload();
  await first;
  await loadScriptOnce("/vendor.js");
  assert.equal(elements.length, 1);
});

test("failed and timed-out scripts can be retried", async (t) => {
  const elements = fakeDocument(t);
  const { loadScriptOnce } = await loadFresh("loadScript.js");
  const failed = loadScriptOnce("/vendor.js");
  elements[0].onerror();
  await assert.rejects(failed, /Failed to load script/);
  assert.equal(elements[0].removed, true);
  const timedOut = loadScriptOnce("/vendor.js", { timeout: 5 });
  await assert.rejects(timedOut, /timed out/);
  assert.equal(elements[1].removed, true);
  const retried = loadScriptOnce("/vendor.js");
  elements[2].onload();
  await retried;
  assert.equal(elements.length, 3);
});
