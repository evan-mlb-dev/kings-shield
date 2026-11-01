import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavTab {
  path: string;
  label: string;
  icon: 'team' | 'chart' | 'history' | 'link' | 'edit';
}

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-main-nav',
  styleUrl: './main-nav.scss',
  templateUrl: './main-nav.html',
})
export class MainNav {
  protected readonly tabs: readonly NavTab[] = [
    { path: '/team-building', label: 'Team Building', icon: 'team' },
    { path: '/type-chart', label: 'Type Chart', icon: 'chart' },
    { path: '/save-editor', label: 'Save Editor', icon: 'edit' },
    { path: '/soul-link', label: 'Soul Link', icon: 'link' },
    { path: '/history', label: 'History', icon: 'history' },
  ];
}
