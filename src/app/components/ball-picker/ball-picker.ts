import {
  booleanAttribute,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { BALLS } from '../../shared/balls';
import { ItemIcon } from '../../shared/icons/item-icon';

/** Lowercase, no accents ("Poké Ball" -> "poke ball") */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

interface BallOption {
  ball: number;
  name: string;
  /** Item of the ball, for its icon (0: none found) */
  itemId: number;
}

/** Ball a Pokémon was caught in: same dropdown as the item picker */
@Component({
  selector: 'app-ball-picker',
  imports: [ItemIcon, NgTemplateOutlet],
  templateUrl: './ball-picker.html',
  styleUrls: ['../item-picker/item-picker.scss', './ball-picker.scss'],
  host: {
    '(document:mousedown)': 'onDocumentClick($event)',
    '[class.compact]': 'compact()',
  },
})
export class BallPicker {
  private readonly db = inject(PokemonDb);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** null: the ball is not known (save cached before balls were read) */
  readonly value = input.required<number | null>();
  readonly disabled = input(false);
  /** Icon only, no label: next to the Pokémon's name */
  readonly compact = input(false, { transform: booleanAttribute });
  readonly valueChange = output<number>();

  protected readonly open = signal(false);
  protected readonly activeBall = signal<number | null>(null);
  protected readonly query = signal('');

  /** Every ball, with the item of the loaded game for its icon */
  private readonly options = computed<BallOption[]>(() => {
    this.db.game();
    const items = new Map([...this.db.items.values()].map((i) => [normalize(i.name), i.id]));
    return BALLS.map((name, ball) => ({ ball, name, itemId: items.get(normalize(name)) ?? 0 }));
  });

  protected readonly visible = computed(() => {
    const query = normalize(this.query());
    return query ? this.options().filter((o) => normalize(o.name).includes(query)) : this.options();
  });

  protected readonly selected = computed(() => {
    const value = this.value();
    return value === null ? null : (this.options()[value] ?? null);
  });

  protected toggle(): void {
    if (this.disabled() || this.value() === null) return;
    if (this.open()) this.close();
    else this.show();
  }

  protected pick(option: BallOption): void {
    if (option.ball !== this.value()) this.valueChange.emit(option.ball);
    this.close();
  }

  protected search(text: string): void {
    this.query.set(text);
    const first = this.visible()[0];
    this.activeBall.set(first?.ball ?? null);
    if (first) this.scrollTo(first.ball);
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
      const visible = this.visible();
      if (!visible.length) return;
      const index = visible.findIndex((o) => o.ball === this.activeBall());
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = visible[(index + step + visible.length) % visible.length];
      this.activeBall.set(next.ball);
      this.scrollTo(next.ball);
      return;
    }
    const inSearch = event.target instanceof HTMLInputElement;
    if ((event.key === 'Enter' || (event.key === ' ' && !inSearch)) && this.open()) {
      event.preventDefault();
      const option = this.visible().find((o) => o.ball === this.activeBall());
      if (option) this.pick(option);
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private show(query = ''): void {
    if (this.disabled() || this.value() === null) return;
    this.open.set(true);
    this.query.set('');
    this.activeBall.set(this.value());
    if (query) this.search(query);
    // Focus the search box, so typing filters right away
    setTimeout(() => {
      this.host.nativeElement.querySelector<HTMLInputElement>('.search')?.focus();
      this.scrollTo(this.activeBall() ?? this.value() ?? 0);
    });
  }

  private close(): void {
    if (!this.open()) return;
    const hadFocus = this.host.nativeElement.contains(document.activeElement);
    this.open.set(false);
    this.query.set('');
    if (hadFocus) this.host.nativeElement.querySelector<HTMLButtonElement>('.trigger')?.focus();
  }

  private scrollTo(ball: number): void {
    this.host.nativeElement
      .querySelector(`[data-ball="${ball}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }
}
