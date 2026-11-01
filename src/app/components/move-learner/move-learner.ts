import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input, model, signal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import type { MoveCategory } from '../../services/pokemon.models';
import { MoveCategoryIcon } from '../../shared/icons/move-category-icon';
import { TypeIcon } from '../../shared/icons/type-icon';
import { LearnableMove } from '../../shared/learnset';
import { typeColor } from '../../shared/type-colors';
import { MoveRow } from '../move-row/move-row';

/** What is dragged: a learnable move, or a move slot */
type MoveDrag = { kind: 'learnable'; moveId: number } | { kind: 'slot'; slot: number };

const CATEGORIES: readonly MoveCategory[] = ['physical', 'special', 'status'];

@Component({
  selector: 'app-move-learner',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, MoveRow, MoveCategoryIcon, TypeIcon],
  templateUrl: './move-learner.html',
  styleUrl: './move-learner.scss',
})
export class MoveLearner {
  private readonly db = inject(PokemonDb);

  /** Move IDs of the 4 slots (0 = empty) */
  readonly slots = model.required<number[]>();
  /** What the species can learn (sorted by power) */
  readonly learnables = input.required<LearnableMove[]>();
  readonly allowed = input.required<ReadonlySet<number>>();
  readonly level = input.required<number>();
  /** The TM case could be read */
  readonly tmsKnown = input(true);

  protected readonly categories = CATEGORIES;
  protected readonly typeColor = typeColor;

  protected readonly slotMoves = computed(() =>
    this.slots().map((id) => (id ? (this.db.moves.get(id) ?? null) : null)),
  );

  protected readonly typeFilter = signal<string | null>(null);
  protected readonly categoryFilter = signal<MoveCategory | null>(null);

  /** Types present in the learnset, in a stable order */
  protected readonly types = computed(() =>
    [...new Set(this.learnables().map((l) => l.move.type.name))].sort(),
  );

  protected readonly visible = computed(() =>
    this.learnables().filter(
      (l) =>
        (!this.typeFilter() || l.move.type.name === this.typeFilter()) &&
        (!this.categoryFilter() || l.move.category === this.categoryFilter()),
    ),
  );

  protected toggleType(type: string): void {
    this.typeFilter.update((current) => (current === type ? null : type));
  }

  protected toggleCategory(category: MoveCategory): void {
    this.categoryFilter.update((current) => (current === category ? null : category));
  }

  protected placeMove(moveId: number, slot: number): void {
    if (!this.allowed().has(moveId)) return;
    this.slots.update((slots) => {
      const next = [...slots];
      const from = next.indexOf(moveId);
      if (from >= 0) next[from] = next[slot];
      next[slot] = moveId;
      return next;
    });
  }

  /** Double-click on a learnable move: first empty slot */
  protected addMove(learnable: LearnableMove): void {
    if (!learnable.available || this.slots().includes(learnable.move.id)) return;
    const empty = this.slots().indexOf(0);
    if (empty >= 0) this.placeMove(learnable.move.id, empty);
  }

  protected dropOnLearnables(event: CdkDragDrop<unknown, unknown, MoveDrag>): void {
    const data = event.item.data;
    if (data.kind === 'slot') this.clearSlot(data.slot);
  }

  protected clearSlot(slot: number): void {
    if (this.slots().filter((id) => id > 0).length <= 1) return;
    this.slots.update((slots) => slots.map((id, i) => (i === slot ? 0 : id)));
  }

  protected dropOnSlot(event: CdkDragDrop<number, unknown, MoveDrag>, slot: number): void {
    const data = event.item.data;
    if (!event.isPointerOverContainer) {
      if (data.kind === 'slot') this.clearSlot(data.slot);
      return;
    }
    if (data.kind === 'learnable') {
      this.placeMove(data.moveId, slot);
    } else if (data.slot !== slot) {
      this.slots.update((slots) => {
        const next = [...slots];
        [next[data.slot], next[slot]] = [next[slot], next[data.slot]];
        return next;
      });
    }
  }
}
