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

## Development

Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

The dev server runs on [http://127.0.0.1:3001](http://127.0.0.1:3001).

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
