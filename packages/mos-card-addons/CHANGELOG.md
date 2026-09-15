# Changelog

All notable changes to `mos-card-addons` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to `mos-card-addons-v*` tags/releases in this repo
(see the [Releasing](../../CLAUDE.md#releasing) section).

Prior to 0.2.0, the three cards here shipped as independent packages
(`mos-kind-title-card`, `mos-server-summary-card`, `mos-detail-card`), each
with its own version and changelog — archived under
[docs/archive/](docs/archive/) for history.

## [0.3.0](https://github.com/AzAel76/ha-mos-card-addons/compare/mos-card-addons-v0.2.0...mos-card-addons-v0.3.0) (2026-09-15)


### ⚠ BREAKING CHANGES

* the HACS-managed Lovelace resource moves from mos-kind-title-card.js to mos-card-addons.js (also now covering the other two cards). Existing installs need the old per-card resources removed and the new combined one added — see README.md.

### Features

* **detail-card:** pool disk linkage, cascading picker, disk usage ([db5cac6](https://github.com/AzAel76/ha-mos-card-addons/commit/db5cac623a8a3a7d02d0a5fd83181d05d887b791))
* **kind-title-card:** regroup editor into collapsible sections ([d38bae4](https://github.com/AzAel76/ha-mos-card-addons/commit/d38bae420ec7233536faca542a6f2183ff65a683))
* unify the three cards into one mos-card-addons package ([dd01fcf](https://github.com/AzAel76/ha-mos-card-addons/commit/dd01fcfc88870dc8dfdcaddb0bb88f9dbc6bc00a))

## [Unreleased]

### Added

- `mos-detail-card`: the pool kind now shows the actual disks backing it —
  parity (where present) and member disks — resolved from `ha-mos`
  v0.3.2's pool/disk linkage (closes
  [anym001/ha-mos#117](https://github.com/anym001/ha-mos/issues/117)).
  Pools get a new dedicated layout (gauge + title + state header, then the
  disk groups) replacing the generic identity/stats/status sections used
  by every other kind; `show_pool_disks` gates the whole thing, and three
  independent options control how each disk shows: `pool_disk_layout`
  (`rows`/`grid`), `pool_disk_value_style` (`gauge`/`bar`/`text`), and
  `pool_disk_attributes` (any of model/type/size/power status/SMART
  warning/temperature, picked individually rather than as a fixed tier).
  Each disk's icon reflects its own `disk_type` (NVMe/SSD/USB/...). The
  value shown is each disk's usage percentage where available, falling
  back to temperature on an older `ha-mos` (see below).

- `mos-detail-card`: the disk kind now shows a usage gauge + labeled
  history sparkline and used/total space, alongside its existing
  temperature/power status, using `ha-mos` v0.3.3's new per-disk
  `disk_usage`/space sensors (closes
  [anym001/ha-mos#119](https://github.com/anym001/ha-mos/issues/119)).
  The pool disk list's value (`pool_disk_value_style`) now shows this same
  usage percentage instead of temperature, falling back to temperature on
  an older `ha-mos` that doesn't report it yet; `temperature` is also now
  its own independently-toggleable `pool_disk_attributes` option
  regardless of which value style is picked.

- `mos-detail-card`'s GUI editor: device selection is now a server → kind
  → device cascade instead of one flat device picker across every server —
  `kind` was always meant as a rare auto-detection override, never the
  primary way to find a specific device (its own doc comment already said
  so); that override now lives in a separate "Advanced" section, untouched
  by the cascade. Every editor across all three cards is also now grouped
  into collapsible sections (mirroring `mos-server-summary-card`'s editor,
  already structured this way), with kind-irrelevant sections no longer
  shown at all rather than present-but-no-op.

### Changed

- Unified the three previously-independent packages into this one package,
  distributed as a single combined bundle (`dist/mos-card-addons.js`) — the
  only way to make all three cards installable via HACS from one
  repository, since HACS's `plugin` category reads exactly one
  `hacs.json`/asset per repository. Every card's own config schema, YAML,
  and rendered behavior is unchanged; only the distribution and internal
  source layout changed. See [docs/](docs/) for each card's usage
  reference (moved from each former package's own README).
- `mos-kind-title-card`'s GUI editor regrouped into collapsible
  "Appearance" / "Widgets" / "Interactions" sections, matching the pattern
  already used by the other two cards' editors.

### Fixed

- `mos-detail-card`'s pool kind: the usage sparkline could leave a bare,
  empty-looking gap above the disk listing while there wasn't yet enough
  history to draw a line. Fixed at the source, for every kind, not just
  pool: a sparkline now renders as fully absent (not a reserved-but-empty
  box) whenever there are fewer than 2 history points.
