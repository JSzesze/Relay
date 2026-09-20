import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_WATCH_INTERVAL_MS,
  EMPTY_WATCH_STATE,
  diffSkeletonDocuments,
  filterEventsSince,
  getWatchIntervalMs,
  isWatchEnabled,
  pollLibraryFingerprint,
  type LibraryWatchPollDeps,
} from "./remarkable-watch";
import { parseRemarkableRootFingerprint } from "./remarkable-sync/types";
import type {
  LibraryWatchEvent,
  LibraryWatchPersistedState,
  RemarkableDocumentSkeleton,
  RemarkableSkeletonStore,
} from "./types";

function documentEntry(
  id: string,
  name: string,
  lastModified: string,
): RemarkableDocumentSkeleton {
  return {
    id,
    kind: "document",
    name,
    parentId: null,
    pinned: false,
    lastModified,
  };
}

function skeletonStore(
  fingerprint: { hash: string; generation: number },
  documents: RemarkableDocumentSkeleton[],
): RemarkableSkeletonStore {
  return {
    syncedAt: "2026-09-20T17:00:00.000Z",
    rootHash: fingerprint.hash,
    generation: fingerprint.generation,
    folders: [],
    documents,
  };
}

function createMemoryStore(initial?: Partial<LibraryWatchPersistedState>) {
  let state: LibraryWatchPersistedState = {
    ...EMPTY_WATCH_STATE,
    ...initial,
    events: initial?.events ? [...initial.events] : [],
  };

  return {
    read: async () => structuredClone(state),
    write: async (next: LibraryWatchPersistedState) => {
      state = structuredClone(next);
    },
    snapshot: () => structuredClone(state),
  };
}

function createPollDeps(
  overrides: Partial<LibraryWatchPollDeps> & {
    fetchRoot: LibraryWatchPollDeps["fetchRoot"];
  },
) {
  const store = createMemoryStore();
  const logs: Array<Record<string, unknown>> = [];
  const webhookCalls: LibraryWatchEvent[] = [];
  let skeleton: RemarkableSkeletonStore | null = null;
  let syncCount = 0;

  const deps: LibraryWatchPollDeps = {
    createEventId: () => "watch_test",
    hasConnection: async () => true,
    log: (payload) => {
      logs.push(payload);
    },
    now: () => new Date("2026-09-20T18:00:00.000Z"),
    notifyWebhook: async (_url, event) => {
      webhookCalls.push(event);
    },
    readSkeleton: async () => skeleton,
    readWatchState: store.read,
    syncSkeleton: async () => {
      syncCount += 1;
      throw new Error("syncSkeleton should be stubbed");
    },
    writeWatchState: store.write,
    ...overrides,
  };

  return {
    deps,
    logs,
    setSkeleton: (next: RemarkableSkeletonStore | null) => {
      skeleton = next;
    },
    store,
    syncCount: () => syncCount,
    trackSync: (next: RemarkableSkeletonStore) => {
      deps.syncSkeleton = async () => {
        syncCount += 1;
        skeleton = next;
        return next;
      };
    },
    webhookCalls,
  };
}

describe("watch config", () => {
  it("defaults to enabled with a 45s interval", () => {
    assert.equal(isWatchEnabled({}), true);
    assert.equal(getWatchIntervalMs({}), DEFAULT_WATCH_INTERVAL_MS);
  });

  it("accepts env overrides and rejects tiny intervals", () => {
    assert.equal(isWatchEnabled({ REMARKABLE_WATCH_ENABLED: "0" }), false);
    assert.equal(isWatchEnabled({ RELAY_WATCH_ENABLED: "false" }), false);
    assert.equal(
      getWatchIntervalMs({ REMARKABLE_WATCH_INTERVAL_MS: "60000" }),
      60_000,
    );
    assert.equal(
      getWatchIntervalMs({ REMARKABLE_WATCH_INTERVAL_MS: "250" }),
      DEFAULT_WATCH_INTERVAL_MS,
    );
  });
});

describe("parseRemarkableRootFingerprint", () => {
  it("reads official hash and generation from a Connect root payload", () => {
    assert.deepEqual(
      parseRemarkableRootFingerprint(
        JSON.stringify({ hash: "abc123", generation: 9 }),
      ),
      { hash: "abc123", generation: 9 },
    );
  });

  it("rejects a root payload without a fingerprint", () => {
    assert.throws(
      () => parseRemarkableRootFingerprint(JSON.stringify({ hash: "abc123" })),
      /generation/,
    );
  });
});

describe("diffSkeletonDocuments", () => {
  it("reports documents whose modified timestamp moved", () => {
    const previous = skeletonStore({ hash: "old", generation: 1 }, [
      documentEntry("doc-1", "Journal", "100"),
      documentEntry("doc-2", "Inbox", "200"),
    ]);
    const current = skeletonStore({ hash: "new", generation: 2 }, [
      documentEntry("doc-1", "Journal", "150"),
      documentEntry("doc-3", "New notes", "300"),
    ]);

    assert.deepEqual(diffSkeletonDocuments(previous, current), [
      {
        id: "doc-1",
        name: "Journal",
        change: "modified",
        previousModified: "100",
        lastModified: "150",
      },
      {
        id: "doc-3",
        name: "New notes",
        change: "added",
        lastModified: "300",
      },
      {
        id: "doc-2",
        name: "Inbox",
        change: "removed",
        previousModified: "200",
      },
    ]);
  });
});

describe("pollLibraryFingerprint", () => {
  it("skips Connect when no account is paired", async () => {
    let fetched = false;
    const ctx = createPollDeps({
      fetchRoot: async () => {
        fetched = true;
        return { hash: "root", generation: 1 };
      },
      hasConnection: async () => false,
    });

    const result = await pollLibraryFingerprint(ctx.deps);

    assert.deepEqual(result, {
      status: "skipped",
      reason: "not_connected",
      polledAt: "2026-09-20T18:00:00.000Z",
    });
    assert.equal(fetched, false);
    assert.equal(ctx.store.snapshot().lastPolledAt, "2026-09-20T18:00:00.000Z");
  });

  it("does not refresh the skeleton when the root fingerprint is unchanged", async () => {
    const fingerprint = { hash: "same-root", generation: 4 };
    const ctx = createPollDeps({
      fetchRoot: async () => fingerprint,
    });
    ctx.setSkeleton(skeletonStore(fingerprint, [documentEntry("doc-1", "Journal", "100")]));
    await ctx.store.write({
      ...EMPTY_WATCH_STATE,
      lastFingerprint: fingerprint,
    });

    const result = await pollLibraryFingerprint(ctx.deps);

    assert.equal(result.status, "unchanged");
    assert.equal(ctx.syncCount(), 0);
    assert.deepEqual(ctx.store.snapshot().lastFingerprint, fingerprint);
    assert.equal(ctx.store.snapshot().events.length, 0);
  });

  it("refreshes the skeleton and records an event when the root fingerprint changes", async () => {
    const previous = { hash: "root-a", generation: 1 };
    const next = { hash: "root-b", generation: 2 };
    const webhookCalls: LibraryWatchEvent[] = [];
    const ctx = createPollDeps({
      fetchRoot: async () => next,
      webhookUrl: "http://127.0.0.1:9/watch",
      notifyWebhook: async (_url, event) => {
        webhookCalls.push(event);
      },
    });
    const previousSkeleton = skeletonStore(previous, [
      documentEntry("doc-1", "Journal", "100"),
    ]);
    const nextSkeleton = skeletonStore(next, [
      documentEntry("doc-1", "Journal", "250"),
    ]);
    ctx.setSkeleton(previousSkeleton);
    ctx.trackSync(nextSkeleton);
    await ctx.store.write({
      ...EMPTY_WATCH_STATE,
      lastFingerprint: previous,
    });

    const result = await pollLibraryFingerprint(ctx.deps);

    assert.equal(result.status, "changed");
    assert.equal(ctx.syncCount(), 1);
    if (result.status !== "changed") {
      throw new Error("expected a changed poll result");
    }
    assert.deepEqual(result.event.previous, previous);
    assert.deepEqual(result.event.current, next);
    assert.deepEqual(result.event.changedDocuments, [
      {
        id: "doc-1",
        name: "Journal",
        change: "modified",
        previousModified: "100",
        lastModified: "250",
      },
    ]);
    assert.deepEqual(ctx.store.snapshot().lastFingerprint, next);
    assert.equal(ctx.store.snapshot().events.length, 1);
    assert.equal(webhookCalls.length, 1);
    assert.equal(
      ctx.logs.some((entry) => entry.event === "library.changed"),
      true,
    );
  });

  it("keeps the previous fingerprint when skeleton refresh fails so the next poll retries", async () => {
    const previous = { hash: "root-a", generation: 1 };
    const ctx = createPollDeps({
      fetchRoot: async () => ({ hash: "root-b", generation: 2 }),
    });
    ctx.setSkeleton(skeletonStore(previous, []));
    await ctx.store.write({
      ...EMPTY_WATCH_STATE,
      lastFingerprint: previous,
    });

    const result = await pollLibraryFingerprint(ctx.deps);

    assert.equal(result.status, "error");
    assert.deepEqual(ctx.store.snapshot().lastFingerprint, previous);
    assert.match(ctx.store.snapshot().lastError ?? "", /syncSkeleton/);
    assert.equal(ctx.store.snapshot().events.length, 0);
  });

  it("refreshes the skeleton on the first poll when no local fingerprint exists", async () => {
    const next = { hash: "root-first", generation: 1 };
    const ctx = createPollDeps({
      fetchRoot: async () => next,
    });
    ctx.trackSync(
      skeletonStore(next, [documentEntry("doc-1", "Journal", "100")]),
    );

    const result = await pollLibraryFingerprint(ctx.deps);

    assert.equal(result.status, "changed");
    assert.equal(ctx.syncCount(), 1);
    if (result.status !== "changed") {
      throw new Error("expected a changed poll result");
    }
    assert.equal(result.event.previous, null);
    assert.deepEqual(result.event.current, next);
    assert.deepEqual(ctx.store.snapshot().lastFingerprint, next);
  });

  it("seeds the first poll from an existing skeleton without a refresh when they match", async () => {
    const fingerprint = { hash: "seeded", generation: 7 };
    const ctx = createPollDeps({
      fetchRoot: async () => fingerprint,
    });
    ctx.setSkeleton(skeletonStore(fingerprint, []));

    const result = await pollLibraryFingerprint(ctx.deps);

    assert.equal(result.status, "unchanged");
    assert.equal(ctx.syncCount(), 0);
    assert.deepEqual(ctx.store.snapshot().lastFingerprint, fingerprint);
  });
});

describe("filterEventsSince", () => {
  it("returns events newer than the since timestamp", () => {
    const events: LibraryWatchEvent[] = [
      {
        id: "newer",
        detectedAt: "2026-09-20T18:00:00.000Z",
        previous: { hash: "a", generation: 1 },
        current: { hash: "b", generation: 2 },
        changedDocuments: [],
      },
      {
        id: "older",
        detectedAt: "2026-09-20T16:00:00.000Z",
        previous: null,
        current: { hash: "a", generation: 1 },
        changedDocuments: [],
      },
    ];

    assert.deepEqual(
      filterEventsSince(events, "2026-09-20T17:00:00.000Z").map((event) => event.id),
      ["newer"],
    );
  });
});
