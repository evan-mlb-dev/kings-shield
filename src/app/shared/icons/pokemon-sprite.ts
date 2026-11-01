import { Component, input, linkedSignal } from '@angular/core';

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
  readonly speciesId = input.required<number>();
  readonly name = input('');
  readonly shiny = input(false);

  protected readonly src = linkedSignal(() =>
    this.shiny()
      ? `images/pokemon/shiny/${this.speciesId()}.png`
      : `images/pokemon/${this.speciesId()}.png`,
  );

  protected onError(): void {
    const normal = `images/pokemon/${this.speciesId()}.png`;
    if (this.src().includes('/shiny/')) this.src.set(normal);
    else if (this.src() !== FALLBACK) this.src.set(FALLBACK);
  }
}
