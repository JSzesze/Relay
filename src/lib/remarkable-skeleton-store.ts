import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RemarkableSkeletonStore } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), ".data");
const SKELETON_PATH = path.join(DATA_DIR, "remarkable-skeleton.json");

export async function readRemarkableSkeleton() {
  try {
    const raw = await readFile(SKELETON_PATH, "utf8");
    return JSON.parse(raw) as RemarkableSkeletonStore;
  } catch {
    return null;
  }
}

export async function writeRemarkableSkeleton(store: RemarkableSkeletonStore) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SKELETON_PATH, JSON.stringify(store, null, 2), "utf8");
}
