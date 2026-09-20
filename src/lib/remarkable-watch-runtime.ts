import "server-only";

import { createId } from "@/lib/utils";
import { readState } from "@/lib/state";
import {
  fetchRemarkableRootFingerprint,
  syncRemarkableSkeleton,
} from "@/lib/remarkable-sync";
import { readRemarkableSkeleton } from "@/lib/remarkable-skeleton-store";
import {
  enterFastWindow,
  getWatchScheduleConfig,
  getWatchWebhookUrl,
  isWatchEnabled,
  parseFastUntil,
  pollLibraryFingerprint,
  resolveWatchSchedule,
  snapshotWatchSchedule,
  type LibraryWatchPollResult,
  type WatchSchedule,
} from "@/lib/remarkable-watch";
import {
  readLibraryWatchState,
  writeLibraryWatchState,
} from "@/lib/remarkable-watch-store";
import type { LibraryWatchEvent, LibraryWatchIntervalMode } from "@/lib/types";

type WatcherHandle = {
  fastUntil: number | null;
  intervalMs: number;
  mode: LibraryWatchIntervalMode;
  pendingRepoll: boolean;
  startedAt: string;
  timer: ReturnType<typeof setTimeout> | null;
};

const globalForWatch = globalThis as typeof globalThis & {
  __relayRemarkableWatcher?: WatcherHandle;
  __relayRemarkableWatchTick?: Promise<LibraryWatchPollResult> | null;
};

function logWatch(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

function handleOrNull() {
  return globalForWatch.__relayRemarkableWatcher;
}

function applySchedule(schedule: WatchSchedule, reason?: string) {
  const handle = handleOrNull();

  if (!handle) {
    return;
  }

  const changed =
    handle.mode !== schedule.mode || handle.intervalMs !== schedule.intervalMs;
  handle.mode = schedule.mode;
  handle.intervalMs = schedule.intervalMs;
  handle.fastUntil = schedule.fastUntil;

  if (changed) {
    logWatch({
      src: "remarkable-watch",
      event: "library.schedule",
      mode: schedule.mode,
      intervalMs: schedule.intervalMs,
      fastUntil:
        schedule.fastUntil == null
          ? null
          : new Date(schedule.fastUntil).toISOString(),
      reason: reason ?? schedule.reason,
    });
  }
}

function applyScheduleFromResult(result: LibraryWatchPollResult) {
  applySchedule({
    fastUntil: parseFastUntil(result.schedule.fastUntil),
    intervalMs: result.schedule.intervalMs,
    mode: result.schedule.mode,
    reason: result.status === "changed" ? "cloud_change" : "unchanged",
  });
}

function clearTimer(handle: WatcherHandle) {
  if (handle.timer) {
    clearTimeout(handle.timer);
    handle.timer = null;
  }
}

function armTimer(delayMs: number) {
  const handle = handleOrNull();

  if (!handle) {
    return;
  }

  clearTimer(handle);
  handle.timer = setTimeout(() => {
    void runWatchTick()
      .catch((error) => {
        logWatch({
          src: "remarkable-watch",
          event: "library.tick_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        const current = handleOrNull();

        if (!current) {
          return;
        }

        if (current.pendingRepoll) {
          current.pendingRepoll = false;
          void runWatchTick()
            .catch((error) => {
              logWatch({
                src: "remarkable-watch",
                event: "library.tick_failed",
                error: error instanceof Error ? error.message : String(error),
              });
            })
            .finally(() => armTimer(current.intervalMs));
          return;
        }

        armTimer(current.intervalMs);
      });
  }, delayMs);
  handle.timer.unref?.();
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
    const handle = handleOrNull();

    if (handle) {
      handle.pendingRepoll = true;
    }

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
  })
    .then((result) => {
      applyScheduleFromResult(result);
      return result;
    })
    .finally(() => {
      globalForWatch.__relayRemarkableWatchTick = null;
    });

  globalForWatch.__relayRemarkableWatchTick = tick;
  return tick;
}

export function getWatchRuntimeStatus() {
  const handle = handleOrNull();
  const config = getWatchScheduleConfig();
  const fallback = resolveWatchSchedule({
    config,
    fastUntil: handle?.fastUntil ?? null,
    nowMs: Date.now(),
  });

  return {
    enabled: isWatchEnabled(),
    fastUntil:
      handle?.fastUntil != null
        ? new Date(handle.fastUntil).toISOString()
        : fallback.fastUntil == null
          ? null
          : new Date(fallback.fastUntil).toISOString(),
    fastWindowMs: config.fastWindowMs,
    intervalMs: handle?.intervalMs ?? fallback.intervalMs,
    maxIntervalMs: config.maxIntervalMs,
    minIntervalMs: config.minIntervalMs,
    mode: handle?.mode ?? fallback.mode,
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

  if (handleOrNull()) {
    return;
  }

  const config = getWatchScheduleConfig();
  const initial = resolveWatchSchedule({
    config,
    fastUntil: null,
    nowMs: Date.now(),
  });

  globalForWatch.__relayRemarkableWatcher = {
    fastUntil: initial.fastUntil,
    intervalMs: initial.intervalMs,
    mode: initial.mode,
    pendingRepoll: false,
    startedAt: new Date().toISOString(),
    timer: null,
  };

  logWatch({
    src: "remarkable-watch",
    event: "library.started",
    mode: initial.mode,
    intervalMs: initial.intervalMs,
    minIntervalMs: config.minIntervalMs,
    maxIntervalMs: config.maxIntervalMs,
    fastWindowMs: config.fastWindowMs,
  });

  void (async () => {
    const state = await readLibraryWatchState();
    const schedule = resolveWatchSchedule({
      config,
      fastUntil: parseFastUntil(state.fastUntil),
      nowMs: Date.now(),
    });
    applySchedule(schedule, "startup");

    try {
      await runWatchTick();
    } catch (error) {
      logWatch({
        src: "remarkable-watch",
        event: "library.tick_failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const handle = handleOrNull();

    if (!handle) {
      return;
    }

    if (handle.pendingRepoll) {
      handle.pendingRepoll = false;
      try {
        await runWatchTick();
      } catch (error) {
        logWatch({
          src: "remarkable-watch",
          event: "library.tick_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    armTimer(handle.intervalMs);
  })();
}

export function stopRemarkableLibraryWatcher() {
  const handle = handleOrNull();

  if (!handle) {
    return;
  }

  clearTimer(handle);
  globalForWatch.__relayRemarkableWatcher = undefined;
}

export async function notifyRemarkableLibraryWrite(
  reason: "local_write" = "local_write",
) {
  const config = getWatchScheduleConfig();
  const schedule = enterFastWindow({
    config,
    nowMs: Date.now(),
    reason,
  });
  const snapshot = snapshotWatchSchedule(schedule);
  const state = await readLibraryWatchState();
  await writeLibraryWatchState({
    ...state,
    fastUntil: snapshot.fastUntil,
  });

  logWatch({
    src: "remarkable-watch",
    event: "library.local_write",
    mode: schedule.mode,
    intervalMs: schedule.intervalMs,
    fastUntil: snapshot.fastUntil,
    reason,
  });

  const handle = handleOrNull();

  if (!handle) {
    return;
  }

  applySchedule(schedule, reason);

  if (globalForWatch.__relayRemarkableWatchTick) {
    handle.pendingRepoll = true;
    return;
  }

  clearTimer(handle);

  try {
    await runWatchTick();
  } catch (error) {
    logWatch({
      src: "remarkable-watch",
      event: "library.tick_failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const current = handleOrNull();

  if (current) {
    armTimer(current.intervalMs);
  }
}
