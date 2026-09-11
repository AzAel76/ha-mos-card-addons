# MOS Server Summary Card

A compact Home Assistant Lovelace summary card for one
[ha-mos](https://github.com/anym001/ha-mos) server: a custom, resizable
header image and hostname, boot time or uptime, a compact identity/version
grid (MOS version with an update indicator, CPU, kernel, architecture, base
OS, memory installed), live CPU load and memory usage — each a color-coded
gauge plus a history sparkline with optional value/time scales — storage
pool usage with editable labels, CPU temperature, a guest updates/problems
section, and a network/service/disk-health status section. Every
below-header section is independently optional, choosable in layout, and
reorderable.

Deliberately excludes per-guest Docker/Compose/LXC/VM detail — that's
[mos-kind-title-card](../mos-kind-title-card)'s job — beyond the guest
status section, which only ever summarizes counts/messages across all
guests, never per-guest detail.

Built with [Lit](https://lit.dev) + TypeScript, bundled with
[Vite](https://vitejs.dev).

## Screenshots

<!--
TODO: replace with real screenshots.
-->

_Screenshots coming soon._

## Suggested deployment

- **Most users:** install via HACS as a custom repository (see
  [CLAUDE.md](../../CLAUDE.md) for this monorepo's current HACS setup —
  at the time of writing HACS can only serve one card per repository, so
  check there for how this package is currently distributed).
- **Developers / building from source:** clone this repo and use the
  Development workflow below (`npm run dev` / `npm run deploy`).

## Requirements

- Node.js 18+
- The [ha-mos](https://github.com/anym001/ha-mos) integration installed and
  configured in Home Assistant.
- Sensor history recorded by Home Assistant's recorder (on by default) for
  the CPU load / memory usage sparklines — a fresh install with no history
  yet just shows the gauges without a trend line until some accumulates.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

This runs Vite in watch mode and writes `dist/mos-server-summary-card.js` on
every change. Home Assistant loads the card as a plain JS module resource,
so there's no hot-reload into the HA frontend itself — after each build you
need to get the file onto your HA instance and **hard-refresh the browser**
(disable cache, or bump the resource version query string).

Two ways to get the built file onto your HA instance:

1. **Manual** — copy `dist/mos-server-summary-card.js` into
   `<config>/www/community/mos-server-summary-card/` yourself.
2. **Scripted** — copy `.env.example` to `.env`, set `HA_HOST` (and
   `HA_CONFIG_PATH` if not `/config`), then run:

   ```bash
   npm run deploy
   ```

## Installing the resource in Home Assistant

Settings → Dashboards → ⋮ → Resources → Add Resource:

- URL: `/local/community/mos-server-summary-card/mos-server-summary-card.js`
- Resource type: JavaScript Module

Then add a card with `type: custom:mos-server-summary-card`, or use the GUI
editor (Add Card → search "MOS Server Summary").

## Usage

```yaml
type: custom:mos-server-summary-card
server: 1a2b3c4d5e6f7890abcdef1234567890
title: MOSBEE
image: /local/mosbee-logo.png
```

## GUI editor

Add Card → "MOS Server Summary Card" opens a visual editor built on Home
Assistant's native `ha-form`/selector components. With ~30 options, fields
are grouped into expandable sections (only a toggle's own sub-options — an
action picker, a style select — appear once that toggle is switched on):

- **MOS server** / **Title** — always visible; server picker + optional
  name override.
- **Header** — header image URL, its size (a 24–96px slider), whether to
  show the boot-time/uptime line, and (once that's on) its display style.
- **Basic Info** — the MOS version/CPU/kernel/architecture/base OS/memory
  grid, on/off.
- **System Metrics** — CPU load / memory usage gauges, on/off each, the
  sparkline history window (1/3/6/12/24h), and the sparkline's optional
  value scale (faint 0/50/100% reference) and time scale (tick labels for
  the actual window shown).
- **Storage Pools** — on/off, and once on: per-pool label overrides and the
  shared pool tap/hold/double-tap actions (see **Interactivity** below).
- **CPU Temperature** — on/off, and once on: its own tap/hold/double-tap
  actions.
- **Guest Status** — on/off, and once on: its display style.
- **Network & Services** — network/service/disk-health toggles, and once
  services are on: the status section's display style.
- **Section Order** — a reorderable multi-select of the five sections above
  (the header is always first and isn't part of this list).
- **Interactions** — the whole-card tap/hold/double-tap actions.

No entity pickers beyond the server itself: every other entity the card
needs is discovered automatically from the device and entity registries.

## Interactivity

Besides the whole-card `tap_action`/`hold_action`/`double_tap_action`, two
element groups can be independently interactive: **storage pool pills**
(`pool_tap_action` etc.) and the **CPU temperature stat**
(`cpu_temp_tap_action` etc.). Tapping one of these, when it has an action
configured, does _not_ also fire the whole-card action.

Since there's one shared action per element _type_ rather than a distinct
action per pool (the pool list is dynamic — discovered per server, not
knowable ahead of time in a static editor schema), these actions support
`{{token}}` placeholders, resolved to that specific element's own values
right before the action fires:

| Element         | Tokens                                                              |
| --------------- | ------------------------------------------------------------------- |
| Pool pills      | `{{pool_name}}`, `{{pool_usage_entity}}`, `{{pool_problem_entity}}` |
| CPU temperature | `{{server_name}}`, `{{cpu_temp_entity}}`                            |

For example, a `more-info` action naming a specific entity per pool:

```yaml
pool_tap_action:
  action: more-info
  entity: "{{pool_usage_entity}}"
```

Or a `fire-dom-event` action (e.g. to open a
[popup-card](https://github.com/olivierplante/popup-card) with per-pool
context) carrying a templated payload in `event_data` — any string value
anywhere in the action config gets the same token substitution.

## YAML

```yaml
type: custom:mos-server-summary-card
server: 1a2b3c4d5e6f7890abcdef1234567890
title: MOSBEE # optional, defaults to the server device's own name
image: /local/mosbee-logo.png # optional, falls back to a generic server icon
image_size: 40 # px, 24-96
show_uptime: true
uptime_style: relative # relative | uptime_compact | uptime_verbose
show_info: true
show_cpu_metric: true
show_memory_metric: true
history_hours: 3 # 1 | 3 | 6 | 12 | 24
sparkline_show_value_scale: false
sparkline_show_time_scale: false
show_pools: true
pool_labels:
  Data: Storage
  Cache: Fast Cache
pool_tap_action:
  action: none
pool_hold_action:
  action: none
pool_double_tap_action:
  action: none
show_cpu_temp: true
cpu_temp_tap_action:
  action: none
cpu_temp_hold_action:
  action: none
cpu_temp_double_tap_action:
  action: none
show_network: true
show_services: true
services_style: compact # compact | labeled | detailed
show_disk_health: true
show_guest_status: true
guest_status_style: badges # badges | text | ticker
section_order:
  - info
  - metrics
  - pools_temp
  - guest_status
  - services
tap_action:
  action: none
hold_action:
  action: none
double_tap_action:
  action: none
```

| Option                                                                        | Purpose                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `server`                                                                      | device_id of the MOS server device (required)                                                                                               |
| `title`                                                                       | Overrides the server device's own name                                                                                                      |
| `image`                                                                       | Custom header image URL; falls back to a generic server icon                                                                                |
| `image_size`                                                                  | Header image/fallback-icon size in px, default `40`                                                                                         |
| `show_uptime`                                                                 | Boot time / uptime line, default `true`                                                                                                     |
| `uptime_style`                                                                | `relative` (default, "2 days ago"), `uptime_compact` ("2d 4h 13m"), or `uptime_verbose` ("2 days, 4 hours, 13 minutes")                     |
| `show_info`                                                                   | MOS version/CPU/kernel/architecture/base OS/memory grid, default `true`                                                                     |
| `show_cpu_metric` / `show_memory_metric`                                      | Each metric's gauge + sparkline, default `true`                                                                                             |
| `history_hours`                                                               | Sparkline lookback window in hours, default `3`                                                                                             |
| `sparkline_show_value_scale`                                                  | Faint 0/50/100% reference on the sparklines, default `false`                                                                                |
| `sparkline_show_time_scale`                                                   | Time-axis tick labels on the sparklines, default `false`                                                                                    |
| `show_pools`                                                                  | Storage pool usage pills, default `true`                                                                                                    |
| `pool_labels`                                                                 | Per-pool label overrides, keyed by the pool's auto-detected name (e.g. `Data`) — the value fully replaces the pill's label                  |
| `pool_tap_action` / `pool_hold_action` / `pool_double_tap_action`             | Shared actions for every pool pill; support `{{pool_name}}`/`{{pool_usage_entity}}`/`{{pool_problem_entity}}` tokens                        |
| `show_cpu_temp`                                                               | CPU temperature stat, default `true`                                                                                                        |
| `cpu_temp_tap_action` / `cpu_temp_hold_action` / `cpu_temp_double_tap_action` | Actions for the CPU temperature stat; support `{{server_name}}`/`{{cpu_temp_entity}}` tokens                                                |
| `show_network`                                                                | Tailscale/Netbird connectivity badges, default `true`                                                                                       |
| `show_services`                                                               | SSH/Samba/NFS status badges, default `true`                                                                                                 |
| `services_style`                                                              | `compact` (default, icon only), `labeled` (icon + short text), or `detailed` (one full row each)                                            |
| `show_disk_health`                                                            | Disk SMART-warning badge, default `true`                                                                                                    |
| `show_guest_status`                                                           | Guest updates/problems section, default `true`                                                                                              |
| `guest_status_style`                                                          | `badges` (default), `text` (static line), or `ticker` (auto-scrolling)                                                                      |
| `section_order`                                                               | Display order of the below-header sections (`info`, `metrics`, `pools_temp`, `guest_status`, `services`); the header itself is always first |
| `tap_action` / `hold_action` / `double_tap_action`                            | Standard Home Assistant [action config](https://www.home-assistant.io/dashboards/actions/) for the whole card                               |

## What it shows

- **Header** — your custom, resizable image (or a generic server icon)
  with the hostname and a boot-time or uptime line.
- **Basic info grid** — MOS version (with a small update dot when a newer
  kernel is recommended than the one running), CPU model, running kernel,
  architecture, base OS, and installed memory.
- **System metrics** — CPU load and memory usage, each as a color-coded
  radial gauge (the same fixed traffic-light scale as mos-kind-title-card's
  gauges — a health indicator, not a branding surface) plus a history
  sparkline, with optional value/time reference scales.
- **Storage pools** — one usage pill per pool discovered on the server,
  labeled after the pool itself (e.g. "Data Pool Usage", or your own
  override via `pool_labels`). A pool reporting a problem shows red
  regardless of its usage percentage.
- **CPU temperature** — a plain stat, deliberately without severity
  coloring: sensible thresholds vary too much by CPU and cooling setup to
  pick a safe default.
- **Guest status** — a section (not a header badge) summarizing
  updates/problems across every Docker/Compose/LXC/VM guest, in your choice
  of small icon badges, a static text line, or an auto-scrolling ticker —
  never per-guest breakdown, see mos-kind-title-card for that.
- **Network & services** — connectivity/service/disk-health status, in your
  choice of compact icons, labeled chips, or detailed rows: Tailscale/
  Netbird (shown only when online), SSH/Samba/NFS (always shown, muted when
  disabled — "this is off" is itself informative for these three), and a
  disk-health warning (shown only when a disk reports one).

Every section above (except the header) can be reordered via
`section_order`.
