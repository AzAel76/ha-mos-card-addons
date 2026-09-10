# MOS Summary Card

A Lovelace custom card for Home Assistant that gives a compact, single-glance
summary of a [MOS](https://github.com/anym001/ha-mos) NAS device: CPU,
memory, temperature, storage pool / disk health, running containers, VMs,
and UPS status.

Built with [Lit](https://lit.dev) + TypeScript, bundled with
[Vite](https://vitejs.dev).

## Requirements

- Node.js 18+
- The [ha-mos](https://github.com/anym001/ha-mos) integration installed and
  configured in your Home Assistant instance, so there are `sensor` /
  `binary_sensor` / `switch` entities to point the card at.

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
need to get the file onto your HA instance and hard-refresh the browser
(disable cache, or bump the resource version query string).

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

Then add a card with `type: custom:mos-summary-card`.

## Card configuration

All fields are optional entity IDs from your `ha-mos` integration — include
whichever ones you have:

```yaml
type: custom:mos-summary-card
title: NAS
cpu_entity: sensor.mos_cpu_load
memory_entity: sensor.mos_memory_usage
temperature_entity: sensor.mos_cpu_temperature
storage_entities:
  - sensor.mos_pool_main_usage
disk_entities:
  - binary_sensor.mos_disk_1_smart_warning
container_entities:
  - switch.mos_container_plex
  - switch.mos_container_sonarr
vm_entities:
  - switch.mos_vm_ubuntu
ups_entity: binary_sensor.mos_ups_status
```

Use **Developer Tools → States** in Home Assistant to find the exact
entity IDs `ha-mos` created for your setup.

There's no visual editor yet — configuration is YAML-only for now.

## Publishing / HACS

This repo includes `hacs.json` so it can be added to Home Assistant as a
[HACS](https://hacs.xyz) custom repository (category: Dashboard) once it's
pushed to GitHub and has a tagged release with `dist/mos-summary-card.js`
attached.
