import { Component, input } from '@angular/core';
import { PcFilter } from '../../shared/pc-filter';

/** Ghost search field of a PC */
@Component({
  selector: 'app-pc-search',
  templateUrl: './pc-search.html',
  styleUrl: './pc-search.scss',
})
export class PcSearch {
  readonly filter = input.required<PcFilter>();
}
