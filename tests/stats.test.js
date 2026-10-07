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
} from '../src/lib/stats.js';
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
