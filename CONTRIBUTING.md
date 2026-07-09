# Contributing to healcha

Thanks for your interest! healcha is a small, local-first project — contributions of all sizes are welcome, from typo fixes to new data sources.

## Getting set up

You need Node 20+ (and the [Rust toolchain + Tauri prerequisites](https://tauri.app/start/prerequisites/) only if you touch the desktop shell).

```bash
git clone https://github.com/dabarov/healcha.git
cd healcha
npm install
npm run dev        # web app at http://localhost:3000
```

No API keys or Fitbit account are required: pick **"Explore with demo data"** on first run to seed 60 days of synthetic history. Database migrations run automatically on boot.

For the desktop shell: `npm run app` (dev) or `npm run app:build` (release bundle).

## Before you open a PR

Run the same checks CI will run:

```bash
npm run typecheck
npm test
npm run build
```

Add or update tests when you change behavior — especially anything under `src/lib/` (the SQL guard, crypto, sync, and scoring logic). Tests live next to the code as `*.test.ts` and run with Vitest (`npm run test:watch` while developing).

## Guidelines

- **Keep the local-first promise.** No feature may ship health data to a third party beyond the user-configured LLM provider, and Ollama (fully local) must keep working.
- **One ingestion path.** New data sources go through the sync pipeline (`src/lib/sync/`), not ad-hoc fetches from components.
- Match the existing code style; the UI follows [DESIGN.md](DESIGN.md).
- Small, focused PRs are easier to review than big ones. Open an issue first for anything substantial so we can agree on the approach.

## Reporting bugs

Open a GitHub issue with steps to reproduce, what you expected, and what happened. For anything security-sensitive, see [SECURITY.md](SECURITY.md) instead — please don't open a public issue.
