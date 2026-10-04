import { Routes } from '@angular/router';
import { TeamBuildingPage } from './pages/team-building/team-building';
import { TypeChartPage } from './pages/type-chart/type-chart';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'team-building' },
  { path: 'team-building', component: TeamBuildingPage, title: "Team Building · King's Shield" },
  { path: 'type-chart', component: TypeChartPage, title: "Type Chart · King's Shield" },
  { path: '**', redirectTo: 'team-building' },
];
