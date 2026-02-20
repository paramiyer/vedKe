# agent.md (Codex / Repo Agent Rules)

You are Codex working in this repo on a NEW BRANCH unless explicitly told otherwise.

## 0) Prime directive
- Prefer small, reversible commits.
- Keep changes scoped to the task, but ensure CI/tests can run.
- Never hardcode secrets. Use `.env.example` + documented env vars.

## 1) Context discipline (repo_map.md)
- Always consult `repo_map.md` first to locate modules and understand boundaries.
- If you add/remove a module, CLI command, or key behavior, update `repo_map.md` in the same PR.
- Prefer referencing file paths over long explanations.

## 2) Vedic ITX → Devanagari token pipeline (Checkpoint 1 scope)
### 2.1 Primary artifacts
- Input: `.itx` files (ITRANS-like with Vedic svara marks)
- Output: `tokens.json` per sukta/slug (Checkpoint 1)

### 2.2 tokens.json schema (Checkpoint 1)
Top-level:
- `slug: string`
- `tokens: Token[]`

Token (Checkpoint 1):
- `id: string` (deterministic)
- `lineId: string` (e.g., `L0001`)
- `deva: string` (Devanagari text for the token)
- `kind: "word" | "punct"`

Notes:
- Keep `kind` minimal in CP1. Metadata can be added later (e.g., source, checksum, line text, offsets).
- IDs must be stable across reruns given same input.

### 2.3 Tokenization & classification rules
- Danda punctuation MUST be `kind="punct"`:
  - `।` and `॥` are never `word`, even though they live in Devanagari blocks.
- ASCII digits must be `kind="punct"`.
- Consecutive digits must be merged into a single token (e.g., `10`, `11`).
- `kind="word"` applies only to tokens that are:
  - not danda
  - not digits
  - not starting with combining marks / Vedic marks

### 2.4 Allowed character policy (Checkpoint 1)
Allowed in `token.deva`:
- Devanagari block U+0900–U+097F
- Vedic extensions U+1CD0–U+1CFF (and required marks like U+0951/U+0952/U+1CF2 as needed)
- Danda punctuation `।` `॥`
- ASCII digits `0-9`

Forbidden characters (always fail validation):
- Any TeX/ASCII hazards: `\ { } ^ ~ \` '`

### 2.5 Validation gates (must exist and stay green)
Implement and maintain these CLI checks:
- `validate-tokens`: hard fail on schema/charset/kind violations
- `audit-charset`: report non-letter characters and unexpected chars

Validation MUST fail when:
- forbidden TeX/ASCII characters exist
- any disallowed character outside allowed policy exists
- token starts with a combining/Vedic mark
- danda token has kind != punct
- digit token has kind != punct
- adjacent digit tokens exist in the same line (number splitting)

Validation output MUST include:
- token id, lineId, offending deva, and Unicode codepoints.

### 2.6 CLI contract (services/itx_pipeline)
- `build-tokens --slug <slug> --itx <path> --out <dir>`
- `validate-tokens --tokens <tokens.json>`
- `audit-charset --tokens <tokens.json>`

## 3) Testing contract (pytest)
- Tests must be runnable locally via:
  - `python -m pytest`
- Add focused tests for:
  - danda classification
  - digit merge (e.g., `॥10॥`)
  - validation rejecting TeX/ASCII hazards
- Keep tests small and deterministic; no network, no external services.

## 4) Engineering hygiene
- If you add a new Python module, ensure imports are package-safe.
- Prefer `python -m <module>` entrypoints for CLIs.
- Keep validators pure and reusable: parse -> validate(payload) -> format(errors).

## 5) Working style
When implementing:
1) Locate relevant code via `repo_map.md`.
2) Make minimal patch.
3) Add/adjust tests.
4) Run `python -m pytest` locally (or ensure CI config does it).
5) Update `repo_map.md` if surface area changed.
6) Summarize changes + commands to run.
