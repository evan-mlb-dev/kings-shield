import { Component, inject } from '@angular/core';
import { RunTimeline } from '../../components/run-timeline/run-timeline';
import { RunsState } from '../../states/runs';

@Component({
  selector: 'app-history-page',
  imports: [RunTimeline],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class HistoryPage {
  protected readonly runs = inject(RunsState).runs;
}
