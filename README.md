# MOS Kind Title Card

A tiny (~50px) Lovelace title-bar card for Home Assistant, one per
virtualization "kind" exposed by the [ha-mos](https://github.com/anym001/ha-mos)
NAS integration: Docker, Compose Stacks, LXC, or Virtual Machines. Meant to
sit in a `vertical-stack` directly above
[ha-mos-card](https://github.com/anym001/ha-mos-card)'s detailed row list for
that kind, as a compact, glanceable, semi-interactive header — icon, running
count, update/problem badges, and a memory gauge, left to right.

Built with [Lit](https://lit.dev) + TypeScript, bundled with
[Vite](https://vitejs.dev).

## Requirements

- Node.js 18+
- The [ha-mos](https://github.com/anym001/ha-mos) integration installed and
  configured in Home Assistant.
- For the running/total/updates counts: an `ha-mos` version including
  [PR #114](https://github.com/anym001/ha-mos/pull/114) (merged
  2026-09-10), which added the per-kind count sensors this card reads. On an
  older integration version those rows are simply omitted — everything else
  (icon, title, memory gauge) still renders normally, since the per-guest
  memory sensors predate that PR.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

This runs Vite in watch mode and writes `dist/mos-summary-card.js` on every
change. Home Assistant loads the card as a plain JS module resource, so
there's no hot-reload into the HA frontend itself — after each build you
need to get the file onto your HA instance and **hard-refresh the browser**
(disable cache, or bump the resource version query string). Module scripts
are cached aggressively; a stale copy showing an old console version banner
is the most common "why isn't my change showing up" cause.

Two ways to get the built file onto your HA instance:

1. **Manual** — copy `dist/mos-summary-card.js` into
   `<config>/www/community/mos-summary-card/` yourself (e.g. via Samba, the
   Studio Code Server add-on, or scp).
2. **Scripted** — copy `.env.example` to `.env`, set `HA_HOST` (and
   `HA_CONFIG_PATH` if not `/config`), then run:

   ```bash
   npm run deploy
   ```

   This builds and `scp`s the file to
   `www/community/mos-summary-card/mos-summary-card.js` over SSH. Requires
   SSH access to the machine running Home Assistant (add-on SSH, HA OS SSH
   add-on, or a container host).

## Installing the resource in Home Assistant

Settings → Dashboards → ⋮ → Resources → Add Resource:

- URL: `/local/community/mos-summary-card/mos-summary-card.js`
- Resource type: JavaScript Module

Then add a card with `type: custom:mos-kind-title-card`, or use the GUI
editor (Add Card → search "MOS Kind Title").

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
- **Accent color** — a Home Assistant color swatch, tinting the icon badge
  and the gauge's normal-range arc (the warning/error thresholds still take
  over above 80%/95% regardless).
- **Layout** — `standard` (default), `compact` (shorter, denser, for tighter
  dashboards), or `gauge_first` (swaps the gauge and count column).
- **Show badges / Show counts / Show memory gauge** — hide any of the three
  right-hand sections for a sparser card.
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
color: blue # optional; a HA color token ("blue", "primary", ...) or a literal CSS color
layout: standard # standard | compact | gauge_first
show_badges: true
show_counts: true
show_gauge: true
tap_action:
  action: none
hold_action:
  action: none
double_tap_action:
  action: none
```

| Option | Purpose |
|---|---|
| `server` | device_id of the MOS server device (required) |
| `kind` | One of `docker`, `compose`, `lxc`, `vm` (required) |
| `title` | Overrides the kind's display name |
| `color` | Home Assistant color token or literal CSS color, tinting the icon badge and gauge |
| `layout` | `standard` (default), `compact`, or `gauge_first` |
| `show_badges` / `show_counts` / `show_gauge` | Toggle each section off, default `true` |
| `tap_action` / `hold_action` / `double_tap_action` | Standard Home Assistant [action config](https://www.home-assistant.io/dashboards/actions/) |

## What it shows

- **Icon** — the kind's icon.
- **Title + badges** — the kind's name, with a small icon-only badge row
  underneath: an update badge when any guest of this kind has an update
  available (Docker/Compose only — LXC/VM report no update info), and a
  problem badge when any guest reports a `problem`-class binary_sensor.
- **Count column** — running/total (e.g. "3/5") and, for Docker/Compose, the
  exact updates-available count.
- **Memory gauge** — this kind's total memory usage, summed across every
  guest device of that kind, as a percentage of the host's total installed
  RAM — plus the absolute value (e.g. "512.00 MiB").

Values are normalized to bytes before summing/dividing regardless of what
display unit (MiB, GiB, or a user-overridden decimal MB/GB) each sensor
happens to be showing, so the gauge percentage is always correct even
though per-guest sensors and the host total report in different units by
default.

## Publishing / HACS

This repo includes `hacs.json` so it can be added to Home Assistant as a
[HACS](https://hacs.xyz) custom repository (category: Dashboard) once it's
pushed to GitHub and has a tagged release with `dist/mos-summary-card.js`
attached.
