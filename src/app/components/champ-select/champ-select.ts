import { Component, computed, inject } from '@angular/core';
import { EndRun } from '../end-run/end-run';
import { GameStateService, MAX_TEAM_SIZE } from '../../states/game-state';
import { SoulLinkService } from '../../states/soul-link';

@Component({
  selector: 'app-champ-select',
  imports: [EndRun],
  templateUrl: './champ-select.html',
  styleUrl: './champ-select.scss',
})
export class ChampSelect {
  protected readonly soulLink = inject(SoulLinkService);
  private readonly gameState = inject(GameStateService);

  protected readonly myName = computed(() => this.gameState.pkmnData()?.trainerName || 'You');
  protected readonly maxTeamSize = MAX_TEAM_SIZE;

  protected readonly partnerName = computed(
    () => this.soulLink.partnerSave()?.trainerName || 'Your partner',
  );

  protected readonly done = computed(
    () => !!this.soulLink.draft() && this.soulLink.pickablePairs().length === 0,
  );
}
