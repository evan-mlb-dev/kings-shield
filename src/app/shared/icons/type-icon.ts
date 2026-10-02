import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-type-icon',
  template: `<img [src]="src()" [alt]="name()" [title]="name()" />`,
  styles: `
    :host {
      display: inline-flex;
    }
    img {
      height: 14px;
      image-rendering: pixelated;
    }
  `,
})
export class TypeIcon {
  readonly name = input.required<string>();

  protected readonly src = computed(() => {
    const file = this.name() === '???' ? 'unknown' : this.name().toLowerCase();
    return `images/types/${file}.png`;
  });
}
