# Contributing

Thanks for contributing to HTTP Request Tracer.

## Ground Rules

- Keep changes focused and scoped.
- Use feature branches; do not commit directly to `master`.
- Open PRs with clear validation notes.
- Follow least privilege and local-first security constraints.

## Development Setup

```bash
npm install
npm run tauri dev
```

Prerequisites:

- macOS
- Node.js `20.19+` or `22.12+`
- Rust toolchain
- `adb` in `PATH`

## Branching

- Feature/fix branches: `codex/<short-description>`
- Release branches: `release/vX.Y.Z`

## Before Opening a PR

Run:

```bash
npm run build
npm test
```

If tests are intentionally skipped, explain why in the PR.

## PR Requirements

- Use the PR template.
- Keep commits meaningful and atomic.
- Include screenshots for UI changes.
- Mention release impact when relevant.

## Security Requirements for Code Changes

- Do not add secrets, credentials, or tokens to code/logs.
- Do not introduce arbitrary shell execution from UI input.
- Keep ADB command usage constrained to explicit allowlisted flows.
- Preserve cleanup behavior for emulator proxy changes.
- Preserve masking/redaction behavior for sensitive values.

## Dependency and License Hygiene

- Keep dependencies up to date.
- Ensure new dependencies are compatible with project license posture.
- Update `THIRD_PARTY_NOTICES.md` when direct dependencies change.

## Reporting Security Issues

Use the private process in `SECURITY.md`, not public issues.
