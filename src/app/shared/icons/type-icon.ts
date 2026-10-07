import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-type-icon',
  template: `<img [class]="variant()" [src]="src()" [alt]="name()" [title]="name()" />`,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
    }
    img {
      max-width: none;
      height: var(--type-icon-size, 20px);
    }
    .badge {
      width: auto;
      aspect-ratio: 100 / 28;
    }
    .square {
      width: var(--type-icon-size, 20px);
    }
  `,
})
export class TypeIcon {
  readonly name = input.required<string>();
  readonly variant = input<'badge' | 'square'>('badge');

  protected readonly src = computed(() => {
    const file = this.name() === '???' ? 'unknown' : this.name().toLowerCase();
    const folder = this.variant() === 'square' ? 'images/types/square' : 'images/types';
    return `${folder}/${file}.svg`;
  });
}
