import { Component, input } from '@angular/core';
import { PcFilter, PcFilterEntry } from '../../shared/pc-filter';

@Component({
  selector: 'app-pc-badges',
  templateUrl: './pc-badges.html',
  styleUrl: './pc-badges.scss',
})
export class PcBadges {
  readonly filter = input.required<PcFilter>();
  readonly entry = input.required<PcFilterEntry>();
}
