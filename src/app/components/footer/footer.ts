import { Component } from '@angular/core';
import { APP_VERSION, CHANGELOG_URL } from '../../shared/version';

@Component({
  imports: [],
  selector: 'app-footer',
  styleUrl: './footer.scss',
  templateUrl: './footer.html',
})
export class Footer {
  protected readonly version = APP_VERSION;
  protected readonly changelog = CHANGELOG_URL;
}
