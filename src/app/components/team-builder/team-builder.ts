import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon } from '../../services/pokemon.models';
import { ParsedPokemon } from '../../services/save-file-parser';
import { GameStateService, MAX_TEAM_SIZE, pokemonKey } from '../../states/game-state';
import { PcFiltersState, PcView } from '../../states/pc-filters';
import { SoulLinkService } from '../../states/soul-link';
import { PcFilter } from '../../shared/pc-filter';
import { PcBadges } from '../pc-filters/pc-badges';
import { PcFilters } from '../pc-filters/pc-filters';
import { PcSearch } from '../pc-filters/pc-search';
import { PcScore } from '../pc-score/pc-score';
import { PokemonCard } from '../pokemon-card/pokemon-card';

interface Entry {
  key: string;
  parsed: ParsedPokemon;
  mon: Pokemon;
}

type DropData = number | Entry[];

const FAINTED_LIST_ID = 'fainted-list';
const FAINTED_TAB_ID = 'fainted-tab';

@Component({
  selector: 'app-team-builder',
  imports: [
    PokemonCard,
    PcFilters,
    PcSearch,
    PcBadges,
    PcScore,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
  ],
  templateUrl: './team-builder.html',
  styleUrl: './team-builder.scss',
})
export class TeamBuilder {
  // services
  private db = inject(PokemonDb);
  // states
  protected gameState = inject(GameStateService);
  private pcFilters = inject(PcFiltersState);

  protected readonly maxTeamSize = MAX_TEAM_SIZE;

  protected readonly team = computed<Entry[]>(() =>
    this.gameState.team().map((p) => this.toEntry(p)),
  );
  private readonly pc = computed<Entry[]>(() => this.gameState.pc().map((p) => this.toEntry(p)));

  protected readonly availableMons = computed(() => this.pc().map((e) => e.mon));

  protected readonly slots = computed<(Entry | null)[]>(() =>
    Array.from({ length: MAX_TEAM_SIZE }, (_, i) => this.team()[i] ?? null),
  );

  protected readonly pcCollapsed = this.pcFilters.pcCollapsed;

  protected togglePc(): void {
    this.pcFilters.togglePc();
  }

  private readonly pcPanel = viewChild<ElementRef<HTMLElement>>('pcPanel');

  private readonly revealPc = effect(() => {
    if (this.pcFilters.revealRequest() === 0) return;
    // After the PC is unfolded and rendered
    queueMicrotask(() =>
      this.pcPanel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  });

  /** Search, type / "effective vs" filters and sort of my PC */
  protected readonly filter = new PcFilter(
    this.db,
    () => this.pc(),
    this.pcFilters.effectiveAgainst,
  );
  protected readonly visiblePc = this.filter.visible;

  protected readonly draggingTeamMember = signal(false);

  protected dropOnSlot(event: CdkDragDrop<number, DropData, Entry>): void {
    const target = event.container.data;
    const source = event.previousContainer.data;
    if (event.container === event.previousContainer) {
      if (!event.isPointerOverContainer) this.gameState.removeFromTeam(event.item.data.parsed);
      return;
    }

    if (!event.isPointerOverContainer) {
      if (typeof source === 'number') this.gameState.removeFromTeam(event.item.data.parsed);
      return;
    }

    if (typeof source === 'number') {
      this.gameState.swapInTeam(source, target);
    } else {
      if (event.previousContainer.id === FAINTED_LIST_ID)
        this.soulLink.revive(event.item.data.parsed);
      this.gameState.placeInTeam(event.item.data.parsed, target);
    }
  }

  protected dropOnPc(event: CdkDragDrop<Entry[], DropData, Entry>): void {
    if (event.previousContainer === event.container) return;
    if (event.previousContainer.id === FAINTED_LIST_ID) {
      this.soulLink.revive(event.item.data.parsed);
    } else {
      this.gameState.removeFromTeam(event.item.data.parsed);
    }
  }

  protected readonly faintedListId = FAINTED_LIST_ID;
  protected readonly faintedTabId = FAINTED_TAB_ID;
  protected readonly fainted = computed<Entry[]>(() =>
    this.gameState.fainted().map((p) => this.toEntry(p)),
  );

  /** Tab shown in the PC panel: the PC or the Fainted box */
  protected readonly pcView = this.pcFilters.pcView;

  protected showView(view: PcView): void {
    this.pcFilters.showView(view);
  }

  protected dropOnPcTab(event: CdkDragDrop<Entry[], DropData, Entry>): void {
    if (!event.isPointerOverContainer) {
      if (typeof event.previousContainer.data === 'number') {
        this.gameState.removeFromTeam(event.item.data.parsed);
      }
      return;
    }
    this.dropOnPc(event);
  }

  /** Dropped in the Fainted box (from the team or the PC) */
  protected dropOnFainted(event: CdkDragDrop<Entry[], DropData, Entry>): void {
    if (event.previousContainer === event.container) return;
    if (!event.isPointerOverContainer) {
      if (typeof event.previousContainer.data === 'number') {
        this.gameState.removeFromTeam(event.item.data.parsed);
      }
      return;
    }
    this.soulLink.requestFaint(event.item.data.parsed);
  }

  protected revive(entry: Entry): void {
    this.soulLink.revive(entry.parsed);
  }

  protected faintedTitle(entry: Entry): string {
    const death = this.soulLink.deathOf('mine', entry.key);
    const cause = !death
      ? ''
      : death.blame === 'mine'
        ? 'Fainted because of you. '
        : `Fainted because of ${this.soulLink.partnerSave()?.trainerName || 'your partner'}. `;
    return cause + 'Double-click to send back to the PC';
  }

  protected add(entry: Entry): void {
    if (this.drafting()) {
      if (this.soulLink.draft()?.myTurn) this.soulLink.pickMine(entry.parsed);
      return;
    }
    if (!this.gameState.isTeamFull()) this.gameState.addToTeam(entry.parsed);
  }

  protected remove(entry: Entry): void {
    if (this.drafting()) return;
    this.gameState.removeFromTeam(entry.parsed);
  }

  protected readonly soulLink = inject(SoulLinkService);

  protected readonly drafting = computed(() => this.soulLink.active() && !!this.soulLink.draft());

  protected hoverMine(entry: Entry): void {
    if (this.soulLink.active()) this.soulLink.hover('mine', entry.parsed);
  }

  protected isLocked(entry: Entry): boolean {
    return this.gameState.lockedKeys().has(entry.key);
  }

  protected toggleLock(entry: Entry): void {
    this.gameState.toggleLock(entry.parsed);
  }

  private toEntry(parsed: ParsedPokemon): Entry {
    return { key: pokemonKey(parsed), parsed, mon: Pokemon.fromParsed(parsed, this.db) };
  }
}
