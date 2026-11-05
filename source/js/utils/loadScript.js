const scripts = new Map();

// Cache the load, not a page's initialization. Navigation must not cancel a
// shared script that another page may already be waiting for.
export function loadScriptOnce(src, { timeout = 15000 } = {}) {
  if (!src) return Promise.reject(new Error("Missing script URL"));
  const url = new URL(src, document.baseURI).href;
  if (scripts.has(url)) return scripts.get(url);

  const pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;

    const finish = (error) => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else {
        resolve();
      }
    };
    const timer = setTimeout(
      () => finish(new Error(`Script timed out: ${url}`)),
      timeout,
    );
    script.onload = () => finish();
    script.onerror = () => finish(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  }).catch((error) => {
    scripts.delete(url);
    throw error;
  });

  scripts.set(url, pending);
  return pending;
}
