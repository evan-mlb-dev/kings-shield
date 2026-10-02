import { Component, input, linkedSignal } from '@angular/core';

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

  protected readonly src = linkedSignal(() => `images/items/${this.id()}.png`);

  protected onError(): void {
    if (this.src() !== FALLBACK) this.src.set(FALLBACK);
  }
}
