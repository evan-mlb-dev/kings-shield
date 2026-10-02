import { Component, computed, inject } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { Pokemon } from '../../services/pokemon.models';
import { ItemIcon } from '../../shared/icons/item-icon';
import { MoveCategoryIcon } from '../../shared/icons/move-category-icon';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { TypeIcon } from '../../shared/icons/type-icon';
import { GameStateService } from '../../states/game-state';

@Component({
  selector: 'app-team-builder',
  imports: [TypeIcon, ItemIcon, MoveCategoryIcon, PokemonSprite],
  templateUrl: './team-builder.html',
  styleUrl: './team-builder.scss',
})
export class TeamBuilder {
  // services
  private db = inject(PokemonDb);
  // states
  private gameState = inject(GameStateService);

  readonly team = computed<Pokemon[]>(() =>
    this.gameState.team().map((p) => Pokemon.fromParsed(p, this.db)),
  );
  readonly pc = computed<Pokemon[]>(() =>
    this.gameState.pc().map((p) => Pokemon.fromParsed(p, this.db)),
  );
}
