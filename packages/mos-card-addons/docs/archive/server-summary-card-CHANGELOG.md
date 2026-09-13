# Changelog

All notable changes to `mos-server-summary-card` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to `mos-server-summary-card-v*` tags/releases in this repo
(see the [Releasing](../../CLAUDE.md#releasing) section).

## [0.1.1](https://github.com/AzAel76/ha-mos-card-addons/compare/mos-server-summary-card-v0.1.0...mos-server-summary-card-v0.1.1) (2026-09-11)


### Features

* add mos-server-summary-card package ([d6720df](https://github.com/AzAel76/ha-mos-card-addons/commit/d6720df31ad4538648a6942ab63e7c03fbd65a13))
* refine mos-server-summary-card after first round of testing ([e0490e4](https://github.com/AzAel76/ha-mos-card-addons/commit/e0490e4ca1075b456b651fb0b303a441ffbdf713))


### Bug Fixes

* annotate CARD_VERSION so release-please actually bumps it ([cba9da5](https://github.com/AzAel76/ha-mos-card-addons/commit/cba9da5117d1698ecb780cfe4d844de45184f53f))
* correct sparkline distortion, memory bug, and broken tap actions ([8dfeb43](https://github.com/AzAel76/ha-mos-card-addons/commit/8dfeb4352c37fb8e7bb9eb1742fe6efbcecc1c13))
* strip renamed prefixes from pool display names ([f6360d5](https://github.com/AzAel76/ha-mos-card-addons/commit/f6360d5647a3f1855ee731721780197f5312cb48))

## [Unreleased]

### Added

- Initial version: a per-server Lovelace summary card for the
  [ha-mos](https://github.com/anym001/ha-mos) integration — header
  image/hostname/boot time, a compact identity/version grid with a MOS
  update indicator, CPU load and memory usage gauges with history
  sparklines, storage pool usage, CPU temperature, and a network/service/
  disk-health status section.
- Resizable header image (`image_size`), an uptime display mode alongside
  the existing relative boot time (`uptime_style`), editable per-pool
  labels (`pool_labels`), and optional value/time reference scales on the
  history sparklines.
- The guest updates/problems indicator moved from header corner badges
  into its own section, selectable as icon badges, a static text line, or
  an auto-scrolling ticker (`guest_status_style`).
- The network/service/disk-health status section gained two more
  descriptive layouts — labeled chips and detailed rows — alongside the
  original compact icons (`services_style`).
- Independently configurable tap/hold/double-tap actions for storage pool
  pills and the CPU temperature stat, supporting `[[token]]` placeholder
  substitution (e.g. `[[pool_name]]`) so one shared action can still
  reference the specific element it was fired from.
- Reorderable section display order (`section_order`, YAML-only — see
  Changed below).
- Three more basic-info layouts alongside the original icon grid: a chip
  row, a dense label:value list, and a single wrapping line
  (`info_layout`).
- The GUI editor is now grouped into expandable, conditionally-populated
  sections to stay usable as the option count grew.

### Fixed

- Sparkline value/time scale labels rendered visibly distorted (squashed
  glyphs) — the SVG's `preserveAspectRatio="none"` non-uniformly scales
  everything inside it, text included; labels now render as plain HTML
  overlays outside the SVG instead. The value scale now sits on the right
  edge.
- "Memory Installed" showed e.g. "16.0B" instead of "16.0 GiB" — the raw
  display-unit state number was being treated as bytes instead of being
  normalized via `stateToBytes`.
- Storage pool / CPU temperature tap actions did nothing: the placeholder
  syntax is now `[[key]]` (matching the sibling `ha-mos-card` project's own
  convention, and deliberately not `{{ }}`, which reads as Jinja), and a
  `more-info` action's `entity` is now correctly lifted to the top-level
  config `handleAction` actually reads it from.
- Pool pill labels showed a doubled "Pool" (e.g. "MOSBEE Pool Data Pool
  Usage") when a pool device's friendly name carried a prefix ha-mos never
  added (e.g. the server's own name, prepended by hand or by Home
  Assistant's own device naming) — the auto-detected name now strips
  through the *last* "Pool " rather than requiring it as a strict prefix,
  so `pool_labels` is no longer needed just to clean this up (it's still
  there for a genuine rename).

### Changed

- `section_order` is no longer a GUI editor field (the reorderable
  multi-select was unintuitive) — it's fully supported YAML/code-editor
  only.
