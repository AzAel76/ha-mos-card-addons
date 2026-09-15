# Changelog

All notable changes to `mos-card-addons` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions correspond to `mos-card-addons-v*` tags/releases in this repo
(see the [Releasing](../../CLAUDE.md#releasing) section).

Prior to 0.2.0, the three cards here shipped as independent packages
(`mos-kind-title-card`, `mos-server-summary-card`, `mos-detail-card`), each
with its own version and changelog — archived under
[docs/archive/](docs/archive/) for history.

## [0.3.0](https://github.com/AzAel76/ha-mos-card-addons/compare/mos-card-addons-v0.2.0...mos-card-addons-v0.3.0) (2026-09-15)


### ⚠ BREAKING CHANGES

* the HACS-managed Lovelace resource moves from mos-kind-title-card.js to mos-card-addons.js (also now covering the other two cards). Existing installs need the old per-card resources removed and the new combined one added — see README.md.

### Features

* **detail-card:** pool disk linkage, cascading picker, disk usage ([db5cac6](https://github.com/AzAel76/ha-mos-card-addons/commit/db5cac623a8a3a7d02d0a5fd83181d05d887b791))
* **kind-title-card:** regroup editor into collapsible sections ([d38bae4](https://github.com/AzAel76/ha-mos-card-addons/commit/d38bae420ec7233536faca542a6f2183ff65a683))
* unify the three cards into one mos-card-addons package ([dd01fcf](https://github.com/AzAel76/ha-mos-card-addons/commit/dd01fcfc88870dc8dfdcaddb0bb88f9dbc6bc00a))

## [Unreleased]
