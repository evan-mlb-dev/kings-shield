import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input, model } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import type { MoveCategory } from '../../services/pokemon.models';
import { LearnableMove } from '../../shared/learnset';
import { MoveRow } from '../move-row/move-row';

/** What is dragged: a learnable move, or a move slot */
type MoveDrag = { kind: 'learnable'; moveId: number } | { kind: 'slot'; slot: number };

@Component({
  selector: 'app-move-learner',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, MoveRow],
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

  protected readonly slotMoves = computed(() =>
    this.slots().map((id) => (id ? (this.db.moves.get(id) ?? null) : null)),
  );

  readonly typeFilter = input<string | null>(null);
  readonly categoryFilter = input<MoveCategory | null>(null);

  protected readonly visible = computed(() =>
    this.learnables().filter(
      (l) =>
        (!this.typeFilter() || l.move.type.name === this.typeFilter()) &&
        (!this.categoryFilter() || l.move.category === this.categoryFilter()),
    ),
  );

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

  protected toggleMove(learnable: LearnableMove): void {
    const known = this.slots().indexOf(learnable.move.id);
    if (known >= 0) {
      this.clearSlot(known);
      return;
    }
    if (!learnable.available) return;
    const empty = this.slots().indexOf(0);
    if (empty >= 0) this.placeMove(learnable.move.id, empty);
  }

  protected dropOnLearnables(event: CdkDragDrop<unknown, unknown, MoveDrag>): void {
    const data = event.item.data;
    if (data.kind === 'slot') this.clearSlot(data.slot);
  }

  protected clearSlot(slot: number): void {
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
