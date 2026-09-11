# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

This is an npm-workspaces monorepo of independent Home Assistant Lovelace
card addons for the [ha-mos](https://github.com/anym001/ha-mos) NAS
integration and its companion [ha-mos-card](https://github.com/anym001/ha-mos-card).
Each addon lives under `packages/<name>/` as a fully standalone package
(own `package.json`, `dist/` build, README, CHANGELOG). There are two
packages: `packages/mos-kind-title-card` and
`packages/mos-server-summary-card`. Each package duplicates rather than
shares its own copies of small cross-cutting utilities (`unit.ts`,
`gauge.ts`-equivalent) — deliberate, not an oversight: extracting a shared
internal package for this modest amount of logic is premature until a
third package needs the same code.

**HACS constraint (now a live limitation, not a hypothetical one):** HACS
reads `hacs.json` only from the repository root, never from a
subdirectory, and a HACS custom-repository add always maps to exactly one
installable item. The root [hacs.json](hacs.json) currently points at
`mos-kind-title-card`, so **only that package installs via HACS from this
repo**. `mos-server-summary-card` has its own `hacs.json` copy for
documentation/consistency, but it is not reachable through HACS from here
— it needs its own repository for that, or users install it manually
(copy the built JS, add the Lovelace resource, no auto-updates). This
wasn't solved when the second package was added; revisit if/when it's
ready to distribute.

**Cross-package custom element names:** both packages can be installed on
the same dashboard, and `customElements.define()` throws on a duplicate
tag name — there's no shared module between these fully-standalone
packages to dedupe a definition through. Any new custom element (a card,
or a small helper element like a gauge/sparkline) needs a name that's
unique across every package in this repo, not just within its own.

## Commands

Run from the repo root (workspaces install once for all packages):

```bash
npm install
```

Per-package commands, run with `--workspace=packages/<name>`, or `cd` into
the package directory and drop the flag:

```bash
npm run dev --workspace=packages/<name>    # vite build --watch
npm run build --workspace=packages/<name>  # one-shot production build -> dist/
npm run deploy --workspace=packages/<name> # build + scp to a HA instance over SSH
```

`npm run build --workspaces` builds every package at once (used by CI).

There is no test suite. Linting/formatting/type-checking run from the root
across all packages:

```bash
npm run lint          # eslint
npm run lint:fix
npm run lint:md        # markdownlint-cli2, all READMEs/CLAUDE.md
npm run format         # prettier --write
npm run format:check
npm run typecheck      # tsc --noEmit, once per package's own tsconfig
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

## Architecture: mos-server-summary-card

A per-server Lovelace summary card — one instance per MOS server device.
Deliberately shows no per-guest Docker/Compose/LXC/VM detail (that's
mos-kind-title-card's job) beyond a single aggregate corner badge for
updates/problems across all of them. Built with Lit + TypeScript, bundled
with Vite, same overall shape as mos-kind-title-card but for a different
device scope (one server device's own entities, plus its dynamic pool/disk
child devices, rather than one kind's sibling guest devices).

Source layout (`packages/mos-server-summary-card/src/`):

- `server-metrics.ts` — flat `MetricDef` constants (translation_key +
  unique_id-suffix key) for every server-level sensor/binary_sensor this
  card reads, confirmed against `ha-mos`'s actual source
  (`sensor/system.py`, `sensor/system_health.py`, `sensor/summary.py`,
  `binary_sensor/services.py`, `sensor/pools.py`, `binary_sensor/pools.py`,
  `binary_sensor/disks.py`) — not assumed. For most of these the
  `key` (what `unique_id` is built from) and `translation_key` are the same
  string, but **not for pool/disk entities**: e.g. `pool_usage`'s `key` is
  just `"usage"`. Getting a pair backwards silently breaks the unique_id
  fallback path in `findMetricEntity`.
- `devices.ts` — adapted from mos-kind-title-card's: `findServerDevices`'s
  known-model-id set is extended with `storage_pool` and `disk` (so a
  server with only pools/disks, no guests, still resolves), plus
  `selectPoolDevices`/`selectDiskDevices` (pools/disks are their own
  dynamic devices under the server, same `via_device_id` pattern as a
  guest) and a generalized `selectGuestDevices` across every guest kind at
  once, for the aggregate badge rather than per-kind detail.
  `findMetricEntity`'s unique_id-suffix fallback is broadened to also match
  `binary_sensor.*` entities, not just `sensor.*` — this card resolves
  several service/connectivity/problem binary sensors that mos-kind-title-card
  never needed to.
- `history.ts` — fetches CPU-load/memory-usage history via a raw
  `history/history_during_period` websocket call (confirmed against
  `home-assistant/frontend`'s own `src/data/history.ts` — `custom-card-helpers`'
  `HomeAssistant` type has no `callWS` helper), once per card instance on
  connect, then a `HistoryBuffer` extends the window locally from each live
  `hass.states` tick rather than re-polling on a timer.
- `sparkline.ts` — a hand-built inline SVG trend line (`<mos-sparkline>`),
  same "no charting library" philosophy as `gauge.ts`.
- `gauge.ts` — the same radial gauge as mos-kind-title-card's, but the
  custom element is named `mos-server-gauge`, not `mos-memory-gauge` — see
  the cross-package custom-element-name note above.
- `mos-server-summary-card.ts` — the card element: resolves the server
  device's own entities plus its pool/disk child devices and cross-kind
  guest problem/update state into a `Resolved` struct, renders the
  header/info-grid/metrics/pools/status-strip sections (each independently
  toggleable), and owns the two `HistoryBuffer` instances. Does **not**
  implement a fixed `getLayoutOptions()` grid size — this card's real
  height varies with which sections are enabled and how many pools are
  discovered, and asserting a static size that's usually-but-not-always
  correct is exactly the mos-kind-title-card overflow bug (see git history)
  repeating itself.
- `editor.ts` — the GUI card editor, same `ha-form`-based structure as
  mos-kind-title-card's.
- `types.ts` — `MosServerSummaryCardConfig`, the full YAML/GUI config
  schema.

Full config option reference and rendered-output description live in
`packages/mos-server-summary-card/README.md`.

## Releasing

Releases are automated per-package via [release-please](https://github.com/googleapis/release-please)
(`release-please-config.json` + `.release-please-manifest.json`, one entry
per package path) — there is no manual version bump or tagging step. Each
package releases independently; a commit touching only one package only
ever moves that package's release PR. The flow, per package:

1. Commit to `main` using Conventional Commits (see Commands above).
2. [.github/workflows/release-please.yml](.github/workflows/release-please.yml)'s
   `release-please` job opens/updates a "release PR" for that package,
   accumulating `fix`/`feat`/etc. commits since its last release, computing
   the next version and generating that package's `CHANGELOG.md` entries
   from the commit log.
3. Merging that PR makes release-please bump `version` in the package's
   `package.json` and `CARD_VERSION` in its main `.ts` file (via
   `extra-files`, a literal string replace — keep the version string unique
   in that file), create a `<package-name>-v*` tag, and publish the GitHub
   release.
4. The same workflow has one `publish-<package>` job per package
   (`needs: release-please`, each gated on that package's own
   `..._released` output) that then builds it and attaches
   `dist/<package-name>.js` to its release — the asset name that
   package's own `hacs.json` `filename` field expects. This runs in the
   _same_ workflow run rather than being triggered by the tag push, since a
   tag created via the default `GITHUB_TOKEN` doesn't cascade into
   triggering a separate workflow.

Adding a third package means adding an entry to both `release-please-config.json`
and `.release-please-manifest.json`, and a matching `publish-<package>` job
in `release-please.yml`.

release-please only proposes a release once a commit on `main` uses a
recognized Conventional Commit type — it won't touch history that predates
adopting it.
