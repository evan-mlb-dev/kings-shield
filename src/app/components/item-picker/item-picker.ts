import { Component, computed, ElementRef, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { ItemIcon } from '../../shared/icons/item-icon';

const POPULAR_ITEMS = [
  'Leftovers',
  'Heavy-Duty Boots',
  'Choice Scarf',
  'Choice Band',
  'Choice Specs',
  'Life Orb',
  'Focus Sash',
  'Assault Vest',
  'Rocky Helmet',
  'Eviolite',
  'Booster Energy',
  'Sitrus Berry',
  'Lum Berry',
  'Black Sludge',
  'Expert Belt',
  'Light Clay',
  'Weakness Policy',
  'Air Balloon',
  'Covert Cloak',
  'Loaded Dice',
  'Clear Amulet',
  'Safety Goggles',
  'Protective Pads',
  'Utility Umbrella',
  'Punching Glove',
  'Mental Herb',
  'White Herb',
  'Power Herb',
  'Mirror Herb',
  'Red Card',
  'Eject Button',
  'Eject Pack',
  'Throat Spray',
  'Blunder Policy',
  'Room Service',
  'Flame Orb',
  'Toxic Orb',
  'Wide Lens',
  'Scope Lens',
  'Razor Claw',
  'Muscle Band',
  'Wise Glasses',
  'Shell Bell',
  'Quick Claw',
  "King's Rock",
  'Metronome',
  'Big Root',
  'Terrain Extender',
  'Heat Rock',
  'Damp Rock',
  'Smooth Rock',
  'Icy Rock',
  'Adrenaline Orb',
  'Ability Shield',
];

interface ItemOption {
  id: number;
  name: string;
}

@Component({
  selector: 'app-item-picker',
  imports: [ItemIcon, NgTemplateOutlet],
  templateUrl: './item-picker.html',
  styleUrl: './item-picker.scss',
  host: {
    '(document:mousedown)': 'onDocumentClick($event)',
  },
})
export class ItemPicker {
  private readonly db = inject(PokemonDb);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Item IDs of the Items pocket, and of the Berries pocket */
  readonly items = input<readonly number[]>([]);
  readonly berries = input<readonly number[]>([]);
  readonly held = input(0);
  readonly value = input.required<number>();
  readonly disabled = input(false);
  readonly valueChange = output<number>();

  protected readonly open = signal(false);
  /** Option under the keyboard cursor while open */
  protected readonly activeId = signal<number | null>(null);

  private option(id: number): ItemOption {
    return { id, name: id ? (this.db.items.get(id)?.name ?? `#${id}`) : 'None' };
  }

  private byName(ids: Iterable<number>): ItemOption[] {
    return [...new Set(ids)]
      .map((id) => this.option(id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  protected readonly groups = computed(() => {
    const inBag = [...this.items(), ...this.berries()];
    const popular = [...new Set(inBag)]
      .map((id) => this.option(id))
      .filter((o) => POPULAR_ITEMS.includes(o.name))
      .sort((a, b) => POPULAR_ITEMS.indexOf(a.name) - POPULAR_ITEMS.indexOf(b.name));
    const taken = new Set(popular.map((o) => o.id));
    const held = this.held();
    return [
      { label: '', options: [this.option(0)] },
      { label: 'Held now', options: held && !inBag.includes(held) ? [this.option(held)] : [] },
      { label: 'Popular', options: popular },
      { label: 'Items', options: this.byName(this.items().filter((id) => !taken.has(id))) },
      { label: 'Berries', options: this.byName(this.berries().filter((id) => !taken.has(id))) },
    ].filter((g) => g.options.length);
  });

  /** Every option in display order, for keyboard moves */
  private readonly ordered = computed(() => this.groups().flatMap((g) => g.options));

  protected readonly selected = computed(() => this.option(this.value()));

  protected toggle(): void {
    if (this.disabled()) return;
    if (this.open()) this.close();
    else this.show();
  }

  protected pick(option: ItemOption): void {
    if (option.id !== this.value()) this.valueChange.emit(option.id);
    this.close();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.open()) event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) {
        this.show();
        return;
      }
      const ordered = this.ordered();
      const index = ordered.findIndex((o) => o.id === this.activeId());
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = ordered[(index + step + ordered.length) % ordered.length];
      this.activeId.set(next.id);
      this.scrollTo(next.id);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && this.open()) {
      event.preventDefault();
      const option = this.ordered().find((o) => o.id === this.activeId());
      if (option) this.pick(option);
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private show(): void {
    this.activeId.set(this.value());
    this.open.set(true);
    setTimeout(() => this.scrollTo(this.value()));
  }

  private close(): void {
    this.open.set(false);
  }

  private scrollTo(id: number): void {
    this.host.nativeElement
      .querySelector(`[data-item="${id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }
}
