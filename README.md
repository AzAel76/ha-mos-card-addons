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

The card renders one **banner row per "kind"** (Docker, Compose Stacks,
LXC, VMs, Disks, Storage Pools, UPS) — the same kind taxonomy used by
[ha-mos-card](https://github.com/anym001/ha-mos-card). Each banner shows an
icon, a running/health count, and one aggregate stat (e.g. summed memory
usage across all containers of that kind).

### GUI editor

Add the card through the dashboard UI (Add Card → search "MOS Summary") and
it opens a visual editor built on Home Assistant's native form/selector
components — the same picker widgets HA's own card editors use:

- **Title** text field
- **MOS server** device picker (informational — filtered to devices from
  the `mos` integration; handy for finding entity names in the pickers
  below)
- **CPU / Memory / Temperature entity** pickers for the optional top vitals
  row
- One collapsible section per kind (Docker, Compose Stacks, LXC, VMs,
  Disks, Storage Pools, UPS), each with:
  - a multi-entity picker for **running/health entities**
    (switch/binary_sensor, pre-filtered by domain)
  - a multi-entity picker for **stat entities** (sensor, summed into the
    banner's secondary stat)
  - an **Advanced** sub-section to override the kind's name/icon/stat
    label/stat icon

No YAML editing is required. A kind's banner only appears once you've
picked at least one entity for it.

### YAML

The same fields are available directly in YAML — each kind is a top-level
key on the card config, matching the editor's `MosKindFields` shape:

```yaml
type: custom:mos-summary-card
title: NAS
server: 1a2b3c4d5e6f7890abcdef1234567890
cpu_entity: sensor.mos_cpu_load
memory_entity: sensor.mos_memory_usage
temperature_entity: sensor.mos_cpu_temperature
docker_container:
  state_entities:
    - switch.mos_container_plex
    - switch.mos_container_sonarr
  stat_entities:
    - sensor.mos_container_plex_memory
    - sensor.mos_container_sonarr_memory
compose_stack:
  state_entities:
    - switch.mos_stack_arr
  stat_entities:
    - sensor.mos_stack_arr_memory
disk:
  state_entities:
    - binary_sensor.mos_disk_1_smart_warning
    - binary_sensor.mos_disk_2_smart_warning
  stat_entities:
    - sensor.mos_disk_1_temperature
    - sensor.mos_disk_2_temperature
storage_pool:
  state_entities:
    - binary_sensor.mos_pool_main_health
  stat_entities:
    - sensor.mos_pool_main_free
ups:
  state_entities:
    - binary_sensor.mos_ups_on_battery
  stat_entities:
    - sensor.mos_ups_load
```

Top-level kind keys (`docker_container`, `compose_stack`, `lxc_container`,
`vm`, `disk`, `storage_pool`, `ups`) each accept:

| Option | Purpose |
|---|---|
| `state_entities` | switch/binary_sensor entities driving the running count (containers/VMs) or health/problem count (disks/pools/UPS) and the banner's accent color |
| `stat_entities` | Numeric sensor entities summed into the banner's secondary stat (e.g. per-container memory sensors) |
| `name`, `icon`, `stat_label`, `stat_icon` | Override the kind's defaults |

A banner is only rendered if it has at least one `state_entities` or
`stat_entities` entry configured.

Use **Developer Tools → States** in Home Assistant to find the exact
entity IDs `ha-mos` created for your setup.

## Publishing / HACS

This repo includes `hacs.json` so it can be added to Home Assistant as a
[HACS](https://hacs.xyz) custom repository (category: Dashboard) once it's
pushed to GitHub and has a tagged release with `dist/mos-summary-card.js`
attached.
