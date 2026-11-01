import { Component, computed, ElementRef, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PokemonDb } from '../../models/pokemon/pokemon-db';

const POPULAR_NATURES = [
  'Adamant',
  'Modest',
  'Jolly',
  'Timid',
  'Bold',
  'Impish',
  'Calm',
  'Careful',
  'Brave',
  'Quiet',
  'Relaxed',
  'Sassy',
];

const STAT_LABELS: Readonly<Record<string, string>> = {
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

interface NatureOption {
  id: number;
  name: string;
  /** Boosted stat (shown in red), null for a neutral nature */
  up: string | null;
  /** Lowered stat (shown in blue) */
  down: string | null;
}

@Component({
  selector: 'app-nature-picker',
  imports: [NgTemplateOutlet],
  templateUrl: './nature-picker.html',
  styleUrl: './nature-picker.scss',
  host: {
    '(document:mousedown)': 'onDocumentClick($event)',
  },
})
export class NaturePicker {
  private readonly db = inject(PokemonDb);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly value = input.required<number>();
  readonly label = input('Nature');
  readonly valueChange = output<number>();

  protected readonly open = signal(false);
  /** Option under the keyboard cursor while open */
  protected readonly activeId = signal<number | null>(null);

  private readonly options: NatureOption[] = this.db.natures.map((n) => {
    const neutral = !n.increasedStat || n.increasedStat === n.decreasedStat;
    return {
      id: n.id,
      name: n.name,
      up: neutral ? null : STAT_LABELS[n.increasedStat!],
      down: neutral ? null : STAT_LABELS[n.decreasedStat!],
    };
  });

  protected readonly groups = [
    {
      label: 'Popular',
      options: POPULAR_NATURES.map((name) => this.options.find((o) => o.name === name)).filter(
        (o): o is NatureOption => !!o,
      ),
    },
    {
      label: 'Others',
      options: this.options
        .filter((o) => !POPULAR_NATURES.includes(o.name))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
  ];

  /** Every option in display order, for keyboard moves */
  private readonly ordered = this.groups.flatMap((g) => g.options);

  protected readonly selected = computed(
    () => this.options.find((o) => o.id === this.value()) ?? null,
  );

  protected toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  protected pick(option: NatureOption): void {
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
      const index = this.ordered.findIndex((o) => o.id === this.activeId());
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = this.ordered[(index + step + this.ordered.length) % this.ordered.length];
      this.activeId.set(next.id);
      this.scrollTo(next.id);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && this.open()) {
      event.preventDefault();
      const option = this.ordered.find((o) => o.id === this.activeId());
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
      .querySelector(`[data-nature="${id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }
}
