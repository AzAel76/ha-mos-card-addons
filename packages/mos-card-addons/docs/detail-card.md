# MOS Detail Card

A single-device detail card for the [ha-mos](https://github.com/anym001/ha-mos)
integration: point it at one device (a Docker container, Compose stack, LXC
container, VM, storage pool, physical disk, or the MOS server itself) via
`device_id`, and it auto-detects what kind of thing it is from the device
registry and renders the right detail for it — identity (icon/picture,
title, kind-specific descriptive attributes), current-value stats, a
history sparkline where a percentage-scale metric exists, status badges,
and a real, interactive power toggle for guest kinds. The server device has
no `model_id` of its own, but is still auto-detected structurally (as the
`via_device_id` parent of any guest/pool/disk device) and shows every
temperature reading available for it — CPU (Main/Average/Max), each disk's
own temperature, and any other hardware-sensor reading `ha-mos` reports
(motherboard, PSU, ...) — in one of three layouts. A pool shows the actual
disks backing it (member and, where present, parity), resolved from
`ha-mos` v0.3.2's pool/disk linkage.

Built to be opened from a `fire-dom-event`/[popup-card](https://github.com/olivierplante/popup-card)
`tap_action` on [ha-mos-card](https://github.com/anym001/ha-mos-card) or
[mos-server-summary-card](server-summary-card.md)'s pool pills, replacing
a hand-assembled stack of generic cards wired together with Jinja
`regex_replace` entity derivation (see **Replacing a hand-built popup**
below) — but it works as a normal standalone dashboard card too.

See the [repo README](../../../README.md) for installation. This page covers usage/configuration.

## Requirements

Sensor history recorded by Home Assistant's recorder (on by default) for
the CPU/pool-usage/disk-usage history sparkline — a fresh install with no
history yet just shows the stats without a trend line until some
accumulates. Disk usage history additionally needs `ha-mos` v0.3.3+ (see
Known limitations below for older versions).

## Usage

```yaml
type: custom:mos-detail-card
device_id: 1a2b3c4d5e6f7890abcdef1234567890
```

## GUI editor

Add Card → "MOS Detail Card" opens a visual editor built on Home Assistant's
native `ha-form`/selector components:

- **MOS server → Kind → Device** — a three-step cascade: pick the server,
  then which kind of thing you're after (Docker/Compose/LXC/VM/Pool/Disk/
  Server), then the matching device found under that server (skipped
  entirely for the "Server" kind — there's only one server device, so
  picking that kind already fully identifies it). Editing an
  already-configured card opens with all three correctly pre-filled, not
  blank. These three fields are an editor-only convenience — only the
  device you land on ever gets saved to `device_id`; switching server or
  kind clears whatever device was previously selected, since it almost
  certainly doesn't belong to the new one.
- **Title** — optional name override.
- **Show identity / Show current-value stats / Show history sparkline(s) /
  Show status badges / Show power toggle** — each independently on/off.
  History adds its own lookback window and optional value/time scale fields
  once switched on. For the pool kind, **Show identity** and **Show status
  badges** are no-ops — its dedicated layout folds title/filesystem type
  and status badges into its own header, gated by **Show current-value
  stats** instead.
- **Compose: container count position / show container list / container
  list style** — always shown in the editor (no-ops for every other kind,
  same as the fields above): where the running/total container count
  appears, whether the member-container list renders at all, and whether it
  renders as a vertical list or a chip row.
- **Server: temperature layout / show hardware sensors** — always shown in
  the editor (no-ops for every other kind): `bars`, `grid`, or `history` for
  the server's temperature readings (grouped CPU / System / Disk — see the
  per-kind table below), and whether the System group (generic
  hardware-sensor readings) shows at all.
- **Pool: show member/parity disks / arrangement / value style /
  attributes** — always shown in the editor (no-ops for every other
  kind): whether the pool's actual member/parity disks show at all, then
  three independent choices — **Rows** or **Grid** (arrangement),
  **Gauge**, **Bar**, or **Text** (how each disk's value is shown), and
  which of Model/Type/Size/Power status/SMART warning to display, picked
  individually rather than as a fixed tier.
- **Interactions** — the whole-card tap/hold/double-tap actions.
- **Advanced → Kind override** — separate from the cascade above and
  normally left untouched: only needed if a future `ha-mos` device kind
  isn't yet recognized by this card's auto-detection.

No further entity pickers: every entity the card needs is discovered
automatically from the device and entity registries, based on the selected
device's own kind.

## Replacing a hand-built popup

A real popup previously assembled from three separate cards — a
[bubble-card](https://github.com/Clooos/Bubble-Card) power toggle, a
`markdown` card for the image description, and a third-party
`statistics-graph-chart-card` for CPU/RAM history — stacked inside
`ha-mos-card`'s `fire-dom-event`/popup-card `tap_action`, deriving every
entity it needed via Jinja `regex_replace` against the two placeholders
`ha-mos-card` hands a popup (`[[entity]]`, `[[power]]`):

```yaml
# Before (excerpt) — inside ha-mos-card's tap_action.popup_card.content:
type: vertical-stack
cards:
  - type: custom:bubble-card
    # ...power toggle + update-available sub-button, both entity-derived
    # from [[power]] via regex_replace...
  - type: markdown
    content: "{{state_attr('[[entity]]', 'image_description')}}"
  - type: custom:statistics-graph-chart-card
    entities:
      - entity: "{{ '[[entity]]' | regex_replace('_state$', '_memory_usage') }}"
        name: Ram Consumed
      - entity: "{{ '[[entity]]' | regex_replace('_state$', '_cpu_usage') }}"
        name: Cpu Usage
```

becomes one card, with `ha-mos-card` needing no change at all —
`[[device_id]]` is already one of its existing placeholder tokens:

```yaml
# After:
type: custom:mos-detail-card
device_id: "[[device_id]]"
```

The same works from `mos-server-summary-card`'s pool pills via
`pool_tap_action`, using its `[[pool_device_id]]` token:

```yaml
pool_tap_action:
  action: fire-dom-event
  popup_card:
    content:
      type: custom:mos-detail-card
      device_id: "[[pool_device_id]]"
```

...and from that same card's CPU Temp pill via `cpu_temp_hold_action`,
using its `[[server_device_id]]` token — this is the `"server"` kind's
primary use case, replacing what used to be a hand-built `<ha-dialog>`
inside `mos-server-summary-card` itself:

```yaml
cpu_temp_hold_action:
  action: fire-dom-event
  popup_card:
    content:
      type: custom:mos-detail-card
      device_id: "[[server_device_id]]"
```

### Designing a popup config: build standalone, then embed

A card config nested inside `tap_action.popup_card.content` is inert YAML
from Home Assistant's dashboard editor's point of view — it's not a
top-level entry in any view/section, so it never gets a pencil icon and the
GUI editor never opens for it.
[popup-card](https://github.com/olivierplante/popup-card)'s own docs
confirm this isn't fixable on our end: `content` is always inlined YAML,
with no "reference an existing card" mode.

The practical workaround: build and tune the card as a normal standalone
dashboard entry first — full GUI editor, live preview, a real device picked
in **Device** — then copy the finished YAML into the calling card's
`popup_card.content`, swapping the literal `device_id` for
`"[[device_id]]"` (or `"[[pool_device_id]]"` for a pool pill). This is a
one-time authoring step per popup design, not per-instance: one embedded
config drives whichever row or pill fired it.

## YAML

```yaml
type: custom:mos-detail-card
device_id: 1a2b3c4d5e6f7890abcdef1234567890
kind: docker # optional override; auto-detected from the device's model_id
title: My Container # optional, defaults to the device's own name
show_identity: true
show_stats: true
show_history: true
history_hours: 3 # 1-24
sparkline_show_value_scale: false
sparkline_show_time_scale: false
container_count_style: stats # stats | subtitle — Compose only
show_containers: true # Compose only
containers_list_style: list # list | chips — Compose only
show_status: true
show_power_toggle: true
cpu_temp_detail_style: bars # bars | grid | history — Server only
show_hardware_sensors: true # Server only
show_pool_disks: true # Pool only
pool_disk_layout: rows # grid | rows — Pool only
pool_disk_value_style: bar # gauge | bar | text — Pool only
pool_disk_attributes: [model, size] # model | type | size | power_status | smart_warning | temperature — Pool only
tap_action:
  action: none
hold_action:
  action: none
double_tap_action:
  action: none
```

| Option                                             | Purpose                                                                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device_id`                                        | device_id of the guest/pool/disk/server device to show (required)                                                                                                                               |
| `kind`                                             | Overrides kind auto-detection: `docker` \| `compose` \| `lxc` \| `vm` \| `pool` \| `disk` \| `server`                                                                                           |
| `title`                                            | Overrides the device's own name                                                                                                                                                                 |
| `show_identity`                                    | Icon/picture, title, and kind-specific descriptive attributes, default `true`. No-op for the pool kind (see `show_stats`)                                                                       |
| `show_stats`                                       | Current-value gauges/stats, default `true`. For pools this gates the whole dedicated pool layout (gauge, state header, member/parity disks)                                                     |
| `show_history`                                     | History sparkline, where a percentage-scale metric exists (CPU for guests, usage for pools and disks), default `true`                                                                           |
| `history_hours`                                    | Sparkline lookback window in hours, default `3`                                                                                                                                                 |
| `sparkline_show_value_scale`                       | Faint 0/50/100% reference on the sparkline, default `false`                                                                                                                                     |
| `sparkline_show_time_scale`                        | Time-axis tick labels on the sparkline, default `false`                                                                                                                                         |
| `container_count_style`                            | Compose only: `stats` (default, a stat item alongside CPU/memory) or `subtitle` (a text line under the title)                                                                                   |
| `show_containers`                                  | Compose only: the list of the stack's member containers, default `true`                                                                                                                         |
| `containers_list_style`                            | Compose only: `list` (default, one row per container) or `chips` (wrapped pills)                                                                                                                |
| `show_status`                                      | Health/update/autostart/SMART-warning badges, kind-permitting, default `true`. No-op for the pool kind (see `show_stats`)                                                                       |
| `show_power_toggle`                                | A real on/off toggle — guest kinds only (docker/compose/lxc/vm), default `true`                                                                                                                 |
| `cpu_temp_detail_style`                            | Server only: `bars` (default, one horizontal bar per reading), `grid` (a small gauge per reading), or `history` (CPU Main as a gauge + labeled sparkline, every other reading as a plain value) |
| `show_hardware_sensors`                            | Server only: the "System" group of generic hardware-sensor readings, default `true` — see Known limitations below                                                                               |
| `show_pool_disks`                                  | Pool only: show the disks actually backing this pool under its gauge, default `true`                                                                                                            |
| `pool_disk_layout`                                 | Pool only: `rows` (default, one per line) or `grid` (wrapped tiles)                                                                                                                             |
| `pool_disk_value_style`                            | Pool only: `bar` (default, a severity-colored horizontal track), `gauge` (a small radial gauge), or `text` (the plain value, no visual)                                                         |
| `pool_disk_attributes`                             | Pool only: any of `model`/`type`/`size`/`power_status`/`smart_warning`/`temperature`, independently — default `[model, size]`                                                                   |
| `tap_action` / `hold_action` / `double_tap_action` | Standard Home Assistant [action config](https://www.home-assistant.io/dashboards/actions/) for the whole card                                                                                   |

## What it shows, per kind

|         | Identity                                                        | Stats                                                                                                                                                                                                                                                                    | History                             | Status                                 | Power toggle |
| ------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | -------------------------------------- | ------------ |
| Docker  | Icon/picture, state, image title/repo/network mode, web UI link | CPU % gauge + labeled sparkline, memory (of host RAM) gauge                                                                                                                                                                                                              | CPU %                               | Healthy, update available, autostart   | Yes          |
| Compose | Same as Docker, plus a container-count subtitle option          | Same as Docker, plus running/total container count                                                                                                                                                                                                                       | CPU %                               | Healthy, update available, autostart   | Yes          |
| LXC     | Icon/picture, state                                             | CPU % gauge + labeled sparkline, memory (of host RAM) gauge                                                                                                                                                                                                              | CPU %                               | Autostart                              | Yes          |
| VM      | Icon/picture, state                                             | CPU % gauge + labeled sparkline, memory (of host RAM) gauge                                                                                                                                                                                                              | CPU %                               | Autostart                              | Yes          |
| Pool    | Folded into its own header (see below)                          | Usage % gauge + labeled sparkline, used/total space, filesystem type, problem/scrub/balance/parity-running state — plus, per `show_pool_disks`, the actual parity and member disks backing this pool (`pool_disk_layout`/`pool_disk_value_style`/`pool_disk_attributes`) | Usage %                             | Folded into its own header (see below) | —            |
| Disk    | Model, type, size                                               | Usage % gauge + labeled sparkline, used/total space, temperature, power status                                                                                                                                                                                           | Usage %                             | SMART warning, preclear running        | —            |
| Server  | —                                                               | Every temperature reading, grouped **CPU → System → Disk**: CPU Main/Average/Max, generic hardware-sensor readings (`show_hardware_sensors`), and each disk's own temperature (`cpu_temp_detail_style`: bars, gauge grid, or gauge + history for CPU Main)               | CPU Main only, `history` style only | —                                      | —            |

**Pools get a dedicated layout**, not the generic identity/stats/status
sections every other kind uses: one consolidated header (usage gauge,
title, filesystem type, and problem/scrub/balance/parity-running state,
all in one place) followed by, per `show_pool_disks`, a "Parity" group
(only shown when the pool actually has one) and a "Disks" group listing
every disk `ha-mos` reports as backing this pool — resolved by matching
each disk's physical serial (read from its own device registry entry, not
exposed on any disk entity) against the pool's `member_disk_serials`/
`parity_disk_serials` attributes. Three independent config axes control
how these groups render: `pool_disk_layout` (`rows`, default, or `grid`),
`pool_disk_value_style` (`bar`, default; `gauge`; or `text` — no visual,
just the value), and `pool_disk_attributes` (any of `model`/`type`/`size`/
`power_status`/`smart_warning`/`temperature`, picked individually rather
than as a fixed tier). Each disk's icon reflects its own `disk_type`
reading (NVMe/SSD/USB/...), the same per-type icons MOS's own web UI disk
table uses. The bar/gauge/text value is each disk's usage percentage
(`ha-mos` v0.3.3+, closes
[anym001/ha-mos#119](https://github.com/anym001/ha-mos/issues/119)),
falling back to temperature on an older `ha-mos` that doesn't report usage
yet — `temperature` is also available as its own independent attribute
chip regardless of which value style is picked.

Every gauge with a history sparkline renders it labeled, in the same row as
the gauge and its current value (matching `mos-server-summary-card`'s
CPU/memory layout) — never as a separate unlabeled block. Memory usage is
shown as a current-value stat (and, when the guest's parent server exposes
its total installed memory, a host-relative percentage gauge) but never as
a history sparkline: it's a raw byte value with no fixed scale, and Home
Assistant's history API doesn't return per-point units — there's no
reliable way to normalize an older sample against whatever unit it was
displayed in at the time. CPU load and pool/disk usage are already fixed
0-100% scales, so they don't have that problem. Fixing this properly means
`ha-mos` exposing a real percentage sensor rather than this card
reconstructing one from raw history — requested:
[anym001/ha-mos#120](https://github.com/anym001/ha-mos/issues/120).

**Compose stacks additionally show a member-container list** (toggle
`show_containers`, styled via `containers_list_style`) — the container
names ha-mos already exposes as the `containers` attribute on the stack's
`state` entity, plus its deduplicated `images` list as a caption when
present. There's no per-container image mapping available (only the
aggregate list), so images are shown as "images in use," not attributed to
individual containers — ha-mos models no separate entity per container
within a stack at all (confirmed in its `coordinator/compose.py`), so this
is the most this card can show without a `ha-mos` change.

## Known limitations

- The disk kind's usage gauge/sparkline and the pool disk list's usage
  value both need `ha-mos` v0.3.3+ (closes
  [anym001/ha-mos#119](https://github.com/anym001/ha-mos/issues/119)),
  which added a `disk_usage`/space sensor set to every physical disk. On
  an older `ha-mos`, the disk kind's usage section is structurally absent
  (falls back to just temperature/power status, same as before this
  version) and the pool disk list falls back to temperature as its value.
- The pool kind's parity-disk group is implemented against `ha-mos`
  v0.3.2's confirmed `parity_disks`/`parity_disk_serials` attribute shape
  ([anym001/ha-mos#117](https://github.com/anym001/ha-mos/issues/117)),
  but hasn't had a live end-to-end check against an actual
  parity-configured pool (mdadm/similar) — only the member-disk path has
  been verified against real hardware so far. It degrades gracefully (the
  group just doesn't render) the same as every other optional section
  here, so this is a "not yet verified" note, not a known bug.
- The server kind's "System" group (generic hardware-sensor readings) can
  duplicate CPU/disk readings shown elsewhere on the same server — e.g. a
  "CPU Temp" hardware sensor reading the same value as CPU Main, or an
  "NVME3" reading duplicating a specific disk's own temperature. Unlike the
  pool/disk case above, **this isn't fixable in `ha-mos`**: a live MOS
  `/sensors` response carries no field at all linking a reading back to a
  specific disk or "this is the CPU" (confirmed — just `id`/`index`/`name`/
  `manufacturer`/`model`/`subtype`/`value`/`unit`, with `manufacturer`/
  `model` `null` in practice), so there's nothing for the integration to
  expose. Use `show_hardware_sensors: false` on a server where this group
  turns out to be pure duplication.
