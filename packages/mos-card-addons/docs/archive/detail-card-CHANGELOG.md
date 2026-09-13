# Changelog

All notable changes to `mos-detail-card` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to `mos-detail-card-v*` tags/releases in this repo
(see the [Releasing](../../CLAUDE.md#releasing) section).

## [Unreleased]

### Added

- Initial version: a single-device detail card for the
  [ha-mos](https://github.com/anym001/ha-mos) integration. Point it at one
  device via `device_id` and it auto-detects whether it's a Docker
  container, Compose stack, LXC container, VM, storage pool, or physical
  disk, and renders identity (icon/picture, title, kind-specific
  descriptive attributes), current-value stats, a history sparkline where a
  percentage-scale metric exists, status badges, and a real, interactive
  power toggle for guest kinds.
- Designed to be opened from a `fire-dom-event`/
  [popup-card](https://github.com/olivierplante/popup-card) `tap_action` on
  `ha-mos-card` or `mos-server-summary-card`'s pool pills, using the
  `[[device_id]]`/`[[pool_device_id]]` placeholder tokens those cards
  already expose — replacing a hand-assembled multi-card popup that
  derived entity IDs via Jinja `regex_replace`.
- Compose stacks show their running/total container count
  (`container_count_style`: a stats-section stat item or an identity
  subtitle) and the stack's member containers (`show_containers`,
  `containers_list_style`: a vertical list or chip row), plus its
  deduplicated image list when present — all read straight off entities/
  attributes `ha-mos` already exposes, no new dependency.
- A new `"server"` kind: the MOS server device itself (recognized
  structurally, since it carries no `model_id` of its own) now shows every
  temperature reading available for it, grouped **CPU → System → Disk**:
  CPU (Main/Average/Max), any hardware-sensor reading `ha-mos` reports
  (motherboard, PSU, ... via its generic `/sensors` endpoint —
  `show_hardware_sensors`, default `true`), and every physical disk's own
  temperature — via `cpu_temp_detail_style` (`bars`, `grid`, or `history`
  for CPU Main only, every other reading staying a plain value). This is
  the reusable, embeddable replacement for what was briefly a hand-built
  `<ha-dialog>` inside `mos-server-summary-card` — that card's
  `cpu_temp_hold_action` now opens this kind instead, via its new
  `[[server_device_id]]` token.

### Changed

- Every metric with a history sparkline (CPU for guests, usage for pools)
  now renders its gauge, current value, and sparkline together in one
  labeled row, matching `mos-server-summary-card`'s CPU/memory layout —
  replacing the previous separate, unlabeled sparkline block. As a result
  `show_history` only has an effect while `show_stats` is also on, since a
  labeled sparkline is now part of its metric's row rather than a
  standalone element.

### Fixed

- A `kind` config override that didn't match the selected device's actual
  auto-detected kind (e.g. `kind: docker` against a device auto-detected as
  something else entirely) silently forced that kind anyway — every entity
  lookup then failed to resolve, rendering a near-empty card (just a
  fallback icon and the device's own name) with no indication anything was
  wrong. Now shown as an explicit warning instead.
- Every guest metric's unique_id-suffix fallback (`state`, `cpu_usage`,
  `memory_usage`, `power`, `healthy`, `update_available`, `autostart`) used
  the full, kind-prefixed translation_key string as its expected key
  instead of the short key `ha-mos` actually registers it with (confirmed
  against `sensor/`, `binary_sensor/`, and `switch/` for all four guest
  kinds) — the same class of mismatch already fixed for pool/disk entities.
  Only affects the fallback path (translation_key lookup is primary and was
  unaffected), but corrected regardless.
