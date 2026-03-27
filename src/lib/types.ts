export type SourceType = "url" | "markdown" | "html" | "text" | "pdf";
export type JobStatus =
  | "queued"
  | "converting"
  | "uploading"
  | "uploaded"
  | "failed";

export interface RemarkableConnection {
  connectedAt: string;
  deviceToken: string;
  userToken: string;
  userTokenUpdatedAt: string;
  tectonicHost?: string;
}

export interface RemarkableTag {
  name: string;
  timestamp?: number;
}

export interface RemarkablePageTag extends RemarkableTag {
  pageId: string;
}

export interface RemarkableFolderSkeleton {
  id: string;
  kind: "folder";
  name: string;
  parentId: string | null;
  pinned: boolean;
  lastModified?: string;
  lastOpened?: string;
}

export interface RemarkableDocumentSkeleton {
  id: string;
  kind: "document";
  name: string;
  parentId: string | null;
  pinned: boolean;
  fileType?: string;
  title?: string;
  authors?: string[];
  pageCount?: number;
  originalPageCount?: number;
  tags: RemarkableTag[];
  pageTags: RemarkablePageTag[];
  lastModified?: string;
  lastOpened?: string;
}

export interface RemarkableSkeletonStore {
  syncedAt: string;
  rootHash: string;
  generation: number;
  folders: RemarkableFolderSkeleton[];
  documents: RemarkableDocumentSkeleton[];
}

export interface SendDocument {
  id: string;
  title: string;
  sourceType: SourceType;
  rawSource: string;
  normalizedHtml?: string;
  plainText?: string;
  outputFormat: "pdf";
  createdAt: string;
}

export interface SendJob {
  id: string;
  documentId: string;
  title: string;
  sourceType: SourceType;
  status: JobStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
  uploadedAt?: string;
}

export interface AppState {
  connection: RemarkableConnection | null;
  documents: SendDocument[];
  jobs: SendJob[];
}
