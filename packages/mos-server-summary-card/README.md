# MOS Server Summary Card

A compact Home Assistant Lovelace summary card for one
[ha-mos](https://github.com/anym001/ha-mos) server: a custom header image and
hostname, boot time, a compact identity/version grid (MOS version with an
update indicator, CPU, kernel, architecture, base OS, memory installed),
live CPU load and memory usage — each a color-coded gauge plus a short
history trend line — storage pool usage, CPU temperature, and small status
badges for network connectivity (Tailscale/Netbird), file/remote-access
services (SSH/Samba/NFS), and disk health.

Deliberately excludes per-guest Docker/Compose/LXC/VM detail — that's
[mos-kind-title-card](../mos-kind-title-card)'s job — beyond a single
aggregate corner badge on the header image for "something needs attention
across your guests" (updates pending or a problem reported).

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
Assistant's native `ha-form`/selector components:

- **MOS server** — a dropdown of every MOS server device found on your
  instance.
- **Title** — optional override of the server device's own name.
- **Header image URL** — a custom image representing this server (e.g. a
  local `/local/...` image); falls back to a generic server icon when unset.
- **Show boot time** — the relative boot-time line under the header.
- **Show basic info** — the MOS version/CPU/kernel/architecture/base OS/
  memory grid.
- **Show CPU load** / **Show memory usage** — each metric's gauge + history
  sparkline, independently toggleable.
- **History window** — how far back the sparklines look (1/3/6/12/24 hours).
- **Show storage pools** — one usage pill per discovered pool. Every pool on
  the server is shown; there's no per-pool picker, the same
  auto-discovery philosophy as mos-kind-title-card.
- **Show CPU temperature**.
- **Show network connectivity** — Tailscale/Netbird badges, shown only when
  online.
- **Show service status** — SSH/Samba/NFS badges, always shown (muted when
  disabled — "this is off" is itself informative for these three).
- **Show disk health** — an aggregate badge if any physical disk reports a
  SMART warning.
- **Show guest updates/problems badge** — the header corner badge
  summarizing Docker/Compose/LXC/VM guests, without per-kind detail.
- **Tap / Hold / Double-tap action** — standard Home Assistant action
  pickers.

No entity pickers beyond the server itself: every other entity the card
needs is discovered automatically from the device and entity registries.

## YAML

```yaml
type: custom:mos-server-summary-card
server: 1a2b3c4d5e6f7890abcdef1234567890
title: MOSBEE # optional, defaults to the server device's own name
image: /local/mosbee-logo.png # optional, falls back to a generic server icon
show_uptime: true
show_info: true
show_cpu_metric: true
show_memory_metric: true
history_hours: 3 # 1 | 3 | 6 | 12 | 24
show_pools: true
show_cpu_temp: true
show_network: true
show_services: true
show_disk_health: true
show_guest_status: true
tap_action:
  action: none
hold_action:
  action: none
double_tap_action:
  action: none
```

| Option                                             | Purpose                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `server`                                           | device_id of the MOS server device (required)                                              |
| `title`                                            | Overrides the server device's own name                                                     |
| `image`                                            | Custom header image URL; falls back to a generic server icon                               |
| `show_uptime`                                      | Relative boot-time line, default `true`                                                    |
| `show_info`                                        | MOS version/CPU/kernel/architecture/base OS/memory grid, default `true`                    |
| `show_cpu_metric` / `show_memory_metric`           | Each metric's gauge + sparkline, default `true`                                            |
| `history_hours`                                    | Sparkline lookback window in hours, default `3`                                            |
| `show_pools`                                       | Storage pool usage pills, default `true`                                                   |
| `show_cpu_temp`                                    | CPU temperature stat, default `true`                                                       |
| `show_network`                                     | Tailscale/Netbird connectivity badges, default `true`                                      |
| `show_services`                                    | SSH/Samba/NFS status badges, default `true`                                                |
| `show_disk_health`                                 | Disk SMART-warning badge, default `true`                                                   |
| `show_guest_status`                                | Header corner badge for guest updates/problems, default `true`                             |
| `tap_action` / `hold_action` / `double_tap_action` | Standard Home Assistant [action config](https://www.home-assistant.io/dashboards/actions/) |

## What it shows

- **Header** — your custom image (or a generic server icon) with the
  hostname and a relative boot-time line. A red or blue corner badge
  appears on the image if any Docker/Compose/LXC/VM guest has a reported
  problem or an update waiting, respectively — no per-guest breakdown here,
  see mos-kind-title-card for that.
- **Basic info grid** — MOS version (with a small update dot when a newer
  kernel is recommended than the one running), CPU model, running kernel,
  architecture, base OS, and installed memory.
- **System metrics** — CPU load and memory usage, each as a color-coded
  radial gauge (the same fixed traffic-light scale as mos-kind-title-card's
  gauges — a health indicator, not a branding surface) plus a short history
  trend line.
- **Storage pools** — one usage pill per pool discovered on the server,
  named after the pool itself (e.g. "Data Pool Usage"). A pool reporting a
  problem shows red regardless of its usage percentage.
- **CPU temperature** — a plain stat, deliberately without severity
  coloring: sensible thresholds vary too much by CPU and cooling setup to
  pick a safe default.
- **Status strip** — small icon badges for Tailscale/Netbird connectivity
  (shown only when online), SSH/Samba/NFS service status (always shown,
  muted when disabled), and a disk-health warning (shown only when a disk
  reports one).
