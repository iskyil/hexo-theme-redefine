import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const source = await fs.readFile(
  new URL("../source/js/utils/whenVisibleOrIdle.js", import.meta.url),
  "utf8",
);
const { whenVisibleOrIdle } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

const fixture = (t, { loaded = true, idle = true, observer = true } = {}) => {
  const saved = Object.fromEntries(
    ["document", "window", "IntersectionObserver"].map((key) => [
      key,
      globalThis[key],
    ]),
  );
  t.after(() => Object.assign(globalThis, saved));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const idleTasks = new Map();
  const observers = [];
  let nextId = 0;
  globalThis.document = Object.assign(new EventTarget(), {
    readyState: loaded ? "complete" : "loading",
    hidden: false,
  });
  globalThis.window = new EventTarget();
  if (idle) {
    window.requestIdleCallback = (callback, options) => {
      const id = nextId++;
      idleTasks.set(id, { callback, options });
      return id;
    };
    window.cancelIdleCallback = (id) => idleTasks.delete(id);
  }
  globalThis.IntersectionObserver = observer
    ? class {
        constructor(callback, options) {
          this.callback = callback;
          this.options = options;
          observers.push(this);
        }
        observe() {}
        disconnect() {
          this.disconnected = true;
        }
      }
    : undefined;
  return {
    observers,
    idleTasks,
    visibility(hidden) {
      document.hidden = hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    runIdle() {
      for (const [id, task] of [...idleTasks]) {
        idleTasks.delete(id);
        task.callback();
      }
    },
  };
};

test("a stationary visit waits for load, foreground dwell, then idle time", (t) => {
  const f = fixture(t, { loaded: false });
  let calls = 0;
  whenVisibleOrIdle({ isConnected: true }, () => calls++);
  t.mock.timers.tick(10000);
  assert.equal(f.idleTasks.size, 0);
  assert.equal(calls, 0);

  window.dispatchEvent(new Event("load"));
  t.mock.timers.tick(2999);
  assert.equal(f.idleTasks.size, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 0);
  assert.equal(f.idleTasks.size, 1);
  assert.equal([...f.idleTasks.values()][0].options.timeout, 1000);
  f.runIdle();
  assert.equal(calls, 1);
  assert.equal(f.observers[0].disconnected, true);
  f.observers[0].callback([{ isIntersecting: true }]);
  f.visibility(false);
  t.mock.timers.tick(10000);
  assert.equal(f.idleTasks.size, 0);
  assert.equal(calls, 1);
});

test("approaching the viewport wins immediately and cancels queued idle work", (t) => {
  const f = fixture(t);
  let calls = 0;
  whenVisibleOrIdle({ isConnected: true }, () => calls++);
  assert.equal(f.observers[0].options.rootMargin, "800px 0px");
  f.observers[0].callback([{ isIntersecting: false }]);
  t.mock.timers.tick(3000);
  const queued = [...f.idleTasks.values()][0].callback;
  f.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(calls, 1);
  assert.equal(f.idleTasks.size, 0);
  queued();
  f.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(calls, 1);
});

test("nearby content does not wait for the page load event", (t) => {
  const f = fixture(t, { loaded: false });
  let calls = 0;
  whenVisibleOrIdle({ isConnected: true }, () => calls++);
  f.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(calls, 1);
  window.dispatchEvent(new Event("load"));
  t.mock.timers.tick(3000);
  assert.equal(f.idleTasks.size, 0);
});

test("hiding the page cancels idle work and requires a new foreground dwell", (t) => {
  const f = fixture(t);
  let calls = 0;
  whenVisibleOrIdle({ isConnected: true }, () => calls++);
  t.mock.timers.tick(2000);
  f.visibility(true);
  t.mock.timers.tick(10000);
  assert.equal(f.idleTasks.size, 0);
  assert.equal(calls, 0);
  f.visibility(false);
  t.mock.timers.tick(2999);
  assert.equal(f.idleTasks.size, 0);
  t.mock.timers.tick(1);
  assert.equal(f.idleTasks.size, 1);
  f.visibility(true);
  assert.equal(f.idleTasks.size, 0);
  f.visibility(false);
  t.mock.timers.tick(3000);
  f.runIdle();
  assert.equal(calls, 1);
});

test("a hidden page waits until visible even when its comments are nearby", (t) => {
  const f = fixture(t);
  f.visibility(true);
  let calls = 0;
  whenVisibleOrIdle({ isConnected: true }, () => calls++);
  f.observers[0].callback([{ isIntersecting: true }]);
  t.mock.timers.tick(10000);
  assert.equal(calls, 0);
  f.visibility(false);
  assert.equal(calls, 1);
  assert.equal(f.idleTasks.size, 0);
});

for (const phase of ["load", "dwell", "idle"]) {
  test(`navigation cancels pending ${phase} work and late observer callbacks`, (t) => {
    const f = fixture(t, { loaded: phase !== "load" });
    const controller = new AbortController();
    let calls = 0;
    whenVisibleOrIdle({ isConnected: true }, () => calls++, {
      signal: controller.signal,
    });
    t.mock.timers.tick(phase === "idle" ? 3000 : 1000);
    controller.abort();
    assert.equal(f.idleTasks.size, 0);
    assert.equal(f.observers[0].disconnected, true);
    window.dispatchEvent(new Event("load"));
    f.visibility(false);
    f.observers[0].callback([{ isIntersecting: true }]);
    t.mock.timers.tick(10000);
    f.runIdle();
    assert.equal(calls, 0);
  });
}

test("detached elements and aborted scopes never load", (t) => {
  const f = fixture(t);
  let calls = 0;
  whenVisibleOrIdle({ isConnected: false }, () => calls++);
  whenVisibleOrIdle({ isConnected: true }, () => calls++, {
    signal: AbortSignal.abort(),
  });
  assert.equal(f.observers.length, 0);
  const element = { isConnected: true };
  whenVisibleOrIdle(element, () => calls++);
  t.mock.timers.tick(3000);
  element.isConnected = false;
  f.runIdle();
  assert.equal(calls, 0);
  assert.equal(f.observers[0].disconnected, true);
});

test("browsers without an idle API load after dwell regardless of connection", (t) => {
  fixture(t, { idle: false });
  window.navigator = { connection: { saveData: true, effectiveType: "2g" } };
  let calls = 0;
  whenVisibleOrIdle({ isConnected: true }, () => calls++);
  t.mock.timers.tick(2999);
  assert.equal(calls, 0);
  t.mock.timers.tick(1);
  assert.equal(calls, 1);
});

test("browsers without observers load as soon as the page is in the foreground", (t) => {
  const f = fixture(t, { observer: false, loaded: false });
  let calls = 0;
  whenVisibleOrIdle({ isConnected: true }, () => calls++);
  assert.equal(calls, 1);
  f.visibility(true);
  whenVisibleOrIdle({ isConnected: true }, () => calls++);
  assert.equal(calls, 1);
  f.visibility(false);
  assert.equal(calls, 2);
});
