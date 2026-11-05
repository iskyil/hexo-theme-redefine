import { loadScriptOnce } from "../utils/loadScript.js";
import { whenVisible } from "../utils/whenVisible.js";

const mounts = new WeakMap();

const isDarkMode = () =>
  Boolean(
    document.body?.classList?.contains("dark-mode") ||
      document.documentElement?.classList?.contains("dark"),
  );

const ensureStylesheet = (id, href) => {
  if (!href || document.getElementById?.(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
};

const runContainerScript = (parent, attributes, { timeout = 15000 } = {}) =>
  new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || value === null || value === "") continue;
      if (typeof script.setAttribute === "function") {
        script.setAttribute(key, String(value));
      } else {
        script[key] = String(value);
      }
    }
    const finish = (error) => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) {
        script.remove?.();
        reject(error);
      } else {
        resolve();
      }
    };
    const timer = setTimeout(
      () => finish(new Error(`Script timed out: ${attributes.src}`)),
      timeout,
    );
    script.onload = () => finish();
    script.onerror = () =>
      finish(new Error(`Failed to load script: ${attributes.src}`));
    parent.appendChild(script);
  });

const mountTarget = (container, id) => {
  const target = document.createElement("div");
  target.id = id;
  container.replaceChildren(target);
  return target;
};

const resolveProvider = (wrapper) => {
  if (wrapper.dataset?.commentProvider) return wrapper.dataset.commentProvider;
  if (wrapper.dataset?.twikooSrc || wrapper.dataset?.twikooEnv) return "twikoo";
  if (wrapper.dataset?.walineConfig || wrapper.dataset?.walineSrc) return "waline";
  if (wrapper.dataset?.gitalkRepo) return "gitalk";
  if (wrapper.dataset?.giscusRepo) return "giscus";
  if (wrapper.dataset?.utterancesRepo) return "utterances";
  if (wrapper.dataset?.artalkServer) return "artalk";
  return "twikoo";
};

const bindDestroy = (state, signal) => {
  if (!state.destroy || !signal) return;
  signal.addEventListener(
    "abort",
    () => {
      if (state.signal !== signal) return;
      const cleanup = state.destroy;
      state.destroy = null;
      state.ready = false;
      try {
        cleanup();
      } catch (error) {
        console.error("[redefine] Failed to destroy comment instance:", error);
      }
    },
    { once: true },
  );
};

const mountProvider = async (provider, wrapper, container, path, isCurrent) => {
  if (provider === "waline") {
    const src = wrapper.dataset.walineSrc || window.theme?.assets?.waline;
    if (!src && !window.__walineModule) {
      throw new Error("Missing Waline module URL");
    }
    const walineModule =
      window.__walineModule ||
      (await import(new URL(src, document.baseURI).href));
    if (!isCurrent()) return null;
    const target = mountTarget(container, "waline");
    const options = JSON.parse(wrapper.dataset.walineConfig || "{}");
    const instance = walineModule.init({
      ...options,
      el: target,
      path,
    });
    return () => instance?.destroy?.();
  }

  if (provider === "gitalk") {
    await loadScriptOnce(
      wrapper.dataset.gitalkSrc ||
        "https://cdnjs.cloudflare.com/ajax/libs/gitalk/1.8.0/gitalk.min.js",
    );
    if (!isCurrent()) return null;
    const target = mountTarget(container, "gitalk-container");
    let pageKey = decodeURI(path);
    if (pageKey.length > 50) {
      pageKey = `${pageKey.substring(0, 47)}...`;
    }
    new window.Gitalk({
      clientID: wrapper.dataset.gitalkClientId,
      clientSecret: wrapper.dataset.gitalkClientSecret,
      repo: wrapper.dataset.gitalkRepo,
      owner: wrapper.dataset.gitalkOwner,
      admin: [wrapper.dataset.gitalkOwner],
      id: pageKey,
      language: wrapper.dataset.gitalkLanguage || window.config?.language,
      proxy:
        wrapper.dataset.gitalkProxy ||
        "https://github.com/login/oauth/access_token",
    }).render(target);
    return null;
  }

  if (provider === "giscus") {
    const target = mountTarget(container, "giscus-container");
    await runContainerScript(target, {
      src: wrapper.dataset.giscusSrc || "https://giscus.app/client.js",
      "data-repo": wrapper.dataset.giscusRepo,
      "data-repo-id": wrapper.dataset.giscusRepoId,
      "data-category": wrapper.dataset.giscusCategory,
      "data-category-id": wrapper.dataset.giscusCategoryId,
      "data-mapping": wrapper.dataset.giscusMapping || "pathname",
      "data-strict": wrapper.dataset.giscusStrict ?? "0",
      "data-reactions-enabled": wrapper.dataset.giscusReactionsEnabled ?? "1",
      "data-emit-metadata": wrapper.dataset.giscusEmitMetadata ?? "0",
      "data-theme": isDarkMode() ? "dark" : "light",
      "data-lang": wrapper.dataset.giscusLang || "en",
      "data-input-position": wrapper.dataset.giscusInputPosition || "bottom",
      ...(wrapper.dataset.giscusLoading === "lazy"
        ? { "data-loading": "lazy" }
        : {}),
      crossorigin: "anonymous",
    });
    return null;
  }

  if (provider === "utterances") {
    const target = mountTarget(container, "utterances-container");
    const themeLight = wrapper.dataset.utterancesThemeLight || "github-light";
    const themeDark = wrapper.dataset.utterancesThemeDark || "github-dark";
    const issueNumber = wrapper.dataset.utterancesIssueNumber;
    await runContainerScript(target, {
      src: wrapper.dataset.utterancesSrc || "https://utteranc.es/client.js",
      repo: wrapper.dataset.utterancesRepo,
      ...(issueNumber !== undefined && issueNumber !== ""
        ? { "issue-number": issueNumber }
        : { "issue-term": wrapper.dataset.utterancesIssueTerm || "pathname" }),
      ...(wrapper.dataset.utterancesLabel
        ? { label: wrapper.dataset.utterancesLabel }
        : {}),
      theme: isDarkMode() ? themeDark : themeLight,
      crossorigin: "anonymous",
    });
    return null;
  }

  if (provider === "artalk") {
    ensureStylesheet(
      "artalk-css",
      wrapper.dataset.artalkCss ||
        "https://cdn.jsdelivr.net/npm/artalk/dist/Artalk.css",
    );
    await loadScriptOnce(
      wrapper.dataset.artalkSrc ||
        "https://cdn.jsdelivr.net/npm/artalk/dist/Artalk.js",
    );
    if (!isCurrent()) return null;
    const target = mountTarget(container, "artalk-comment");
    const instance = window.Artalk.init({
      el: target,
      pageKey: path,
      server: wrapper.dataset.artalkServer,
      site: wrapper.dataset.artalkSite,
      darkMode: isDarkMode(),
    });
    const onColorMode = (event) => {
      const dark =
        typeof event?.detail?.isDark === "boolean"
          ? event.detail.isDark
          : isDarkMode();
      instance?.setDarkMode?.(dark);
    };
    window.addEventListener?.("redefine:color-mode", onColorMode);
    return () => {
      window.removeEventListener?.("redefine:color-mode", onColorMode);
      instance?.destroy?.();
    };
  }

  await loadScriptOnce(wrapper.dataset.twikooSrc);
  if (!isCurrent()) return null;
  // Twikoo's Vue client replaces its mount element. Keep a stable host for
  // lifecycle checks, retries, and refreshes of the same page DOM.
  const target = mountTarget(container, "twikoo-comment");
  await window.twikoo.init({
    el: target,
    envId: wrapper.dataset.twikooEnv,
    ...(wrapper.dataset.twikooRegion
      ? { region: wrapper.dataset.twikooRegion }
      : {}),
    path,
  });
  return null;
};

const createMount = (wrapper, container) => {
  const status = wrapper.querySelector("[data-comment-status]");
  const retry = wrapper.querySelector("[data-comment-retry]");
  const provider = resolveProvider(wrapper);
  const path = location.pathname;
  const state = { loading: false, ready: false, signal: null, destroy: null };
  const isCurrent = () => !state.signal?.aborted && container.isConnected;

  state.load = async () => {
    if (state.loading || state.ready || !isCurrent()) return;
    state.loading = true;
    status.hidden = false;
    status.textContent = window.i18n.comments_loading;
    retry.hidden = true;
    container.setAttribute("aria-busy", "true");

    try {
      const destroy = await mountProvider(
        provider,
        wrapper,
        container,
        path,
        isCurrent,
      );
      if (!isCurrent()) {
        destroy?.();
        return;
      }
      state.destroy = destroy || null;
      bindDestroy(state, state.signal);
      state.ready = true;
      status.hidden = true;
    } catch (error) {
      if (!isCurrent()) return;
      console.error(`[redefine] ${provider} failed:`, error);
      status.textContent = window.i18n.comments_load_failed;
      retry.hidden = false;
    } finally {
      state.loading = false;
      if (isCurrent()) container.setAttribute("aria-busy", "false");
    }
  };
  return state;
};

export default function initTwikoo({ signal } = {}) {
  const wrapper = document.querySelector(
    "[data-comment-provider], [data-twikoo]",
  );
  const container =
    wrapper?.querySelector("[data-twikoo-mount]") ||
    wrapper?.querySelector("[data-comment-mount]");
  if (!container || signal?.aborted) return;

  let state = mounts.get(container);
  if (!state) {
    state = createMount(wrapper, container);
    mounts.set(container, state);
  }
  // A refresh may replace a page scope without replacing its DOM. Transfer
  // pending work to that scope while retaining the existing component mount.
  state.signal = signal;
  bindDestroy(state, signal);
  if (state.ready) return;

  wrapper
    .querySelector("[data-comment-retry]")
    .addEventListener("click", state.load, { signal });
  if (
    resolveProvider(wrapper) === "giscus" &&
    wrapper.dataset?.giscusLoading === "eager"
  ) {
    state.load();
    return;
  }
  whenVisible(wrapper, state.load, { signal });
}
