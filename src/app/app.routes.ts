import { Routes } from '@angular/router';
import { TeamBuildingPage } from './pages/team-building/team-building';
import { HistoryPage } from './pages/history/history';
import { TypeChartPage } from './pages/type-chart/type-chart';
import { SoulLinkPage } from './pages/soul-link/soul-link';
import { SaveEditorPage } from './pages/save-editor/save-editor';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'team-building' },
  { path: 'team-building', component: TeamBuildingPage, title: "Team Building · King's Shield" },
  { path: 'type-chart', component: TypeChartPage, title: "Type Chart · King's Shield" },
  { path: 'soul-link', component: SoulLinkPage, title: "Soul Link · King's Shield" },
  { path: 'save-editor', component: SaveEditorPage, title: "Save Editor · King's Shield" },
  { path: 'history', component: HistoryPage, title: "History · King's Shield" },
  { path: '**', redirectTo: 'team-building' },
];
