// Scoring and standings. The table is always computed from the match
// records, so it can never get out of sync with the history.
import { POINTS } from './config.js';
import { seasonOf } from './dates.js';

export const RESULT_LABEL = { win: 'V', draw: 'E', loss: 'D' };
export const RESULT_NAME = { win: 'Vitória', draw: 'Empate', loss: 'Derrota' };

export function isPlayed(match) {
  return match.status === 'played' && !match.deleted_at && match.score_a != null && match.score_b != null;
}

// Result of a played match from one team's point of view.
export function resultForTeam(match, team) {
  if (!isPlayed(match) || (team !== 'A' && team !== 'B')) return null;
  const own = team === 'A' ? match.score_a : match.score_b;
  const other = team === 'A' ? match.score_b : match.score_a;
  if (own > other) return 'win';
  if (own < other) return 'loss';
  return 'draw';
}

// Goals implied by the individual tallies: a team's goals plus the
// own goals scored by the other team.
export function goalsFromLineup(lineup) {
  const totals = { A: 0, B: 0 };
  for (const row of lineup) {
    if (row.team === 'A') {
      totals.A += row.goals || 0;
      totals.B += row.own_goals || 0;
    } else if (row.team === 'B') {
      totals.B += row.goals || 0;
      totals.A += row.own_goals || 0;
    }
  }
  return totals;
}

// Returns the teams whose individual tallies don't add up to the score.
export function scoreMismatch(match, lineup) {
  if (match.score_a == null || match.score_b == null) return null;
  const totals = goalsFromLineup(lineup);
  const issues = [];
  if (totals.A !== Number(match.score_a)) issues.push({ team: 'A', counted: totals.A, score: Number(match.score_a) });
  if (totals.B !== Number(match.score_b)) issues.push({ team: 'B', counted: totals.B, score: Number(match.score_b) });
  return issues.length ? issues : null;
}

// Seasons that have at least one played match, newest first.
export function listSeasons(matches) {
  const set = new Set(matches.filter(isPlayed).map((m) => seasonOf(m.starts_at)));
  return [...set].sort().reverse();
}

function emptyRow(player) {
  return {
    player_id: player.id,
    name: player.name,
    active: player.active,
    points: 0,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals: 0,
    own_goals: 0,
  };
}

// Per-player totals for the given matches. `season` = null means all seasons.
export function computeStandings({ matches, lineupsByMatch, playersById, season = null }) {
  const rows = new Map();

  for (const match of matches) {
    if (!isPlayed(match)) continue;
    if (season && seasonOf(match.starts_at) !== season) continue;

    for (const entry of lineupsByMatch.get(match.id) || []) {
      const result = resultForTeam(match, entry.team);
      if (!result) continue; // called up but did not play
      const player = playersById.get(entry.player_id);
      if (!player) continue;

      if (!rows.has(player.id)) rows.set(player.id, emptyRow(player));
      const row = rows.get(player.id);
      row.played += 1;
      row.goals += entry.goals || 0;
      row.own_goals += entry.own_goals || 0;
      row.points += POINTS[result];
      if (result === 'win') row.wins += 1;
      else if (result === 'draw') row.draws += 1;
      else row.losses += 1;
    }
  }

  const sorted = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      b.goals - a.goals ||
      a.name.localeCompare(b.name, 'pt'),
  );

  // Players level on points, wins and goals share the same position.
  let rank = 0;
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    const tied = prev && prev.points === row.points && prev.wins === row.wins && prev.goals === row.goals;
    rank = tied ? rank : i + 1;
    row.rank = rank;
  });

  return sorted;
}

// Totals for one player over a list of matches (used by the history filter).
export function playerSummary(playerId, matches, lineupsByMatch) {
  const summary = { played: 0, wins: 0, draws: 0, losses: 0, goals: 0, own_goals: 0, points: 0 };
  for (const match of matches) {
    const entry = (lineupsByMatch.get(match.id) || []).find((e) => e.player_id === playerId);
    const result = entry && resultForTeam(match, entry.team);
    if (!result) continue;
    summary.played += 1;
    summary.goals += entry.goals || 0;
    summary.own_goals += entry.own_goals || 0;
    summary.points += POINTS[result];
    if (result === 'win') summary.wins += 1;
    else if (result === 'draw') summary.draws += 1;
    else summary.losses += 1;
  }
  return summary;
}
