import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_VERSION, CHANGELOG_URL } from '../../shared/version';

@Component({
  imports: [RouterLink],
  selector: 'app-logo-app',
  styleUrl: './logo-app.scss',
  templateUrl: './logo-app.html',
})
export class LogoApp {
  protected readonly version = APP_VERSION;
  protected readonly changelog = CHANGELOG_URL;
}
