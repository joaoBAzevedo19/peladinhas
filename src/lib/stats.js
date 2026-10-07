// Scoring and standings. The table is always computed from the match
// records, so it can never get out of sync with the history.
import { POINTS } from './config.js';
import { dateKey, seasonOf } from './dates.js';

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

// Before kick-off, teams can be picked once every called-up player has
// confirmed (at least two, one per side).
export function canPickTeams(lineup) {
  return lineup.length >= 2 && lineup.every((e) => e.confirmed);
}

// Teams count as confirmed when every called-up player is on a side and
// both sides have someone. Calling up someone new reopens the team pick.
export function teamsConfirmed(lineup) {
  return (
    lineup.length >= 2 &&
    lineup.every((e) => e.team === 'A' || e.team === 'B') &&
    lineup.some((e) => e.team === 'A') &&
    lineup.some((e) => e.team === 'B')
  );
}

// Random draw of two teams of equal size: { [playerId]: 'A' | 'B' }. With an
// odd number of players, the side that gets the extra one is also drawn.
// `random` returns a number in [0, 1), like Math.random (injectable for tests).
export function drawTeams(playerIds, random = Math.random) {
  const ids = [...playerIds];
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const extraToA = ids.length % 2 === 1 && random() < 0.5;
  const sizeA = Math.floor(ids.length / 2) + (extraToA ? 1 : 0);
  return Object.fromEntries(ids.map((id, i) => [id, i < sizeA ? 'A' : 'B']));
}

// Registered seasons, latest start first (ties: latest created first).
function sortSeasons(seasons) {
  return [...seasons].sort(
    (a, b) => b.starts_on.localeCompare(a.starts_on) || (b.created_at || '').localeCompare(a.created_at || ''),
  );
}

// Season a match belongs to. A registered season (Classificação > Nova
// época) runs from its starts_on until the next one starts; matches before
// the first registered season keep the automatic label ("2025/26").
// Returns the season id or the automatic label.
export function seasonKeyOf(match, seasons = []) {
  const day = dateKey(match.starts_at);
  const found = sortSeasons(seasons).find((s) => s.starts_on <= day);
  return found ? found.id : seasonOf(match.starts_at);
}

// Seasons for the filters, newest first: every registered season, then the
// automatic ones that have at least one played match.
// Each item: {key, label, total_matches?, starts_on?}
export function listSeasons(matches, seasons = []) {
  const registered = sortSeasons(seasons).map((s) => ({
    key: s.id,
    label: s.name,
    total_matches: s.total_matches,
    starts_on: s.starts_on,
  }));
  const ids = new Set(registered.map((s) => s.key));
  const auto = new Set(matches.filter(isPlayed).map((m) => seasonKeyOf(m, seasons)).filter((k) => !ids.has(k)));
  return [...registered, ...[...auto].sort().reverse().map((key) => ({ key, label: key }))];
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

// Per-player totals for the given matches. `season` (a key from
// listSeasons) = null means all seasons.
export function computeStandings({ matches, lineupsByMatch, playersById, season = null, seasons = [] }) {
  const rows = new Map();

  for (const match of matches) {
    if (!isPlayed(match)) continue;
    if (season && seasonKeyOf(match, seasons) !== season) continue;

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
