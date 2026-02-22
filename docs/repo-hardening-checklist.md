# Repo Hardening Checklist

This checklist contains GitHub repository settings that are not stored in source files.

## Branch Protection (`master`)

- Require a pull request before merging.
- Require at least 1 approval.
- Dismiss stale approvals when new commits are pushed.
- Require conversation resolution before merging.
- Require status checks to pass before merging.
- Required check: `Frontend tests (Vitest)`.
- Restrict who can push to `master` (maintainers only).
- Disable force pushes.
- Disable branch deletion.

Automation helper:

- Run `scripts/apply-branch-protection.sh DerSarco/httprequesttracer_matecode master` after repo visibility/plan allows branch protection API.

## Pull Request Safety

- Require linear history or squash merge policy (team preference).
- Enable auto-delete head branches after merge.
- Enforce CODEOWNERS review for protected paths.

## GitHub Actions Security

- Set default `GITHUB_TOKEN` permissions to read-only at repo level.
- Allow only trusted actions and reusable workflows.
- Restrict workflow creation/modification to maintainers.

## Supply Chain Security

- Enable Dependabot alerts.
- Enable Dependabot security updates.
- Enable secret scanning.
- Enable push protection for secrets.
- Enable code scanning (CodeQL) for default branch.

## Release Governance

- Publish releases only from `release/vX.Y.Z` branches.
- Keep version synchronized in `package.json`.
- Keep version synchronized in `src-tauri/Cargo.toml`.
- Keep version synchronized in `src-tauri/tauri.conf.json`.
- Verify release assets for both macOS architectures before publish.
