# Contributing to Gene Personal Assistant

Thanks for your interest — this project exists to prove that a private, on-device AI assistant is
possible, and contributions of any kind help.

## Ways to contribute

- **Bug reports** — use the bug report template, include device/OS/model details.
- **Feature proposals** — open a discussion or a feature request; keep proposals scoped.
- **Code** — see the workflow below.
- **Docs** — README, ARCHITECTURE, and comments; clarity matters more than volume here.
- **Security research** — see `SECURITY.md` (do NOT open public issues for vulnerabilities).

## Development workflow

```sh
git clone https://github.com/AkhtarXx/gene.git
cd gene
npm install
npx expo run:android   # or run:ios
```

### Quality gates (all three must pass before a PR is merged)

```sh
npm run lint        # ESLint + Prettier (flat config)
npm run typecheck   # tsc --noEmit
npm test            # node:test unit tests
```

### Conventions

- TypeScript strict mode; every tool is a typed `ToolDefinition` in `src/services/tools/`.
- **Safety rules are non-negotiable**: the model never touches an OS API directly, side effects
  stay behind the Security Gate, and untrusted content is tainted. New tools default to
  `deny-by-default` registration.
- New services follow the existing pattern: singleton in `src/services/index.ts`, typed interface,
  exposed to React via `ServicesContext`.
- Tests: add a case to `tests/` whenever you change agent/gate/tool behavior. The test runner
  loads real TypeScript sources with faked native adapters.
- Formatting: Prettier config is in `.prettierrc`; run `npm run format` before pushing.

### Pull requests

1. Fork and branch from `main` (`git checkout -b fix/thing`).
2. Make focused changes; keep PRs small and reviewable.
3. Update tests and docs where behavior changes.
4. Run all three quality gates.
5. Open a PR with a clear description of the change and its motivation.

PRs are squash-merged; commit messages follow conventional commit prefixes
(`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).

## Code of conduct

All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
