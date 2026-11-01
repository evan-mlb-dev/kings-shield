# King's Shield

A team builder for **Pokémon Radical Red** (Nuzlocke friendly). Load your `.sav` file, build a team from your party and PC, and check its type coverage.

**Live site:** https://evan-mlb-dev.github.io/kings-shield/

## Features

- **Save file loading**: reads Radical Red `.sav` files (party and PC boxes), with levels recomputed for PC Pokémon.
- **Team builder**: drag & drop between the team and the PC, lock team members, set fainted Pokémon aside.
- **PC filters**: search, type, "effective vs" a type (with match-up badges), sort by base stats or Smogon tier.
- **Coverage**: defensive and offensive tables, critical weaknesses, well resisted types and 0–100 team scores.
- **Type chart**: interactive 18×18 chart with the strengths and weaknesses of each type.
- **History**: finished Soul Link runs, each with its deaths on a timeline and both players' body counts.
- **Soul Link**: connect with another player (peer to peer, room code), see your linked Pokémon (same met location, or linked by hand) and run a turn-based champ select that fills both teams pair by pair.

Everything runs in the browser: your save and runs are stored in `localStorage`, nothing is sent to a server. With Soul Link, the public PeerJS server only introduces the two browsers; your Pokémon then go straight to the other player.

## Getting started

Requirements: Node.js 22+ and npm.

```bash
npm install
npm start
```

Then open http://localhost:4200/.

| Command | Description |
| --- | --- |
| `npm start` | Development server with live reload |
| `npm run build` | Production build in `dist/kings-shield/browser` |
| `npm test` | Unit tests |

## Data

The Pokémon data lives in `src/app/data/`. Scripts to refresh it:

| Script | Output |
| --- | --- |
| `node src/app/data/build-pokemon-db.mjs <rawDir>` | Species, moves, abilities, items, natures and types from the Radical Red dex export |
| `node src/app/data/fetch-growth-rates.mjs` | `growth-rates.json`: experience curves (used to compute PC levels) |
| `node src/app/data/fetch-smogon-data.mjs` | `smogon.json`: Smogon tiers and dex links |
| `node src/app/data/fetch-evolutions.mjs` | `evolutions.json`: evolutions of every species (Save Editor) |
| `node src/app/data/fetch-shiny-sprites.mjs` | `public/images/pokemon/shiny/`: shiny front sprites |
| `node src/app/data/fetch-learnsets.mjs` | `learnsets.json`: level-up moves and TMs of every species (Save Editor) |

## Deployment

Every push to `main` builds the app and publishes it on GitHub Pages (`.github/workflows/deploy.yml`).

## Credits

- Radical Red data and sprites: [Radical Red Pokédex](https://github.com/JwowSquared/Radical-Red-Pokedex)
- Smogon tiers and some sprites: [Pokémon Showdown](https://play.pokemonshowdown.com/)
- Item sprites and growth rates: [PokeAPI](https://pokeapi.co/)
- Type icons: [partywhale/pokemon-type-icons](https://github.com/partywhale/pokemon-type-icons) (MIT)

Pokémon and all related names and images are © Nintendo, Game Freak and The Pokémon Company. This is an unofficial fan project, not affiliated with or endorsed by them.
