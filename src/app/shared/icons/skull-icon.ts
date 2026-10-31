import { Component } from '@angular/core';

@Component({
  selector: 'app-skull-icon',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        fill-rule="evenodd"
        d="M12 2.5c-4.7 0-8.3 3.4-8.3 7.8 0 2.5 1.1 4.4 2.8 5.6v2.6c0 .7.6 1.3 1.3 1.3h1.4v-1.9h1.6v1.9h2.4v-1.9h1.6v1.9h1.4c.7 0 1.3-.6 1.3-1.3v-2.6c1.7-1.2 2.8-3.1 2.8-5.6 0-4.4-3.6-7.8-8.3-7.8ZM8.7 9.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6.6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM12 13.6l1.1 2h-2.2l1.1-2Z"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      width: 1em;
      height: 1em;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class SkullIcon {}
