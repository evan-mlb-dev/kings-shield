import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon } from '../../services/pokemon.models';
import { ParsedPokemon } from '../../services/save-file-parser';
import { MoveLearner } from '../../components/move-learner/move-learner';
import { MoveRow } from '../../components/move-row/move-row';
import { NaturePicker } from '../../components/nature-picker/nature-picker';
import { NumberStepper } from '../../components/number-stepper/number-stepper';
import { Evolution, evolutionsOf } from '../../shared/evolutions';
import { LearnableMove, learnableMoves } from '../../shared/learnset';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { TypeIcon } from '../../shared/icons/type-icon';
import { pokemonKey } from '../../states/game-state';
import { LevelCapState } from '../../states/level-cap';
import { SaveEditorSession } from '../../states/save-editor-session';

/** A Pokémon of the working copy, as listed */
interface Entry {
  key: string;
  parsed: ParsedPokemon;
  mon: Pokemon;
  /** "Team" or "PC" (list group) */
  place: string;
  /** Where it is in the PC: "Box 3, slot 12" */
  position: string;
}

@Component({
  selector: 'app-save-editor-page',
  imports: [PokemonSprite, TypeIcon, NumberStepper, NaturePicker, MoveLearner, MoveRow],
  templateUrl: './save-editor.html',
  styleUrl: './save-editor.scss',
})
export class SaveEditorPage {
  private readonly db = inject(PokemonDb);
  protected readonly session = inject(SaveEditorSession);

  protected readonly search = signal('');

  private readonly levelCapState = inject(LevelCapState);
  protected readonly levelCap = this.levelCapState.cap;

  protected readonly offCap = computed(
    () =>
      this.entries().filter((e) => {
        const action = this.session.levelCapAction(e.parsed, this.levelCap());
        return action === 'raise' || action === 'lower';
      }).length,
  );

  protected setLevelCap(value: number): void {
    this.levelCapState.set(value);
  }

  protected applyLevelCap(): void {
    try {
      const cap = this.levelCap();
      const { raised, lowered, skipped } = this.session.applyLevelCap(cap);
      const parts = [
        raised ? `${raised} raised to level ${cap}` : '',
        lowered ? `${lowered} brought back to level ${cap}` : '',
        skipped ? `${skipped} skipped (unknown experience curve)` : '',
      ].filter(Boolean);
      this.message.set({
        kind: 'ok',
        text: parts.length ? `${parts.join(', ')}.` : 'Every Pokémon is already at the cap.',
      });
    } catch (error) {
      this.message.set({ kind: 'error', text: (error as Error).message });
    }
  }
  protected readonly selectedKey = signal<string | null>(null);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  private readonly hideMessage = effect((onCleanup) => {
    const message = this.message();
    if (!message) return;
    const timer = setTimeout(() => this.message.set(null), message.kind === 'error' ? 7000 : 4000);
    onCleanup(() => clearTimeout(timer));
  });

  protected readonly entries = computed<Entry[]>(() => {
    const { team, pc: pcMons } = this.session.editable();
    const toEntry = (parsed: ParsedPokemon, place: string): Entry => ({
      key: pokemonKey(parsed),
      parsed,
      mon: Pokemon.fromParsed(parsed, this.db),
      place,
      position:
        parsed.location === 'party'
          ? `Team, slot ${parsed.slot}`
          : parsed.region === 'extra'
            ? `Extra boxes, slot ${parsed.slot}`
            : `Box ${parsed.box}, slot ${parsed.slot}`,
    });
    const pc = pcMons
      .map((p) => toEntry(p, 'PC · by base stats'))
      .sort((a, b) => b.mon.baseStatTotal - a.mon.baseStatTotal);
    return [...team.map((p) => toEntry(p, 'Team')), ...pc];
  });

  protected readonly visible = computed(() => {
    const query = this.search().trim().toLowerCase();
    if (!query) return this.entries();
    return this.entries().filter(
      (e) =>
        e.mon.nickname.toLowerCase().includes(query) ||
        e.mon.speciesName.toLowerCase().includes(query),
    );
  });

  protected readonly editedKeys = computed(() => new Set(this.session.changes().map((c) => c.key)));

  protected readonly selected = computed(
    () => this.entries().find((e) => e.key === this.selectedKey()) ?? null,
  );

  protected readonly level = linkedSignal(() => this.selected()?.mon.level ?? 1);
  protected readonly nature = linkedSignal(() => this.selected()?.mon.nature?.id ?? 0);
  protected readonly shiny = linkedSignal(() => this.selected()?.mon.isShiny ?? false);

  /** Species to evolve into (null: no evolution) */
  protected readonly evolveTo = linkedSignal<number | null>(() => {
    this.selected();
    return null;
  });

  protected readonly previewSpecies = computed(() => {
    const id = this.evolveTo();
    const species = id === null ? undefined : this.db.species.get(id);
    return species ? { id: id!, name: species.name, types: species.types } : null;
  });

  protected readonly baseStats = computed(() => {
    const entry = this.selected();
    if (!entry) return null;
    const stats = this.db.species.get(this.evolveTo() ?? entry.parsed.speciesId)?.baseStats;
    if (!stats) return null;
    const rows = (
      [
        ['HP', stats.hp],
        ['Atk', stats.atk],
        ['Def', stats.def],
        ['SpA', stats.spa],
        ['SpD', stats.spd],
        ['Spe', stats.spe],
      ] as const
    ).map(([label, value]) => ({
      label,
      value,
      percent: Math.min(100, (value / 180) * 100),
      hue: Math.round(Math.min(1, Math.max(0, (value - 60) / 70)) * 180),
    }));
    return { rows, total: rows.reduce((sum, r) => sum + r.value, 0) };
  });

  protected readonly smogonLink = computed(() => {
    const entry = this.selected();
    if (!entry) return null;
    const id = this.evolveTo() ?? entry.parsed.speciesId;
    const species = this.db.species.get(id);
    return species?.smogonSlug
      ? {
          name: species.name,
          url: `https://www.smogon.com/dex/sv/pokemon/${species.smogonSlug}/national-dex/`,
        }
      : null;
  });

  /** Direct evolutions of the selected Pokémon */
  protected readonly evolutions = computed<Evolution[]>(() => {
    const entry = this.selected();
    return entry ? evolutionsOf(entry.parsed.speciesId, this.db) : [];
  });

  protected isBlockedByCap(evolution: Evolution): boolean {
    return evolution.level !== null && evolution.level > this.levelCap();
  }

  protected isAllowed(evolution: Evolution): boolean {
    return evolution.kind !== 'other' && !this.isBlockedByCap(evolution);
  }

  /** Why an evolution cannot be picked, shown next to it */
  protected blockReason(evolution: Evolution): string {
    if (evolution.kind === 'other') return '(not allowed: do it in the game)';
    return this.isBlockedByCap(evolution) ? '(above the level cap)' : '';
  }

  protected readonly evolvableKeys = computed(
    () =>
      new Set(
        this.entries()
          .filter((e) => evolutionsOf(e.parsed.speciesId, this.db).some((x) => this.isAllowed(x)))
          .map((e) => e.key),
      ),
  );

  protected readonly canEvolve = computed(() => this.evolutions().some((e) => this.isAllowed(e)));

  protected chooseEvolution(value: string): void {
    const evolution = this.evolutions().find((e) => e.speciesId === +value) ?? null;
    if (evolution && !this.isAllowed(evolution)) return;
    this.evolveTo.set(evolution?.speciesId ?? null);
    if (evolution?.level && this.level() < evolution.level) this.level.set(evolution.level);
  }

  protected readonly evolutionProblem = computed(() => {
    const evolution = this.evolutions().find((e) => e.speciesId === this.evolveTo());
    if (evolution?.kind === 'other') return 'This evolution is not allowed: do it in the game.';
    if (!evolution?.level) return null;
    if (this.isBlockedByCap(evolution)) {
      return `Evolves at level ${evolution.level}: above the level cap (${this.levelCap()}).`;
    }
    if (this.level() < evolution.level) return `Evolves at level ${evolution.level}.`;
    return null;
  });

  /** The level field cannot go above the level cap */
  protected readonly maxLevel = computed(() => Math.min(100, this.levelCap()));

  /** The selected Pokémon is already above the level cap */
  protected readonly aboveCap = computed(() => (this.selected()?.mon.level ?? 0) > this.levelCap());

  protected readonly tab = signal<'details' | 'moves'>('details');

  /** Move IDs of the 4 slots (0 = empty) */
  protected readonly moveSlots = linkedSignal(() => {
    const moves = this.selected()?.mon.moves ?? [];
    return [0, 1, 2, 3].map((i) => moves[i]?.id ?? 0);
  });

  /** Moves in the slots (a Pokémon keeps at least one) */
  protected readonly filledSlots = computed(() => this.moveSlots().filter((id) => id > 0).length);

  protected clearSlot(slot: number): void {
    if (this.filledSlots() <= 1) return;
    this.moveSlots.update((slots) => slots.map((id, i) => (i === slot ? 0 : id)));
  }

  protected readonly slotMoves = computed(() =>
    this.moveSlots().map((id) => (id ? (this.db.moves.get(id) ?? null) : null)),
  );

  protected readonly learnables = computed<LearnableMove[]>(() => {
    const entry = this.selected();
    if (!entry) return [];
    const species = this.evolveTo() ?? entry.parsed.speciesId;
    return learnableMoves(species, this.level(), this.session.ownedTms(), this.db);
  });

  protected readonly allowedMoves = computed(
    () =>
      new Set([
        ...(this.selected()?.mon.moves.map((m) => m.id) ?? []),
        ...this.learnables()
          .filter((l) => l.available)
          .map((l) => l.move.id),
      ]),
  );

  /** Changes of the form compared with the selected Pokémon */
  protected readonly formChanges = computed(() => {
    const entry = this.selected();
    if (!entry) return null;
    const mon = entry.mon;
    const moves = this.moveSlots();
    const currentMoves = [0, 1, 2, 3].map((i) => mon.moves[i]?.id ?? 0);
    const movesChanged = moves.some((id, i) => id !== currentMoves[i]);
    return {
      species: this.evolveTo() ?? undefined,
      level: this.level() !== mon.level ? this.level() : undefined,
      nature: this.nature() !== (mon.nature?.id ?? 0) ? this.nature() : undefined,
      shiny: this.shiny() !== mon.isShiny ? this.shiny() : undefined,
      moves: movesChanged ? moves.filter((id) => id > 0) : undefined,
    };
  });

  protected readonly canApply = computed(() => {
    const changes = this.formChanges();
    if (!changes) return false;
    const level = this.level();
    if (!Number.isInteger(level) || level < 1 || level > 100) return false;
    if (changes.level !== undefined && level > this.levelCap()) return false;
    if (this.evolutionProblem()) return false;
    if (changes.moves && changes.moves.length === 0) return false;
    return Object.values(changes).some((v) => v !== undefined);
  });

  protected select(entry: Entry): void {
    this.selectedKey.set(entry.key);
    this.message.set(null);
  }

  protected apply(): void {
    const entry = this.selected();
    const changes = this.formChanges();
    if (!entry || !changes || !this.canApply()) return;
    try {
      this.session.apply(entry.parsed, changes);
      const after = this.session.changes().at(-1)?.key;
      if (after) this.selectedKey.set(after);
      this.message.set({ kind: 'ok', text: `${entry.mon.nickname} updated.` });
    } catch (error) {
      this.message.set({ kind: 'error', text: (error as Error).message });
    }
  }

  protected resetForm(): void {
    const selected = this.selected();
    if (selected && this.editedKeys().has(selected.key)) {
      try {
        const key = this.session.revert(selected.parsed);
        this.selectedKey.set(key);
        this.message.set({ kind: 'ok', text: `${selected.mon.nickname}: changes undone.` });
      } catch (error) {
        this.message.set({ kind: 'error', text: (error as Error).message });
      }
    }
    const entry = this.selected();
    if (!entry) return;
    this.evolveTo.set(null);
    this.level.set(entry.mon.level ?? 1);
    this.nature.set(entry.mon.nature?.id ?? 0);
    this.shiny.set(entry.mon.isShiny);
    this.moveSlots.set([0, 1, 2, 3].map((i) => entry.mon.moves[i]?.id ?? 0));
  }

  protected download(): void {
    try {
      const name = this.session.download();
      this.message.set({
        kind: 'ok',
        text: `${name} downloaded. It is now the site's save too. Keep your original as a backup.`,
      });
    } catch (error) {
      this.message.set({ kind: 'error', text: (error as Error).message });
    }
  }

  protected discard(): void {
    this.session.restart();
    this.message.set(null);
  }
}
