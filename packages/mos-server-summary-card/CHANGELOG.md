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
  pills and the CPU temperature stat, supporting `{{token}}` placeholder
  substitution (e.g. `{{pool_name}}`) so one shared action can still
  reference the specific element it was fired from.
- Reorderable section display order (`section_order`).
- The GUI editor is now grouped into expandable, conditionally-populated
  sections to stay usable as the option count grew.
