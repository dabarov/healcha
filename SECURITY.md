# Security Policy

healcha handles sensitive personal data: health metrics, Google OAuth tokens, and LLM API keys. Security reports are taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting: go to the repository's **Security** tab → **Report a vulnerability** (or https://github.com/dabarov/healcha/security/advisories/new). You should get a response within a few days.

Please include steps to reproduce, the impact you see, and the version/commit you tested.

## Scope

Reports are especially welcome for:

- **Data leaving the machine** when it shouldn't — anything that sends health data somewhere other than the user-configured LLM provider or Google's Fitness API.
- **The text-to-SQL guard** (`src/lib/ai/textToSql.ts`) — any way LLM-generated SQL can mutate the database or escape the read-only constraints.
- **Token handling** (`src/lib/crypto.ts`, `src/lib/config.ts`) — OAuth refresh-token encryption at rest, key handling, `config.json` permissions.
- **The packaged app** — secrets or personal data accidentally bundled into release artifacts.

## Supported versions

Only the latest release and `main` receive fixes.

## Known, accepted trade-offs

These are documented behaviors, not vulnerabilities:

- Release binaries are unsigned/ad-hoc signed (no Apple Developer / Windows code-signing certificate); verify downloads come from this repository's Releases page.
- The local SQLite database is unencrypted at rest — it lives in the OS app-data directory and relies on OS user permissions, like most desktop apps.
