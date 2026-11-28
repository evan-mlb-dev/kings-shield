import { Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon, PokemonType } from '../../services/pokemon.models';
import { scoreLabel, teamScores } from '../../shared/coverage-score';
import { TYPE_ORDER } from '../../shared/type-order';
import { ParsedPokemon } from '../../services/save-file-parser';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { GameStateService, MAX_TEAM_SIZE, pokemonKey } from '../../states/game-state';
import { PcFiltersState } from '../../states/pc-filters';
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
  fainted: boolean;
}

@Component({
  selector: 'app-partner-pc',
  imports: [PokemonCard, PokemonSprite, RouterLink, PcFilters, PcSearch, PcBadges, PcScore],
  templateUrl: './partner-pc.html',
  styleUrl: './partner-pc.scss',
})
export class PartnerPc {
  private readonly db = inject(PokemonDb);
  protected readonly soulLink = inject(SoulLinkService);
  private readonly gameState = inject(GameStateService);
  private readonly pcFilters = inject(PcFiltersState);

  protected readonly collapsed = this.pcFilters.partnerPcCollapsed;

  protected toggle(): void {
    this.pcFilters.togglePartnerPc();
  }

  protected readonly partnerName = computed(
    () => this.soulLink.partnerSave()?.trainerName || 'Your partner',
  );

  protected readonly team = computed<(Entry | null)[]>(() => {
    const team = this.soulLink.partnerTeamMons();
    return Array.from({ length: MAX_TEAM_SIZE }, (_, i) =>
      team[i] ? this.toEntry(team[i]) : null,
    );
  });

  private readonly types: PokemonType[] = TYPE_ORDER.map((name) => this.db.types.get(name)).filter(
    (t): t is PokemonType => !!t,
  );

  protected readonly scores = computed(() => {
    const members = this.team()
      .filter((e): e is Entry => !!e)
      .map((e) => e.mon);
    const pair = this.soulLink.previewPair();
    const withPreview = pair ? [...members, Pokemon.fromParsed(pair.theirs, this.db)] : members;
    if (withPreview.length === 0) return [];
    const base = teamScores(members, this.types);
    const { defense, offense } = teamScores(withPreview, this.types);
    return [
      { label: 'Defense', value: defense, delta: pair ? defense - base.defense : null },
      { label: 'Offense', value: offense, delta: pair ? offense - base.offense : null },
    ].map((s) => ({ ...s, grade: scoreLabel(s.value) }));
  });

  protected scoreHue(value: number): number {
    return Math.round(Math.min(1, Math.max(0, (value - 20) / 75)) * 180);
  }

  /** Partner's Pokémon outside their team; the dead ones are not shown */
  protected readonly pc = computed<Entry[]>(() => {
    const inTeam = new Set(this.soulLink.partnerTeam().teamKeys);
    return (this.soulLink.partnerSave()?.mons ?? [])
      .filter((p) => !p.isEgg && !inTeam.has(pokemonKey(p)))
      .map((p) => this.toEntry(p))
      .filter((e) => !e.fainted);
  });

  /** Same filters as my PC, with their own state */
  protected readonly filter = new PcFilter(this.db, () => this.pc());

  protected readonly availableMons = computed(() =>
    this.pc()
      .filter((e) => !e.fainted)
      .map((e) => e.mon),
  );

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

  private readonly revealHighlight = effect(() => {
    const key = this.soulLink.highlightedTheirs();
    const grid = this.grid()?.nativeElement;
    if (!key || !grid) return;
    const slot = grid.querySelector<HTMLElement>(`[data-key="${key}"]`);
    if (!slot) return;
    // The grid is positioned: offsetTop is relative to it
    const top = slot.offsetTop;
    if (top < grid.scrollTop || top + slot.offsetHeight > grid.scrollTop + grid.clientHeight) {
      grid.scrollTo({
        top: top - grid.clientHeight / 2 + slot.offsetHeight / 2,
        behavior: 'smooth',
      });
    }
  });

  protected slotTitle(entry: Entry): string {
    if (this.soulLink.draft()?.myTurn && this.soulLink.pickableTheirs().has(entry.key)) {
      return 'Double-click to pick this pair';
    }
    const death = entry.fainted ? this.soulLink.deathOf('theirs', entry.key) : null;
    if (!death) return '';
    return death.blame === 'mine'
      ? `Fainted because of ${this.gameState.playerName()}`
      : `Fainted because of ${this.partnerName()}`;
  }

  protected pick(entry: Entry): void {
    if (this.soulLink.draft()?.myTurn) this.soulLink.pickTheirs(entry.parsed);
  }

  private toEntry(parsed: ParsedPokemon): Entry {
    const key = pokemonKey(parsed);
    return {
      key,
      parsed,
      mon: Pokemon.fromParsed(parsed, this.db),
      fainted: this.soulLink.partnerFaintedKeys().has(key),
    };
  }
}
