import { Component, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon } from '../../services/pokemon.models';
import { ParsedPokemon } from '../../services/save-file-parser';
import { NumberStepper } from '../../components/number-stepper/number-stepper';
import { Evolution, evolutionsOf } from '../../shared/evolutions';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { TypeIcon } from '../../shared/icons/type-icon';
import { pokemonKey } from '../../states/game-state';
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

const LEVEL_CAP_KEY = 'king_shield_level_cap';

function readLevelCap(): number {
  try {
    const value = Number(localStorage.getItem(LEVEL_CAP_KEY));
    return value >= 1 && value <= 100 ? value : 50;
  } catch {
    return 50;
  }
}

const STAT_LABELS: Readonly<Record<string, string>> = {
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

@Component({
  selector: 'app-save-editor-page',
  imports: [PokemonSprite, TypeIcon, NumberStepper],
  templateUrl: './save-editor.html',
  styleUrl: './save-editor.scss',
})
export class SaveEditorPage {
  private readonly db = inject(PokemonDb);
  protected readonly session = inject(SaveEditorSession);

  protected readonly search = signal('');

  /** Level cap of the next fight; remembered between visits */
  protected readonly levelCap = signal(readLevelCap());

  protected readonly offCap = computed(
    () =>
      this.entries().filter((e) => {
        const action = this.session.levelCapAction(e.parsed, this.levelCap());
        return action === 'raise' || action === 'lower';
      }).length,
  );

  protected setLevelCap(value: number): void {
    const cap = Math.max(1, Math.min(100, Math.round(value) || 1));
    this.levelCap.set(cap);
    try {
      localStorage.setItem(LEVEL_CAP_KEY, String(cap));
    } catch {
      // Storage unavailable: only for this visit
    }
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

  /** Direct evolutions of the selected Pokémon */
  protected readonly evolutions = computed<Evolution[]>(() => {
    const entry = this.selected();
    return entry ? evolutionsOf(entry.parsed.speciesId, this.db) : [];
  });

  /** The level field cannot go above the level cap */
  protected readonly maxLevel = computed(() => Math.min(100, this.levelCap()));

  /** The selected Pokémon is already above the level cap */
  protected readonly aboveCap = computed(() => (this.selected()?.mon.level ?? 0) > this.levelCap());
  protected readonly moveNames = linkedSignal(() => {
    const moves = this.selected()?.mon.moves ?? [];
    return [0, 1, 2, 3].map((i) => moves[i]?.name ?? '');
  });

  protected readonly natures = this.db.natures.map((n) => ({
    id: n.id,
    label:
      n.increasedStat && n.decreasedStat && n.increasedStat !== n.decreasedStat
        ? `${n.name} (+${STAT_LABELS[n.increasedStat]} −${STAT_LABELS[n.decreasedStat]})`
        : `${n.name} (neutral)`,
  }));

  private readonly moveIds: ReadonlyMap<string, number> = (() => {
    const counts = new Map<string, number>();
    for (const m of this.db.moves.values()) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
    const ids = new Map<string, number>();
    for (const m of this.db.moves.values()) {
      if (counts.get(m.name) === 1) ids.set(m.name.toLowerCase(), m.id);
    }
    return ids;
  })();

  protected readonly moveOptions = [...this.db.moves.values()]
    .filter((m) => this.moveIds.has(m.name.toLowerCase()))
    .map((m) => m.name)
    .sort((a, b) => a.localeCompare(b));

  private readonly formMoves = computed(() =>
    this.moveNames().map((name) =>
      name.trim() ? (this.moveIds.get(name.trim().toLowerCase()) ?? null) : 0,
    ),
  );

  protected readonly invalidMoves = computed(() => this.formMoves().map((id) => id === null));

  protected readonly hasInvalidMove = computed(() => this.invalidMoves().some((x) => x));

  protected readonly duplicateMoves = computed(() =>
    this.formMoves().map((id, i, all) => !!id && all.indexOf(id) !== i),
  );

  protected readonly hasDuplicateMove = computed(() => this.duplicateMoves().some((x) => x));

  /** Changes of the form compared with the selected Pokémon */
  protected readonly formChanges = computed(() => {
    const entry = this.selected();
    if (!entry) return null;
    const mon = entry.mon;
    const moves = this.formMoves();
    const currentMoves = [0, 1, 2, 3].map((i) => mon.moves[i]?.id ?? 0);
    const movesChanged = moves.some((id, i) => id !== currentMoves[i]);
    return {
      species: this.evolveTo() ?? undefined,
      level: this.level() !== mon.level ? this.level() : undefined,
      nature: this.nature() !== (mon.nature?.id ?? 0) ? this.nature() : undefined,
      shiny: this.shiny() !== mon.isShiny ? this.shiny() : undefined,
      moves: movesChanged ? moves.filter((id): id is number => id !== null && id > 0) : undefined,
    };
  });

  protected readonly canApply = computed(() => {
    const changes = this.formChanges();
    if (!changes) return false;
    const level = this.level();
    if (!Number.isInteger(level) || level < 1 || level > 100) return false;
    if (changes.level !== undefined && level > this.levelCap()) return false;
    if (this.hasInvalidMove() || this.hasDuplicateMove()) return false;
    if (changes.moves && changes.moves.length === 0) return false;
    return Object.values(changes).some((v) => v !== undefined);
  });

  protected select(entry: Entry): void {
    this.selectedKey.set(entry.key);
    this.message.set(null);
  }

  protected setMoveName(index: number, name: string): void {
    this.moveNames.update((names) => names.map((n, i) => (i === index ? name : n)));
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
    const entry = this.selected();
    if (!entry) return;
    this.evolveTo.set(null);
    this.level.set(entry.mon.level ?? 1);
    this.nature.set(entry.mon.nature?.id ?? 0);
    this.shiny.set(entry.mon.isShiny);
    this.moveNames.set([0, 1, 2, 3].map((i) => entry.mon.moves[i]?.name ?? ''));
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
