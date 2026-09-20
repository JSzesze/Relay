import "server-only";

import { createId } from "@/lib/utils";
import { readState } from "@/lib/state";
import {
  fetchRemarkableRootFingerprint,
  syncRemarkableSkeleton,
} from "@/lib/remarkable-sync";
import { readRemarkableSkeleton } from "@/lib/remarkable-skeleton-store";
import {
  getWatchIntervalMs,
  getWatchWebhookUrl,
  isWatchEnabled,
  pollLibraryFingerprint,
  type LibraryWatchPollResult,
} from "@/lib/remarkable-watch";
import {
  readLibraryWatchState,
  writeLibraryWatchState,
} from "@/lib/remarkable-watch-store";
import type { LibraryWatchEvent } from "@/lib/types";

type WatcherHandle = {
  intervalMs: number;
  startedAt: string;
  timer: ReturnType<typeof setInterval>;
};

const globalForWatch = globalThis as typeof globalThis & {
  __relayRemarkableWatcher?: WatcherHandle;
  __relayRemarkableWatchTick?: Promise<LibraryWatchPollResult> | null;
};

function logWatch(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

export async function hasRemarkableConnection() {
  const state = await readState();
  return state.connection !== null;
}

export async function postWatchWebhook(
  url: string,
  event: LibraryWatchEvent,
) {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Watch webhook URL is invalid.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Watch webhook URL must be http or https.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Relay-RemarkableWatch/1.0",
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Watch webhook failed with HTTP ${response.status}`);
  }
}

export async function runWatchTick(): Promise<LibraryWatchPollResult> {
  if (globalForWatch.__relayRemarkableWatchTick) {
    return globalForWatch.__relayRemarkableWatchTick;
  }

  const tick = pollLibraryFingerprint({
    createEventId: () => createId("watch"),
    fetchRoot: fetchRemarkableRootFingerprint,
    hasConnection: hasRemarkableConnection,
    log: logWatch,
    now: () => new Date(),
    notifyWebhook: postWatchWebhook,
    readSkeleton: readRemarkableSkeleton,
    readWatchState: readLibraryWatchState,
    syncSkeleton: syncRemarkableSkeleton,
    webhookUrl: getWatchWebhookUrl(),
    writeWatchState: writeLibraryWatchState,
  }).finally(() => {
    globalForWatch.__relayRemarkableWatchTick = null;
  });

  globalForWatch.__relayRemarkableWatchTick = tick;
  return tick;
}

export function getWatchRuntimeStatus() {
  const handle = globalForWatch.__relayRemarkableWatcher;

  return {
    enabled: isWatchEnabled(),
    intervalMs: handle?.intervalMs ?? getWatchIntervalMs(),
    running: Boolean(handle),
    startedAt: handle?.startedAt ?? null,
    webhookConfigured: Boolean(getWatchWebhookUrl()),
  };
}

export function startRemarkableLibraryWatcher() {
  if (!isWatchEnabled()) {
    logWatch({
      src: "remarkable-watch",
      event: "library.disabled",
    });
    return;
  }

  if (globalForWatch.__relayRemarkableWatcher) {
    return;
  }

  const intervalMs = getWatchIntervalMs();
  const timer = setInterval(() => {
    void runWatchTick().catch((error) => {
      logWatch({
        src: "remarkable-watch",
        event: "library.tick_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  timer.unref?.();
  globalForWatch.__relayRemarkableWatcher = {
    intervalMs,
    startedAt: new Date().toISOString(),
    timer,
  };

  logWatch({
    src: "remarkable-watch",
    event: "library.started",
    intervalMs,
  });

  void runWatchTick().catch((error) => {
    logWatch({
      src: "remarkable-watch",
      event: "library.tick_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export function stopRemarkableLibraryWatcher() {
  const handle = globalForWatch.__relayRemarkableWatcher;

  if (!handle) {
    return;
  }

  clearInterval(handle.timer);
  globalForWatch.__relayRemarkableWatcher = undefined;
}
