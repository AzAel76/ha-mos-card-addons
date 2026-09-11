# ha-mos-card-addons

A monorepo of Lovelace card addons for
[ha-mos](https://github.com/anym001/ha-mos), the Home Assistant NAS
integration, and its companion
[ha-mos-card](https://github.com/anym001/ha-mos-card).

## Packages

| Package | Description |
| --- | --- |
| [mos-kind-title-card](packages/mos-kind-title-card) | A compact title-bar card summarizing one virtualization kind (Docker, Compose Stacks, LXC, VMs): running/total counts, update/problem badges, and a memory gauge. |

Each package is built and distributed independently (its own `dist/`
bundle, HACS metadata, and README) so it can be installed as a standalone
Lovelace resource.

## Requirements

- Node.js 18+
- The [ha-mos](https://github.com/anym001/ha-mos) integration installed and
  configured in Home Assistant.

## Setup

```bash
npm install
```

This installs dependencies for all packages via npm workspaces.

## Working on a package

```bash
npm run dev --workspace=packages/mos-kind-title-card
npm run build --workspace=packages/mos-kind-title-card
npm run deploy --workspace=packages/mos-kind-title-card
```

See each package's own README for details on its build, deploy, and HACS
setup.

## License

MIT
