// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStandings,
  scoreMismatch,
  resultForTeam,
  listSeasons,
  playerSummary,
  seasonKeyOf,
  canPickTeams,
  teamsConfirmed,
  drawTeams,
  balanceTeams,
  seasonGoals,
  teamAverages,
  playerOverall,
  isValidOverall,
  overallDelta,
  computeOveralls,
  computeOverallTimeline,
} from '../src/lib/stats.js';
import { OVERALL } from '../src/lib/config.js';
import { seasonOf, localInputToIso, isoToLocalInput, formatDate, formatTime, nextKickoffInput } from '../src/lib/dates.js';

const players = ['Rui', 'Tiago', 'Nuno', 'Hugo'].map((name, i) => ({ id: `p${i}`, name, active: true }));
const playersById = new Map(players.map((p) => [p.id, p]));

function match(id, startsAt, a, b, extra = {}) {
  return { id, starts_at: startsAt, status: 'played', score_a: a, score_b: b, deleted_at: null, ...extra };
}

test('points: win 3, draw 1, loss 0 for every player of the team', () => {
  const matches = [
    match('m1', '2026-09-02T20:00:00Z', 3, 1),
    match('m2', '2026-09-09T20:00:00Z', 2, 2),
  ];
  const lineupsByMatch = new Map([
    ['m1', [
      { player_id: 'p0', team: 'A', goals: 2, own_goals: 0 },
      { player_id: 'p1', team: 'A', goals: 1, own_goals: 0 },
      { player_id: 'p2', team: 'B', goals: 1, own_goals: 0 },
      { player_id: 'p3', team: null, goals: 0, own_goals: 0 }, // called up, did not play
    ]],
    ['m2', [
      { player_id: 'p0', team: 'B', goals: 0, own_goals: 1 },
      { player_id: 'p2', team: 'A', goals: 1, own_goals: 0 },
    ]],
  ]);
  const rows = computeStandings({ matches, lineupsByMatch, playersById });
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

  assert.equal(byName.Rui.points, 4);
  assert.equal(byName.Rui.played, 2);
  assert.equal(byName.Rui.goals, 2, 'own goals do not count as goals');
  assert.equal(byName.Rui.own_goals, 1);
  assert.equal(byName.Tiago.points, 3);
  assert.equal(byName.Nuno.points, 1);
  assert.deepEqual([byName.Nuno.wins, byName.Nuno.draws, byName.Nuno.losses], [0, 1, 1]);
  assert.equal(byName.Hugo, undefined, 'presence only counts when the player is in a team');
  assert.deepEqual(rows.map((r) => r.name), ['Rui', 'Tiago', 'Nuno']);
});

test('ignores scheduled, cancelled and deleted matches', () => {
  const matches = [
    match('m1', '2026-09-02T20:00:00Z', 1, 0, { status: 'scheduled' }),
    match('m2', '2026-09-09T20:00:00Z', 1, 0, { status: 'cancelled' }),
    match('m3', '2026-09-16T20:00:00Z', 1, 0, { deleted_at: '2026-09-17T10:00:00Z' }),
  ];
  const lineup = [{ player_id: 'p0', team: 'A', goals: 1, own_goals: 0 }];
  const lineupsByMatch = new Map(matches.map((m) => [m.id, lineup]));
  assert.equal(computeStandings({ matches, lineupsByMatch, playersById }).length, 0);
});

test('season filter and tie-break order (points, wins, goals)', () => {
  const matches = [
    match('old', '2026-08-26T20:00:00Z', 5, 0), // season 2025/26
    match('m1', '2026-09-02T20:00:00Z', 2, 1),
    match('m2', '2026-09-09T20:00:00Z', 1, 2),
  ];
  const lineupsByMatch = new Map([
    ['old', [{ player_id: 'p3', team: 'A', goals: 5, own_goals: 0 }, { player_id: 'p2', team: 'B', goals: 0, own_goals: 0 }]],
    ['m1', [{ player_id: 'p0', team: 'A', goals: 2, own_goals: 0 }, { player_id: 'p1', team: 'B', goals: 1, own_goals: 0 }]],
    ['m2', [{ player_id: 'p0', team: 'A', goals: 1, own_goals: 0 }, { player_id: 'p1', team: 'B', goals: 2, own_goals: 0 }]],
  ]);
  const season = computeStandings({ matches, lineupsByMatch, playersById, season: '2026/27' });
  // Rui and Tiago: 3 points and 1 win each; Rui has 3 goals vs 3 -> tie -> same rank
  assert.deepEqual(season.map((r) => [r.name, r.points, r.rank]), [['Rui', 3, 1], ['Tiago', 3, 1]]);
  const all = computeStandings({ matches, lineupsByMatch, playersById });
  assert.equal(all[0].name, 'Hugo');
  assert.equal(all[0].rank, 1);
  assert.equal(all[1].rank, 2);
  assert.deepEqual(listSeasons(matches).map((s) => s.key), ['2026/27', '2025/26']);
});

test('registered seasons run from their start date until the next one', () => {
  const matches = [
    match('old', '2026-08-26T20:00:00Z', 5, 0), // before any registered season -> 2025/26
    match('m1', '2026-09-02T20:00:00Z', 2, 1),
    match('m2', '2026-09-09T20:00:00Z', 1, 2),
  ];
  const seasons = [
    { id: 's1', name: 'Outono', total_matches: 10, starts_on: '2026-09-01', created_at: '2026-09-01T10:00:00Z' },
    { id: 's2', name: 'Inverno', total_matches: 12, starts_on: '2026-09-09', created_at: '2026-09-05T10:00:00Z' },
  ];
  assert.equal(seasonKeyOf(matches[0], seasons), '2025/26');
  assert.equal(seasonKeyOf(matches[1], seasons), 's1');
  assert.equal(seasonKeyOf(matches[2], seasons), 's2', 'starts on the match day');
  assert.deepEqual(listSeasons(matches, seasons).map((s) => s.label), ['Inverno', 'Outono', '2025/26']);
  const lineupsByMatch = new Map([
    ['m1', [{ player_id: 'p0', team: 'A', goals: 2, own_goals: 0 }, { player_id: 'p1', team: 'B', goals: 1, own_goals: 0 }]],
    ['m2', [{ player_id: 'p0', team: 'A', goals: 1, own_goals: 0 }, { player_id: 'p1', team: 'B', goals: 2, own_goals: 0 }]],
  ]);
  const rows = computeStandings({ matches, lineupsByMatch, playersById, season: 's1', seasons });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].played, 1);
});

test('score mismatch counts own goals for the other team', () => {
  const m = match('m1', '2026-09-02T20:00:00Z', 2, 1);
  const lineup = [
    { player_id: 'p0', team: 'A', goals: 1, own_goals: 0 },
    { player_id: 'p1', team: 'B', goals: 1, own_goals: 1 },
  ];
  assert.equal(scoreMismatch(m, lineup), null);
  assert.deepEqual(scoreMismatch({ ...m, score_a: 3 }, lineup), [{ team: 'A', counted: 2, score: 3 }]);
  assert.equal(resultForTeam(m, 'B'), 'loss');
  assert.equal(resultForTeam(m, null), null);
});

test('player summary', () => {
  const matches = [match('m1', '2026-09-02T20:00:00Z', 2, 2)];
  const lineupsByMatch = new Map([['m1', [{ player_id: 'p0', team: 'A', goals: 2, own_goals: 0 }]]]);
  assert.deepEqual(playerSummary('p0', matches, lineupsByMatch),
    { played: 1, wins: 0, draws: 1, losses: 0, goals: 2, own_goals: 0, points: 1 });
});

test('dates in Lisbon time, dd/mm/aaaa and 24h', () => {
  // Summer time (UTC+1)
  assert.equal(localInputToIso('2026-10-14T21:00'), '2026-10-14T20:00:00.000Z');
  // Winter time (UTC+0)
  assert.equal(localInputToIso('2026-11-04T21:00'), '2026-11-04T21:00:00.000Z');
  assert.equal(isoToLocalInput('2026-10-14T20:00:00.000Z'), '2026-10-14T21:00');
  assert.equal(formatDate('2026-10-14T20:00:00Z'), '14/10/2026');
  assert.equal(formatTime('2026-11-04T21:00:00Z'), '21:00');
  // Day of the clock change (25/10/2026)
  assert.equal(isoToLocalInput(localInputToIso('2026-10-25T21:00')), '2026-10-25T21:00');
});

test('season boundaries: September starts a new season', () => {
  assert.equal(seasonOf('2026-08-31T21:00:00Z'), '2025/26');
  assert.equal(seasonOf('2026-08-31T23:30:00Z'), '2026/27', 'already 1 September in Lisbon');
  assert.equal(seasonOf('2027-01-10T20:00:00Z'), '2026/27');
  assert.equal(seasonOf('2099-09-01T20:00:00Z'), '2099/00');
});

test('next kick-off is the next free Wednesday at 21:00', () => {
  const wedMorning = new Date('2026-10-07T05:47:00Z');
  assert.equal(nextKickoffInput(wedMorning), '2026-10-07T21:00');
  assert.equal(nextKickoffInput(wedMorning, ['2026-10-07T20:00:00Z']), '2026-10-14T21:00');
  assert.equal(nextKickoffInput(new Date('2026-10-07T21:30:00Z')), '2026-10-14T21:00');
});

test('teams can be picked only when every called-up player confirmed', () => {
  assert.equal(canPickTeams([]), false);
  assert.equal(canPickTeams([{ confirmed: true }]), false, 'one player is not a match');
  assert.equal(canPickTeams([{ confirmed: true }, { confirmed: false }]), false);
  assert.equal(canPickTeams([{ confirmed: true }, { confirmed: true }]), true);
});

test('teams are confirmed when everyone has a side and both sides have players', () => {
  assert.equal(teamsConfirmed([]), false);
  assert.equal(teamsConfirmed([{ team: 'A' }, { team: 'A' }]), false, 'team B is empty');
  assert.equal(teamsConfirmed([{ team: 'A' }, { team: 'B' }, { team: null }]), false, 'new call-up without a side');
  assert.equal(teamsConfirmed([{ team: 'A' }, { team: 'B' }, { team: 'B' }]), true);
});

test('team draw: equal sides, every player once, odd extra on either side', () => {
  const sizes = (teams) => {
    const values = Object.values(teams);
    return [values.filter((t) => t === 'A').length, values.filter((t) => t === 'B').length];
  };
  const ten = Array.from({ length: 10 }, (_, i) => `p${i}`);
  const even = drawTeams(ten);
  assert.deepEqual(Object.keys(even).sort(), [...ten].sort());
  assert.deepEqual(sizes(even), [5, 5]);

  const nine = ten.slice(0, 9);
  // The last call to random() decides which side gets the extra player.
  const fixed = (last) => {
    let calls = 0;
    return () => (++calls > nine.length - 1 ? last : 0.3);
  };
  assert.deepEqual(sizes(drawTeams(nine, fixed(0.1))), [5, 4]);
  assert.deepEqual(sizes(drawTeams(nine, fixed(0.9))), [4, 5]);

  assert.deepEqual(sizes(drawTeams(['p0', 'p1'])), [1, 1]);
  assert.deepEqual(drawTeams([]), {});
});

test('team draw shuffles players (not always the same split)', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
  const splits = new Set();
  for (let i = 0; i < 20; i += 1) {
    const teams = drawTeams(ids);
    splits.add(ids.filter((id) => teams[id] === 'A').join(','));
  }
  assert.ok(splits.size > 1);
});

test('balanced draw: closest averages, equal sides, every player once', () => {
  const sideOf = (teams, id) => teams[id];
  // One strong player: the best split pairs that player with a weak one.
  const four = new Map([['s', 100], ['w1', 1], ['w2', 1], ['w3', 1]]);
  const teams = balanceTeams([...four.keys()], four);
  assert.deepEqual(Object.keys(teams).sort(), [...four.keys()].sort());
  const avg = teamAverages(teams, four);
  assert.equal(Math.abs(avg.A - avg.B), 49.5);

  // Averages, not sums: with 5 players the strong one goes to the side of 3.
  const five = new Map([['s', 40], ['a', 10], ['b', 10], ['c', 10], ['d', 10]]);
  for (let i = 0; i < 10; i += 1) {
    const t = balanceTeams([...five.keys()], five);
    const side = sideOf(t, 's');
    assert.equal(Object.values(t).filter((x) => x === side).length, 3);
  }

  // Missing values count as 0.
  const partial = balanceTeams(['x', 'y', 'z', 'w'], new Map([['x', 2], ['y', 2]]));
  assert.notEqual(partial.x, partial.y);
  assert.deepEqual(balanceTeams([], new Map()), {});
});

test('balanced draw: exact search beats every other split (10 players)', () => {
  const ratings = [92, 81, 77, 64, 60, 55, 51, 43, 38, 20];
  const values = new Map(ratings.map((r, i) => [`p${i}`, r]));
  const ids = [...values.keys()];
  const t = balanceTeams(ids, values);
  const avg = teamAverages(t, values);
  const got = Math.abs(avg.A - avg.B);
  // Brute force over every 5-player group.
  let best = Infinity;
  for (let mask = 0; mask < 1 << 10; mask += 1) {
    let size = 0;
    let sum = 0;
    for (let i = 0; i < 10; i += 1) if (mask & (1 << i)) { size += 1; sum += ratings[i]; }
    if (size !== 5) continue;
    const total = ratings.reduce((a, b) => a + b, 0);
    best = Math.min(best, Math.abs(sum / 5 - (total - sum) / 5));
  }
  assert.ok(Math.abs(got - best) < 1e-9);
});

test('balanced draw: ties are drawn at random, large groups still balanced', () => {
  const equal = new Map(Array.from({ length: 10 }, (_, i) => [`p${i}`, 50]));
  const splits = new Set();
  for (let i = 0; i < 20; i += 1) {
    const t = balanceTeams([...equal.keys()], equal);
    splits.add([...equal.keys()].filter((id) => t[id] === 'A').join(','));
  }
  assert.ok(splits.size > 1);

  // Above the exact-search limit: swap improvement, sides still 13/12.
  const many = new Map(Array.from({ length: 25 }, (_, i) => [`p${i}`, i * 3]));
  const t = balanceTeams([...many.keys()], many);
  const sizes = ['A', 'B'].map((side) => Object.values(t).filter((x) => x === side).length).sort();
  assert.deepEqual(sizes, [12, 13]);
  const avg = teamAverages(t, many);
  assert.ok(Math.abs(avg.A - avg.B) < 1.5);
});

test('season goals: only played matches of that season, by players who played', () => {
  const matches = [
    { id: 'm1', status: 'played', starts_at: '2026-09-02T20:00:00Z', score_a: 3, score_b: 1 },
    { id: 'm2', status: 'played', starts_at: '2026-09-09T20:00:00Z', score_a: 0, score_b: 2 },
    { id: 'm3', status: 'scheduled', starts_at: '2026-09-16T20:00:00Z', score_a: null, score_b: null },
    { id: 'm4', status: 'played', starts_at: '2026-09-23T20:00:00Z', score_a: 5, score_b: 0, deleted_at: '2026-09-24' },
    // Previous season (31/08 in Lisbon).
    { id: 'm5', status: 'played', starts_at: '2026-08-31T20:00:00Z', score_a: 4, score_b: 0 },
  ];
  const lineupsByMatch = new Map([
    ['m1', [{ player_id: 'a', team: 'A', goals: 3 }, { player_id: 'b', team: 'B', goals: 0, own_goals: 1 }, { player_id: 'c', team: null }]],
    ['m2', [{ player_id: 'a', team: 'A', goals: 0 }, { player_id: 'b', team: 'B', goals: 2 }]],
    ['m3', [{ player_id: 'c', team: 'A' }]],
    ['m4', [{ player_id: 'a', team: 'A', goals: 5 }]],
    ['m5', [{ player_id: 'a', team: 'A', goals: 4 }, { player_id: 'd', team: 'A', goals: 2 }]],
  ]);
  const goals = seasonGoals(matches, lineupsByMatch, '2026/27');
  assert.deepEqual(goals.get('a'), { goals: 3, played: 2, perMatch: 1.5 });
  assert.deepEqual(goals.get('b'), { goals: 2, played: 2, perMatch: 1 });
  assert.equal(goals.has('c'), false);
  assert.equal(goals.has('d'), false);
  assert.deepEqual(seasonGoals(matches, lineupsByMatch, '2025/26').get('a'), { goals: 4, played: 1, perMatch: 4 });

  // A registered season starting mid-year takes its matches.
  const seasons = [{ id: 's1', name: 'Inverno', starts_on: '2026-09-05' }];
  assert.deepEqual(seasonGoals(matches, lineupsByMatch, 's1', seasons).get('a'), { goals: 0, played: 1, perMatch: 0 });
});

test('team averages ignore players without a side', () => {
  const values = new Map([['a', 10], ['b', 20], ['c', 99]]);
  assert.deepEqual(teamAverages({ a: 'A', b: 'B', c: null }, values), { A: 10, B: 20 });
  assert.deepEqual(teamAverages({ a: 'A' }, values), { A: 10, B: null });
});

test('overall: shown in the standings but never changes points or order', () => {
  const rated = [
    { id: 'p0', name: 'Rui', active: true, overall: 20 },
    { id: 'p1', name: 'Tiago', active: true, overall: 99 },
    { id: 'p2', name: 'Nuno', active: true }, // read before the column existed
  ];
  const byId = new Map(rated.map((p) => [p.id, p]));
  const matches = [match('m1', '2026-09-02T20:00:00Z', 2, 1)];
  const lineupsByMatch = new Map([
    ['m1', [
      { player_id: 'p0', team: 'A', goals: 2, own_goals: 0 },
      { player_id: 'p1', team: 'B', goals: 1, own_goals: 0 },
      { player_id: 'p2', team: 'B', goals: 0, own_goals: 0 },
    ]],
  ]);
  const rows = computeStandings({ matches, lineupsByMatch, playersById: byId });
  assert.deepEqual(rows.map((r) => [r.name, r.rank, r.overall]), [
    ['Rui', 1, 20],
    ['Tiago', 2, 99],
    ['Nuno', 3, OVERALL.default],
  ]);
});

test('overall: default and valid range', () => {
  assert.equal(OVERALL.default, 50);
  assert.equal(playerOverall({}), 50);
  assert.equal(playerOverall({ overall: null }), 50);
  assert.equal(playerOverall({ overall: 77 }), 77);
  assert.equal(isValidOverall(OVERALL.min), true);
  assert.equal(isValidOverall(OVERALL.max), true);
  assert.equal(isValidOverall(OVERALL.min - 1), false);
  assert.equal(isValidOverall(OVERALL.max + 1), false);
  assert.equal(isValidOverall(50.5), false);
  assert.equal(isValidOverall(Number('')), false);
});

test('OVR per match: win +2, draw 0, loss -3, +1 per goal, own goals do not count', () => {
  const m = match('m', '2026-09-02T20:00:00Z', 3, 1);
  assert.equal(overallDelta(m, { team: 'A', goals: 2, own_goals: 1 }), 4);
  assert.equal(overallDelta(m, { team: 'B', goals: 1, own_goals: 0 }), -2);
  assert.equal(overallDelta(match('d', '2026-09-02T20:00:00Z', 2, 2), { team: 'A', goals: 0 }), 0);
});

test('OVR per match: missing a match changes nothing, whether not called up or called up without a team', () => {
  const m = match('m', '2026-09-02T20:00:00Z', 3, 1);
  assert.equal(overallDelta(m, null), 0);
  assert.equal(overallDelta(m, { team: null, goals: 0 }), 0);
});

test('OVR per match: 6+ goal margin adds +2 to winners and -3 to losers; 5 does not', () => {
  const big = match('b', '2026-09-02T20:00:00Z', 1, 7);
  assert.equal(overallDelta(big, { team: 'B', goals: 0 }), 4);
  assert.equal(overallDelta(big, { team: 'A', goals: 1 }), -5);
  const five = match('f', '2026-09-02T20:00:00Z', 6, 1);
  assert.equal(overallDelta(five, { team: 'A', goals: 0 }), 2);
  assert.equal(overallDelta(five, { team: 'B', goals: 0 }), -3);
});

test('OVR accumulates over seasons from the initial value; scheduled and deleted matches do not count', () => {
  const group = [
    { id: 'p0', name: 'Rui', active: true, overall: 60, created_at: '2026-01-01T00:00:00Z' },
    { id: 'p1', name: 'Tiago', active: true, created_at: '2026-01-01T00:00:00Z' }, // no column yet: 50
    { id: 'p2', name: 'Nuno', active: true, overall: 50, created_at: '2026-01-01T00:00:00Z' },
  ];
  const matches = [
    match('m1', '2026-05-06T20:00:00Z', 2, 1), // season 2025/26
    match('m2', '2026-09-09T20:00:00Z', 0, 6), // season 2026/27, big margin
    match('m3', '2026-09-16T20:00:00Z', 1, 0, { status: 'scheduled', score_a: null, score_b: null }),
    match('m4', '2026-09-23T20:00:00Z', 5, 0, { deleted_at: '2026-09-24T00:00:00Z' }),
  ];
  const lineupsByMatch = new Map([
    ['m1', [
      { player_id: 'p0', team: 'A', goals: 2, own_goals: 0 },
      { player_id: 'p1', team: 'B', goals: 1, own_goals: 0 },
      { player_id: 'p2', team: null, goals: 0, own_goals: 0 },
    ]],
    ['m2', [
      { player_id: 'p0', team: 'A', goals: 0, own_goals: 0 },
      { player_id: 'p1', team: 'B', goals: 3, own_goals: 0 },
    ]],
    ['m3', [{ player_id: 'p0', team: 'A', goals: 0, own_goals: 0 }]],
    ['m4', [{ player_id: 'p0', team: 'A', goals: 5, own_goals: 0 }]],
  ]);
  const ovr = computeOveralls({ players: group, matches, lineupsByMatch });
  assert.equal(ovr.get('p0'), 60 + 4 - 6); // win + 2 goals, then lost by 6
  assert.equal(ovr.get('p1'), 50 - 2 + 7); // loss + 1 goal, then big win + 3 goals
  assert.equal(ovr.get('p2'), 50); // called up without a team, then not called up
});

test('OVR: missing matches does not change it, for active and inactive players', () => {
  const group = [
    { id: 'reg', name: 'Regular', active: true, overall: 50, created_at: '2026-01-01T00:00:00Z' },
    { id: 'gone', name: 'Saiu', active: false, overall: 50, created_at: '2026-01-01T00:00:00Z' },
  ];
  const matches = [
    match('m1', '2026-09-02T20:00:00Z', 1, 0),
    match('m2', '2026-09-16T20:00:00Z', 1, 0),
    match('m3', '2026-09-23T20:00:00Z', 1, 0),
  ];
  const lineupsByMatch = new Map([
    ['m1', [{ player_id: 'reg', team: 'A', goals: 0 }, { player_id: 'gone', team: 'B', goals: 0 }]],
    ['m2', [{ player_id: 'reg', team: null, goals: 0 }]],
    ['m3', []],
  ]);
  const { overalls, changes } = computeOverallTimeline({ players: group, matches, lineupsByMatch });
  assert.equal(overalls.get('reg'), 50 + 2);
  assert.equal(overalls.get('gone'), 50 - 3);
  assert.deepEqual([...changes.get('reg')], [['m1', 2]]); // only matches actually played
});

test('OVR stays between min and max after every match, in date order', () => {
  const group = [
    { id: 'top', name: 'Top', active: true, overall: 98, created_at: '2026-01-01T00:00:00Z' },
    { id: 'low', name: 'Low', active: true, overall: 3, created_at: '2026-01-01T00:00:00Z' },
  ];
  // Listed out of order on purpose: the big win comes first.
  const matches = [
    match('m2', '2026-09-09T20:00:00Z', 0, 1),
    match('m1', '2026-09-02T20:00:00Z', 7, 0),
  ];
  const lineupsByMatch = new Map([
    ['m1', [{ player_id: 'top', team: 'A', goals: 3 }, { player_id: 'low', team: 'B', goals: 0 }]],
    ['m2', [{ player_id: 'top', team: 'A', goals: 0 }, { player_id: 'low', team: 'B', goals: 0 }]],
  ]);
  const ovr = computeOveralls({ players: group, matches, lineupsByMatch });
  assert.equal(ovr.get('top'), OVERALL.max - 3); // capped at 99, then -3
  assert.equal(ovr.get('low'), OVERALL.min + 2); // floored at 1, then +2
});

test('OVR change per match is the actual move after clamping to min and max', () => {
  const group = [
    { id: 'top', name: 'Top', active: true, overall: 98, created_at: '2026-01-01T00:00:00Z' },
    { id: 'low', name: 'Low', active: true, overall: 3, created_at: '2026-01-01T00:00:00Z' },
    { id: 'mid', name: 'Mid', active: true, overall: 50, created_at: '2026-01-01T00:00:00Z' },
  ];
  const matches = [
    match('m1', '2026-09-02T20:00:00Z', 7, 0),
    match('m2', '2026-09-09T20:00:00Z', 1, 0),
    match('m3', '2026-09-16T20:00:00Z', 2, 2),
  ];
  const lineupsByMatch = new Map([
    ['m1', [{ player_id: 'top', team: 'A', goals: 3 }, { player_id: 'low', team: 'B', goals: 0 }]],
    ['m2', [{ player_id: 'top', team: 'A', goals: 0 }, { player_id: 'low', team: 'B', goals: 0 }]],
    ['m3', [{ player_id: 'top', team: 'A', goals: 0 }, { player_id: 'mid', team: 'B', goals: 0 }]],
  ]);
  const { overalls, changes } = computeOverallTimeline({ players: group, matches, lineupsByMatch });
  assert.deepEqual([...changes.get('top')], [['m1', 1], ['m2', 0], ['m3', 0]]); // 98 -> 99, stays capped
  assert.deepEqual([...changes.get('low')], [['m1', -2], ['m2', 0]]); // 3 -> 1, then floored
  assert.deepEqual([...changes.get('mid')], [['m3', 0]]);
  assert.equal(overalls.get('top'), OVERALL.max);
  assert.equal(overalls.get('low'), OVERALL.min);
});

test('standings take the OVR from computeOveralls when given', () => {
  const matches = [match('m1', '2026-09-02T20:00:00Z', 1, 0)];
  const lineupsByMatch = new Map([['m1', [{ player_id: 'p0', team: 'A', goals: 1 }]]]);
  const rows = computeStandings({ matches, lineupsByMatch, playersById, overalls: new Map([['p0', 73]]) });
  assert.equal(rows[0].overall, 73);
});
