import { useServiceWorkerStore } from "../store/serviceWorkerStore";

/** Fired after successful registration (detail: `{ registration }`). */
export const SW_EVENT_REGISTERED = "stellarsplit:sw-registered";
/** Fired when a new service worker is installed and the page should prompt to reload. */
export const SW_EVENT_UPDATE_AVAILABLE = "stellarsplit:sw-update-available";
/** Fired on registration or lifecycle failure (detail: `{ message: string, cause?: unknown }`). */
export const SW_EVENT_ERROR = "stellarsplit:sw-error";

const SW_PATH = "/sw.js";

let lastRegistration: ServiceWorkerRegistration | null = null;

/**
 * Guards against StrictMode's double effect-fire in development calling
 * `registerServiceWorker()` twice, which would otherwise register the SW
 * twice and log a console warning.
 */
let registered = false;

/**
 * Fires when a new service worker is installed and an older one is still in control
 * (typical: new build waiting to activate).
 */
function emitUpdateAvailable() {
  useServiceWorkerStore.getState().setUpdateAvailable();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SW_EVENT_UPDATE_AVAILABLE, { detail: {} }),
    );
  }
}

function emitRegistered(reg: ServiceWorkerRegistration) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SW_EVENT_REGISTERED, { detail: { registration: reg } }),
    );
  }
}

function emitError(message: string, cause?: unknown) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SW_EVENT_ERROR, { detail: { message, cause } }),
    );
  }
}

function notifyIfUpdateAvailable(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) {
    emitUpdateAvailable();
  }
}

function attachToInstallingWorker(
  _reg: ServiceWorkerRegistration,
  worker: ServiceWorker | null,
) {
  if (!worker) return;
  const onState = () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      emitUpdateAvailable();
    }
  };
  worker.addEventListener("statechange", onState);
  if (worker.state === "installed" && navigator.serviceWorker.controller) {
    emitUpdateAvailable();
  }
}

function watchRegistration(reg: ServiceWorkerRegistration) {
  reg.addEventListener("updatefound", () => {
    attachToInstallingWorker(reg, reg.installing);
  });
  if (reg.installing) {
    attachToInstallingWorker(reg, reg.installing);
  }
  notifyIfUpdateAvailable(reg);
}

/**
 * Call after `navigator` is available (e.g. from `main.tsx`).
 * Drives `useServiceWorkerStore` (phase, error) and listens for new SW versions.
 */
export async function registerServiceWorker(): Promise<void> {
  const store = useServiceWorkerStore.getState();
  if (!("serviceWorker" in navigator)) {
    store.setPhase("unsupported");
    return;
  }

  if (registered) return;
  registered = true;

  store.setPhase("registering");
  store.setError(null);
  lastRegistration = null;

  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, {
      updateViaCache: "none",
    });
    lastRegistration = reg;
    store.setPhase("ready");
    watchRegistration(reg);
    emitRegistered(reg);

    const onVisible = () => {
      if (document.visibilityState === "visible" && reg) {
        void reg.update();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Service worker registration failed";
    registered = false;
    store.setError(message);
    emitError(message, err);
  }
}

/**
 * Activate a waiting service worker, if any, then reload when the controller changes.
 * If there is no waiting worker, perform a full reload to pick up app shell changes.
 */
export function applyServiceWorkerUpdate(): void {
  const reg = lastRegistration;
  if (reg?.waiting) {
    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    reg.waiting.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  window.location.reload();
}

/**
 * Clear all caches, unregister the service worker, and reload (stale-asset / recovery path).
 */
export async function forceRefreshWithCacheClear(): Promise<void> {
  try {
    if ("caches" in globalThis) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    /* ignore */
  }
  try {
    const r = lastRegistration ?? (await navigator.serviceWorker.getRegistration());
    if (r) {
      await r.unregister();
    }
  } catch {
    /* ignore */
  }
  lastRegistration = null;
  window.location.reload();
}

export function __resetServiceWorkerTestStateForTests() {
  lastRegistration = null;
  registered = false;
}

/** @internal Test-only: assign `lastRegistration` for apply / force-refresh tests. */
export function __setLastRegistrationForTests(
  reg: ServiceWorkerRegistration | null,
) {
  lastRegistration = reg;
}
