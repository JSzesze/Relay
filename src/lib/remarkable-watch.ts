import type {
  LibraryWatchDocumentChange,
  LibraryWatchEvent,
  LibraryWatchIntervalMode,
  LibraryWatchPersistedState,
  RemarkableSkeletonStore,
  SyncRootFingerprint,
} from "@/lib/types";

export const DEFAULT_WATCH_MIN_INTERVAL_MS = 20_000;
export const DEFAULT_WATCH_MAX_INTERVAL_MS = 180_000;
export const DEFAULT_WATCH_FAST_WINDOW_MS = 120_000;
export const MIN_WATCH_INTERVAL_MS = 5_000;
export const MAX_WATCH_EVENTS = 100;
export const MAX_CHANGED_DOCUMENTS = 25;
export const MAX_SKELETON_REFRESH_COALESCE = 3;

/** @deprecated Use DEFAULT_WATCH_MAX_INTERVAL_MS — quiet baseline. */
export const DEFAULT_WATCH_INTERVAL_MS = DEFAULT_WATCH_MAX_INTERVAL_MS;

export const EMPTY_WATCH_STATE: LibraryWatchPersistedState = {
  lastFingerprint: null,
  lastPolledAt: null,
  lastChangedAt: null,
  lastError: null,
  fastUntil: null,
  events: [],
};

export type LibraryWatchPollStatus =
  | "unchanged"
  | "changed"
  | "skipped"
  | "error";

export type LibraryWatchSkipReason = "not_connected";

export type LibraryWatchScheduleReason =
  | "cloud_change"
  | "local_write"
  | "quiet"
  | "unchanged";

export interface WatchScheduleConfig {
  fastWindowMs: number;
  maxIntervalMs: number;
  minIntervalMs: number;
}

export interface WatchSchedule {
  fastUntil: number | null;
  intervalMs: number;
  mode: LibraryWatchIntervalMode;
  reason: LibraryWatchScheduleReason;
}

export interface LibraryWatchScheduleSnapshot {
  fastUntil: string | null;
  intervalMs: number;
  mode: LibraryWatchIntervalMode;
}

export type LibraryWatchPollResult = {
  polledAt: string;
  schedule: LibraryWatchScheduleSnapshot;
} & (
  | {
      status: "unchanged";
      fingerprint: SyncRootFingerprint;
    }
  | {
      status: "changed";
      event: LibraryWatchEvent;
    }
  | {
      status: "skipped";
      reason: LibraryWatchSkipReason;
    }
  | {
      status: "error";
      error: string;
    }
);

export interface LibraryWatchPollDeps {
  createEventId: () => string;
  fetchRoot: () => Promise<SyncRootFingerprint>;
  hasConnection: () => Promise<boolean>;
  log?: (payload: Record<string, unknown>) => void;
  now: () => Date;
  notifyWebhook?: (url: string, event: LibraryWatchEvent) => Promise<void>;
  readSkeleton: () => Promise<RemarkableSkeletonStore | null>;
  readWatchState: () => Promise<LibraryWatchPersistedState>;
  scheduleConfig?: WatchScheduleConfig;
  syncSkeleton: () => Promise<RemarkableSkeletonStore>;
  webhookUrl?: string | null;
  writeWatchState: (state: LibraryWatchPersistedState) => Promise<void>;
}

function parseBooleanFlag(value: string | undefined) {
  if (value == null || value.trim() === "") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

type EnvMap = Record<string, string | undefined>;

function parsePositiveInt(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < MIN_WATCH_INTERVAL_MS) {
    return null;
  }

  return parsed;
}

export function isWatchEnabled(env: EnvMap = process.env) {
  const parsed = parseBooleanFlag(
    env.REMARKABLE_WATCH_ENABLED ?? env.RELAY_WATCH_ENABLED,
  );
  return parsed ?? true;
}

export function getWatchScheduleConfig(
  env: EnvMap = process.env,
): WatchScheduleConfig {
  const minIntervalMs =
    parsePositiveInt(
      env.REMARKABLE_WATCH_MIN_INTERVAL_MS ?? env.RELAY_WATCH_MIN_INTERVAL_MS,
    ) ?? DEFAULT_WATCH_MIN_INTERVAL_MS;
  const maxIntervalMs =
    parsePositiveInt(
      env.REMARKABLE_WATCH_MAX_INTERVAL_MS ??
        env.RELAY_WATCH_MAX_INTERVAL_MS ??
        env.REMARKABLE_WATCH_INTERVAL_MS ??
        env.RELAY_WATCH_INTERVAL_MS,
    ) ?? DEFAULT_WATCH_MAX_INTERVAL_MS;
  const fastWindowMs =
    parsePositiveInt(
      env.REMARKABLE_WATCH_FAST_WINDOW_MS ??
        env.RELAY_WATCH_FAST_WINDOW_MS ??
        env.REMARKABLE_WATCH_BACKOFF_MS ??
        env.RELAY_WATCH_BACKOFF_MS,
    ) ?? DEFAULT_WATCH_FAST_WINDOW_MS;

  return {
    fastWindowMs,
    maxIntervalMs: Math.max(maxIntervalMs, minIntervalMs),
    minIntervalMs,
  };
}

export function getWatchIntervalMs(env: EnvMap = process.env) {
  return getWatchScheduleConfig(env).maxIntervalMs;
}

export function getWatchWebhookUrl(env: EnvMap = process.env) {
  const raw = env.REMARKABLE_WATCH_WEBHOOK_URL ?? env.RELAY_WATCH_WEBHOOK_URL;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export function parseFastUntil(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function snapshotWatchSchedule(
  schedule: WatchSchedule,
): LibraryWatchScheduleSnapshot {
  return {
    fastUntil:
      schedule.fastUntil == null
        ? null
        : new Date(schedule.fastUntil).toISOString(),
    intervalMs: schedule.intervalMs,
    mode: schedule.mode,
  };
}

export function resolveWatchSchedule(input: {
  config: WatchScheduleConfig;
  fastUntil: number | null;
  nowMs: number;
  reason?: LibraryWatchScheduleReason;
}): WatchSchedule {
  const remaining =
    input.fastUntil != null ? input.fastUntil - input.nowMs : 0;

  if (remaining > 0) {
    return {
      fastUntil: input.fastUntil,
      intervalMs: input.config.minIntervalMs,
      mode: "fast",
      reason: input.reason ?? "cloud_change",
    };
  }

  return {
    fastUntil: null,
    intervalMs: input.config.maxIntervalMs,
    mode: "quiet",
    reason: input.reason ?? "quiet",
  };
}

export function enterFastWindow(input: {
  config: WatchScheduleConfig;
  nowMs: number;
  reason?: Extract<LibraryWatchScheduleReason, "cloud_change" | "local_write">;
}): WatchSchedule {
  return {
    fastUntil: input.nowMs + input.config.fastWindowMs,
    intervalMs: input.config.minIntervalMs,
    mode: "fast",
    reason: input.reason ?? "cloud_change",
  };
}

export function advanceWatchSchedule(input: {
  config: WatchScheduleConfig;
  fastUntil: number | null;
  nowMs: number;
  observedChange: boolean;
}): WatchSchedule {
  if (input.observedChange) {
    return enterFastWindow({
      config: input.config,
      nowMs: input.nowMs,
      reason: "cloud_change",
    });
  }

  return resolveWatchSchedule({
    config: input.config,
    fastUntil: input.fastUntil,
    nowMs: input.nowMs,
    reason: "unchanged",
  });
}

export function fingerprintsEqual(
  left: SyncRootFingerprint | null,
  right: SyncRootFingerprint | null,
) {
  if (!left || !right) {
    return false;
  }

  return left.hash === right.hash && left.generation === right.generation;
}

export function skeletonFingerprint(
  skeleton: RemarkableSkeletonStore | null,
): SyncRootFingerprint | null {
  if (!skeleton) {
    return null;
  }

  return {
    hash: skeleton.rootHash,
    generation: skeleton.generation,
  };
}

export function diffSkeletonDocuments(
  previous: RemarkableSkeletonStore | null,
  current: RemarkableSkeletonStore,
): LibraryWatchDocumentChange[] {
  if (!previous) {
    return [];
  }

  const previousById = new Map(
    previous.documents.map((document) => [document.id, document]),
  );
  const currentById = new Map(
    current.documents.map((document) => [document.id, document]),
  );
  const changes: LibraryWatchDocumentChange[] = [];

  for (const document of current.documents) {
    const prior = previousById.get(document.id);

    if (!prior) {
      changes.push({
        id: document.id,
        name: document.name,
        change: "added",
        lastModified: document.lastModified,
      });
      continue;
    }

    if (prior.lastModified !== document.lastModified) {
      changes.push({
        id: document.id,
        name: document.name,
        change: "modified",
        previousModified: prior.lastModified,
        lastModified: document.lastModified,
      });
    }
  }

  for (const document of previous.documents) {
    if (!currentById.has(document.id)) {
      changes.push({
        id: document.id,
        name: document.name,
        change: "removed",
        previousModified: document.lastModified,
      });
    }
  }

  return changes.slice(0, MAX_CHANGED_DOCUMENTS);
}

export function filterEventsSince(
  events: LibraryWatchEvent[],
  since?: string | null,
) {
  if (!since) {
    return events;
  }

  const sinceTime = Date.parse(since);

  if (Number.isNaN(sinceTime)) {
    return events;
  }

  return events.filter((event) => Date.parse(event.detectedAt) > sinceTime);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function appendEvent(
  events: LibraryWatchEvent[],
  event: LibraryWatchEvent,
) {
  return [event, ...events].slice(0, MAX_WATCH_EVENTS);
}

async function refreshSkeletonUntilStable(
  deps: LibraryWatchPollDeps,
  initialFingerprint: SyncRootFingerprint,
) {
  let fingerprint = initialFingerprint;
  let skeleton = await deps.syncSkeleton();

  for (let attempt = 0; attempt < MAX_SKELETON_REFRESH_COALESCE; attempt += 1) {
    const latest = await deps.fetchRoot();

    if (
      fingerprintsEqual(latest, fingerprint) ||
      fingerprintsEqual(latest, skeletonFingerprint(skeleton))
    ) {
      fingerprint = latest;
      break;
    }

    fingerprint = latest;
    skeleton = await deps.syncSkeleton();
  }

  return { fingerprint, skeleton };
}

export async function pollLibraryFingerprint(
  deps: LibraryWatchPollDeps,
): Promise<LibraryWatchPollResult> {
  const polledAtDate = deps.now();
  const polledAt = polledAtDate.toISOString();
  const nowMs = polledAtDate.getTime();
  const config = deps.scheduleConfig ?? getWatchScheduleConfig();
  const log = deps.log ?? (() => undefined);

  const scheduleFor = (
    fastUntil: number | null,
    observedChange: boolean,
  ) =>
    snapshotWatchSchedule(
      advanceWatchSchedule({
        config,
        fastUntil,
        nowMs,
        observedChange,
      }),
    );

  try {
    const connected = await deps.hasConnection();

    if (!connected) {
      const state = await deps.readWatchState();
      const schedule = scheduleFor(parseFastUntil(state.fastUntil), false);
      await deps.writeWatchState({
        ...state,
        lastPolledAt: polledAt,
        fastUntil: schedule.fastUntil,
      });
      log({
        src: "remarkable-watch",
        event: "library.skipped",
        reason: "not_connected",
        mode: schedule.mode,
        intervalMs: schedule.intervalMs,
        polledAt,
      });
      return {
        status: "skipped",
        reason: "not_connected",
        polledAt,
        schedule,
      };
    }

    const [state, skeleton, current] = await Promise.all([
      deps.readWatchState(),
      deps.readSkeleton(),
      deps.fetchRoot(),
    ]);
    const previous =
      state.lastFingerprint ?? skeletonFingerprint(skeleton);
    const incomingFastUntil = parseFastUntil(state.fastUntil);

    if (fingerprintsEqual(previous, current)) {
      const schedule = scheduleFor(incomingFastUntil, false);
      await deps.writeWatchState({
        ...state,
        lastFingerprint: current,
        lastPolledAt: polledAt,
        lastError: null,
        fastUntil: schedule.fastUntil,
      });
      log({
        src: "remarkable-watch",
        event: "library.unchanged",
        hash: current.hash,
        generation: current.generation,
        mode: schedule.mode,
        intervalMs: schedule.intervalMs,
        polledAt,
      });
      return {
        status: "unchanged",
        fingerprint: current,
        polledAt,
        schedule,
      };
    }

    const refreshed = await refreshSkeletonUntilStable(deps, current);
    const schedule = scheduleFor(incomingFastUntil, true);
    const event: LibraryWatchEvent = {
      id: deps.createEventId(),
      detectedAt: polledAt,
      previous,
      current: refreshed.fingerprint,
      changedDocuments: diffSkeletonDocuments(skeleton, refreshed.skeleton),
    };

    await deps.writeWatchState({
      lastFingerprint: refreshed.fingerprint,
      lastPolledAt: polledAt,
      lastChangedAt: polledAt,
      lastError: null,
      fastUntil: schedule.fastUntil,
      events: appendEvent(state.events, event),
    });

    log({
      src: "remarkable-watch",
      event: "library.changed",
      previousHash: previous?.hash ?? null,
      previousGeneration: previous?.generation ?? null,
      hash: refreshed.fingerprint.hash,
      generation: refreshed.fingerprint.generation,
      detectedAt: polledAt,
      changedDocuments: event.changedDocuments,
      mode: schedule.mode,
      intervalMs: schedule.intervalMs,
      fastUntil: schedule.fastUntil,
    });

    if (deps.webhookUrl && deps.notifyWebhook) {
      try {
        await deps.notifyWebhook(deps.webhookUrl, event);
      } catch (error) {
        log({
          src: "remarkable-watch",
          event: "library.webhook_failed",
          error: errorMessage(error),
          detectedAt: polledAt,
        });
      }
    }

    return {
      status: "changed",
      event,
      polledAt,
      schedule,
    };
  } catch (error) {
    const message = errorMessage(error);
    let schedule = snapshotWatchSchedule(
      resolveWatchSchedule({
        config,
        fastUntil: null,
        nowMs,
      }),
    );

    try {
      const state = await deps.readWatchState();
      schedule = scheduleFor(parseFastUntil(state.fastUntil), false);
      await deps.writeWatchState({
        ...state,
        lastPolledAt: polledAt,
        lastError: message,
        fastUntil: schedule.fastUntil,
      });
    } catch {
      // Persist the poll error when possible; the thrown path still logs.
    }

    log({
      src: "remarkable-watch",
      event: "library.error",
      error: message,
      mode: schedule.mode,
      intervalMs: schedule.intervalMs,
      polledAt,
    });

    return {
      status: "error",
      error: message,
      polledAt,
      schedule,
    };
  }
}
