import { Component, computed, input, model } from '@angular/core';
import type { MoveCategory } from '../../services/pokemon.models';
import { MoveCategoryIcon } from '../../shared/icons/move-category-icon';
import { TypeIcon } from '../../shared/icons/type-icon';
import { typeColor } from '../../shared/type-colors';

const CATEGORIES: readonly MoveCategory[] = ['physical', 'special', 'status'];

@Component({
  selector: 'app-move-filters',
  imports: [MoveCategoryIcon, TypeIcon],
  templateUrl: './move-filters.html',
  styleUrl: './move-filters.scss',
})
export class MoveFilters {
  /** Types to offer (those of the learnset) */
  readonly types = input.required<readonly string[]>();
  readonly stab = input<readonly string[]>([]);
  readonly type = model<string | null>(null);
  readonly category = model<MoveCategory | null>(null);

  protected readonly lastStab = computed(() => {
    const types = this.types();
    const count = types.filter((t) => this.stab().includes(t)).length;
    return count > 0 && count < types.length ? types[count - 1] : null;
  });

  protected readonly categories = CATEGORIES;
  protected readonly typeColor = typeColor;

  protected toggleType(type: string): void {
    this.type.update((current) => (current === type ? null : type));
  }

  protected toggleCategory(category: MoveCategory): void {
    this.category.update((current) => (current === category ? null : category));
  }
}
