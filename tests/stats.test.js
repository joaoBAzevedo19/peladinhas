// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStandings, scoreMismatch, resultForTeam, listSeasons, playerSummary } from '../src/lib/stats.js';
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
  assert.deepEqual(listSeasons(matches), ['2026/27', '2025/26']);
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
