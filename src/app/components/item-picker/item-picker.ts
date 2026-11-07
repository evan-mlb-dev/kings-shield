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

/** Lowercase, no accents ("Poké Doll" -> "poke doll") */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

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
  protected readonly query = signal('');

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
    const query = normalize(this.query());
    const matches = (o: ItemOption) => normalize(o.name).includes(query);
    return [
      { label: '', options: [this.option(0)] },
      { label: 'Held now', options: held && !inBag.includes(held) ? [this.option(held)] : [] },
      { label: 'Popular', options: popular },
      { label: 'Items', options: this.byName(this.items().filter((id) => !taken.has(id))) },
      { label: 'Berries', options: this.byName(this.berries().filter((id) => !taken.has(id))) },
    ]
      .map((g) => ({ ...g, options: query ? g.options.filter(matches) : g.options }))
      .filter((g) => g.options.length);
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

  protected search(text: string): void {
    this.query.set(text);
    const first = this.ordered()[0];
    this.activeId.set(first?.id ?? null);
    if (first) this.scrollTo(first.id);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (
      !this.open() &&
      event.key.length === 1 &&
      /\S/.test(event.key) &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      this.show(event.key);
      return;
    }
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
    const inSearch = event.target instanceof HTMLInputElement;
    if ((event.key === 'Enter' || (event.key === ' ' && !inSearch)) && this.open()) {
      event.preventDefault();
      const option = this.ordered().find((o) => o.id === this.activeId());
      if (option) this.pick(option);
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private show(query = ''): void {
    this.open.set(true);
    this.query.set('');
    this.activeId.set(this.value());
    if (query) this.search(query);
    // Focus the search box, so typing filters right away
    setTimeout(() => {
      this.host.nativeElement.querySelector<HTMLInputElement>('.search')?.focus();
      this.scrollTo(this.activeId() ?? this.value());
    });
  }

  private close(): void {
    if (!this.open()) return;
    const hadFocus = this.host.nativeElement.contains(document.activeElement);
    this.open.set(false);
    this.query.set('');
    if (hadFocus) this.host.nativeElement.querySelector<HTMLButtonElement>('.trigger')?.focus();
  }

  private scrollTo(id: number): void {
    this.host.nativeElement
      .querySelector(`[data-item="${id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }
}
