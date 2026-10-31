import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { DataConnection, Peer, PeerError } from 'peerjs';
import { ParsedPokemon } from '../services/save-file-parser';
import { GameStateService, MAX_TEAM_SIZE, pokemonKey } from './game-state';
import { Run, RunMon, RunsState, swapRun } from './runs';

const ENABLED_KEY = 'king_shield_soul_link';
const LINKS_KEY = 'king_shield_soul_links';
const DEATHS_KEY = 'king_shield_soul_deaths';
const RUN_KEY = 'king_shield_soul_run';
const PEER_PREFIX = 'kings-shield-soul-link-';
const PROTOCOL = 4;
/** Room codes: no 0/O or 1/I, easy to read out loud */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export type ConnectionStatus = 'idle' | 'opening' | 'waiting' | 'connecting' | 'connected';

/** What a player shares of their save */
export interface SharedSave {
  trainerName: string;
  mons: ParsedPokemon[];
}

export interface SharedTeam {
  teamKeys: string[];
  faintedKeys: string[];
}

export interface SoulLinkPair {
  mine: ParsedPokemon;
  theirs: ParsedPokemon;
  /** Met location of my Pokémon */
  location: number;
  manual: boolean;
}

interface LinkState {
  manual: [mine: string, theirs: string][];
  excludedMine: string[];
  excludedTheirs: string[];
}

export type Blame = 'mine' | 'theirs';

export interface Death {
  mine: string | null;
  theirs: string | null;
  blame: Blame;
  at?: number;
}

interface RunState {
  ended: boolean;
  startedAt: number | null;
}

/** Champ select in progress */
export interface DraftState {
  myTurn: boolean;
}

type Message =
  | {
      type: 'hello';
      protocol: number;
      links: LinkState | null;
      deaths: Death[] | null;
      run: RunState | null;
    }
  | { type: 'new-run'; startedAt: number }
  | { type: 'faint'; death: Death }
  | { type: 'revive'; mine: string }
  | { type: 'deaths'; deaths: Death[] }
  | { type: 'end-run'; run: Run }
  | { type: 'save'; save: SharedSave | null }
  | { type: 'team'; team: SharedTeam }
  | { type: 'links'; links: LinkState }
  | { type: 'draft-start' }
  | { type: 'pick'; mine: string; theirs: string }
  | { type: 'draft-end' };

const EMPTY_LINKS: LinkState = { manual: [], excludedMine: [], excludedTheirs: [] };
const EMPTY_TEAM: SharedTeam = { teamKeys: [], faintedKeys: [] };

/** The same links seen from the other player */
function swapLinks(links: LinkState): LinkState {
  return {
    manual: links.manual.map(([a, b]) => [b, a]),
    excludedMine: links.excludedTheirs,
    excludedTheirs: links.excludedMine,
  };
}

/** The same death seen from the other player */
function swapDeath(death: Death): Death {
  return {
    mine: death.theirs,
    theirs: death.mine,
    blame: death.blame === 'mine' ? 'theirs' : 'mine',
    at: death.at,
  };
}

/** A Pokémon as the History remembers it */
function snapshot(p: ParsedPokemon): RunMon {
  return { speciesId: p.speciesId, nickname: p.nickname, level: p.level ?? null };
}

function randomCode(): string {
  const values = crypto.getRandomValues(new Uint32Array(CODE_LENGTH));
  return Array.from(values, (v) => CODE_ALPHABET[v % CODE_ALPHABET.length]).join('');
}

function errorMessage(error: PeerError<string>): string {
  switch (error.type) {
    case 'peer-unavailable':
      return 'No room found with this code. Check it, and make sure the host is still waiting.';
    case 'unavailable-id':
      return 'This room code is already in use, please try again.';
    case 'browser-incompatible':
      return 'This browser does not support peer-to-peer connections.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not reach the matchmaking server. Check your connection and try again.';
    default:
      return `Connection error (${error.type}).`;
  }
}

function readDeaths(): Death[] {
  try {
    const raw = localStorage.getItem(DEATHS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function readRunState(): RunState {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    return raw ? JSON.parse(raw) : { ended: false, startedAt: null };
  } catch {
    return { ended: false, startedAt: null };
  }
}

function readLinks(): LinkState {
  try {
    const raw = localStorage.getItem(LINKS_KEY);
    return raw ? { ...EMPTY_LINKS, ...JSON.parse(raw) } : EMPTY_LINKS;
  } catch {
    return EMPTY_LINKS;
  }
}

@Injectable({
  providedIn: 'root',
})
export class SoulLinkService {
  private readonly gameState = inject(GameStateService);
  private readonly runs = inject(RunsState);

  /** Soul Link option; remembered between visits */
  readonly enabled = signal(this.readEnabled());

  readonly status = signal<ConnectionStatus>('idle');
  readonly roomCode = signal<string | null>(null);
  readonly isHost = signal(false);
  readonly error = signal<string | null>(null);

  readonly partnerSave = signal<SharedSave | null>(null);
  readonly partnerTeam = signal<SharedTeam>(EMPTY_TEAM);

  private readonly links = signal<LinkState>(readLinks());

  readonly draft = signal<DraftState | null>(null);

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;

  private readonly myMons = computed<ParsedPokemon[]>(() => {
    const data = this.gameState.pkmnData();
    return data ? [...data.team, ...data.pc].filter((p) => !p.isEgg) : [];
  });

  private readonly theirMons = computed<ParsedPokemon[]>(
    () => this.partnerSave()?.mons.filter((p) => !p.isEgg) ?? [],
  );

  readonly pairs = computed<SoulLinkPair[]>(() => {
    const links = this.links();
    const mine = new Map(this.myMons().map((p) => [pokemonKey(p), p]));
    const theirs = new Map(this.theirMons().map((p) => [pokemonKey(p), p]));
    const pairs: SoulLinkPair[] = [];

    for (const [a, b] of links.manual) {
      const m = mine.get(a);
      const t = theirs.get(b);
      if (!m || !t) continue;
      pairs.push({ mine: m, theirs: t, location: m.metLocation, manual: true });
      mine.delete(a);
      theirs.delete(b);
    }

    const excludedMine = new Set(links.excludedMine);
    const excludedTheirs = new Set(links.excludedTheirs);
    const byLocation = (mons: Map<string, ParsedPokemon>, excluded: Set<string>) => {
      const groups = new Map<number, ParsedPokemon[]>();
      for (const [key, p] of mons) {
        if (excluded.has(key)) continue;
        groups.set(p.metLocation, [...(groups.get(p.metLocation) ?? []), p]);
      }
      return groups;
    };
    const theirGroups = byLocation(theirs, excludedTheirs);
    for (const [location, group] of byLocation(mine, excludedMine)) {
      const other = theirGroups.get(location);
      if (group.length === 1 && other?.length === 1) {
        pairs.push({ mine: group[0], theirs: other[0], location, manual: false });
      }
    }

    return pairs.sort((x, y) => x.location - y.location);
  });

  private readonly linkedMine = computed(
    () => new Map(this.pairs().map((pair) => [pokemonKey(pair.mine), pair])),
  );
  private readonly linkedTheirs = computed(
    () => new Map(this.pairs().map((pair) => [pokemonKey(pair.theirs), pair])),
  );

  readonly unlinkedMine = computed(() =>
    this.myMons().filter((p) => !this.linkedMine().has(pokemonKey(p))),
  );
  readonly unlinkedTheirs = computed(() =>
    this.theirMons().filter((p) => !this.linkedTheirs().has(pokemonKey(p))),
  );

  /** Partner's Pokémon linked to one of mine, if any */
  partnerOf(mine: ParsedPokemon): ParsedPokemon | null {
    return this.linkedMine().get(pokemonKey(mine))?.theirs ?? null;
  }

  readonly active = computed(() => this.enabled() && this.status() === 'connected');

  readonly hovered = signal<{ side: 'mine' | 'theirs'; key: string } | null>(null);

  readonly highlightedMine = computed(() => {
    const hovered = this.hovered();
    const pair = hovered?.side === 'theirs' ? this.linkedTheirs().get(hovered.key) : undefined;
    return pair ? pokemonKey(pair.mine) : null;
  });

  readonly highlightedTheirs = computed(() => {
    const hovered = this.hovered();
    const pair = hovered?.side === 'mine' ? this.linkedMine().get(hovered.key) : undefined;
    return pair ? pokemonKey(pair.theirs) : null;
  });

  hover(side: 'mine' | 'theirs', mon: ParsedPokemon): void {
    this.hovered.set({ side, key: pokemonKey(mon) });
  }

  unhover(): void {
    this.hovered.set(null);
  }

  link(mine: ParsedPokemon, theirs: ParsedPokemon): void {
    const a = pokemonKey(mine);
    const b = pokemonKey(theirs);
    this.updateLinks((links) => ({
      manual: [...links.manual.filter(([x, y]) => x !== a && y !== b), [a, b]],
      excludedMine: links.excludedMine.filter((k) => k !== a),
      excludedTheirs: links.excludedTheirs.filter((k) => k !== b),
    }));
  }

  unlink(pair: SoulLinkPair): void {
    const a = pokemonKey(pair.mine);
    const b = pokemonKey(pair.theirs);
    this.updateLinks((links) =>
      pair.manual
        ? { ...links, manual: links.manual.filter(([x]) => x !== a) }
        : {
            ...links,
            excludedMine: [...links.excludedMine, a],
            excludedTheirs: [...links.excludedTheirs, b],
          },
    );
  }

  renameMine(renamed: ReadonlyMap<string, string>): void {
    if (renamed.size === 0) return;
    const map = (key: string) => renamed.get(key) ?? key;
    this.updateLinks((links) => ({
      ...links,
      manual: links.manual.map(([a, b]) => [map(a), b]),
      excludedMine: links.excludedMine.map(map),
    }));
    this._deaths.update((deaths) => deaths.map((d) => (d.mine ? { ...d, mine: map(d.mine) } : d)));
    this.send({ type: 'deaths', deaths: this._deaths() });
  }

  resetLinks(): void {
    this.updateLinks(() => EMPTY_LINKS);
  }

  private updateLinks(change: (links: LinkState) => LinkState): void {
    this.links.update(change);
    this.send({ type: 'links', links: this.links() });
  }

  private readonly _deaths = signal<Death[]>(readDeaths());
  readonly deaths = this._deaths.asReadonly();

  /** Pokémon each player caused to faint */
  readonly bodyCount = computed(() => {
    const deaths = this._deaths();
    return {
      mine: deaths.filter((d) => d.blame === 'mine').length,
      theirs: deaths.filter((d) => d.blame === 'theirs').length,
    };
  });

  deathOf(side: Blame, key: string): Death | null {
    return this._deaths().find((d) => d[side] === key) ?? null;
  }

  readonly pendingFaint = signal<ParsedPokemon | null>(null);

  requestFaint(mon: ParsedPokemon): void {
    if (this.gameState.isLocked(mon)) return;
    if (this.active()) this.pendingFaint.set(mon);
    else this.gameState.faint(mon);
  }

  cancelFaint(): void {
    this.pendingFaint.set(null);
  }

  confirmFaint(blame: Blame): void {
    const mon = this.pendingFaint();
    this.pendingFaint.set(null);
    if (!mon) return;
    const key = pokemonKey(mon);
    const partner = this.partnerOf(mon);
    const death: Death = {
      mine: key,
      theirs: partner ? pokemonKey(partner) : null,
      blame,
      at: Date.now(),
    };
    this.gameState.faint(mon);
    this._deaths.update((deaths) => [...deaths.filter((d) => d.mine !== key), death]);
    this.send({ type: 'faint', death });
  }

  revive(mon: ParsedPokemon): void {
    const key = pokemonKey(mon);
    this.gameState.revive(mon);
    if (!this._deaths().some((d) => d.mine === key)) return;
    this._deaths.update((deaths) => deaths.filter((d) => d.mine !== key));
    this.send({ type: 'revive', mine: key });
  }

  readonly wipedOut = computed<Blame | null>(() => {
    if (this.runEnded() || this._deaths().length === 0 || this.draft()) return null;
    if (this.gameState.team().length === 0) return 'mine';
    if (this.partnerSave() && this.partnerTeam().teamKeys.length === 0) return 'theirs';
    return null;
  });

  private readonly runState = signal<RunState>(readRunState());

  /** The last run was ended: waiting for "New run" */
  readonly runEnded = computed(() => this.runState().ended);

  newRun(): void {
    const startedAt = Date.now();
    this.runState.set({ ended: false, startedAt });
    this.send({ type: 'new-run', startedAt });
  }

  endRun(wipedOut: Blame | null): void {
    const myTeam = this.gameState.team().map(snapshot);
    const partnerTeam = this.partnerTeamMons().map(snapshot);
    if (wipedOut) this.wipeTeam(wipedOut);
    const run = this.buildRun(wipedOut, myTeam, partnerTeam);
    this.archiveRun(run);
    this.send({ type: 'end-run', run });
  }

  private wipeTeam(side: Blame): void {
    const at = Date.now();
    const members = side === 'mine' ? this.gameState.team() : this.partnerTeamMons();
    for (const mon of members) {
      const key = pokemonKey(mon);
      if (this._deaths().some((d) => d[side] === key)) continue;
      const pair = side === 'mine' ? this.linkedMine().get(key) : this.linkedTheirs().get(key);
      const death: Death =
        side === 'mine'
          ? { mine: key, theirs: pair ? pokemonKey(pair.theirs) : null, blame: side, at }
          : { mine: pair ? pokemonKey(pair.mine) : null, theirs: key, blame: side, at };
      if (death.mine) {
        const mine = side === 'mine' ? mon : pair?.mine;
        if (mine) this.gameState.forceFaint(mine);
      }
      this._deaths.update((deaths) => [...deaths, death]);
      this.send({ type: 'faint', death });
    }
  }

  private archiveRun(run: Run): void {
    this.runs.add(run);
    this.runState.set({ ended: true, startedAt: null });
    this._deaths.set([]);
    this.links.set(EMPTY_LINKS);
    this.draft.set(null);
    this.gameState.endRun();
  }

  private buildRun(wipedOut: Blame | null, myTeam: RunMon[], partnerTeam: RunMon[]): Run {
    const myMons = new Map(this.myMons().map((p) => [pokemonKey(p), p]));
    const theirMons = new Map(this.theirMons().map((p) => [pokemonKey(p), p]));
    const deaths = this._deaths();
    const now = Date.now();
    const times = deaths.map((d) => d.at).filter((t): t is number => typeof t === 'number');
    const known = (p: ParsedPokemon | undefined) => (p ? snapshot(p) : null);
    return {
      id: crypto.randomUUID(),
      name: this.runs.defaultName(),
      startedAt: this.runState().startedAt ?? (times.length ? Math.min(...times) : now),
      endedAt: now,
      myName: this.gameState.pkmnData()?.trainerName || 'You',
      partnerName: this.partnerSave()?.trainerName || 'Partner',
      wipedOut,
      deaths: deaths.map((d) => ({
        at: d.at ?? null,
        mine: d.mine ? known(myMons.get(d.mine)) : null,
        theirs: d.theirs ? known(theirMons.get(d.theirs)) : null,
        blame: d.blame,
      })),
      myTeam,
      partnerTeam,
    };
  }

  resetDeaths(): void {
    this._deaths.set([]);
    this.send({ type: 'deaths', deaths: [] });
  }

  private readonly myTeamKeys = computed(() => new Set(this.gameState.team().map(pokemonKey)));
  private readonly myFaintedKeys = computed(
    () => new Set(this.gameState.fainted().map(pokemonKey)),
  );

  /** Partner's team, resolved against their save */
  readonly partnerTeamMons = computed<ParsedPokemon[]>(() => {
    const byKey = new Map(this.theirMons().map((p) => [pokemonKey(p), p]));
    return this.partnerTeam()
      .teamKeys.map((k) => byKey.get(k))
      .filter((p): p is ParsedPokemon => !!p);
  });

  readonly partnerFaintedKeys = computed(() => new Set(this.partnerTeam().faintedKeys));

  readonly pickablePairs = computed<SoulLinkPair[]>(() => {
    if (this.gameState.team().length >= MAX_TEAM_SIZE) return [];
    if (this.partnerTeam().teamKeys.length >= MAX_TEAM_SIZE) return [];
    const theirTeam = new Set(this.partnerTeam().teamKeys);
    const theirFainted = this.partnerFaintedKeys();
    return this.pairs().filter((pair) => {
      const a = pokemonKey(pair.mine);
      const b = pokemonKey(pair.theirs);
      return (
        !this.myTeamKeys().has(a) &&
        !this.myFaintedKeys().has(a) &&
        !theirTeam.has(b) &&
        !theirFainted.has(b)
      );
    });
  });

  readonly previewPair = computed<SoulLinkPair | null>(() => {
    const hovered = this.hovered();
    if (!hovered || !this.draft()) return null;
    return (
      this.pickablePairs().find(
        (pair) => pokemonKey(hovered.side === 'mine' ? pair.mine : pair.theirs) === hovered.key,
      ) ?? null
    );
  });

  readonly pickableMine = computed(
    () => new Set(this.pickablePairs().map((pair) => pokemonKey(pair.mine))),
  );

  readonly pickableTheirs = computed(
    () => new Set(this.pickablePairs().map((pair) => pokemonKey(pair.theirs))),
  );

  /** My pick, by my Pokémon: its pair joins both teams */
  pickMine(mine: ParsedPokemon): void {
    const key = pokemonKey(mine);
    const pair = this.pickablePairs().find((p) => pokemonKey(p.mine) === key);
    if (pair) this.pick(pair);
  }

  /** My pick, by the partner's Pokémon (clicked in their PC) */
  pickTheirs(theirs: ParsedPokemon): void {
    const key = pokemonKey(theirs);
    const pair = this.pickablePairs().find((p) => pokemonKey(p.theirs) === key);
    if (pair) this.pick(pair);
  }

  startDraft(): void {
    if (this.status() !== 'connected') return;
    this.gameState.setTeam([]);
    this.draft.set({ myTurn: true });
    this.send({ type: 'draft-start' });
  }

  pick(pair: SoulLinkPair): void {
    if (!this.draft()?.myTurn || !this.pickablePairs().includes(pair)) return;
    this.gameState.addToTeam(pair.mine);
    this.draft.set({ myTurn: false });
    this.send({ type: 'pick', mine: pokemonKey(pair.mine), theirs: pokemonKey(pair.theirs) });
  }

  endDraft(): void {
    if (!this.draft()) return;
    this.draft.set(null);
    this.send({ type: 'draft-end' });
  }

  constructor() {
    effect(() => {
      if (!this.draft() || this.pickablePairs().length > 0) return;
      const team = this.gameState.team();
      if (team.length > 0) untracked(() => this.gameState.setResetTeam(team));
    });

    effect(() => {
      try {
        localStorage.setItem(RUN_KEY, JSON.stringify(this.runState()));
      } catch {
        // Storage unavailable: only lasts for this visit
      }
    });

    effect(() => {
      try {
        localStorage.setItem(DEATHS_KEY, JSON.stringify(this._deaths()));
      } catch {
        // Storage unavailable: the deaths only last for this visit
      }
    });

    effect(() => {
      try {
        localStorage.setItem(LINKS_KEY, JSON.stringify(this.links()));
      } catch {
        // Storage unavailable: the links only last for this visit
      }
    });

    effect(() => {
      const data = this.gameState.pkmnData();
      if (this.status() !== 'connected') return;
      const save = data
        ? { trainerName: data.trainerName, mons: [...data.team, ...data.pc] }
        : null;
      untracked(() => this.send({ type: 'save', save }));
    });
    effect(() => {
      const team: SharedTeam = {
        teamKeys: [...this.myTeamKeys()],
        faintedKeys: [...this.myFaintedKeys()],
      };
      if (this.status() !== 'connected') return;
      untracked(() => this.send({ type: 'team', team }));
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
    try {
      localStorage.setItem(ENABLED_KEY, String(enabled));
    } catch {
      // Storage unavailable: the choice only lasts for this visit
    }
    if (!enabled) this.disconnect();
  }

  /** Opens a room and waits for the other player */
  async host(): Promise<void> {
    if (this.status() !== 'idle') return;
    const code = randomCode();
    const peer = await this.openPeer(PEER_PREFIX + code);
    if (!peer) return;
    this.roomCode.set(code);
    this.isHost.set(true);
    this.status.set('waiting');
    peer.on('connection', (conn) => {
      // One partner at a time
      if (this.conn) {
        conn.on('open', () => conn.close());
        return;
      }
      this.attach(conn);
    });
  }

  /** Joins the room of the other player */
  async join(rawCode: string): Promise<void> {
    const code = rawCode.trim().toUpperCase();
    if (this.status() !== 'idle' || !code) return;
    const peer = await this.openPeer();
    if (!peer) return;
    this.roomCode.set(code);
    this.isHost.set(false);
    this.status.set('connecting');
    this.attach(peer.connect(PEER_PREFIX + code, { reliable: true }));
  }

  /** Leaves the room (and closes it when hosting) */
  disconnect(): void {
    const conn = this.conn;
    const peer = this.peer;
    this.conn = null;
    this.peer = null;
    conn?.close();
    peer?.destroy();
    this.status.set('idle');
    this.roomCode.set(null);
    this.isHost.set(false);
    this.clearPartner();
  }

  private async openPeer(id?: string): Promise<Peer | null> {
    this.error.set(null);
    this.status.set('opening');
    const { Peer } = await import('peerjs');
    return new Promise((resolve) => {
      const peer = id ? new Peer(id) : new Peer();
      this.peer = peer;
      peer.on('open', () => resolve(peer));
      peer.on('error', (error) => {
        if (this.status() === 'connected') return;
        this.fail(errorMessage(error));
        resolve(null);
      });
    });
  }

  private attach(conn: DataConnection): void {
    this.conn = conn;
    conn.on('open', () => {
      // The host's link corrections win: the guest adopts them
      this.sendOn(conn, {
        type: 'hello',
        protocol: PROTOCOL,
        links: this.isHost() ? this.links() : null,
        deaths: this.isHost() ? this._deaths() : null,
        run: this.isHost() ? this.runState() : null,
      });
      this.status.set('connected');
    });
    conn.on('data', (data) => this.receive(data as Message));
    conn.on('close', () => this.onClosed(conn));
    conn.on('error', () => this.onClosed(conn));
  }

  private onClosed(conn: DataConnection): void {
    if (conn !== this.conn) return;
    this.conn = null;
    this.clearPartner();
    if (this.isHost() && this.peer && !this.peer.destroyed) {
      this.status.set('waiting');
    } else {
      this.disconnect();
      this.error.set('The other player left.');
    }
  }

  private fail(message: string): void {
    this.disconnect();
    this.error.set(message);
  }

  private clearPartner(): void {
    this.partnerSave.set(null);
    this.partnerTeam.set(EMPTY_TEAM);
    this.draft.set(null);
  }

  private receive(message: Message): void {
    switch (message?.type) {
      case 'hello':
        if (message.protocol !== PROTOCOL) {
          this.fail('The other player runs another version of the site: both must reload it.');
          return;
        }
        if (message.links) this.links.set(swapLinks(message.links));
        if (message.deaths) this._deaths.set(message.deaths.map(swapDeath));
        if (message.run) this.runState.set(message.run);
        break;
      case 'faint': {
        const death = swapDeath(message.death);
        this._deaths.update((deaths) => [
          ...deaths.filter((d) => !death.theirs || d.theirs !== death.theirs),
          death,
        ]);
        // Soul Link rule: my linked Pokémon faints too
        const mon = death.mine ? this.myMons().find((p) => pokemonKey(p) === death.mine) : null;
        if (mon) this.gameState.forceFaint(mon);
        break;
      }
      case 'new-run':
        this.runState.set({ ended: false, startedAt: message.startedAt });
        break;
      case 'end-run':
        this.archiveRun(swapRun(message.run));
        break;
      case 'deaths':
        this._deaths.set(message.deaths.map(swapDeath));
        break;
      case 'revive': {
        const death = this._deaths().find((d) => d.theirs === message.mine);
        if (!death) break;
        this._deaths.update((deaths) => deaths.filter((d) => d !== death));
        const mon = death.mine ? this.myMons().find((p) => pokemonKey(p) === death.mine) : null;
        if (mon) this.gameState.revive(mon);
        break;
      }
      case 'save':
        this.partnerSave.set(message.save);
        break;
      case 'team':
        this.partnerTeam.set(message.team);
        break;
      case 'links':
        this.links.set(swapLinks(message.links));
        break;
      case 'draft-start':
        this.gameState.setTeam([]);
        this.draft.set({ myTurn: false });
        break;
      case 'pick': {
        const mon = this.myMons().find((p) => pokemonKey(p) === message.theirs);
        if (mon && !this.gameState.isFainted(mon) && !this.gameState.isTeamFull()) {
          this.gameState.addToTeam(mon);
        }
        if (this.draft()) this.draft.set({ myTurn: true });
        break;
      }
      case 'draft-end':
        this.draft.set(null);
        break;
    }
  }

  private send(message: Message): void {
    if (this.conn?.open) this.sendOn(this.conn, message);
  }

  private sendOn(conn: DataConnection, message: Message): void {
    try {
      conn.send(message);
    } catch (error) {
      console.warn('Soul Link: could not send a message', error);
    }
  }

  private readEnabled(): boolean {
    try {
      return localStorage.getItem(ENABLED_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
