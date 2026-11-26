import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { PokemonDb } from '../models/pokemon/pokemon-db';
import { Analytics } from '../services/analytics';
import { AbilityChoice, SaveEditError, SaveEditor } from '../services/save-editor';
import { ParsedPokemon, ParsedSave, SaveFileParser } from '../services/save-file-parser';
import { SaveFileWriter } from '../services/save-file-writer';
import { experienceForLevel, type GrowthRate, levelFromExperience } from '../shared/experience';
import { ownedTmNumbers } from '../shared/learnset';
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
  /** 0 = ability 1, 1 = ability 2, 2 = hidden */
  ability?: AbilityChoice;
  /** Held item ID (0: none) */
  item?: number;
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
  ability?: string;
  /** Held item name ("None" when taken off) */
  item?: string;
  moves?: string[];
}

type ChangedFields = Pick<
  PendingChange,
  'evolvedFrom' | 'level' | 'nature' | 'shiny' | 'ability' | 'item' | 'moves'
>;

@Injectable({
  providedIn: 'root',
})
export class SaveEditorSession {
  private readonly db = inject(PokemonDb);
  private readonly parser = inject(SaveFileParser);
  private readonly saveBytes = inject(SaveBytesState);
  private readonly gameState = inject(GameStateService);
  private readonly soulLink = inject(SoulLinkService);
  private readonly analytics = inject(Analytics);

  private editor: SaveEditor | null = null;
  private original: Uint8Array | null = null;
  private renamed = new Map<string, string>();

  /** The working copy, parsed again after every edit */
  readonly save = signal<ParsedSave | null>(null);

  readonly plannedTeam = computed<ParsedPokemon[] | null>(() => {
    const save = this.save();
    this._changes(); // renamed keys
    const keys = this.gameState.team().map((p) => {
      const key = pokemonKey(p);
      return this.renamed.get(key) ?? key;
    });
    if (!save || !keys.length) return null;
    const byKey = new Map([...save.team, ...save.pc].map((p) => [pokemonKey(p), p]));
    const team = keys.map((k) => byKey.get(k)).filter((p): p is ParsedPokemon => !!p);
    return team.length ? team : null;
  });

  readonly partyChanged = computed(() => {
    const planned = this.plannedTeam();
    const party = this.save()?.team ?? [];
    return (
      !!planned &&
      (planned.length !== party.length ||
        planned.some((p, i) => pokemonKey(p) !== pokemonKey(party[i])))
    );
  });

  /** Move slots as laid out in the editor, by Pokémon key (the save keeps them packed) */
  readonly moveLayouts = signal(new Map<string, number[]>());

  readonly editable = computed<{ team: ParsedPokemon[]; pc: ParsedPokemon[] }>(() => {
    const save = this.save();
    if (!save) return { team: [], pc: [] };
    const fainted = new Set(this.gameState.fainted().map(pokemonKey));
    const keep = (p: ParsedPokemon) => !p.isEgg && !fainted.has(pokemonKey(p));
    const team = this.plannedTeam() ?? save.team;
    const inTeam = new Set(team.map(pokemonKey));
    const pc = [...save.team, ...save.pc].filter((p) => !inTeam.has(pokemonKey(p)));
    return { team: team.filter(keep), pc: pc.filter(keep) };
  });
  readonly ownedTms = computed<ReadonlySet<number> | null>(() => {
    const tmCase = this.save()?.tmCase;
    return tmCase ? ownedTmNumbers(tmCase, this.db) : null;
  });

  readonly abilityItems = computed<{ pill: boolean; patch: boolean } | null>(() => {
    const bag = this.save()?.bagItems;
    if (!bag) return null;
    const names = new Set(bag.map((id) => this.db.items.get(id)?.name));
    return { pill: names.has('Ability Pill'), patch: names.has('Dream Patch') };
  });

  readonly holdableItems = computed<{ items: number[]; berries: number[] } | null>(() => {
    const save = this.save();
    if (!save?.bagItems) return null;
    return { items: save.bagItems, berries: save.bagBerries ?? [] };
  });

  readonly unavailable = signal<string | null>(null);
  private readonly _changes = signal<PendingChange[]>([]);
  readonly changes = this._changes.asReadonly();
  readonly hasChanges = computed(() => this._changes().length > 0 || this.partyChanged());

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
    this.original = bytes.slice();
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
      if (edit.ability !== undefined) {
        const before = current;
        current = editor.setAbility(current, edit.ability);
        if (current !== before) {
          const ids = this.db.species.get(current.speciesId)?.abilityIds ?? [];
          const id = ids[edit.ability === 2 ? 0 : 1 + edit.ability];
          fields.ability = this.db.abilities.get(id)?.name ?? `#${id}`;
        }
      }
      if (edit.item !== undefined && edit.item !== current.heldItem) {
        current = editor.setHeldItem(current, edit.item);
        fields.item = edit.item ? (this.db.items.get(edit.item)?.name ?? `#${edit.item}`) : 'None';
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
    const growth = this.growthRate(mon);
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

  /** Every Pokémon (team and PC) holds the item; returns how many changed */
  giveItemToAll(itemId: number): number {
    const editor = this.editor;
    const { team, pc } = this.editable();
    if (!editor || !this.save()) throw new SaveEditError('No save to edit.');
    const name = this.db.items.get(itemId)?.name ?? `#${itemId}`;
    const backup = editor.writer.bytes.slice();
    const changesBackup = this._changes();
    let changed = 0;
    try {
      for (const mon of [...team, ...pc]) {
        if (mon.heldItem === itemId) continue;
        editor.setHeldItem(mon, itemId);
        const key = pokemonKey(mon);
        this.recordChange(key, key, mon, { item: name });
        changed++;
      }
    } catch (error) {
      editor.writer.bytes.set(backup);
      this._changes.set(changesBackup);
      this.reparse();
      throw error;
    }
    this.reparse();
    return changed;
  }

  revert(mon: ParsedPokemon): string {
    const editor = this.editor;
    const original = this.original;
    if (!editor || !original) throw new SaveEditError('No save to edit.');
    const key = pokemonKey(mon);
    editor.restore(mon, original);
    const originalKey = [...this.renamed].find(([, current]) => current === key)?.[0] ?? key;
    this.renamed.delete(originalKey);
    this._changes.update((changes) => changes.filter((c) => c.key !== key));
    this.reparse();
    return originalKey;
  }

  download(): string {
    const editor = this.editor;
    if (!editor || !this.hasChanges()) throw new SaveEditError('Nothing to download.');
    const bytes = this.withPlannedParty(editor.writer.toBytes());
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
    this.analytics.event('save-downloaded');
    return name;
  }

  private withPlannedParty(bytes: Uint8Array): Uint8Array {
    const team = this.plannedTeam();
    const save = this.save();
    if (!team || !save || !this.partyChanged()) return bytes;
    const opened = SaveFileWriter.open(bytes);
    if (!opened.ok) throw new SaveEditError(opened.reason);
    new SaveEditor(opened.editor, this.db).setParty(team, save);
    return opened.editor.toBytes();
  }

  private reparse(): void {
    const editor = this.editor;
    const save = editor ? this.parser.parseSaveFile(editor.writer.bytes.slice().buffer) : null;
    if (editor) editor.party = save?.team ?? [];
    this.save.set(save);
  }

  growthRate(mon: ParsedPokemon): GrowthRate | null {
    this.save();
    return this.editor?.growthRate(mon) ?? null;
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
