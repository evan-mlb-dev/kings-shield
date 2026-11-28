import { Component, inject, input, linkedSignal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';

const FALLBACK = 'images/items/unknown.svg';

@Component({
  selector: 'app-item-icon',
  template: `<img [src]="src()" [alt]="name()" [title]="name()" (error)="onError()" />`,
  styles: `
    :host {
      display: inline-flex;
    }
    img {
      width: 30px;
      height: 30px;
      image-rendering: pixelated;
    }
  `,
})
export class ItemIcon {
  /** Radical Red internal item ID */
  readonly id = input.required<number>();
  readonly name = input('');
  private readonly db = inject(PokemonDb);

  /** Icons are stored under Radical Red's item IDs */
  protected readonly src = linkedSignal(() => {
    this.db.game();
    return `images/items/${this.db.itemIconId(this.id())}.png`;
  });

  protected onError(): void {
    if (this.src() !== FALLBACK) this.src.set(FALLBACK);
  }
}
