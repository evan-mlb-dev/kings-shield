import { inject, Injectable } from '@angular/core';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import {
  ballColours,
  bestBall,
  imagePixels,
  palette,
  type PaletteColour,
} from '../shared/ball-colors';
import { BALLS } from '../shared/balls';
import type { ParsedPokemon } from './save-file-parser';

const normalize = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Ball matching each Pokémon's sprite colours (shiny sprite for shinies) */
@Injectable({
  providedIn: 'root',
})
export class BallMatcher {
  private readonly db = inject(PokemonDb);
  /** Ball colours by game: icons differ only by item ID */
  private readonly balls = new Map<string, Promise<PaletteColour[][]>>();
  /** Palette by sprite URL */
  private readonly sprites = new Map<string, Promise<PaletteColour[]>>();

  /** Ball index for each Pokémon key; Pokémon whose sprite could not be read are left out */
  async match(mons: readonly ParsedPokemon[], key: (mon: ParsedPokemon) => string) {
    const balls = await this.ballColours();
    const result = new Map<string, number>();
    await Promise.all(
      mons.map(async (mon) => {
        const colours = await this.spriteColours(mon);
        const ball = bestBall(colours, balls);
        if (ball !== null) result.set(key(mon), ball);
      }),
    );
    return result;
  }

  private ballColours(): Promise<PaletteColour[][]> {
    const game = this.db.game();
    let balls = this.balls.get(game);
    if (!balls) {
      const items = new Map([...this.db.items.values()].map((i) => [normalize(i.name), i.id]));
      balls = Promise.all(
        BALLS.map(async (name) => {
          const item = items.get(normalize(name));
          if (item === undefined) return [];
          const pixels = await imagePixels(`images/items/${this.db.itemIconId(item)}.png`, true);
          return pixels ? ballColours(pixels) : [];
        }),
      );
      this.balls.set(game, balls);
    }
    return balls;
  }

  private spriteColours(mon: ParsedPokemon): Promise<PaletteColour[]> {
    const id = this.db.spriteId(mon.speciesId);
    const normal = `images/pokemon/${id}.png`;
    const src = mon.isShiny ? `images/pokemon/shiny/${id}.png` : normal;
    let colours = this.sprites.get(src);
    if (!colours) {
      colours = (async () => {
        // A missing shiny sprite falls back to the normal one, as on screen
        const pixels =
          (await imagePixels(src)) ?? (src !== normal ? await imagePixels(normal) : null);
        return pixels ? palette(pixels) : [];
      })();
      this.sprites.set(src, colours);
    }
    return colours;
  }
}
