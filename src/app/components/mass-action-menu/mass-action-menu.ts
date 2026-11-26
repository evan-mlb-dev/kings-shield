import { Component, computed, ElementRef, inject, input, output, signal } from '@angular/core';
import { ItemIcon } from '../../shared/icons/item-icon';

export interface MassAction {
  id: string;
  label: string;
  /** Item shown as the icon */
  itemId?: number;
  /** Why the action cannot run (greyed out) */
  blocked?: string;
}

@Component({
  selector: 'app-mass-action-menu',
  imports: [ItemIcon],
  templateUrl: './mass-action-menu.html',
  styleUrl: './mass-action-menu.scss',
  host: {
    '(document:mousedown)': 'onDocumentClick($event)',
  },
})
export class MassActionMenu {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly actions = input.required<readonly MassAction[]>();
  readonly disabled = input(false);
  readonly run = output<string>();

  protected readonly open = signal(false);
  protected readonly activeId = signal<string | null>(null);

  private readonly usable = computed(() => this.actions().filter((a) => !a.blocked));

  protected toggle(): void {
    if (this.disabled()) return;
    if (this.open()) this.close();
    else this.show();
  }

  protected pick(action: MassAction): void {
    if (action.blocked) return;
    this.close();
    this.run.emit(action.id);
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
      const usable = this.usable();
      if (!usable.length) return;
      const index = usable.findIndex((a) => a.id === this.activeId());
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.activeId.set(usable[(index + step + usable.length) % usable.length].id);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && this.open()) {
      event.preventDefault();
      const action = this.usable().find((a) => a.id === this.activeId());
      if (action) this.pick(action);
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  private show(): void {
    this.open.set(true);
    this.activeId.set(this.usable()[0]?.id ?? null);
  }

  private close(): void {
    this.open.set(false);
  }
}
