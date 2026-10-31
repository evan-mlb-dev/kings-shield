import { Component, ElementRef, inject, input, OnDestroy, OnInit, output } from '@angular/core';

@Component({
  selector: 'app-number-stepper',
  template: `
    <button
      type="button"
      class="step"
      tabindex="-1"
      [attr.aria-label]="'Decrease ' + label()"
      [disabled]="value() <= min()"
      (click)="change(value() - 1)"
    >
      −
    </button>
    <input
      type="number"
      inputmode="numeric"
      [id]="inputId()"
      [attr.aria-label]="label()"
      [min]="min()"
      [max]="max()"
      [value]="value()"
      (change)="change(+$any($event.target).value, $event)"
      (keydown.enter)="change(+$any($event.target).value, $event)"
    />
    <button
      type="button"
      class="step"
      tabindex="-1"
      [attr.aria-label]="'Increase ' + label()"
      [disabled]="value() >= max()"
      (click)="change(value() + 1)"
    >
      +
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: stretch;
      overflow: hidden;
      background: var(--bg-card);
      border: 1px solid rgb(255 255 255 / 15%);
      border-radius: 8px;
      transition: border-color 0.15s ease;
    }

    :host(:focus-within),
    :host(:hover) {
      border-color: var(--primary-color);
    }

    input {
      width: 3.2em;
      padding: 5px 0;
      font: inherit;
      font-size: 0.8rem;
      color: white;
      text-align: center;
      appearance: textfield;
      outline: none;
      background: transparent;
      border: none;
    }

    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
      margin: 0;
      appearance: none;
    }

    .step {
      width: 26px;
      font: inherit;
      font-size: 0.95rem;
      line-height: 1;
      color: rgb(255 255 255 / 75%);
      cursor: pointer;
      background: rgb(255 255 255 / 5%);
      border: none;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;

      &:hover:not(:disabled) {
        color: white;
        background: rgb(135 116 245 / 35%);
      }

      &:disabled {
        cursor: default;
        opacity: 0.3;
      }
    }
  `,
})
export class NumberStepper implements OnInit, OnDestroy {
  readonly value = input.required<number>();
  readonly min = input(1);
  readonly max = input(100);
  readonly label = input('Value');
  readonly inputId = input<string | null>(null);
  readonly valueChange = output<number>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly onWheel = (event: WheelEvent) => {
    if (event.deltaY === 0) return;
    event.preventDefault();
    this.change(this.value() + (event.deltaY < 0 ? 1 : -1));
  };

  ngOnInit(): void {
    this.host.nativeElement.addEventListener('wheel', this.onWheel, { passive: false });
  }

  ngOnDestroy(): void {
    this.host.nativeElement.removeEventListener('wheel', this.onWheel);
  }

  protected change(next: number, event?: Event): void {
    const value = Math.max(this.min(), Math.min(this.max(), Math.round(next) || this.min()));
    // Typed value out of range: show the clamped one
    if (event?.target instanceof HTMLInputElement) event.target.value = String(value);
    if (value !== this.value()) this.valueChange.emit(value);
  }
}
