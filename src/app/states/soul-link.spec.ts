import { TestBed } from '@angular/core/testing';
import { ParsedPokemon } from '../services/save-file-parser';
import { GameStateService, pokemonKey } from './game-state';
import { RunsState } from './runs';
import { SoulLinkService } from './soul-link';

function mon(personality: number, metLocation: number, trainerId = 1): ParsedPokemon {
  return {
    location: 'box',
    slot: 1,
    personality,
    trainerId,
    secretId: 0,
    nickname: `Mon ${personality}`,
    otName: 'Red',
    language: 2,
    speciesId: 1,
    heldItem: 0,
    experience: 0,
    friendship: 0,
    moves: [],
    pp: [],
    ppBonuses: 0,
    evs: { hp: 0, atk: 0, def: 0, spe: 0, spa: 0, spd: 0 },
    ivs: { hp: 0, atk: 0, def: 0, spe: 0, spa: 0, spd: 0 },
    isEgg: false,
    abilitySlot: 0,
    isShiny: false,
    metLocation,
  } as ParsedPokemon;
}

describe('SoulLinkService', () => {
  let soulLink: SoulLinkService;
  let gameState: GameStateService;
  const a = mon(1, 101);
  const b = mon(2, 102);
  const c = mon(3, 102);
  const d = mon(4, 103);
  // Theirs: route 1, route 2, route 4
  const x = mon(11, 101, 2);
  const y = mon(12, 102, 2);
  const z = mon(13, 104, 2);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    gameState = TestBed.inject(GameStateService);
    soulLink = TestBed.inject(SoulLinkService);
    gameState.setPkmnData({
      team: [],
      pc: [a, b, c, d],
      trainerName: 'Me',
      trainerId: 1,
      secretId: 0,
      boxNames: [],
    });
    soulLink.partnerSave.set({ trainerName: 'You', mons: [x, y, z] });
  });

  const pairKeys = () =>
    soulLink.pairs().map((p) => [pokemonKey(p.mine), pokemonKey(p.theirs), p.manual]);

  it('links Pokémon alone at the same met location', () => {
    expect(pairKeys()).toEqual([[pokemonKey(a), pokemonKey(x), false]]);
    expect(soulLink.unlinkedMine()).toEqual([b, c, d]);
    expect(soulLink.unlinkedTheirs()).toEqual([y, z]);
  });

  it('links by hand and undoes links', () => {
    soulLink.link(b, y);
    soulLink.link(d, z);
    expect(pairKeys()).toContainEqual([pokemonKey(b), pokemonKey(y), true]);
    expect(soulLink.pairs()).toHaveLength(3);

    const auto = soulLink.pairs().find((p) => !p.manual)!;
    soulLink.unlink(auto);
    expect(soulLink.pairs().some((p) => p.mine === a)).toBe(false);

    soulLink.resetLinks();
    expect(pairKeys()).toEqual([[pokemonKey(a), pokemonKey(x), false]]);
  });

  it('runs a champ select: my pick joins my team, their pick adds my linked Pokémon', () => {
    soulLink.link(b, y);
    soulLink.status.set('connected');
    gameState.addToTeam(c);

    soulLink.startDraft();
    expect(gameState.team()).toEqual([]);
    expect(soulLink.draft()).toEqual({ myTurn: true });

    const pairA = soulLink.pickablePairs().find((p) => p.mine === a)!;
    soulLink.pick(pairA);
    expect(gameState.team()).toEqual([a]);
    expect(soulLink.draft()).toEqual({ myTurn: false });

    // Not my turn: ignored
    soulLink.pick(soulLink.pickablePairs()[0]);
    expect(gameState.team()).toEqual([a]);

    // The partner picks y: its link (b) joins my team
    (soulLink as unknown as { receive(m: unknown): void }).receive({
      type: 'pick',
      mine: pokemonKey(y),
      theirs: pokemonKey(b),
    });
    expect(gameState.team()).toEqual([a, b]);
    expect(soulLink.draft()).toEqual({ myTurn: true });
  });

  it('adopts links sent by the partner, seen from my side', () => {
    (soulLink as unknown as { receive(m: unknown): void }).receive({
      type: 'links',
      links: { manual: [[pokemonKey(z), pokemonKey(d)]], excludedMine: [], excludedTheirs: [] },
    });
    expect(pairKeys()).toContainEqual([pokemonKey(d), pokemonKey(z), true]);
  });

  it('highlights the Pokémon linked to the hovered one, on both sides', () => {
    soulLink.hover('mine', a);
    expect(soulLink.highlightedTheirs()).toBe(pokemonKey(x));
    expect(soulLink.highlightedMine()).toBeNull();

    soulLink.hover('theirs', x);
    expect(soulLink.highlightedMine()).toBe(pokemonKey(a));

    soulLink.hover('mine', b); // not linked
    expect(soulLink.highlightedTheirs()).toBeNull();
    soulLink.unhover();
    expect(soulLink.hovered()).toBeNull();
  });

  it('picks a pair from either PC', () => {
    soulLink.link(b, y);
    soulLink.status.set('connected');
    soulLink.startDraft();
    expect([...soulLink.pickableTheirs()]).toEqual([pokemonKey(x), pokemonKey(y)]);

    soulLink.pickTheirs(y);
    expect(gameState.team()).toEqual([b]);
    expect(soulLink.draft()).toEqual({ myTurn: false });
  });

  it('makes Reset bring back the team chosen in a completed champ select', () => {
    soulLink.link(b, y);
    soulLink.status.set('connected');
    soulLink.startDraft();
    soulLink.pickMine(a);
    (soulLink as unknown as { receive(m: unknown): void }).receive({
      type: 'pick',
      mine: pokemonKey(y),
      theirs: pokemonKey(b),
    });
    // The partner's team follows (sent by their app)
    soulLink.partnerTeam.set({ teamKeys: [pokemonKey(x), pokemonKey(y)], faintedKeys: [] });
    TestBed.tick();
    expect(soulLink.pickablePairs()).toEqual([]);
    expect(gameState.hasCustomReset()).toBe(true);

    soulLink.endDraft();
    gameState.clearTeam();
    gameState.addToTeam(d);
    gameState.resetTeam();
    expect(gameState.team()).toEqual([a, b]);
  });

  it('previews the hovered pickable pair during the champ select only', () => {
    soulLink.hover('mine', a);
    expect(soulLink.previewPair()).toBeNull(); // no champ select

    soulLink.status.set('connected');
    soulLink.startDraft();
    soulLink.hover('theirs', x);
    expect(soulLink.previewPair()?.mine).toBe(a);

    soulLink.hover('mine', d); // not linked: nothing to preview
    expect(soulLink.previewPair()).toBeNull();

    soulLink.pickMine(a);
    soulLink.hover('mine', a); // already in the team
    expect(soulLink.previewPair()).toBeNull();
  });

  it('asks who caused a faint, records it and counts it', () => {
    soulLink.status.set('connected');
    soulLink.setEnabled(true);
    soulLink.requestFaint(a);
    expect(gameState.isFainted(a)).toBe(false); // waiting for the answer
    expect(soulLink.pendingFaint()).toBe(a);

    soulLink.confirmFaint('theirs');
    expect(gameState.isFainted(a)).toBe(true);
    expect(soulLink.deathOf('mine', pokemonKey(a))).toMatchObject({
      mine: pokemonKey(a),
      theirs: pokemonKey(x),
      blame: 'theirs',
    });
    expect(soulLink.bodyCount()).toEqual({ mine: 0, theirs: 1 });

    soulLink.revive(a);
    expect(gameState.isFainted(a)).toBe(false);
    expect(soulLink.bodyCount()).toEqual({ mine: 0, theirs: 0 });
  });

  it('faints my linked Pokémon when the partner reports a death, even locked', () => {
    gameState.addToTeam(a);
    gameState.toggleLock(a);
    const receive = (m: unknown) =>
      (soulLink as unknown as { receive(m: unknown): void }).receive(m);
    receive({
      type: 'faint',
      death: { mine: pokemonKey(x), theirs: pokemonKey(a), blame: 'mine' },
    });
    expect(gameState.isFainted(a)).toBe(true);
    expect(gameState.team()).toEqual([]);
    expect(soulLink.bodyCount()).toEqual({ mine: 0, theirs: 1 });

    receive({ type: 'revive', mine: pokemonKey(x) });
    expect(gameState.isFainted(a)).toBe(false);
    expect(soulLink.bodyCount()).toEqual({ mine: 0, theirs: 0 });
  });

  it('faints right away without asking when Soul Link is not connected', () => {
    soulLink.requestFaint(b);
    expect(soulLink.pendingFaint()).toBeNull();
    expect(gameState.isFainted(b)).toBe(true);
  });

  it('detects a wipe and ends the run: archived with its deaths, then reset', () => {
    const runs = TestBed.inject(RunsState);
    soulLink.status.set('connected');
    soulLink.setEnabled(true);
    soulLink.partnerTeam.set({ teamKeys: [pokemonKey(y)], faintedKeys: [] });
    gameState.addToTeam(a);
    expect(soulLink.wipedOut()).toBeNull();

    soulLink.requestFaint(a);
    soulLink.confirmFaint('mine');
    expect(gameState.team()).toEqual([]);
    expect(soulLink.wipedOut()).toBe('mine');

    soulLink.endRun(soulLink.wipedOut());
    const run = runs.runs()[0];
    expect(run.wipedOut).toBe('mine');
    expect(run.myName).toBe('Me');
    expect(run.partnerName).toBe('You');
    expect(run.deaths).toHaveLength(1);
    expect(run.deaths[0].mine?.nickname).toBe('Mon 1');
    expect(run.deaths[0].theirs?.nickname).toBe('Mon 11');
    expect(run.deaths[0].blame).toBe('mine');
    expect(typeof run.deaths[0].at).toBe('number');

    expect(soulLink.deaths()).toEqual([]);
    expect(gameState.isFainted(a)).toBe(false);
    expect(soulLink.wipedOut()).toBeNull();
  });

  it('archives the run ended by the partner, seen from my side', () => {
    const runs = TestBed.inject(RunsState);
    (soulLink as unknown as { receive(m: unknown): void }).receive({
      type: 'end-run',
      run: {
        id: 'r1',
        name: 'Run 1',
        startedAt: 1,
        endedAt: 2,
        myName: 'You',
        partnerName: 'Me',
        wipedOut: 'mine',
        deaths: [{ at: 1, mine: null, theirs: null, blame: 'mine' }],
        myTeam: [],
        partnerTeam: [],
      },
    });
    const run = runs.runs()[0];
    expect(run.myName).toBe('Me');
    expect(run.wipedOut).toBe('theirs');
    expect(run.deaths[0].blame).toBe('theirs');
  });

  it('tells when the team differs from what Reset brings back', () => {
    expect(gameState.isTeamModified()).toBe(false); // the save's party: empty here
    gameState.addToTeam(a);
    expect(gameState.isTeamModified()).toBe(true);
    gameState.resetTeam();
    expect(gameState.isTeamModified()).toBe(false);

    gameState.setTeam([a, b]);
    gameState.setResetTeam([a, b]);
    expect(gameState.isTeamModified()).toBe(false);
    gameState.swapInTeam(0, 1); // order counts
    expect(gameState.isTeamModified()).toBe(true);
  });

  it('ending on my wipe faints my team and adds it to my body count', () => {
    const runs = TestBed.inject(RunsState);
    soulLink.link(b, y);
    soulLink.status.set('connected');
    soulLink.setEnabled(true);
    gameState.addToTeam(a);
    gameState.addToTeam(b);
    gameState.addToTeam(d);
    soulLink.requestFaint(a);
    soulLink.confirmFaint('theirs');

    soulLink.endRun('mine');
    const run = runs.runs()[0];
    expect(run.wipedOut).toBe('mine');
    expect(run.deaths.map((x) => x.blame)).toEqual(['theirs', 'mine', 'mine']);
    expect(run.deaths[1].theirs?.nickname).toBe('Mon 12'); // b's link (y)
    expect(run.deaths[2].theirs).toBeNull(); // d is not linked
    expect(run.myTeam.map((m) => m.nickname)).toEqual(['Mon 2', 'Mon 4']);
  });

  it("ending on the partner's wipe faints their team, linked Pokémon included", () => {
    const runs = TestBed.inject(RunsState);
    soulLink.status.set('connected');
    soulLink.setEnabled(true);
    gameState.addToTeam(a);
    soulLink.partnerTeam.set({ teamKeys: [pokemonKey(x), pokemonKey(z)], faintedKeys: [] });

    soulLink.endRun('theirs');
    const run = runs.runs()[0];
    expect(run.deaths.map((x) => x.blame)).toEqual(['theirs', 'theirs']);
    expect(run.deaths[0].mine?.nickname).toBe('Mon 1'); // x is linked to a
    expect(run.deaths[1].mine).toBeNull(); // z is not linked
    expect(run.partnerTeam).toHaveLength(2);
  });

  it('switches to New run once a run is ended, and dates the next run from it', () => {
    const runs = TestBed.inject(RunsState);
    soulLink.status.set('connected');
    expect(soulLink.runEnded()).toBe(false);

    soulLink.endRun(null);
    expect(soulLink.runEnded()).toBe(true);

    soulLink.newRun();
    expect(soulLink.runEnded()).toBe(false);
    const before = Date.now();
    soulLink.endRun(null);
    expect(runs.runs()[0].startedAt).toBeLessThanOrEqual(before);
    expect(runs.runs()[0].startedAt).toBeGreaterThan(before - 5000);

    // The partner starts the next one
    (soulLink as unknown as { receive(m: unknown): void }).receive({
      type: 'new-run',
      startedAt: 42,
    });
    expect(soulLink.runEnded()).toBe(false);
  });
});
