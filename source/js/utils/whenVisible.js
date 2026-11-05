export function whenVisible(
  element,
  callback,
  { signal, rootMargin = "400px 0px" } = {},
) {
  if (signal?.aborted || !element.isConnected) return;

  let observer;
  let started = false;
  const cleanup = () => {
    observer?.disconnect();
    signal?.removeEventListener("abort", cleanup);
  };
  const start = () => {
    if (started || signal?.aborted || !element.isConnected) return;
    started = true;
    cleanup();
    callback();
  };

  if (typeof IntersectionObserver === "undefined") {
    start();
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) start();
    },
    { rootMargin },
  );
  signal?.addEventListener("abort", cleanup, { once: true });
  observer.observe(element);
}
