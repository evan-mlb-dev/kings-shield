import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { PokemonDb } from '../../models/pokemon/pokemon-db';
import { PokemonSprite } from '../../shared/icons/pokemon-sprite';
import { SkullIcon } from '../../shared/icons/skull-icon';
import { Run, RunMon, RunsState } from '../../states/runs';

/** A remembered Pokémon, with its species name resolved */
interface MonView {
  speciesId: number;
  name: string;
  speciesName: string;
  level: number | null;
}

interface DeathView {
  index: number;
  at: number | null;
  elapsed: string | null;
  mine: MonView | null;
  theirs: MonView | null;
  blame: 'mine' | 'theirs';
}

function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

@Component({
  selector: 'app-run-timeline',
  imports: [DatePipe, PokemonSprite, SkullIcon],
  templateUrl: './run-timeline.html',
  styleUrl: './run-timeline.scss',
})
export class RunTimeline {
  private readonly db = inject(PokemonDb);
  private readonly runs = inject(RunsState);

  readonly run = input.required<Run>();

  protected readonly deaths = computed<DeathView[]>(() => {
    const run = this.run();
    return run.deaths.map((d, index) => ({
      index,
      at: d.at,
      elapsed: d.at !== null ? duration(d.at - run.startedAt) : null,
      mine: this.view(d.mine),
      theirs: this.view(d.theirs),
      blame: d.blame,
    }));
  });

  protected readonly bodyCount = computed(() => {
    const deaths = this.run().deaths;
    const mine = deaths.filter((d) => d.blame === 'mine').length;
    return { mine, theirs: deaths.length - mine };
  });

  protected readonly duration = computed(() => duration(this.run().endedAt - this.run().startedAt));

  protected readonly myTeam = computed(() => this.run().myTeam.map((m) => this.view(m)!));
  protected readonly partnerTeam = computed(() => this.run().partnerTeam.map((m) => this.view(m)!));

  protected readonly renaming = signal(false);
  protected readonly draftName = signal('');
  protected readonly confirmDelete = signal(false);

  protected startRename(): void {
    this.draftName.set(this.run().name);
    this.renaming.set(true);
  }

  protected confirmRename(): void {
    this.runs.rename(this.run().id, this.draftName());
    this.renaming.set(false);
  }

  protected delete(): void {
    if (this.confirmDelete()) this.runs.remove(this.run().id);
    else this.confirmDelete.set(true);
  }

  private view(mon: RunMon | null): MonView | null {
    if (!mon) return null;
    const speciesName = this.db.species.get(mon.speciesId)?.name ?? `#${mon.speciesId}`;
    return {
      speciesId: mon.speciesId,
      name: mon.nickname || speciesName,
      speciesName,
      level: mon.level,
    };
  }
}
