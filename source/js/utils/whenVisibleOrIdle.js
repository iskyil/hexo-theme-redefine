// Race actual demand against a quiet foreground visit. Both paths share one
// lifetime so navigation or the winning trigger cancels all remaining work.
export function whenVisibleOrIdle(
  element,
  callback,
  { signal, rootMargin = "800px 0px", idleDelay = 3000 } = {},
) {
  if (signal?.aborted || !element.isConnected) return;

  let observer;
  let delayTimer;
  let idleHandle;
  let stopped = false;
  let loaded = document.readyState === "complete";
  let nearby = typeof IntersectionObserver === "undefined";

  const cancelIdle = () => {
    clearTimeout(delayTimer);
    if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
    delayTimer = idleHandle = undefined;
  };
  const cleanup = () => {
    stopped = true;
    observer?.disconnect();
    cancelIdle();
    window.removeEventListener("load", onLoad);
    document.removeEventListener("visibilitychange", scheduleIdle);
    signal?.removeEventListener("abort", cleanup);
  };
  const isCurrent = () => {
    if (stopped) return false;
    if (signal?.aborted || !element.isConnected) {
      cleanup();
      return false;
    }
    return true;
  };
  const start = () => {
    if (!isCurrent() || document.hidden) return;
    cleanup();
    callback();
  };
  const onIdle = () => {
    idleHandle = undefined;
    start();
  };
  function scheduleIdle() {
    cancelIdle();
    if (!isCurrent() || document.hidden) return;
    if (nearby) {
      start();
      return;
    }
    if (!loaded) return;

    delayTimer = setTimeout(() => {
      delayTimer = undefined;
      if (!isCurrent() || document.hidden) return;
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(onIdle, { timeout: 1000 });
      } else {
        onIdle();
      }
    }, idleDelay);
  }
  function onLoad() {
    loaded = true;
    scheduleIdle();
  }

  signal?.addEventListener("abort", cleanup, { once: true });
  document.addEventListener("visibilitychange", scheduleIdle);
  if (!loaded) window.addEventListener("load", onLoad, { once: true });
  if (!nearby) {
    observer = new IntersectionObserver(
      (entries) => {
        nearby = entries.some((entry) => entry.isIntersecting);
        if (nearby) start();
      },
      { rootMargin },
    );
    observer.observe(element);
  }
  scheduleIdle();
  return cleanup;
}
