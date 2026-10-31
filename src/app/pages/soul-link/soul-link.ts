import { Component, computed, inject, signal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon } from '../../services/pokemon.models';
import { ParsedPokemon } from '../../services/save-file-parser';
import { EndRun } from '../../components/end-run/end-run';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { metLocationName } from '../../shared/met-locations';
import { GameStateService, pokemonKey } from '../../states/game-state';
import { SoulLinkPair, SoulLinkService } from '../../states/soul-link';

/** A Pokémon as displayed: raw save data + resolved model */
interface Mon {
  key: string;
  parsed: ParsedPokemon;
  mon: Pokemon;
  location: string;
}

interface PairView {
  pair: SoulLinkPair;
  key: string;
  mine: Mon;
  theirs: Mon;
}

@Component({
  selector: 'app-soul-link-page',
  imports: [PokemonSprite, EndRun],
  templateUrl: './soul-link.html',
  styleUrl: './soul-link.scss',
})
export class SoulLinkPage {
  private readonly db = inject(PokemonDb);
  protected readonly gameState = inject(GameStateService);
  protected readonly soulLink = inject(SoulLinkService);

  protected readonly joinCode = signal('');
  protected readonly copied = signal(false);

  protected readonly partnerName = computed(
    () => this.soulLink.partnerSave()?.trainerName || 'Your partner',
  );

  protected readonly pairs = computed(() => this.soulLink.pairs().map((p) => this.toPairView(p)));

  protected readonly unlinkedMine = computed(() =>
    this.soulLink.unlinkedMine().map((p) => this.toMon(p)),
  );
  protected readonly unlinkedTheirs = computed(() =>
    this.soulLink.unlinkedTheirs().map((p) => this.toMon(p)),
  );

  /** Pokémon picked on each side to be linked by hand */
  protected readonly selectedMine = signal<Mon | null>(null);
  protected readonly selectedTheirs = signal<Mon | null>(null);

  protected isFainted(mon: Mon, side: 'mine' | 'theirs'): boolean {
    return side === 'mine'
      ? this.gameState.isFainted(mon.parsed)
      : this.soulLink.partnerFaintedKeys().has(mon.key);
  }

  protected join(): void {
    void this.soulLink.join(this.joinCode());
  }

  protected async copyCode(): Promise<void> {
    const code = this.soulLink.roomCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard blocked: the code stays visible to copy by hand
    }
  }

  protected selectMine(mon: Mon): void {
    this.selectedMine.update((current) => (current?.key === mon.key ? null : mon));
    this.linkSelected();
  }

  protected selectTheirs(mon: Mon): void {
    this.selectedTheirs.update((current) => (current?.key === mon.key ? null : mon));
    this.linkSelected();
  }

  private linkSelected(): void {
    const mine = this.selectedMine();
    const theirs = this.selectedTheirs();
    if (!mine || !theirs) return;
    this.soulLink.link(mine.parsed, theirs.parsed);
    this.selectedMine.set(null);
    this.selectedTheirs.set(null);
  }

  private toPairView(pair: SoulLinkPair): PairView {
    const mine = this.toMon(pair.mine);
    const theirs = this.toMon(pair.theirs);
    return { pair, key: `${mine.key}|${theirs.key}`, mine, theirs };
  }

  private toMon(parsed: ParsedPokemon): Mon {
    return {
      key: pokemonKey(parsed),
      parsed,
      mon: Pokemon.fromParsed(parsed, this.db),
      location: metLocationName(parsed.metLocation),
    };
  }
}
