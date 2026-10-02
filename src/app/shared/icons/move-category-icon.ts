import { Component, computed, input } from '@angular/core';
import type { MoveCategory } from '../../services/pokemon.models';

const LABELS: Record<MoveCategory, string> = {
  physical: 'Physical',
  special: 'Special',
  status: 'Status',
};

@Component({
  selector: 'app-move-category-icon',
  template: `<img
    [src]="'images/categories/' + category() + '.png'"
    [alt]="label()"
    [title]="label()"
  />`,
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
export class MoveCategoryIcon {
  readonly category = input.required<MoveCategory>();

  protected readonly label = computed(() => LABELS[this.category()]);
}
