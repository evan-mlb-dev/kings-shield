import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './components/footer/footer';
import { Header } from './components/header/header';

@Component({
  imports: [RouterOutlet, Header, Footer],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
  host: {
    '(document:dragstart)': 'preventImageDrag($event)',
  },
})
export class App {
  protected readonly title = signal('kings-shield');

  protected preventImageDrag(event: DragEvent): void {
    const target = event.target as Element | null;
    if (target?.closest?.('img, svg')) event.preventDefault();
  }
}
