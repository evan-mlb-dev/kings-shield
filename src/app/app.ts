import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './components/footer/footer';
import { Header } from './components/header/header';

const SPLASH_MAX_WAIT_MS = 8000;
const SPLASH_MIN_MS = 400;
const SPLASH_FADE_MS = 600;

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
  private document = inject(DOCUMENT);
  private readonly startedAt = performance.now();

  protected readonly title = signal('kings-shield');

  constructor() {
    afterNextRender(() => this.hideSplashWhenImagesLoaded());
  }

  protected preventImageDrag(event: DragEvent): void {
    const target = event.target as Element | null;
    if (target?.closest?.('img, svg')) event.preventDefault();
  }

  private async hideSplashWhenImagesLoaded(): Promise<void> {
    const splash = this.document.getElementById('splash');
    if (!splash) return;

    await new Promise((resolve) => requestAnimationFrame(resolve));

    const images = Array.from(this.document.images).filter((img) => !splash.contains(img));
    const allLoaded = Promise.all(images.map(waitForImage));
    const timeout = new Promise((resolve) => setTimeout(resolve, SPLASH_MAX_WAIT_MS));
    await Promise.race([allLoaded, timeout]);

    const elapsed = performance.now() - this.startedAt;
    if (elapsed < SPLASH_MIN_MS) {
      await new Promise((resolve) => setTimeout(resolve, SPLASH_MIN_MS - elapsed));
    }

    splash.classList.add('hide');
    setTimeout(() => splash.remove(), SPLASH_FADE_MS);
  }
}

function waitForImage(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  });
}
