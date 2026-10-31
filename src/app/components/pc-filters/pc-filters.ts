import { Component, input } from '@angular/core';
import { TypeIcon } from '../../shared/icons/type-icon';
import { PcFilter } from '../../shared/pc-filter';
import { typeColor } from '../../shared/type-colors';

@Component({
  selector: 'app-pc-filters',
  imports: [TypeIcon],
  templateUrl: './pc-filters.html',
  styleUrl: './pc-filters.scss',
})
export class PcFilters {
  readonly filter = input.required<PcFilter>();
  protected readonly typeColor = typeColor;
}
