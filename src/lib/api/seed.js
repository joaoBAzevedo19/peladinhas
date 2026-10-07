// Sample data for demo mode: a group of 14 players, the last weeks of
// Wednesday matches and the next two matches. Dates are relative to the
// first time the demo is opened.
import { localInputToIso, nextKickoffInput, zonedParts } from '../dates.js';

const NAMES = [
  'André', 'Bruno', 'Carlos', 'Diogo', 'Filipe', 'Gonçalo', 'Hugo',
  'João', 'Luís', 'Miguel', 'Nuno', 'Pedro', 'Rui', 'Tiago',
];
const LOCATION = 'Pavilhão Municipal';

// Small deterministic random generator so the demo always looks the same.
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export { uid };

export function buildSeed(now = new Date()) {
  const random = mulberry32(20261007);
  const created = now.toISOString();
  const players = NAMES.map((name) => ({ id: uid(), name, active: true, created_at: created }));
  players.push({ id: uid(), name: 'Ricardo', active: false, created_at: created });

  const matches = [];
  const match_players = [];

  // Wednesdays going back from the most recent one before `now`.
  const firstUpcoming = nextKickoffInput(now);
  const upcomingIso = localInputToIso(firstUpcoming);
  const weekMs = 7 * 86400000;

  for (let week = 14; week >= 1; week--) {
    const approx = new Date(new Date(upcomingIso).getTime() - week * weekMs);
    const p = zonedParts(approx);
    const pad = (n) => String(n).padStart(2, '0');
    const startsAt = localInputToIso(`${p.year}-${pad(p.month)}-${pad(p.day)}T21:00`);
    const id = uid();
    const pool = shuffle(players.filter((pl) => pl.active || week > 10), random).slice(0, 10);

    // One summer week was cancelled.
    if (p.month === 8 && !matches.some((m) => m.status === 'cancelled')) {
      matches.push({
        id, starts_at: startsAt, location: LOCATION, status: 'cancelled',
        score_a: null, score_b: null, notes: 'Férias, pouca gente disponível.',
        deleted_at: null, created_at: created, updated_at: created,
      });
      pool.slice(0, 6).forEach((pl, i) =>
        match_players.push({ match_id: id, player_id: pl.id, team: null, confirmed: i < 4, goals: 0, own_goals: 0 }),
      );
      continue;
    }

    const lineup = pool.map((pl, i) => ({
      match_id: id, player_id: pl.id, team: i < 5 ? 'A' : 'B', confirmed: true, goals: 0, own_goals: 0,
    }));
    const score = { A: 0, B: 0 };
    for (const team of ['A', 'B']) {
      const side = lineup.filter((e) => e.team === team);
      const goals = 2 + Math.floor(random() * 7);
      for (let g = 0; g < goals; g++) {
        const scorer = side[Math.floor(Math.pow(random(), 1.6) * side.length)];
        scorer.goals += 1;
        score[team] += 1;
      }
    }
    if (random() < 0.25) {
      const unlucky = lineup[Math.floor(random() * lineup.length)];
      unlucky.own_goals += 1;
      score[unlucky.team === 'A' ? 'B' : 'A'] += 1;
    }
    match_players.push(...lineup);
    matches.push({
      id, starts_at: startsAt, location: LOCATION, status: 'played',
      score_a: score.A, score_b: score.B, notes: '',
      deleted_at: null, created_at: created, updated_at: created,
    });
  }

  // Next two matches, with call-ups and some confirmations.
  const nextDates = [upcomingIso, new Date(new Date(upcomingIso).getTime() + weekMs).toISOString()];
  nextDates.forEach((startsAt, index) => {
    const id = uid();
    matches.push({
      id, starts_at: startsAt, location: LOCATION, status: 'scheduled',
      score_a: null, score_b: null, notes: index === 0 ? 'Levem coletes e a bola nova.' : '',
      deleted_at: null, created_at: created, updated_at: created,
    });
    const called = players.filter((pl) => pl.active).slice(0, 12);
    const confirmedCount = index === 0 ? 7 : 3;
    shuffle(called, random).forEach((pl, i) =>
      match_players.push({
        match_id: id, player_id: pl.id, team: null, confirmed: i < confirmedCount, goals: 0, own_goals: 0,
      }),
    );
  });

  return { players, matches, match_players };
}
