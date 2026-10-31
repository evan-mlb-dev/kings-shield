import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { SaveEditError, SaveEditor } from '../services/save-editor';
import { ParsedPokemon, ParsedSave, SaveFileParser } from '../services/save-file-parser';
import { SaveFileWriter } from '../services/save-file-writer';
import { experienceForLevel, levelFromExperience } from '../shared/experience';
import { GameStateService, pokemonKey } from './game-state';
import { SaveBytesState } from './save-bytes';
import { SoulLinkService } from './soul-link';

/** What can be changed on one Pokémon at once */
export interface PokemonEdit {
  /** Evolution (new species) */
  species?: number;
  level?: number;
  nature?: number;
  shiny?: boolean;
  moves?: number[];
}

/** Pending changes of one Pokémon, for the summary */
export interface PendingChange {
  /** Current key (after a nature / shiny change) */
  key: string;
  name: string;
  species: string;
  evolvedFrom?: string;
  /** Only the changed fields are set */
  level?: number;
  nature?: string;
  shiny?: boolean;
  moves?: string[];
}

type ChangedFields = Pick<PendingChange, 'evolvedFrom' | 'level' | 'nature' | 'shiny' | 'moves'>;

@Injectable({
  providedIn: 'root',
})
export class SaveEditorSession {
  private readonly db = inject(PokemonDb);
  private readonly parser = inject(SaveFileParser);
  private readonly saveBytes = inject(SaveBytesState);
  private readonly gameState = inject(GameStateService);
  private readonly soulLink = inject(SoulLinkService);

  private editor: SaveEditor | null = null;
  private renamed = new Map<string, string>();

  /** The working copy, parsed again after every edit */
  readonly save = signal<ParsedSave | null>(null);

  readonly editable = computed<{ team: ParsedPokemon[]; pc: ParsedPokemon[] }>(() => {
    const save = this.save();
    if (!save) return { team: [], pc: [] };
    const fainted = new Set(this.gameState.fainted().map(pokemonKey));
    const keep = (p: ParsedPokemon) => !p.isEgg && !fainted.has(pokemonKey(p));
    return { team: save.team.filter(keep), pc: save.pc.filter(keep) };
  });
  readonly unavailable = signal<string | null>(null);
  private readonly _changes = signal<PendingChange[]>([]);
  readonly changes = this._changes.asReadonly();
  readonly hasChanges = computed(() => this._changes().length > 0);

  constructor() {
    effect(() => {
      this.saveBytes.bytes();
      untracked(() => this.restart());
    });
  }

  /** Drops every pending change: back to the loaded save */
  restart(): void {
    this.editor = null;
    this.renamed = new Map();
    this._changes.set([]);
    this.save.set(null);
    const bytes = this.saveBytes.bytes();
    if (!bytes) {
      this.unavailable.set(
        this.gameState.pkmnData()
          ? 'Load your save file again (Load Save button) to edit it: the site only kept its Pokémon.'
          : 'Load your save file (Load Save button) to edit it.',
      );
      return;
    }
    const opened = SaveFileWriter.open(bytes);
    if (!opened.ok) {
      this.unavailable.set(opened.reason);
      return;
    }
    this.unavailable.set(null);
    this.editor = new SaveEditor(opened.editor, this.db);
    this.reparse();
  }

  apply(mon: ParsedPokemon, edit: PokemonEdit): void {
    const editor = this.editor;
    if (!editor) throw new SaveEditError('No save to edit.');
    const backup = editor.writer.bytes.slice();
    const oldKey = pokemonKey(mon);
    const fields: ChangedFields = {};
    try {
      let current = mon;
      if (edit.species !== undefined && edit.species !== mon.speciesId) {
        current = editor.setSpecies(current, edit.species);
        fields.evolvedFrom = this.db.species.get(mon.speciesId)?.name;
      }
      if (edit.nature !== undefined || edit.shiny !== undefined) {
        const before = current;
        current = editor.setNatureAndShiny(current, { nature: edit.nature, shiny: edit.shiny });
        if (current.personality % 25 !== before.personality % 25) {
          fields.nature = this.db.natures[current.personality % 25]?.name;
        }
        if (current.isShiny !== before.isShiny) fields.shiny = current.isShiny;
      }
      if (edit.level !== undefined) {
        editor.setLevel(current, edit.level);
        fields.level = edit.level;
      }
      if (edit.moves) {
        editor.setMoves(current, edit.moves);
        fields.moves = edit.moves.map((id) => this.db.moves.get(id)?.name ?? `#${id}`);
      }
      if (Object.keys(fields).length === 0) return;

      const newKey = pokemonKey(current);
      if (newKey !== oldKey) this.rename(oldKey, newKey);
      this.recordChange(oldKey, newKey, current, fields);
      this.reparse();
    } catch (error) {
      editor.writer.bytes.set(backup);
      throw error;
    }
  }

  levelCapAction(mon: ParsedPokemon, cap: number): 'raise' | 'lower' | 'unknown' | null {
    const growth = this.db.species.get(mon.speciesId)?.growthRate;
    if (!growth) return 'unknown';
    const level = mon.level ?? levelFromExperience(growth, mon.experience);
    if (level < cap) return 'raise';
    return mon.experience > experienceForLevel(growth, cap) ? 'lower' : null;
  }

  applyLevelCap(cap: number): { raised: number; lowered: number; skipped: number } {
    const editor = this.editor;
    const { team, pc } = this.editable();
    if (!editor || !this.save()) throw new SaveEditError('No save to edit.');
    const level = Math.max(1, Math.min(100, Math.round(cap)));
    const backup = editor.writer.bytes.slice();
    const changesBackup = this._changes();
    const count = { raised: 0, lowered: 0, skipped: 0 };
    try {
      for (const mon of [...team, ...pc]) {
        const action = this.levelCapAction(mon, level);
        if (action === 'unknown') count.skipped++;
        if (action !== 'raise' && action !== 'lower') continue;
        editor.setLevel(mon, level);
        const key = pokemonKey(mon);
        this.recordChange(key, key, mon, { level });
        count[action === 'raise' ? 'raised' : 'lowered']++;
      }
    } catch (error) {
      editor.writer.bytes.set(backup);
      this._changes.set(changesBackup);
      this.reparse();
      throw error;
    }
    this.reparse();
    return count;
  }

  download(): string {
    const editor = this.editor;
    if (!editor || !this.hasChanges()) throw new SaveEditError('Nothing to download.');
    const bytes = editor.writer.toBytes();
    const name = editedFileName(this.gameState.saveName());

    const url = URL.createObjectURL(
      new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    // The edited save becomes the site's save
    const parsed = this.parser.parseSaveFile(bytes.slice().buffer);
    const renamed = this.renamed;
    if (parsed) {
      this.gameState.replaceSaveData(parsed, renamed);
      this.soulLink.renameMine(renamed);
      this.gameState.setSaveName(name);
    }
    this.saveBytes.set(bytes);
    return name;
  }

  private reparse(): void {
    const editor = this.editor;
    this.save.set(editor ? this.parser.parseSaveFile(editor.writer.bytes.slice().buffer) : null);
  }

  private rename(oldKey: string, newKey: string): void {
    // Chains: original -> a -> b becomes original -> b
    const original = [...this.renamed].find(([, current]) => current === oldKey)?.[0] ?? oldKey;
    this.renamed.set(original, newKey);
  }

  private recordChange(
    oldKey: string,
    newKey: string,
    mon: ParsedPokemon,
    fields: ChangedFields,
  ): void {
    const species = this.db.species.get(mon.speciesId)?.name ?? `#${mon.speciesId}`;
    this._changes.update((changes) => {
      const previous = changes.find((c) => c.key === oldKey);
      // Evolving twice: keep the first species
      const evolvedFrom = previous?.evolvedFrom ?? fields.evolvedFrom;
      return [
        ...changes.filter((c) => c.key !== oldKey),
        {
          ...previous,
          ...fields,
          evolvedFrom,
          key: newKey,
          name: mon.nickname || species,
          species,
        },
      ];
    });
  }
}

function editedFileName(saveName: string | null): string {
  const base = (saveName ?? 'radical-red.sav').replace(/\.sav$/i, '').replace(/-edited$/, '');
  return `${base}-edited.sav`;
}
