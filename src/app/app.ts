import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from './components/footer/footer';
import { Header } from './components/header/header';
import { TeamBuilder } from './components/team-builder/team-builder';

@Component({
  imports: [RouterOutlet, Header, Footer, TeamBuilder],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('kings-shield');
}
