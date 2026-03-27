# Relay

Relay is a Next.js app for sending content to reMarkable and exploring pulled reMarkable documents locally.

Current capabilities:
- connect a reMarkable account with the browser pairing code flow
- send Markdown, HTML, text, URLs, and PDFs to reMarkable
- sync a local skeleton of folders and documents from reMarkable cloud
- inspect document metadata, tags, and page-level details
- preview pulled `.rm` notebook pages with a first-party v6 parser
- download original PDF and EPUB assets when available

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
pnpm build
```

## Acknowledgements

This project was informed by community reverse-engineering and tooling around reMarkable formats and sync behavior, especially:

- [splitbrain/ReMarkableAPI](https://github.com/splitbrain/ReMarkableAPI)
- [ddvk/rmapi](https://github.com/ddvk/rmapi)
- [hafaio/repub](https://github.com/hafaio/repub)
- [Scrybbling-together/rmscene](https://github.com/Scrybbling-together/rmscene)
- [Scrybbling-together/rmc](https://github.com/Scrybbling-together/rmc)
- [Scrybbling-together/remarks](https://github.com/Scrybbling-together/remarks)

The current `.rm` parser and renderer in this repo are first-party code, but these projects were useful references for understanding the format boundaries and validating behavior.
