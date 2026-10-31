import { Component } from '@angular/core';
import { Coverage } from '../../components/coverage/coverage';
import { ChampSelect } from '../../components/champ-select/champ-select';
import { FaintDialog } from '../../components/faint-dialog/faint-dialog';
import { PartnerPc } from '../../components/partner-pc/partner-pc';
import { TeamBuilder } from '../../components/team-builder/team-builder';

@Component({
  selector: 'app-team-building-page',
  imports: [ChampSelect, TeamBuilder, PartnerPc, Coverage, FaintDialog],
  template: `
    <app-champ-select />
    <app-team-builder />
    <app-partner-pc />
    <app-coverage />
    <app-faint-dialog />
  `,
})
export class TeamBuildingPage {}
