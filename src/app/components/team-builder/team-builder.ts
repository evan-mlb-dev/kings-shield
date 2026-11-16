import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDragSortEvent,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
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
/** Drop list id of the reserve, under the PC */
const RESERVE_LIST_ID = 'reserve-list';

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
  /** Every PC Pokémon (neither in the team nor fainted) */
  private readonly allPc = computed<Entry[]>(() => this.gameState.pc().map((p) => this.toEntry(p)));

  protected readonly reserveListId = RESERVE_LIST_ID;
  protected readonly reserve = computed<Entry[]>(() => {
    const byKey = new Map(this.allPc().map((e) => [e.key, e]));
    return this.pcFilters
      .reserve()
      .map((key) => byKey.get(key))
      .filter((e): e is Entry => !!e);
  });

  /** The PC itself: everyone but the reserve */
  private readonly pc = computed<Entry[]>(() => {
    const reserved = new Set(this.pcFilters.reserve());
    return this.allPc().filter((e) => !reserved.has(e.key));
  });

  protected readonly availableMons = computed(() => this.pc().map((e) => e.mon));

  protected readonly slots = computed<(Entry | null)[]>(() =>
    Array.from({ length: MAX_TEAM_SIZE }, (_, i) => this.team()[i] ?? null),
  );

  protected readonly pcCollapsed = this.pcFilters.pcCollapsed;

  protected togglePc(): void {
    this.pcFilters.togglePc();
  }

  private readonly pcPanel = viewChild<ElementRef<HTMLElement>>('pcPanel');

  private readonly pcGrid = viewChild<ElementRef<HTMLElement>>('pcGrid');
  /** Layout position of every tile (offsets: not affected by running animations) */
  private pcLayout = new Map<HTMLElement, { x: number; y: number }>();

  private readPcLayout(): Map<HTMLElement, { x: number; y: number }> {
    const grid = this.pcGrid()?.nativeElement;
    const layout = new Map<HTMLElement, { x: number; y: number }>();
    for (const el of grid?.children ?? []) {
      // Hidden tiles (the one being dragged) have no layout
      if (el instanceof HTMLElement && el.offsetParent) {
        layout.set(el, { x: el.offsetLeft, y: el.offsetTop });
      }
    }
    return layout;
  }

  private pointer = { x: 0, y: 0 };
  private lastSort = { time: 0, from: -1, x: 0, y: 0 };
  private static readonly SORT_PAUSE_MS = 220;
  private static readonly BACK_DISTANCE_PX = 28;

  private readonly trackPointer = (event: PointerEvent) =>
    (this.pointer = { x: event.clientX, y: event.clientY });

  constructor() {
    document.addEventListener('pointermove', this.trackPointer, { passive: true });
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener('pointermove', this.trackPointer),
    );
  }

  protected readonly pcSortPredicate = (index: number): boolean => {
    const last = this.lastSort;
    if (performance.now() - last.time < TeamBuilder.SORT_PAUSE_MS) return false;
    const moved = Math.hypot(this.pointer.x - last.x, this.pointer.y - last.y);
    return index !== last.from || moved >= TeamBuilder.BACK_DISTANCE_PX;
  };

  protected onPcSorted(event: CdkDragSortEvent): void {
    this.lastSort = {
      time: performance.now(),
      from: event.previousIndex,
      x: this.pointer.x,
      y: this.pointer.y,
    };
    this.animatePcReflow();
  }

  protected capturePcLayout(): void {
    // After the CDK inserted its placeholder
    requestAnimationFrame(() => (this.pcLayout = this.readPcLayout()));
  }

  protected animatePcReflow(): void {
    const next = this.readPcLayout();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const [el, position] of next) {
        const previous = this.pcLayout.get(el);
        if (!previous) continue;
        const dx = previous.x - position.x;
        const dy = previous.y - position.y;
        if (!dx && !dy) continue;
        el.getAnimations().forEach((animation) => animation.cancel());
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
          duration: 180,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        });
      }
    }
    this.pcLayout = next;
  }

  private readonly revealPc = effect(() => {
    if (this.pcFilters.revealRequest() === 0) return;
    // After the PC is unfolded and rendered
    queueMicrotask(() =>
      this.pcPanel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  });

  protected readonly filter = new PcFilter(
    this.db,
    () => this.allPc(),
    this.pcFilters.effectiveAgainst,
    this.pcFilters.pcOrder,
  );
  protected readonly visiblePc = computed(() => {
    const reserved = new Set(this.pcFilters.reserve());
    return this.filter.visible().filter((e) => !reserved.has(e.key));
  });

  protected readonly visibleReserve = computed(() => {
    const order = this.pcFilters.reserve();
    const rank = new Map(order.map((key, i) => [key, i]));
    const list = this.filter.visible().filter((e) => rank.has(e.key));
    return this.filter.canReorder()
      ? [...list].sort((a, b) => rank.get(a.key)! - rank.get(b.key)!)
      : list;
  });

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
      this.pcFilters.removeFromReserve(event.item.data.key);
    }
  }

  protected dropOnPc(event: CdkDragDrop<Entry[], DropData, Entry>): void {
    if (event.previousContainer === event.container) {
      const target = event.container.data[event.currentIndex];
      if (target && event.previousIndex !== event.currentIndex) {
        this.filter.reorder(event.item.data.key, target.key);
      }
      return;
    }
    if (event.previousContainer.id === RESERVE_LIST_ID) {
      this.pcFilters.removeFromReserve(event.item.data.key);
    } else if (event.previousContainer.id === FAINTED_LIST_ID) {
      this.soulLink.revive(event.item.data.parsed);
    } else {
      this.gameState.removeFromTeam(event.item.data.parsed);
    }
  }

  protected dropOnReserve(event: CdkDragDrop<Entry[], DropData, Entry>): void {
    const entry = event.item.data;
    const fromTeam = typeof event.previousContainer.data === 'number';
    if (!event.isPointerOverContainer) {
      if (fromTeam) this.gameState.removeFromTeam(entry.parsed);
      return;
    }
    if (fromTeam) this.gameState.removeFromTeam(entry.parsed);
    if (event.previousContainer.id === FAINTED_LIST_ID) this.soulLink.revive(entry.parsed);
    const target = event.container.data[event.currentIndex];
    const keys = this.pcFilters.reserve().filter((k) => k !== entry.key);
    const index = target && target.key !== entry.key ? keys.indexOf(target.key) : -1;
    this.pcFilters.addToReserve(entry.key, index >= 0 ? index : keys.length);
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
        ? `Fainted because of ${this.gameState.playerName()}. `
        : `Fainted because of ${this.soulLink.partnerSave()?.trainerName || 'your partner'}. `;
    return cause + 'Double-click to send back to the PC';
  }

  protected add(entry: Entry): void {
    if (this.drafting()) {
      if (this.soulLink.draft()?.myTurn) this.soulLink.pickMine(entry.parsed);
      return;
    }
    if (!this.gameState.isTeamFull()) {
      this.gameState.addToTeam(entry.parsed);
      this.pcFilters.removeFromReserve(entry.key);
    }
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
