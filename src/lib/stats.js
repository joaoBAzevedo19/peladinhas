// Scoring and standings. The table is always computed from the match
// records, so it can never get out of sync with the history.
import { OVERALL, OVERALL_RULES, POINTS } from './config.js';
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
  const ids = shuffled(playerIds, random);
  const extraToA = ids.length % 2 === 1 && random() < 0.5;
  const sizeA = Math.floor(ids.length / 2) + (extraToA ? 1 : 0);
  return Object.fromEntries(ids.map((id, i) => [id, i < sizeA ? 'A' : 'B']));
}

// Fisher-Yates shuffle (copy).
function shuffled(items, random) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Up to this many players, balanceTeams tries every possible split
// (C(20, 10) = 184 756). Above it, it improves a random split by swaps.
const BALANCE_EXACT_MAX = 20;

const average = (sum, size) => (size ? sum / size : 0);

// Two teams of equal size (with an odd number, one gets an extra player) whose
// average value is as close as possible. values: Map(id -> number), missing
// = 0. Among equally balanced splits one is drawn at random, and so is which
// side is A. Returns { [playerId]: 'A' | 'B' }, like drawTeams.
export function balanceTeams(playerIds, values, random = Math.random) {
  const ids = shuffled(playerIds, random);
  const v = ids.map((id) => Number(values.get(id)) || 0);
  const n = ids.length;
  const k = Math.floor(n / 2);
  const total = v.reduce((a, b) => a + b, 0);
  const gap = (sum) => Math.abs(average(sum, k) - average(total - sum, n - k));

  // Indexes of the k players of the first group.
  let pick;
  if (n <= BALANCE_EXACT_MAX) {
    let best = Infinity;
    let ties = 0;
    const chosen = [];
    const visit = (start, sum) => {
      if (chosen.length === k) {
        const g = gap(sum);
        if (g < best - 1e-9) {
          best = g;
          ties = 1;
          pick = [...chosen];
        } else if (g <= best + 1e-9) {
          // Reservoir sampling: every tied split is equally likely.
          ties += 1;
          if (random() * ties < 1) pick = [...chosen];
        }
        return;
      }
      for (let i = start; i <= n - (k - chosen.length); i += 1) {
        chosen.push(i);
        visit(i + 1, sum + v[i]);
        chosen.pop();
      }
    };
    visit(0, 0);
  } else {
    pick = improveBySwaps(v, k, gap);
  }

  const groupToA = random() < 0.5;
  const inGroup = new Set(pick);
  return Object.fromEntries(ids.map((id, i) => [id, inGroup.has(i) === groupToA ? 'A' : 'B']));
}

// Starts from the first k players against the rest and keeps making the swap
// that most narrows the gap between averages, until no swap helps.
// gap(sum of the group) = distance between the two averages.
function improveBySwaps(v, k, gap) {
  const n = v.length;
  const group = new Set(Array.from({ length: k }, (_, i) => i));
  let sum = [...group].reduce((acc, i) => acc + v[i], 0);
  for (;;) {
    let best = null;
    let bestGap = gap(sum) - 1e-9;
    for (const i of group) {
      for (let j = 0; j < n; j += 1) {
        if (group.has(j)) continue;
        const g = gap(sum - v[i] + v[j]);
        if (g < bestGap) {
          bestGap = g;
          best = [i, j];
        }
      }
    }
    if (!best) return [...group];
    const [i, j] = best;
    group.delete(i);
    group.add(j);
    sum += v[j] - v[i];
  }
}

// Goals of each player in one season (a key from seasonKeyOf / listSeasons),
// over its played matches; own goals don't count. Players who did not play
// in that season are left out (read as 0).
// Returns Map(id -> { goals, played, perMatch }).
export function seasonGoals(matches, lineupsByMatch, season, seasons = []) {
  const totals = new Map();
  for (const match of matches) {
    if (!isPlayed(match) || seasonKeyOf(match, seasons) !== season) continue;
    for (const entry of lineupsByMatch.get(match.id) || []) {
      if (!resultForTeam(match, entry.team)) continue;
      const t = totals.get(entry.player_id) ?? { goals: 0, played: 0 };
      t.goals += entry.goals || 0;
      t.played += 1;
      totals.set(entry.player_id, t);
    }
  }
  return new Map([...totals].map(([id, t]) => [id, { ...t, perMatch: t.goals / t.played }]));
}

// Average value of each team. teams: { [playerId]: 'A' | 'B' | null }.
// Returns { A, B } (null for a team with no players).
export function teamAverages(teams, values) {
  const acc = { A: { sum: 0, size: 0 }, B: { sum: 0, size: 0 } };
  for (const [id, team] of Object.entries(teams)) {
    if (!acc[team]) continue;
    acc[team].sum += Number(values.get(id)) || 0;
    acc[team].size += 1;
  }
  return {
    A: acc.A.size ? average(acc.A.sum, acc.A.size) : null,
    B: acc.B.size ? average(acc.B.sum, acc.B.size) : null,
  };
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

// Initial overall rating of a player (set by the admin). Rows read before
// the database has the column have no value, so they fall back to the default.
export function playerOverall(player) {
  return Number.isInteger(player?.overall) ? player.overall : OVERALL.default;
}

export function isValidOverall(value) {
  return Number.isInteger(value) && value >= OVERALL.min && value <= OVERALL.max;
}

const clampOverall = (value) => Math.min(OVERALL.max, Math.max(OVERALL.min, value));

// OVR change for one played match. entry = the player's line-up row; a
// player who did not play (no entry or no team) does not change.
export function overallDelta(match, entry) {
  const result = entry ? resultForTeam(match, entry.team) : null;
  if (!result) return 0;
  const margin = Math.abs(match.score_a - match.score_b);
  const big = margin >= OVERALL_RULES.bigMargin;
  let delta = OVERALL_RULES[result] + OVERALL_RULES.goal * (entry.goals || 0);
  if (big && result === 'win') delta += OVERALL_RULES.bigWin;
  if (big && result === 'loss') delta += OVERALL_RULES.bigLoss;
  return delta;
}

// Current OVR of every player: initial value plus the change of each match
// they played, in date order, kept between OVERALL.min and OVERALL.max after
// every match. Missing a match does not change the OVR.
// Returns { overalls: Map(id -> OVR), changes: Map(id -> Map(matchId -> change)) },
// where change is the actual move after clamping (0 when already at a limit).
export function computeOverallTimeline({ players, matches, lineupsByMatch }) {
  const played = matches
    .filter(isPlayed)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || String(a.id).localeCompare(String(b.id)));

  const overalls = new Map(players.map((p) => [p.id, playerOverall(p)]));
  const changes = new Map(players.map((p) => [p.id, new Map()]));
  for (const match of played) {
    for (const entry of lineupsByMatch.get(match.id) || []) {
      if (!overalls.has(entry.player_id) || !resultForTeam(match, entry.team)) continue;
      const before = overalls.get(entry.player_id);
      const after = clampOverall(before + overallDelta(match, entry));
      overalls.set(entry.player_id, after);
      changes.get(entry.player_id).set(match.id, after - before);
    }
  }
  return { overalls, changes };
}

// Current OVR of every player. Returns Map(id -> OVR).
export function computeOveralls(args) {
  return computeOverallTimeline(args).overalls;
}

function emptyRow(player, overalls) {
  return {
    player_id: player.id,
    name: player.name,
    active: player.active,
    overall: overalls?.get(player.id) ?? playerOverall(player),
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
// listSeasons) = null means all seasons. `overalls` (from computeOveralls)
// only fills the OVR column; it never changes points or order.
export function computeStandings({ matches, lineupsByMatch, playersById, season = null, seasons = [], overalls = null }) {
  const rows = new Map();

  for (const match of matches) {
    if (!isPlayed(match)) continue;
    if (season && seasonKeyOf(match, seasons) !== season) continue;

    for (const entry of lineupsByMatch.get(match.id) || []) {
      const result = resultForTeam(match, entry.team);
      if (!result) continue; // called up but did not play
      const player = playersById.get(entry.player_id);
      if (!player) continue;

      if (!rows.has(player.id)) rows.set(player.id, emptyRow(player, overalls));
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
