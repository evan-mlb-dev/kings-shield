import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon, PokemonType } from '../../services/pokemon.models';
import { scoreLabel, teamScores } from '../../shared/coverage-score';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { TypeIcon } from '../../shared/icons/type-icon';
import { TYPE_ORDER } from '../../shared/type-order';
import { GameStateService, pokemonKey } from '../../states/game-state';
import { SavedTeam, SavedTeamsState } from '../../states/saved-teams';

/** A saved team as displayed: resolved members and scores */
interface HistoryEntry {
  team: SavedTeam;
  members: { key: string; mon: Pokemon }[];
  scores: { label: string; value: number; grade: string }[];
}

@Component({
  selector: 'app-history-page',
  imports: [DatePipe, PokemonSprite, TypeIcon],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class HistoryPage {
  private db = inject(PokemonDb);
  private gameState = inject(GameStateService);
  private savedTeams = inject(SavedTeamsState);
  private router = inject(Router);

  private readonly types: PokemonType[] = TYPE_ORDER.map((name) => this.db.types.get(name)).filter(
    (t): t is PokemonType => !!t,
  );

  protected readonly entries = computed<HistoryEntry[]>(() =>
    this.savedTeams.teams().map((team) => {
      const members = team.members.map((p) => ({
        key: pokemonKey(p),
        mon: Pokemon.fromParsed(p, this.db),
      }));
      const { defense, offense } = teamScores(
        members.map((m) => m.mon),
        this.types,
      );
      return {
        team,
        members,
        scores: [
          { label: 'Defense', value: defense, grade: scoreLabel(defense) },
          { label: 'Offense', value: offense, grade: scoreLabel(offense) },
        ],
      };
    }),
  );

  /** Team being renamed, and its draft name */
  protected readonly renamingId = signal<string | null>(null);
  protected readonly draftName = signal('');
  protected readonly confirmDeleteId = signal<string | null>(null);

  protected load(team: SavedTeam): void {
    this.gameState.setTeam(team.members);
    this.router.navigate(['/team-building']);
  }

  protected startRename(team: SavedTeam): void {
    this.draftName.set(team.name);
    this.renamingId.set(team.id);
  }

  protected confirmRename(team: SavedTeam): void {
    this.savedTeams.rename(team.id, this.draftName());
    this.renamingId.set(null);
  }

  protected delete(team: SavedTeam): void {
    if (this.confirmDeleteId() === team.id) {
      this.savedTeams.remove(team.id);
      this.confirmDeleteId.set(null);
    } else {
      this.confirmDeleteId.set(team.id);
    }
  }

  protected scoreHue(value: number): number {
    return Math.round(Math.min(1, Math.max(0, (value - 20) / 75)) * 180);
  }
}
