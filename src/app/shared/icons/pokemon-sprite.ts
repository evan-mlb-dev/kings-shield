import { Component, inject, input, linkedSignal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';

const FALLBACK = 'images/pokemon/unknown.png';

@Component({
  selector: 'app-pokemon-sprite',
  template: `<img [src]="src()" [alt]="name()" [title]="name()" (error)="onError()" />`,
  styles: `
    :host {
      display: inline-flex;
    }
    img {
      width: 64px;
      height: 64px;
      object-fit: contain;
      image-rendering: pixelated;
    }
  `,
})
export class PokemonSprite {
  private readonly db = inject(PokemonDb);
  readonly speciesId = input.required<number>();
  readonly name = input('');
  readonly shiny = input(false);

  /** Sprites are stored under Radical Red's species IDs */
  private spriteId(): number {
    this.db.game();
    return this.db.spriteId(this.speciesId());
  }

  protected readonly src = linkedSignal(() =>
    this.shiny()
      ? `images/pokemon/shiny/${this.spriteId()}.png`
      : `images/pokemon/${this.spriteId()}.png`,
  );

  protected onError(): void {
    const normal = `images/pokemon/${this.spriteId()}.png`;
    if (this.src().includes('/shiny/')) this.src.set(normal);
    else if (this.src() !== FALLBACK) this.src.set(FALLBACK);
  }
}
