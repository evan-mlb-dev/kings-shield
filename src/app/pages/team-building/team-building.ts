import { Component } from '@angular/core';
import { Coverage } from '../../components/coverage/coverage';
import { TeamBuilder } from '../../components/team-builder/team-builder';

@Component({
  selector: 'app-team-building-page',
  imports: [TeamBuilder, Coverage],
  template: `
    <app-team-builder />
    <app-coverage />
  `,
})
export class TeamBuildingPage {}
