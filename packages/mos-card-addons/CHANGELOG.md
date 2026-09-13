# Changelog

All notable changes to `mos-card-addons` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to `mos-card-addons-v*` tags/releases in this repo
(see the [Releasing](../../CLAUDE.md#releasing) section).

Prior to 0.2.0, the three cards here shipped as independent packages
(`mos-kind-title-card`, `mos-server-summary-card`, `mos-detail-card`), each
with its own version and changelog — archived under
[docs/archive/](docs/archive/) for history.

## [Unreleased]

### Changed

- Unified the three previously-independent packages into this one package,
  distributed as a single combined bundle (`dist/mos-card-addons.js`) — the
  only way to make all three cards installable via HACS from one
  repository, since HACS's `plugin` category reads exactly one
  `hacs.json`/asset per repository. Every card's own config schema, YAML,
  and rendered behavior is unchanged; only the distribution and internal
  source layout changed. See [docs/](docs/) for each card's usage
  reference (moved from each former package's own README).
