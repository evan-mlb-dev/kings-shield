# Changelog

All notable changes to King's Shield. Versions follow [Semantic Versioning](https://semver.org/):
**major** for breaking changes (old saves or runs no longer read), **minor** for new features,
**patch** for fixes.

## [1.3.0] - 2026-11-27

### Added

- Soul Link rooms survive a page reload: the host reopens the same room code and the guest joins it
  again on their own.
- Lost Soul Link connections (partner reloading, phone asleep, server hiccup) reconnect
  automatically for up to 10 minutes, with a "Reconnecting…" state and a button to leave.

## [1.2.0] - 2026-11-27

### Added

- Random abilities: runs with the in-game ability randomizer show the abilities of the run.
- Random learnsets: the Save Editor's "Can learn" list follows the run's randomized level-up moves.
- Mobile layout (work in progress): compact header and navigation, one card per row in Team
  Building, long press to drag on touch screens, Save Editor list and form fitted to phones.
- Version badge in the header and the footer.

### Fixed

- The `.sav` file can be picked on iOS (the file filter greyed it out), with an error message when
  the file is not a Radical Red save.

## [1.1.0] - 2026-11-26

### Added

- Save Editor mass actions: give a Sitrus or Oran Berry to every Pokémon.
- Every move slot can be cleared in the Save Editor (the save keeps a move until a new one is picked).
- Smogon links open the highest tier with an analysis instead of National Dex.

### Fixed

- PC Pokémon without a nickname were missing.
- Experience curves: missing curves are worked out from the party, and Radical Red's tables 1 XP
  below the formulas are accepted.
- Forgetting a move keeps the other moves in their slots.
- The dragged team card was squashed on wide windows.

## [1.0.0] - 2026-11-25

First public release.

### Added

- Demo save loaded until the player loads their own.
- Visit statistics with GoatCounter.

### Fixed

- Save Editor moves tab fits next to the Smogon side panel.

## [0.3.0] - 2026-11-16

### Added

- Save Editor: level, nature, shininess, ability, held item, moves, evolutions, level cap, move
  learner with tutors, auto-save.
- The Team Building team becomes the in-game party of the downloaded save.
- Smogon builds in a side panel, scaled UI on wide windows.

## [0.2.0] - 2026-10-28

### Added

- Soul Link mode: peer to peer connection, linked Pokémon, champ select, body counts and run history.
- Fainted box as a tab of the PC panel.
- Dual types, scores and tier lists in the type chart.

## [0.1.0] - 2026-10-09

### Added

- Load Radical Red save files: party and PC boxes.
- Drag & drop team builder with PC filters, Smogon tiers, team coverage with scores, type chart,
  history and fainted box.
- Deployment on GitHub Pages.

[1.3.0]: https://github.com/evan-mlb-dev/kings-shield/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/evan-mlb-dev/kings-shield/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/evan-mlb-dev/kings-shield/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/evan-mlb-dev/kings-shield/releases/tag/v1.0.0
[0.3.0]: https://github.com/evan-mlb-dev/kings-shield/releases/tag/v0.3.0
[0.2.0]: https://github.com/evan-mlb-dev/kings-shield/releases/tag/v0.2.0
[0.1.0]: https://github.com/evan-mlb-dev/kings-shield/releases/tag/v0.1.0
