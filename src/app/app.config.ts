import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { CDK_DRAG_CONFIG } from '@angular/cdk/drag-drop';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { loadDefaultSave } from './states/default-save';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAppInitializer(loadDefaultSave),
    // On touch screens a long press starts a drag, so swiping still scrolls the page
    { provide: CDK_DRAG_CONFIG, useValue: { dragStartDelay: { touch: 250, mouse: 0 } } },
  ],
};
