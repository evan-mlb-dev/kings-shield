import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameStateService } from '../../states/game-state';
import { Blame, SoulLinkService } from '../../states/soul-link';

@Component({
  selector: 'app-end-run',
  templateUrl: './end-run.html',
  styleUrl: './end-run.scss',
  host: { '(document:keydown.escape)': 'open.set(false)' },
})
export class EndRun {
  private readonly router = inject(Router);
  private readonly gameState = inject(GameStateService);
  protected readonly soulLink = inject(SoulLinkService);

  protected readonly open = signal(false);

  protected readonly myName = computed(() => this.gameState.pkmnData()?.trainerName || 'You');
  protected readonly partnerName = computed(
    () => this.soulLink.partnerSave()?.trainerName || 'Your partner',
  );

  protected readonly myAlive = computed(() => this.gameState.team().length);
  protected readonly partnerAlive = computed(() => this.soulLink.partnerTeamMons().length);

  protected end(wipedOut: Blame | null): void {
    this.open.set(false);
    this.soulLink.endRun(wipedOut);
    this.router.navigate(['/history']);
  }
}
