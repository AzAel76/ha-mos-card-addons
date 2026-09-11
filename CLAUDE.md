# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

This is an npm-workspaces monorepo of independent Home Assistant Lovelace
card addons for the [ha-mos](https://github.com/anym001/ha-mos) NAS
integration and its companion [ha-mos-card](https://github.com/anym001/ha-mos-card).
Each addon lives under `packages/<name>/` as a fully standalone package
(own `package.json`, `dist/` build, README). There is currently one
package: `packages/mos-kind-title-card`.

**HACS constraint:** HACS reads `hacs.json` only from the repository
root, never from a subdirectory — so the root [hacs.json](hacs.json)
(kept in sync with `packages/mos-kind-title-card/hacs.json`) is what
actually makes this repo installable as a HACS custom repository. This
only works cleanly because there is one package; if a second addon ever
needs independent HACS distribution, it will need its own repository
rather than living here as another `packages/*` entry.

## Commands

Run from the repo root (workspaces install once for all packages):

```bash
npm install
```

Per-package commands, run with `--workspace=packages/<name>`, or `cd` into
the package directory and drop the flag:

```bash
npm run dev --workspace=packages/mos-kind-title-card    # vite build --watch
npm run build --workspace=packages/mos-kind-title-card  # one-shot production build -> dist/
npm run deploy --workspace=packages/mos-kind-title-card # build + scp to a HA instance over SSH
```

There is no test suite. Linting/formatting/type-checking run from the root
across all packages:

```bash
npm run lint          # eslint
npm run lint:fix
npm run lint:md        # markdownlint-cli2, all READMEs/CLAUDE.md
npm run format         # prettier --write
npm run format:check
npm run typecheck      # tsc --noEmit (currently hardcoded to mos-kind-title-card's tsconfig)
```

A Husky `pre-commit` hook runs `lint-staged` (Prettier/ESLint/markdownlint
on staged files only) and a `commit-msg` hook runs commitlint — commits
must follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `ci:`, `perf:`),
lowercase subject, ≤72-character header — see `.commitlintrc.json`. This
isn't just style: release-please (see Releasing below) derives version
bumps and changelog entries from these commit types.

`npm run dev`/`build` write a single self-contained JS module to `dist/`
(one file, everything including `lit` bundled in — see
`vite.config.ts`'s `inlineDynamicImports: true`). Home Assistant loads
cards as plain `<script type="module">` resources with no HMR into the HA
frontend itself, so after a build you must get the file onto the HA
instance and hard-refresh the browser (module scripts are cached
aggressively — a stale console version banner is the most common "why
isn't my change showing up" symptom). `npm run deploy` automates the scp
step via `scripts/deploy.sh`, configured with a package-local `.env` (see
that package's `.env.example`) for `HA_HOST` / `HA_CONFIG_PATH`.

## Architecture: mos-kind-title-card

A compact Lovelace title-bar card, one instance per virtualization "kind"
(`docker` | `compose` | `lxc` | `vm`) exposed by the ha-mos integration.
Built with Lit + TypeScript, bundled with Vite.

Source layout (`packages/mos-kind-title-card/src/`):

- `kinds.ts` — static per-kind facts: HA device registry `model_id`,
  display name/icon, the entity `translation_key` prefixes for its
  memory/CPU metrics, its MOS web-UI path segment, and (where they exist)
  its PR-114 summary sensors (running/total/updates counts, which live on
  the _server_ device, not per-guest). Note the `vm` kind's real mismatch
  between device `model_id: "virtual_machine"` and entity prefix `vm_` —
  confirmed against the integration's source, not assumed.
- `devices.ts` — device/entity registry discovery, architecture ported
  from the sibling `ha-mos-card` project: devices are matched by
  `model_id`, and the MOS "server" device is identified as the
  `via_device_id` parent of any kind-tagged device (the server itself
  carries no `model_id`). Registries are fetched and kept live over the
  raw websocket via `home-assistant-js-websocket`'s `createCollection`,
  which dedupes concurrent subscribers on the same cache key — every card
  instance on a dashboard shares one `config/device_registry/list` call.
  Metric entities resolve by `translation_key` first, falling back to a
  `unique_id` suffix, with no further guessing since a wrong match would
  silently sum/divide the wrong number.
- `unit.ts` — normalizes every data-size sensor to raw bytes before any
  arithmetic, since HA auto-converts each sensor's displayed unit (MiB vs
  GiB, or a user override to decimal MB/GB) independently; summing
  display-unit numbers directly would silently produce wrong percentages.
  Also owns the shared ≤4-character formatting rule for every
  gauge-adjacent number (magnitude-tiered fixed decimals, not literal
  significant figures — that broke for sub-1 values).
- `gauge.ts` — a hand-built radial percentage gauge (270° arc, icon
  centered), deliberately not HA's own `ha-gauge` (built for a much larger
  full gauge-card layout). Uses a fixed traffic-light color scale
  (green/yellow/orange/red at 25/50/75%) regardless of the card's icon
  color, since it's a health indicator, not a branding surface.
- `mos-kind-title-card.ts` — the card element itself: subscribes to the
  device/entity registries, resolves the current server+kind's entities
  into a `Resolved` struct (recomputed only when registries or config
  change, never on a bare `hass` state tick), and renders icon badge,
  title/subtitle, count column, and gauge(s) per the configured `layout`.
- `editor.ts` — the GUI card editor (`ha-form`-based), no entity pickers:
  once `server` + `kind` are chosen, every entity the card needs is
  discovered automatically, so device/container churn needs no
  reconfiguration.
- `types.ts` — `MosKindTitleCardConfig`, the full YAML/GUI config schema.

Full config option reference and rendered-output description live in
`packages/mos-kind-title-card/README.md` — read it before changing config
schema or visual behavior, since the two must stay in sync.

## Releasing

Releases are automated via [release-please](https://github.com/googleapis/release-please)
(`release-please-config.json` + `.release-please-manifest.json`, package
path `packages/mos-kind-title-card`) — there is no manual version bump or
tagging step. The flow:

1. Commit to `main` using Conventional Commits (see Commands above).
2. [.github/workflows/release-please.yml](.github/workflows/release-please.yml)'s
   `release-please` job opens/updates a "release PR" that accumulates
   `fix`/`feat`/etc. commits since the last release, computing the next
   version and generating `packages/mos-kind-title-card/CHANGELOG.md`
   entries from the commit log.
3. Merging that PR makes release-please bump `version` in `package.json`
   and `CARD_VERSION` in `mos-kind-title-card.ts` (via `extra-files`, a
   literal string replace — keep the version string unique in that file),
   create a `mos-kind-title-card-v*` tag, and publish the GitHub release.
4. The same workflow's `publish` job (`needs: release-please`, gated on
   `release_created`) then builds the package and attaches
   `dist/mos-kind-title-card.js` to that release — the asset name
   `hacs.json`'s `filename` field expects. This runs in the _same_
   workflow run rather than being triggered by the tag push, since a tag
   created via the default `GITHUB_TOKEN` doesn't cascade into triggering
   a separate workflow.

release-please only proposes a release once a commit on `main` uses a
recognized Conventional Commit type — it won't touch history that predates
adopting it.
