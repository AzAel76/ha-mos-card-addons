# Changelog

All notable changes to `mos-kind-title-card` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to `mos-kind-title-card-v*` tags/releases in this repo
(see the [Releasing](../../CLAUDE.md#releasing) section).

## [Unreleased]

### Fixed

- The count/gauge row no longer wraps onto a second line and grows the card
  past its fixed height when several optional stats (Updates, Containers)
  and a CPU gauge are all shown at once — it now always stays on one line,
  with the title truncating further instead if space is tight.
- The CPU gauge label no longer shows a 5-character value (e.g. `"0.270"`)
  for sub-1% CPU usage; every gauge-adjacent number is now capped at 4
  characters regardless of magnitude.

## [0.1.0] - 2026-09-11

### Added

- Initial release: a per-kind Lovelace title-bar card for the
  [ha-mos](https://github.com/anym001/ha-mos) integration (Docker, Compose
  Stacks, LXC, Virtual Machines) — icon with update/problem badges,
  running/total and updates counts, a memory gauge (plus an optional CPU
  gauge), a link to the kind's page in MOS's own web UI, and a GUI editor.
