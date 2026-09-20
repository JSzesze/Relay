# Relay

Relay is a Next.js app for sending content to reMarkable and exploring pulled reMarkable documents locally.

Current capabilities:
- connect a reMarkable account with the browser pairing code flow
- send Markdown, HTML, text, URLs, and PDFs to reMarkable
- sync a local skeleton of folders and documents from reMarkable cloud
- inspect document metadata, tags, and page-level details
- preview pulled `.rm` notebook pages with a first-party v6 parser
- download original PDF and EPUB assets when available
- append or create native notebook pages by rendering Markdown/HTML to PNG and embedding those images in v6 `.rm` pages (image-in-.rm), then syncing through official Connect
- poll the official Connect sync root fingerprint and refresh the local library skeleton when the cloud library changes

## Development

Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

The dev server and `pnpm start` both bind [http://127.0.0.1:3001](http://127.0.0.1:3001).

Useful commands:

```bash
pnpm lint
pnpm test
pnpm build
```

## Agent notebook writes (image-in-.rm)

Relay can now write **new pages onto an existing notebook** (or create a notebook) without Developer Mode / SSH. The v1 path does **not** synthesize ink strokes. It:

1. renders Markdown, HTML, or plain text to Paper Pro-sized PNGs (`1620×2160`)
2. builds firmware 3.27+ v6 `.rm` pages that place those PNGs as native image items
3. stores each PNG next to its page (`{docId}/{pageId}/{imageUuid}.png`)
4. uploads the patched notebook bundle through Connect sync v3

This is the official Connect path. It will not edit existing handwriting.

### Library function

```ts
import { writeNotebookPages } from "@/lib/notebook-pages";

const created = await writeNotebookPages({
  mode: "create",
  title: "Agent notes",
  sourceType: "markdown",
  content: "## Inbox\n- Follow up with Maya",
});

const appended = await writeNotebookPages({
  mode: "append",
  target: { name: "Journal" }, // or { id } or { path: "Projects/Journal" }
  sourceType: "markdown",
  content: "### 20 Sep\nShipped the Connect append path.",
});
```

`writeNotebookPages()` returns the document id, new page ids, generated file inventory, and whether Connect upload succeeded. Pass `dryRun: true` to generate the bundle without writing the cloud root.

### HTTP and CLI

```bash
# After pairing in the app
curl -X POST http://127.0.0.1:3001/api/remarkable/notebook \
  -H 'content-type: application/json' \
  -d '{"mode":"append","sourceType":"markdown","target":{"name":"Journal"},"content":"# Hello"}'

pnpm notebook create --title "Agent notes" --markdown "# Hello"
pnpm notebook append --name "Journal" --markdown "## More" --dry-run
```

Append looks up notebooks from the local library skeleton (`pnpm` app library sync). Pass `--id` if you already know the document UUID.

### Current limits

- Appends **image pages**, not typed text or ink. Existing strokes are left untouched.
- Text is rasterized with a public-domain 8×8 bitmap face (scaled up on Paper Pro). That is readable for notes, not a typeset PDF.
- Target device page size defaults to **reMarkable Paper Pro** (`1620×2160`). Override with `pageSize`.
- Only notebooks can be appended. PDF/EPUB documents still use the existing `/api/send` PDF upload.
- Live Connect upload needs a paired account. If sync v3 PUT/root update is rejected, the generator still produces valid `.rm` + PNG files and returns `uploadGap` with the API error.
- Do not commit Connect tokens. Pairing data stays in local `.data/`.

## Connect library watcher

Connect does not push library changes. Relay therefore polls the official sync root (`GET /sync/v4/root`) for `hash` + `generation` only. Notebook blobs are not downloaded on each poll. When that fingerprint changes, Relay reuses the existing skeleton sync path, writes a change event, and emits a local signal.

The watcher starts and stops with the Relay Node process via `src/instrumentation.ts` (`register()` on `next dev` / `next start`). This is the long-running Mini / LaunchAgent mode — not a serverless Vercel function.

### Enable and interval

The watcher is **on by default** whenever the Next.js server boots. Pair the account once in the app (tokens stay in local `.data/`), then leave Relay running.

```bash
# Long-lived local service (binds 127.0.0.1:3001)
pnpm build
pnpm start
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `REMARKABLE_WATCH_ENABLED` | `1` | Set `0` / `false` / `off` to disable the background timer |
| `REMARKABLE_WATCH_INTERVAL_MS` | `45000` | Poll interval (minimum 5000 ms) |
| `REMARKABLE_WATCH_WEBHOOK_URL` | unset | Optional `POST` target for change events |

`RELAY_WATCH_*` aliases are also accepted. Last-seen fingerprint and events are persisted at `.data/remarkable-watch.json` beside pairing state and the skeleton.

On each change Relay:

1. refreshes the local library skeleton
2. records previous vs new `hash` / `generation`, timestamp, and a short list of documents whose `lastModified` moved (plus added/removed when that is visible from the skeleton)
3. writes a structured log line (`{"src":"remarkable-watch","event":"library.changed",...}`)
4. optionally POSTs that event JSON to `REMARKABLE_WATCH_WEBHOOK_URL`

### Endpoints

Local-only. The process binds `127.0.0.1` in `pnpm start`.

```bash
# Status + recent events
curl http://127.0.0.1:3001/api/remarkable/watch

# Events since an ISO timestamp
curl 'http://127.0.0.1:3001/api/remarkable/watch?since=2026-09-20T17:00:00.000Z'

# Run one poll immediately (same path as the timer)
curl -X POST http://127.0.0.1:3001/api/remarkable/watch
```

`GET` returns watcher runtime (`running`, `intervalMs`, last fingerprint, last poll/error) plus events. `POST` returns `{ status: "unchanged" | "changed" | "skipped" | "error", ... }`.

### LaunchAgent-friendly long-running mode

On a Mac Mini, run the built Next server as a keep-alive user agent. Pair first, then load a plist that starts Relay in the project directory:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.relay.remarkable</string>
  <key>WorkingDirectory</key>
  <string>/path/to/Relay</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>pnpm</string>
    <string>start</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>REMARKABLE_WATCH_ENABLED</key>
    <string>1</string>
    <key>REMARKABLE_WATCH_INTERVAL_MS</key>
    <string>45000</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/path/to/Relay/.data/relay.out.log</string>
  <key>StandardErrorPath</key>
  <string>/path/to/Relay/.data/relay.err.log</string>
</dict>
</plist>
```

`pnpm start` is what enables the watcher (`next start` → `instrumentation.ts` → poll loop). Do not use a serverless host for this path. The webhook stays unset unless you opt in with a local URL.

## Acknowledgements

This project was informed by community reverse-engineering and tooling around reMarkable formats and sync behavior, especially:

- [splitbrain/ReMarkableAPI](https://github.com/splitbrain/ReMarkableAPI)
- [ddvk/rmapi](https://github.com/ddvk/rmapi)
- [hafaio/repub](https://github.com/hafaio/repub)
- [Scrybbling-together/rmscene](https://github.com/Scrybbling-together/rmscene)
- [Scrybbling-together/rmc](https://github.com/Scrybbling-together/rmc)
- [Scrybbling-together/remarks](https://github.com/Scrybbling-together/remarks)
- [knox-dawson/remarkable-shapes](https://github.com/knox-dawson/remarkable-shapes)
- [ricklupton/rmscene#52](https://github.com/ricklupton/rmscene/pull/52) for native image-blob block layout

The current `.rm` parser and renderer in this repo are first-party code, but these projects were useful references for understanding the format boundaries and validating behavior.
