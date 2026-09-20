import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { EMPTY_WATCH_STATE } from "@/lib/remarkable-watch";
import type {
  LibraryWatchEvent,
  LibraryWatchPersistedState,
  SyncRootFingerprint,
} from "@/lib/types";

const DEFAULT_DATA_DIR = path.join(process.cwd(), ".data");
const WATCH_STATE_FILE = "remarkable-watch.json";

function watchStatePath(dataDir = DEFAULT_DATA_DIR) {
  return path.join(dataDir, WATCH_STATE_FILE);
}

function isFingerprint(value: unknown): value is SyncRootFingerprint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const fingerprint = value as Partial<SyncRootFingerprint>;
  return (
    typeof fingerprint.hash === "string" &&
    typeof fingerprint.generation === "number"
  );
}

function isWatchEvent(value: unknown): value is LibraryWatchEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<LibraryWatchEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.detectedAt === "string" &&
    isFingerprint(event.current) &&
    Array.isArray(event.changedDocuments)
  );
}

function normalizeWatchState(value: unknown): LibraryWatchPersistedState {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_WATCH_STATE };
  }

  const raw = value as Partial<LibraryWatchPersistedState>;
  return {
    lastFingerprint: isFingerprint(raw.lastFingerprint)
      ? raw.lastFingerprint
      : null,
    lastPolledAt:
      typeof raw.lastPolledAt === "string" ? raw.lastPolledAt : null,
    lastChangedAt:
      typeof raw.lastChangedAt === "string" ? raw.lastChangedAt : null,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    events: Array.isArray(raw.events)
      ? raw.events.filter(isWatchEvent)
      : [],
  };
}

export function getLibraryWatchStatePath(dataDir = DEFAULT_DATA_DIR) {
  return watchStatePath(dataDir);
}

export async function readLibraryWatchState(dataDir = DEFAULT_DATA_DIR) {
  try {
    const raw = await readFile(watchStatePath(dataDir), "utf8");
    return normalizeWatchState(JSON.parse(raw) as unknown);
  } catch {
    return { ...EMPTY_WATCH_STATE };
  }
}

export async function writeLibraryWatchState(
  state: LibraryWatchPersistedState,
  dataDir = DEFAULT_DATA_DIR,
) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    watchStatePath(dataDir),
    JSON.stringify(state, null, 2),
    "utf8",
  );
}
