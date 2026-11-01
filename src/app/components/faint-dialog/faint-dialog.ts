import { Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon } from '../../services/pokemon.models';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { GameStateService } from '../../states/game-state';
import { SoulLinkService } from '../../states/soul-link';

@Component({
  selector: 'app-faint-dialog',
  imports: [PokemonSprite],
  templateUrl: './faint-dialog.html',
  styleUrl: './faint-dialog.scss',
  host: { '(document:keydown.escape)': 'soulLink.cancelFaint()' },
})
export class FaintDialog {
  private readonly db = inject(PokemonDb);
  private readonly gameState = inject(GameStateService);
  protected readonly soulLink = inject(SoulLinkService);

  protected readonly mon = computed(() => {
    const parsed = this.soulLink.pendingFaint();
    return parsed ? Pokemon.fromParsed(parsed, this.db) : null;
  });

  protected readonly partner = computed(() => {
    const parsed = this.soulLink.pendingFaint();
    const linked = parsed ? this.soulLink.partnerOf(parsed) : null;
    return linked ? Pokemon.fromParsed(linked, this.db) : null;
  });

  protected readonly myName = this.gameState.playerName;
  protected readonly partnerName = computed(
    () => this.soulLink.partnerSave()?.trainerName || 'Your partner',
  );

  private readonly firstButton = viewChild<ElementRef<HTMLButtonElement>>('firstButton');

  /** Focus the first answer as soon as the dialog opens */
  private readonly focusOnOpen = effect(() => {
    const button = this.firstButton()?.nativeElement;
    if (button) queueMicrotask(() => button.focus());
  });
}
