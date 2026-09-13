# mos-card-addons

The single package that builds and ships all three MOS Lovelace cards
(`mos-kind-title-card`, `mos-server-summary-card`, `mos-detail-card`) as one
bundle, `dist/mos-card-addons.js`.

- **Installing/using the cards:** see the [repo root README](../../README.md).
- **Full per-card usage/configuration reference:** see [docs/](docs/) —
  [kind-title-card.md](docs/kind-title-card.md),
  [server-summary-card.md](docs/server-summary-card.md),
  [detail-card.md](docs/detail-card.md).
- **Architecture/source layout:** see [CLAUDE.md](../../CLAUDE.md).

## Development

```bash
npm install          # from the repo root
npm run dev --workspace=packages/mos-card-addons    # vite build --watch
npm run build --workspace=packages/mos-card-addons  # one-shot build -> dist/mos-card-addons.js
npm run deploy --workspace=packages/mos-card-addons # build + scp to a HA instance (see .env.example)
```
