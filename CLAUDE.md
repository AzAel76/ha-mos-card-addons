# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository structure

This repo builds three Home Assistant Lovelace cards for the
[ha-mos](https://github.com/anym001/ha-mos) NAS integration and its
companion [ha-mos-card](https://github.com/anym001/ha-mos-card), all
distributed together as **one** HACS plugin from a single package,
`packages/mos-card-addons`. There is only one npm workspace member; the
`workspaces` field in the root `package.json` is a holdover from before
this merge (see History below) and there is no present plan to add a
second package.

Source layout (`packages/mos-card-addons/src/`):

- `index.ts` — the single Vite entry point: side-effect-imports each
  card's main module, which registers its custom element (and, on first
  `getConfigElement()` call, lazy-loads its editor via a dynamic import —
  inlined into the one output file by `vite.config.ts`'s
  `inlineDynamicImports: true`, since Home Assistant loads the built file
  as a single `<script type="module">` resource with no code-splitting).
- `kind-title-card/`, `server-summary-card/`, `detail-card/` — one
  subfolder per card, each still a fairly self-contained unit (its own
  `mos-*-card.ts`, `editor.ts`, `types.ts`, `devices.ts`, `gauge.ts`,
  `sparkline.ts`, and so on) — see the three Architecture sections below.
- `shared/` — code genuinely identical (or a strict superset) across two
  or more cards, factored out during the merge: `unit.ts`, `devices.ts`
  (registry discovery + the `findMetricEntityIn` core matcher — each
  card's own `devices.ts` is now a thin facade re-exporting from here plus
  that card's own fixed unique_id-domain fallback, so every other file in
  each card still imports from its own local `./devices` unchanged),
  `gauge.ts` (an undecorated `MosGaugeBase` — each card's own `gauge.ts`
  subclasses it under that card's own existing `@customElement` tag, so
  tag names/CSS selectors didn't change), `sparkline.ts` (same pattern,
  `MosSparklineBase`), `history.ts`. A function only moves here once
  audited to confirm it's actually the same across its callers — a few
  things that look similar but aren't (e.g. each card's own
  `findMetricEntity` unique_id-suffix domain fallback: `sensor` only for
  the title card, `+ binary_sensor` for the summary card, `+ switch` for
  the detail card) deliberately stay as each card's own explicit fixed
  argument to a shared core function, not silently unified.
- `mos-server-summary-card`/`mos-detail-card`'s device-discovery code
  still says "adapted from mos-kind-title-card's" in places below — that's
  the actual origin story (ported when each was added as a second/third
  package), kept for context even though it's no longer a cross-_package_
  relationship now that they're one.

### History: from three packages to one

Through mid-September 2026 this repo was an npm-workspaces monorepo of
three fully independent packages (`mos-kind-title-card`,
`mos-server-summary-card`, `mos-detail-card`), each with its own
`package.json`/`dist/`/README/CHANGELOG/`hacs.json`. That structure hit a
hard HACS limitation: HACS's `plugin` category reads `hacs.json` only from
a repository's root and installs exactly one JS asset per repository — so
only the package the root `hacs.json` pointed at (`mos-kind-title-card`)
was ever actually installable via HACS from this repo; the other two were
manual-install-only. Splitting into three repositories was considered and
rejected — the cards are too interlinked (shared `[[token]]` placeholder
conventions between them, cross-referencing config examples, features that
routinely span two cards in one change) for the coordination cost to be
worth it. Bundling three still-separate packages into one build-time
combined asset was the cheaper option, but merging into one real package
was chosen instead as the more permanent fix, since it also let the
several near-duplicate utility files (see `shared/` above) finally be
reconciled instead of hand-copied. Each card's former standalone README
became `packages/mos-card-addons/docs/<card>.md`; each former CHANGELOG.md
is archived under `packages/mos-card-addons/docs/archive/` for history.

## Custom element names

`customElements.define()` throws on a duplicate tag name, so every custom
element registered anywhere in `src/` (a card, or a small helper element
like a gauge/sparkline) needs a name unique across the whole package.
Current names: `mos-kind-title-card`/`mos-memory-gauge`,
`mos-server-summary-card`/`mos-server-gauge`/`mos-sparkline`,
`mos-detail-card`/`mos-detail-gauge`/`mos-detail-sparkline`. This used to
be documented as a _cross-package_ constraint (three separate bundles that
could all end up on one dashboard); it's a plain intra-package constraint
now, kept for the same reason — nothing here dedupes a `customElements`
registration for you.

## Commands

```bash
npm install
```

```bash
npm run dev --workspace=packages/mos-card-addons    # vite build --watch
npm run build --workspace=packages/mos-card-addons  # one-shot production build -> dist/mos-card-addons.js
npm run deploy --workspace=packages/mos-card-addons # build + scp to a HA instance over SSH
```

(`npm run build --workspaces` also works and is what CI uses — equivalent
today since there's only the one workspace member.)

There is no test suite. Linting/formatting/type-checking run from the root:

```bash
npm run lint          # eslint
npm run lint:fix
npm run lint:md        # markdownlint-cli2, all READMEs/CLAUDE.md
npm run format         # prettier --write
npm run format:check
npm run typecheck      # tsc --noEmit -p packages/mos-card-addons/tsconfig.json
```

A Husky `pre-commit` hook runs `lint-staged` (Prettier/ESLint/markdownlint
on staged files only) and a `commit-msg` hook runs commitlint — commits
must follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`, `ci:`, `perf:`),
lowercase subject, ≤72-character header, and an optional scope naming
which card the commit touches (`kind-title-card`, `server-summary-card`,
`detail-card`, `shared`, or `release` — see `.commitlintrc.json`'s
`scope-enum`). Scoping isn't required, but doing so is what makes
release-please's generated changelog entries read as
"**detail-card:** fix ..." instead of an undifferentiated flat list, since
this whole package now releases under one version number (see Releasing
below).

`npm run dev`/`build` write a single self-contained JS module to
`dist/mos-card-addons.js` (one file, everything — `lit`, all three cards,
all three editors — bundled in; see `vite.config.ts`'s
`inlineDynamicImports: true`). Home Assistant loads it as a plain
`<script type="module">` resource with no HMR into the HA frontend itself,
so after a build you must get the file onto the HA instance and
hard-refresh the browser (module scripts are cached aggressively — a stale
console version banner is the most common "why isn't my change showing up"
symptom). `npm run deploy` automates the scp step via `scripts/deploy.sh`,
configured with a package-local `.env` (see `.env.example`) for `HA_HOST`
/ `HA_CONFIG_PATH`; the root `scripts/deploy-all.sh` (`npm run deploy` from
the repo root) does the same thing via one shared root `.env`.

## Architecture: mos-kind-title-card

A compact Lovelace title-bar card, one instance per virtualization "kind"
(`docker` | `compose` | `lxc` | `vm`) exposed by the ha-mos integration.
Built with Lit + TypeScript, bundled with Vite.

Source layout (`packages/mos-card-addons/src/kind-title-card/`):

- `kinds.ts` — static per-kind facts: HA device registry `model_id`,
  display name/icon, the entity `translation_key` prefixes for its
  memory/CPU metrics, its MOS web-UI path segment, and (where they exist)
  its PR-114 summary sensors (running/total/updates counts, which live on
  the _server_ device, not per-guest). Note the `vm` kind's real mismatch
  between device `model_id: "virtual_machine"` and entity prefix `vm_` —
  confirmed against the integration's source, not assumed. `MetricDef`
  itself now comes from `../shared/devices`, not defined here.
- `devices.ts` — a thin facade over `../shared/devices` (see Repository
  structure above): adds this card's own `SERVER_MEMORY_TOTAL` constant,
  its `findMetricEntity` wrapper (unique_id-suffix fallback matches
  `sensor.*` only), and `selectGuestDevices` (this card's kind-specific
  wrapper around shared's `selectGuestDevicesOfKind`). Registries are
  fetched and kept live over the raw websocket via
  `home-assistant-js-websocket`'s `createCollection`, which dedupes
  concurrent subscribers on the same cache key — every MOS card on a
  dashboard, of any of the three kinds, shares one
  `config/device_registry/list` call. Metric entities resolve by
  `translation_key` first, falling back to a `unique_id` suffix, with no
  further guessing since a wrong match would silently sum/divide the
  wrong number.
- `gauge.ts` — a ~10-line subclass of `../shared/gauge.ts`'s
  `MosGaugeBase`, registered under this card's own tag `mos-memory-gauge`.
  The actual radial-gauge implementation (270° arc, icon centered,
  deliberately not HA's own `ha-gauge` — built for a much larger full
  gauge-card layout) and its fixed traffic-light color scale
  (green/yellow/orange/red at 25/50/75%, regardless of the card's icon
  color, since it's a health indicator not a branding surface) live in
  `shared/gauge.ts`.
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
[docs/kind-title-card.md](packages/mos-card-addons/docs/kind-title-card.md) —
read it before changing config schema or visual behavior, since the two
must stay in sync.

## Architecture: mos-server-summary-card

A per-server Lovelace summary card — one instance per MOS server device.
Deliberately shows no per-guest Docker/Compose/LXC/VM detail (that's
mos-kind-title-card's job) beyond a single aggregate guest-status section
for updates/problems across all of them. Built with Lit + TypeScript, bundled
with Vite, same overall shape as mos-kind-title-card but for a different
device scope (one server device's own entities, plus its dynamic pool/disk
child devices, rather than one kind's sibling guest devices).

Source layout (`packages/mos-card-addons/src/server-summary-card/`):

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
- `devices.ts` — a thin facade over `../shared/devices` (originally
  "adapted from mos-kind-title-card's" when this was a second package;
  now genuinely the same underlying implementation): adds this card's own
  `findMetricEntity` wrapper (unique_id-suffix fallback matches
  `sensor.*` + `binary_sensor.*` — this card resolves several
  service/connectivity/problem binary sensors that mos-kind-title-card
  never needed to) and re-exports `selectPoolDevices`/`selectDiskDevices`/
  `poolDisplayName` from shared (pools/disks are their own dynamic devices
  under the server, same `via_device_id` pattern as a guest).
- `history.ts` / `sparkline.ts` / `gauge.ts` — thin facades over their
  `shared/` equivalents (see Repository structure above); `sparkline.ts`
  registers this card's own `mos-sparkline` tag, `gauge.ts` registers
  `mos-server-gauge`.
- `gesture.ts` — `GestureTracker` (per-element tap/hold/double-tap timer
  state, one instance per pool + one for CPU temp + one for the whole
  card, so a sub-element's gesture doesn't reset mid-flight on an
  unrelated re-render) and two helpers ported from the sibling
  `ha-mos-card` project's own action-handling code (`rows.ts`/`mos-card.ts`),
  since this card's shared-per-element-type action fields
  (`pool_tap_action` etc.) need the same placeholder mechanism:
  `fillPlaceholders` substitutes `[[key]]` tokens (deliberately not
  `{{ }}`, which reads as Jinja) recursively through an action config, and
  `moreInfoEntity` lifts a `more-info` action's `entity` out to the
  top-level config object `handleAction` actually reads it from — a
  `more-info` action's own `entity` field is otherwise silently ignored
  regardless of whether its placeholder was substituted correctly, which
  is exactly what broke this the first time it was implemented.
- `mos-server-summary-card.ts` — the card element: resolves the server
  device's own entities plus its pool/disk child devices and cross-kind
  guest problem/update state into a `Resolved` struct, renders the
  header/info/metrics/pools-temp/guest-status/services sections (each
  independently toggleable and, below the header, reorderable via
  `section_order`), and owns the two `HistoryBuffer` instances. Does
  **not** implement a fixed `getLayoutOptions()` grid size — this card's
  real height varies with which sections are enabled, their order, and how
  many pools are discovered, and asserting a static size that's
  usually-but-not-always correct is exactly the mos-kind-title-card
  overflow bug (see git history) repeating itself.
- `editor.ts` — the GUI card editor: same `ha-form`-based structure as
  mos-kind-title-card's, but with ~30 fields grouped into `expandable`
  schema sections (`flatten: true`, so the underlying config stays flat)
  to stay usable, combined with the same conditional-field-inclusion
  technique for sub-options that only matter once their toggle is on.
  `section_order` is deliberately **not** a schema field — YAML-only, see
  the docs page.
- `types.ts` — `MosServerSummaryCardConfig`, the full YAML/GUI config
  schema.

Full config option reference and rendered-output description live in
[docs/server-summary-card.md](packages/mos-card-addons/docs/server-summary-card.md).

## Architecture: mos-detail-card

A single-device Lovelace detail card — one instance per Docker/Compose/LXC/
VM guest, storage pool, physical disk device, or the MOS server itself.
Unlike the other two cards, this one is handed one already-known
`device_id` directly (typically a `[[device_id]]`/`[[pool_device_id]]`/
`[[server_device_id]]` placeholder substituted by whichever `ha-mos-card`
row or `mos-server-summary-card` pill opened it via a
`fire-dom-event`/popup-card `tap_action`), auto-detects the device's kind
from its `model_id` (or, for the server device — which carries no
`model_id` of its own — structurally, via `isServerDevice`), and renders
identity/stats/history/status/power-toggle sections generically off that
kind's own structural capabilities — no per-kind branching scattered
through the render methods.

Source layout (`packages/mos-card-addons/src/detail-card/`):

- `detail-kinds.ts` — the `DetailKindDef` registry, one entry per
  `model_id` (`docker_container`, `compose_stack`, `lxc_container`,
  `virtual_machine`, `storage_pool`, `disk`) plus a `server` entry
  (structural, no `model_id`), confirmed against `ha-mos`'s actual source
  (`sensor/{docker,compose,lxc,vm,disks,system_health,hardware}.py`,
  `binary_sensor/{docker,compose,lxc,vm}.py`,
  `switch/{docker,compose,lxc,vm}.py`, `sensor/pools.py`,
  `binary_sensor/pools.py`) — each entry has only the `MetricDef` fields
  that kind actually has (e.g. no `powerMetric` on a pool); a
  structurally-absent field is how a section gets skipped, not a runtime
  flag, the same discipline `mos-kind-title-card`'s `kinds.ts` established.
  Pool/disk entities repeat the key-vs-translation_key prefix-stripping
  pattern already documented in `mos-server-summary-card`'s
  `server-metrics.ts`.
- `devices.ts` — a thin facade over `../shared/devices`: no `via_device_id`
  server-then-children traversal for guest/pool/disk lookup, since config
  hands this card one specific device directly — `findDeviceById` is the
  normal path, `findDeviceByEntityId` a fallback for the rare case only an
  entity_id is available, both defined locally (not shared — no other
  card needs direct-by-id lookup). `isServerDevice` (also local) is how
  the server device is recognized, structurally, as the `via_device_id`
  parent of at least one guest/pool/disk device. Re-exports
  `selectDiskDevices`/`poolDisplayName`/`diskDisplayName` from shared (the
  server kind's temperature view is this card's one need to enumerate a
  device's _children_ rather than working from an already-known
  `device_id`). This card's own `findMetricEntity` wrapper's unique_id-
  suffix fallback matches `sensor.*` + `binary_sensor.*` + `switch.*` —
  its power toggle is the only need for a `switch` entity in this
  package.
- `gauge.ts`/`sparkline.ts`/`history.ts` — thin facades over their
  `shared/` equivalents, registering this card's own `mos-detail-gauge`/
  `mos-detail-sparkline` tags, parameterized on whichever entity the
  resolved `DetailKindDef` says carries that data for this device rather
  than hardcoded server entities. Deliberately **never plots memory usage
  as history**: memory is a raw byte value with no fixed scale, and
  `history/history_during_period` is called with `no_attributes: true`
  (see `shared/history.ts`'s own comment), so there's no reliable
  per-point unit to normalize an older sample against — only CPU load and
  pool usage (already fixed 0-100% scales) are ever plotted.
- `gesture.ts` — just `GestureTracker` for the whole-card actions and the
  power toggle; no placeholder-substitution machinery here (unlike
  `mos-server-summary-card`'s `gesture.ts`), since resolving
  `[[device_id]]` etc. is the _calling_ card's job — this card only ever
  sees a plain, already-resolved `device_id` string.
- `mos-detail-card.ts` — the card element: resolves the configured device +
  its `DetailKindDef` + entities into a `Resolved` struct (including, for
  guest kinds, a walk up the device's own `via_device_id` to the parent
  server's `memory_installed` entity, so per-guest memory_usage — raw
  bytes — can render as a host-relative percentage gauge the same way
  `mos-kind-title-card` does; and for the server kind, every temperature
  reading available — CPU Main/Average/Max, each disk's own temperature
  via `selectDiskDevices`, and any generic hardware-sensor reading found
  by its shared `hardware_temperature` `translation_key` — grouped
  **CPU → System → Disk** via `_groupServerReadings`), renders each
  independently toggleable section, and owns the power toggle
  (`hass.callService("switch", "turn_on"/"turn_off", ...)`, not a blind
  `toggle` — always reflects the entity's actual current state rather
  than an assumption). The server kind's hardware-sensor readings
  (`show_hardware_sensors` config toggle, default `true`) can duplicate
  CPU/disk readings with no reliable way to detect it — confirmed the raw
  MOS `/sensors` API carries no field linking a reading back to a specific
  disk or "this is the CPU" — so the toggle is the user-facing way to hide
  that group entirely on a server where it turns out to be pure
  duplication, not something this card tries to deduplicate automatically.
- `editor.ts` — GUI editor; `device_id` uses HA's native
  `selector: { device: { filter: { integration: "mos" } } }`, a direct
  device picker scoped to `ha-mos` devices — appropriate here since (unlike
  the other two cards) this card names one specific already-known device
  rather than discovering children of a chosen server.
- `types.ts` — `MosDetailCardConfig`.

Full config option reference, the exact popup-replacement worked example,
and the "design standalone, then embed" workflow note for popup-card
configs live in
[docs/detail-card.md](packages/mos-card-addons/docs/detail-card.md).

## Releasing

Releases are automated via [release-please](https://github.com/googleapis/release-please)
(`release-please-config.json` + `.release-please-manifest.json`, one entry
for `packages/mos-card-addons`) — there is no manual version bump or
tagging step, and (since the 2026-09 merge into one package) one version
number covers all three cards. The flow:

1. Commit to `main` using Conventional Commits (see Commands above),
   optionally scoped to the card touched.
2. [.github/workflows/release-please.yml](.github/workflows/release-please.yml)'s
   `release-please` job opens/updates a release PR, accumulating
   `fix`/`feat`/etc. commits since the last release, computing the next
   version and generating `CHANGELOG.md` entries from the commit log (a
   commit's scope, if present, renders as a `**scope:** message` prefix
   per line — the way per-card attribution shows up in the changelog now
   that there's only one version).
3. Merging that PR makes release-please bump `version` in `package.json`
   and `CARD_VERSION` in **all three** cards' main `.ts` files (via
   `extra-files` — they're kept in lockstep, all three always show the
   same version number even though there are three separate `console.info`
   banners), create a `mos-card-addons-v*` tag, and publish the GitHub
   release. Each `CARD_VERSION` line needs a trailing
   `// x-release-please-version` comment for this to work —
   release-please's generic `extra-files` updater does **not** search a
   file for a bare version string; without that exact annotation on the
   line, it silently leaves the file untouched (confirmed against
   release-please's own source, `src/updaters/generic.ts`, after this went
   unnoticed in a real release PR that updated `package.json` but not a
   `.ts` file). Any new `CARD_VERSION`-style constant needs the same
   annotation.
4. The same workflow has one `publish` job (`needs: release-please`, gated
   on its `released` output) that then builds the package and attaches
   `dist/mos-card-addons.js` to the release — the asset name
   `hacs.json`'s `filename` field expects. This runs in the _same_
   workflow run rather than being triggered by the tag push, since a tag
   created via the default `GITHUB_TOKEN` doesn't cascade into triggering
   a separate workflow.

release-please only proposes a release once a commit on `main` uses a
recognized Conventional Commit type — it won't touch history that predates
adopting it.
