import type {
  LibraryWatchDocumentChange,
  LibraryWatchEvent,
  LibraryWatchPersistedState,
  RemarkableSkeletonStore,
  SyncRootFingerprint,
} from "@/lib/types";

export const DEFAULT_WATCH_INTERVAL_MS = 45_000;
export const MIN_WATCH_INTERVAL_MS = 5_000;
export const MAX_WATCH_EVENTS = 100;
export const MAX_CHANGED_DOCUMENTS = 25;

export const EMPTY_WATCH_STATE: LibraryWatchPersistedState = {
  lastFingerprint: null,
  lastPolledAt: null,
  lastChangedAt: null,
  lastError: null,
  events: [],
};

export type LibraryWatchPollStatus =
  | "unchanged"
  | "changed"
  | "skipped"
  | "error";

export type LibraryWatchSkipReason = "not_connected";

export type LibraryWatchPollResult =
  | {
      status: "unchanged";
      fingerprint: SyncRootFingerprint;
      polledAt: string;
    }
  | {
      status: "changed";
      event: LibraryWatchEvent;
      polledAt: string;
    }
  | {
      status: "skipped";
      reason: LibraryWatchSkipReason;
      polledAt: string;
    }
  | {
      status: "error";
      error: string;
      polledAt: string;
    };

export interface LibraryWatchPollDeps {
  createEventId: () => string;
  fetchRoot: () => Promise<SyncRootFingerprint>;
  hasConnection: () => Promise<boolean>;
  log?: (payload: Record<string, unknown>) => void;
  now: () => Date;
  notifyWebhook?: (url: string, event: LibraryWatchEvent) => Promise<void>;
  readSkeleton: () => Promise<RemarkableSkeletonStore | null>;
  readWatchState: () => Promise<LibraryWatchPersistedState>;
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

export function isWatchEnabled(env: EnvMap = process.env) {
  const parsed = parseBooleanFlag(
    env.REMARKABLE_WATCH_ENABLED ?? env.RELAY_WATCH_ENABLED,
  );
  return parsed ?? true;
}

export function getWatchIntervalMs(env: EnvMap = process.env) {
  const raw = env.REMARKABLE_WATCH_INTERVAL_MS ?? env.RELAY_WATCH_INTERVAL_MS;

  if (!raw) {
    return DEFAULT_WATCH_INTERVAL_MS;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < MIN_WATCH_INTERVAL_MS) {
    return DEFAULT_WATCH_INTERVAL_MS;
  }

  return parsed;
}

export function getWatchWebhookUrl(env: EnvMap = process.env) {
  const raw = env.REMARKABLE_WATCH_WEBHOOK_URL ?? env.RELAY_WATCH_WEBHOOK_URL;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
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

export async function pollLibraryFingerprint(
  deps: LibraryWatchPollDeps,
): Promise<LibraryWatchPollResult> {
  const polledAt = deps.now().toISOString();
  const log = deps.log ?? (() => undefined);

  try {
    const connected = await deps.hasConnection();

    if (!connected) {
      const state = await deps.readWatchState();
      await deps.writeWatchState({
        ...state,
        lastPolledAt: polledAt,
      });
      log({
        src: "remarkable-watch",
        event: "library.skipped",
        reason: "not_connected",
        polledAt,
      });
      return {
        status: "skipped",
        reason: "not_connected",
        polledAt,
      };
    }

    const [state, skeleton, current] = await Promise.all([
      deps.readWatchState(),
      deps.readSkeleton(),
      deps.fetchRoot(),
    ]);
    const previous =
      state.lastFingerprint ?? skeletonFingerprint(skeleton);

    if (fingerprintsEqual(previous, current)) {
      await deps.writeWatchState({
        ...state,
        lastFingerprint: current,
        lastPolledAt: polledAt,
        lastError: null,
      });
      log({
        src: "remarkable-watch",
        event: "library.unchanged",
        hash: current.hash,
        generation: current.generation,
        polledAt,
      });
      return {
        status: "unchanged",
        fingerprint: current,
        polledAt,
      };
    }

    const nextSkeleton = await deps.syncSkeleton();
    const event: LibraryWatchEvent = {
      id: deps.createEventId(),
      detectedAt: polledAt,
      previous,
      current,
      changedDocuments: diffSkeletonDocuments(skeleton, nextSkeleton),
    };

    await deps.writeWatchState({
      lastFingerprint: current,
      lastPolledAt: polledAt,
      lastChangedAt: polledAt,
      lastError: null,
      events: appendEvent(state.events, event),
    });

    log({
      src: "remarkable-watch",
      event: "library.changed",
      previousHash: previous?.hash ?? null,
      previousGeneration: previous?.generation ?? null,
      hash: current.hash,
      generation: current.generation,
      detectedAt: polledAt,
      changedDocuments: event.changedDocuments,
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
    };
  } catch (error) {
    const message = errorMessage(error);

    try {
      const state = await deps.readWatchState();
      await deps.writeWatchState({
        ...state,
        lastPolledAt: polledAt,
        lastError: message,
      });
    } catch {
      // Persist the poll error when possible; the thrown path still logs.
    }

    log({
      src: "remarkable-watch",
      event: "library.error",
      error: message,
      polledAt,
    });

    return {
      status: "error",
      error: message,
      polledAt,
    };
  }
}
