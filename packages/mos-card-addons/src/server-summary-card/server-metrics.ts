/**
 * Static facts about every ha-mos entity this card reads: its
 * `translation_key` and the `key` (unique_id suffix) it was actually
 * registered with. Confirmed against the integration's source
 * (`sensor/system.py`, `sensor/system_health.py`, `sensor/summary.py`,
 * `binary_sensor/services.py`, `sensor/pools.py`, `binary_sensor/pools.py`,
 * `binary_sensor/disks.py`), not assumed — for most of these `key` and
 * `translation_key` are identical strings, but not always: pool and disk
 * entities register with a short `key` (`"usage"`, `"problem"`,
 * `"smart_warning"`) under a longer, prefixed `translation_key`
 * (`"pool_usage"`, `"pool_problem"`, `"disk_smart_warning"`) — getting this
 * wrong silently breaks `findMetricEntity`'s unique_id fallback path.
 */
import type { MetricDef } from "./devices";

const same = (key: string): MetricDef => ({ translationKey: key, keySuffix: key });

// Static identity/version info, sourced from the /osinfo endpoint (sensor/system.py).
// key === translation_key for all of these.
export const BOOT_TIME: MetricDef = same("boot_time");
export const MOS_VERSION: MetricDef = same("mos_version");
export const RUNNING_KERNEL: MetricDef = same("running_kernel");
export const RECOMMENDED_KERNEL: MetricDef = same("recommended_kernel");
export const ARCH: MetricDef = same("arch");
export const CPU_BRAND: MetricDef = same("cpu_brand");
export const BASE_OS: MetricDef = same("base_os");

// Live system health, sourced from /system/load (sensor/system_health.py).
// key === translation_key for all of these.
export const CPU_LOAD: MetricDef = same("cpu_load");
export const CPU_TEMPERATURE: MetricDef = same("cpu_temperature");
// Mean across physical cores only (SMT siblings report no temperature of
// their own) and the max across all cores, respectively — confirmed against
// sensor/system_health.py, not assumed. Both are distinct readings from
// CPU_TEMPERATURE's own "main" value, not derived from it client-side.
export const CPU_TEMPERATURE_AVERAGE: MetricDef = same("cpu_temperature_average");
export const CPU_TEMPERATURE_MAX: MetricDef = same("cpu_temperature_max");
export const MEMORY_USAGE: MetricDef = same("memory_usage");
export const MEMORY_INSTALLED: MetricDef = same("memory_installed");

// Cross-kind guest summary (sensor/summary.py) — only the update counters;
// this card deliberately shows no per-kind running/total detail.
// key === translation_key for both.
export const DOCKER_UPDATES_AVAILABLE: MetricDef = same("docker_updates_available");
export const COMPOSE_UPDATES_AVAILABLE: MetricDef = same("compose_updates_available");

// Service status, on the server device (binary_sensor/services.py).
// key === translation_key for all of these.
export const SSH_ENABLED: MetricDef = same("ssh_enabled");
export const SAMBA_ENABLED: MetricDef = same("samba_enabled");
export const NFS_ENABLED: MetricDef = same("nfs_enabled");
export const TAILSCALE_ONLINE: MetricDef = same("tailscale_online");
export const NETBIRD_ONLINE: MetricDef = same("netbird_online");

// Per-pool metrics, resolved against one pool device's own entities
// (sensor/pools.py, binary_sensor/pools.py) — key differs from translation_key here.
export const POOL_USAGE: MetricDef = { translationKey: "pool_usage", keySuffix: "usage" };
export const POOL_PROBLEM: MetricDef = { translationKey: "pool_problem", keySuffix: "problem" };

// Per-disk metric, resolved against one disk device's own entities
// (binary_sensor/disks.py) — key differs from translation_key here too.
export const DISK_SMART_WARNING: MetricDef = { translationKey: "disk_smart_warning", keySuffix: "smart_warning" };
