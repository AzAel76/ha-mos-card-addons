# MOS Kind Title Card

A compact (~50px by default — grows a little taller only if you enable
enough optional stats to need it) Lovelace title-bar card for Home
Assistant, one per virtualization "kind" exposed by the
[ha-mos](https://github.com/anym001/ha-mos) NAS integration: Docker, Compose
Stacks, LXC, or Virtual Machines. Envisioned to act as a title card for
[expander-card](https://github.com/MelleD/lovelace-expander-card) it can also be placed in
a `vertical-stack` directly above
[ha-mos-card](https://github.com/anym001/ha-mos-card)'s detailed row
list for that kind, as a glanceable, semi-interactive header — icon, running
count, update/problem badges, cpu and memory gauges, left to right.

See the [repo README](../../../README.md) for installation. This page covers usage/configuration.

## Screenshots

**Standard layout:**

![Standard layout](screenshots/kind-title-card/Screenshot_standard_layout.png)

**Compact layout** (`layout: compact`):

![Compact layout](screenshots/kind-title-card/Screenshot_compact_layout.png)

**Gauge-first layout** (`layout: gauge_first` — swaps the gauges and count column):

![Gauge-first layout](screenshots/kind-title-card/Screenshot_gaugefirst_layout.png)

**GUI editor:**

![GUI editor](screenshots/kind-title-card/Screenshot_visual_editor.png)

## Requirements

For the running/total/updates counts: an `ha-mos` version including
[PR #114](https://github.com/anym001/ha-mos/pull/114) (merged 2026-09-10),
which added the per-kind count sensors this card reads. On an older
integration version those rows are simply omitted — everything else (icon,
title, memory gauge) still renders normally, since the per-guest memory
sensors predate that PR.

## Usage

Add one card per kind you want a header for, stacked above that kind's
`ha-mos-card` list:

```yaml
type: vertical-stack
cards:
  - type: custom:mos-kind-title-card
    server: 1a2b3c4d5e6f7890abcdef1234567890
    kind: docker
  - type: custom:mos-card
    server: 1a2b3c4d5e6f7890abcdef1234567890
    kinds: [docker_container]
```

## GUI editor

Add Card → "MOS Kind Title Card" opens a visual editor built on Home
Assistant's native `ha-form`/selector components:

- **MOS server** — a dropdown of every MOS server device found on your
  instance (populated live from the device registry, the same approach
  `ha-mos-card`'s own editor uses).
- **Kind** — Docker / Compose Stacks / LXC / Virtual Machines.
- **Title** — optional override of the kind's display name.
- **Icon** — optional override of the kind's default mdi icon.
- **Icon style** — `Filled` (default: a colored circle behind a white icon)
  or `Transparent` (no circle — the icon drawn directly in its own color).
- **Icon shape** — `Circle` (default) or `Square` (a rounded square,
  matching `ha-mos-card`'s own icon shape).
- **Icon background color** — the circle's color in Filled style (also the
  icon's own color in Transparent style, unless overridden below). The
  gauges are colored by value regardless (see below), not by this setting.
- **Icon color** — overrides the icon glyph's own color independently of
  the background — e.g. a colored icon on a still-colored circle.
- **Layout** — `standard` (default), `compact` (shorter, denser, for tighter
  dashboards), or `gauge_first` (swaps the gauges and count column).
- **Show badges / Show counts / Show memory gauge** — hide any of the three
  right-hand sections for a sparser card.
- **Show CPU usage** — an extra gauge, grouped alongside the memory gauge,
  for this kind's aggregate CPU usage summed the same way as memory. Off by
  default (the card is already fairly dense).
- **Show MOS UI link** — a tappable link opening this kind's page in MOS's
  own web UI (not an individual container's own web UI — those already
  have their own link in `ha-mos-card`'s row list). Built from the server
  device's `configuration_url` plus a per-kind path: `/docker` for both
  Docker and Compose (stacks run under the docker engine and share its
  page), `/lxc`, and `/vm`. Override the path per-card with **Link path
  override** if a given MOS version differs. On by default; simply doesn't
  appear if the server has no `configuration_url`.
- **Link style** — `Corner badge on icon` (default, compact) or `Standalone
button` (a separate tappable icon at the end of the row — more visible,
  costs a bit more width).
- **Show container count** (Compose only) — the containers-within-stacks
  ratio (distinct from stacks running/total), as an extra stat. Off by
  default.
- **Tap / Hold / Double-tap action** — standard Home Assistant action
  pickers (the card is tap/hold/double-tap interactive).

No entity pickers: once server + kind are chosen, every entity the card
needs is discovered automatically from the device and entity registries —
the same architecture `ha-mos-card` uses, so device/container churn (a
container added or removed) is picked up live with nothing to reconfigure.

## YAML

```yaml
type: custom:mos-kind-title-card
server: 1a2b3c4d5e6f7890abcdef1234567890
kind: docker
title: Docker # optional, defaults to the kind's name
icon_style: filled # filled | transparent
icon_shape: circle # circle | square
color: blue # optional; a HA color token ("blue", "primary", ...) or a literal CSS color
icon_color: white # optional override of the glyph color specifically
layout: standard # standard | compact | gauge_first
show_badges: true
show_counts: true
show_gauge: true
show_cpu: false
show_link: true
link_style: badge # badge | button
link_path: docker # optional override; defaults to docker/lxc/vm per kind
show_containers: false # compose only
tap_action:
  action: none
hold_action:
  action: none
double_tap_action:
  action: none
```

| Option                                             | Purpose                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `server`                                           | device_id of the MOS server device (required)                                                                     |
| `kind`                                             | One of `docker`, `compose`, `lxc`, `vm` (required)                                                                |
| `title`                                            | Overrides the kind's display name                                                                                 |
| `icon`                                             | Overrides the kind's default mdi icon                                                                             |
| `icon_style`                                       | `filled` (default, colored circle) or `transparent` (no circle)                                                   |
| `icon_shape`                                       | `circle` (default) or `square` (rounded square)                                                                   |
| `color`                                            | Home Assistant color token or literal CSS color for the icon background (filled) or the icon itself (transparent) |
| `icon_color`                                       | Overrides the icon glyph's own color independently of `color`                                                     |
| `layout`                                           | `standard` (default), `compact`, or `gauge_first`                                                                 |
| `show_badges` / `show_counts` / `show_gauge`       | Toggle each section off, default `true`                                                                           |
| `show_cpu`                                         | Extra aggregate CPU-usage gauge, grouped with memory, default `false`                                             |
| `show_link`                                        | Tappable link to this kind's page in MOS's own web UI, default `true`                                             |
| `link_style`                                       | `badge` (default, on the icon) or `button` (standalone, end of row)                                               |
| `link_path`                                        | Overrides the kind's default URL path segment (`docker`/`lxc`/`vm`)                                               |
| `show_containers`                                  | Containers-within-stacks ratio (compose only), default `false`                                                    |
| `tap_action` / `hold_action` / `double_tap_action` | Standard Home Assistant [action config](https://www.home-assistant.io/dashboards/actions/)                        |

## What it shows

- **Icon** — the kind's icon (or your override) in a colored circular badge,
  with a small corner badge for an update (Docker/Compose only — LXC/VM
  report no update info) and/or a problem (any guest reporting a
  `problem`-class binary_sensor) — mirroring `ha-mos-card`'s icon-badge
  convention.
- **Title + subtitle** — the kind's name, with a short status line beneath
  it (e.g. "2 updates available", "1 issue") when there's something to
  report — otherwise blank.
- **Count column** — labeled stats: running/total (e.g. "3/5" under
  "Running") and, for Docker/Compose, the exact updates-available count
  under "Updates" (only shown once it's non-zero).
- **Gauges** — a memory gauge (a 270° arc, its icon centered and scaled to
  the ring) showing this kind's total memory usage (summed across every
  guest device of that kind) as a percentage of the host's total installed
  RAM, labeled underneath with the absolute value and unit (e.g. "512 MiB"
  under "Memory", the unit rendered smaller than the number). With **Show
  CPU usage** on, a matching CPU gauge appears right beside it. Both gauges
  use a fixed traffic-light scale regardless of icon color — green 0–25%,
  yellow 26–50%, orange 51–75%, red 76–100% — since they're a health
  indicator, not a branding surface. Every gauge-adjacent number (memory,
  CPU%) is formatted to at most 4 characters — "100", "99.9", "9.99",
  "0.27" — never wider than the small label has comfortable room for.

Values are normalized to bytes before summing/dividing regardless of what
display unit (MiB, GiB, or a user-overridden decimal MB/GB) each sensor
happens to be showing, so the gauge percentage is always correct even
though per-guest sensors and the host total report in different units by
default.
