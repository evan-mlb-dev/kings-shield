import { Component, computed, input } from '@angular/core';
import { Pokemon } from '../../services/pokemon.models';
import { ItemIcon } from '../../shared/icons/item-icon';
import { MoveCategoryIcon } from '../../shared/icons/move-category-icon';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { TypeIcon } from '../../shared/icons/type-icon';
import { typeColor } from '../../shared/type-colors';

/** A Pokémon knows at most 4 moves */
const MAX_MOVES = 4;

@Component({
  imports: [TypeIcon, ItemIcon, MoveCategoryIcon, PokemonSprite],
  selector: 'app-pokemon-card',
  styleUrl: './pokemon-card.scss',
  templateUrl: './pokemon-card.html',
  host: {
    '[class.mini]': "variant() === 'mini'",
    '[style.--type-1]': 'color1()',
    '[style.--type-2]': 'color2()',
    '[style.--idle-delay]': 'idleDelay()',
  },
})
export class PokemonCard {
  readonly pokemon = input<Pokemon | null>(null);
  readonly variant = input<'full' | 'mini'>('full');

  protected readonly color1 = computed(() => typeColor(this.pokemon()?.types[0]?.name));
  protected readonly color2 = computed(() =>
    typeColor(this.pokemon()?.types[1]?.name ?? this.pokemon()?.types[0]?.name),
  );
  protected readonly typeColor = typeColor;

  protected readonly idleDelay = computed(
    () => `${-(((this.pokemon()?.speciesId ?? 0) * 0.37) % 2.4)}s`,
  );

  protected readonly emptyMoveRows = computed(() =>
    Array.from(
      { length: Math.max(0, MAX_MOVES - (this.pokemon()?.moves.length ?? 0)) },
      (_, i) => i,
    ),
  );
}
