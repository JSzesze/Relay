import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId } from "@/lib/utils";
import type {
  AppState,
  JobStatus,
  RemarkableConnection,
  SendDocument,
  SendJob,
  SourceType,
} from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const STATE_PATH = path.join(DATA_DIR, "state.json");

const EMPTY_STATE: AppState = {
  connection: null,
  documents: [],
  jobs: [],
};

async function ensureStateFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(STATE_PATH, "utf8");
  } catch {
    await writeFile(STATE_PATH, JSON.stringify(EMPTY_STATE, null, 2), "utf8");
  }
}

export async function readState(): Promise<AppState> {
  await ensureStateFile();
  const raw = await readFile(STATE_PATH, "utf8");
  return JSON.parse(raw) as AppState;
}

async function writeState(state: AppState) {
  await ensureStateFile();
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function saveConnection(connection: RemarkableConnection) {
  const state = await readState();
  state.connection = connection;
  await writeState(state);
}

export async function clearConnection() {
  const state = await readState();
  state.connection = null;
  await writeState(state);
}

export async function createDocument(input: {
  title: string;
  sourceType: SourceType;
  rawSource: string;
  normalizedHtml?: string;
  plainText?: string;
}) {
  const state = await readState();
  const document: SendDocument = {
    id: createId("doc"),
    title: input.title,
    sourceType: input.sourceType,
    rawSource: input.rawSource,
    normalizedHtml: input.normalizedHtml,
    plainText: input.plainText,
    outputFormat: "pdf",
    createdAt: new Date().toISOString(),
  };
  state.documents.unshift(document);
  await writeState(state);
  return document;
}

export async function createJob(input: {
  documentId: string;
  title: string;
  sourceType: SourceType;
}) {
  const state = await readState();
  const now = new Date().toISOString();
  const job: SendJob = {
    id: createId("job"),
    documentId: input.documentId,
    title: input.title,
    sourceType: input.sourceType,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  state.jobs.unshift(job);
  await writeState(state);
  return job;
}

export async function updateJob(
  jobId: string,
  updates: Partial<Pick<SendJob, "status" | "error" | "uploadedAt">>,
) {
  const state = await readState();
  const job = state.jobs.find((entry) => entry.id === jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (updates.status) {
    job.status = updates.status as JobStatus;
  }
  if (updates.error !== undefined) {
    job.error = updates.error;
  }
  if (updates.uploadedAt !== undefined) {
    job.uploadedAt = updates.uploadedAt;
  }
  job.updatedAt = new Date().toISOString();

  await writeState(state);
  return job;
}
