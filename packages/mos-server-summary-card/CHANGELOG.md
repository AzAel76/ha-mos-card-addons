# Changelog

All notable changes to `mos-server-summary-card` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to `mos-server-summary-card-v*` tags/releases in this repo
(see the [Releasing](../../CLAUDE.md#releasing) section).

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

### Changed

- `section_order` is no longer a GUI editor field (the reorderable
  multi-select was unintuitive) — it's fully supported YAML/code-editor
  only.
