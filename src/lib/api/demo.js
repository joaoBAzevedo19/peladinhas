// Demo backend: same interface as the Supabase one, with the data kept in
// this browser (localStorage). Used when no Supabase keys are configured.
import { buildSeed, uid } from './seed.js';
import { AppError } from './errors.js';
import { PIN_ACCOUNTS } from '../config.js';
import { checkPin } from './pin.js';

const STORAGE_KEY = 'peladinhas-demo-v1';
const SESSION_KEY = 'peladinhas-demo-session';

function readStorage(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): keep working in memory.
  }
}

// Fixed PINs for the demo, shown on the PIN screen.
export const DEMO_PINS = { guest: '000000', admin: '111111' };

const clone = (value) => JSON.parse(JSON.stringify(value));
const delay = () => new Promise((resolve) => setTimeout(resolve, 120));

export function createDemoApi() {
  let db;
  try {
    db = JSON.parse(readStorage(STORAGE_KEY));
  } catch {
    db = null;
  }
  if (!db?.players) {
    db = buildSeed();
    writeStorage(STORAGE_KEY, JSON.stringify(db));
  }
  db.seasons ??= [];

  let session = readStorage(SESSION_KEY) ? { email: readStorage(SESSION_KEY) } : null;
  const listeners = new Set();

  const persist = () => writeStorage(STORAGE_KEY, JSON.stringify(db));
  // Sessions saved before the PIN screen (any email) count as admin.
  const sessionIsAdmin = () => Boolean(session) && session.email !== PIN_ACCOUNTS.guest;
  const requireAdmin = () => {
    if (!sessionIsAdmin()) throw new AppError('Sem permissão. Entra como administrador em Gerir.');
  };
  const nameTaken = (name, exceptId) =>
    db.players.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === name.trim().toLowerCase());

  return {
    mode: 'demo',

    async loadAll() {
      await delay();
      const visible = sessionIsAdmin() ? db.matches : db.matches.filter((m) => !m.deleted_at);
      const ids = new Set(visible.map((m) => m.id));
      return clone({
        players: db.players,
        matches: visible,
        match_players: db.match_players.filter((mp) => ids.has(mp.match_id)),
        seasons: db.seasons,
      });
    },

    async getSession() {
      return session;
    },

    onAuthChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    async signInWithPin(pin) {
      checkPin(pin);
      await delay();
      const role = Object.keys(DEMO_PINS).find((key) => DEMO_PINS[key] === pin);
      if (!role) throw new AppError('PIN incorreto.');
      session = { email: PIN_ACCOUNTS[role] };
      writeStorage(SESSION_KEY, session.email);
      listeners.forEach((cb) => cb(session));
    },

    async signOut() {
      session = null;
      writeStorage(SESSION_KEY, null);
      listeners.forEach((cb) => cb(null));
    },

    async checkAdmin() {
      return sessionIsAdmin();
    },

    async addPlayer(name) {
      requireAdmin();
      const clean = name.trim();
      if (!clean || clean.length > 40) throw new AppError('O nome tem de ter entre 1 e 40 caracteres.');
      if (nameTaken(clean)) throw new AppError('Já existe um jogador com esse nome.');
      const player = { id: uid(), name: clean, active: true, created_at: new Date().toISOString() };
      db.players.push(player);
      persist();
      return clone(player);
    },

    async updatePlayer(id, patch) {
      requireAdmin();
      const player = db.players.find((p) => p.id === id);
      if (!player) throw new AppError('Jogador não encontrado.');
      if (patch.name !== undefined) {
        const clean = patch.name.trim();
        if (!clean || clean.length > 40) throw new AppError('O nome tem de ter entre 1 e 40 caracteres.');
        if (nameTaken(clean, id)) throw new AppError('Já existe um jogador com esse nome.');
        player.name = clean;
      }
      if (patch.active !== undefined) player.active = Boolean(patch.active);
      persist();
    },

    async addSeason(season) {
      requireAdmin();
      const name = season.name.trim();
      const total = Number(season.total_matches);
      if (!name || name.length > 40) throw new AppError('O nome tem de ter entre 1 e 40 caracteres.');
      if (!Number.isInteger(total) || total < 1 || total > 200) {
        throw new AppError('O número de jogos tem de estar entre 1 e 200.');
      }
      if (db.seasons.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())) {
        throw new AppError('Já existe uma época com esse nome.');
      }
      const row = {
        id: uid(), name, total_matches: total, starts_on: season.starts_on, created_at: new Date().toISOString(),
      };
      db.seasons.push(row);
      persist();
      return clone(row);
    },

    async saveMatch(match, players) {
      requireAdmin();
      await delay();
      const played = match.status === 'played';
      if (played && (match.score_a == null || match.score_b == null)) {
        throw new AppError('Indica o resultado do jogo.');
      }
      if (played) {
        const teams = new Set(players.map((p) => p.team).filter(Boolean));
        if (!teams.has('A') || !teams.has('B')) {
          throw new AppError('Um jogo jogado precisa de jogadores nas duas equipas.');
        }
      }
      const now = new Date().toISOString();
      const fields = {
        starts_at: match.starts_at,
        location: (match.location || '').trim(),
        status: match.status,
        score_a: played ? Number(match.score_a) : null,
        score_b: played ? Number(match.score_b) : null,
        notes: (match.notes || '').trim(),
      };
      let id = match.id;
      if (id) {
        const existing = db.matches.find((m) => m.id === id);
        if (!existing) throw new AppError('Jogo não encontrado.');
        Object.assign(existing, fields, { updated_at: now });
      } else {
        id = uid();
        db.matches.push({ id, ...fields, deleted_at: null, created_at: now, updated_at: now });
      }
      db.match_players = db.match_players.filter((mp) => mp.match_id !== id);
      for (const p of players) {
        db.match_players.push({
          match_id: id,
          player_id: p.player_id,
          team: p.team || null,
          confirmed: Boolean(p.confirmed),
          goals: played ? Number(p.goals) || 0 : 0,
          own_goals: played ? Number(p.own_goals) || 0 : 0,
        });
      }
      persist();
      return id;
    },

    async setConfirmed(matchId, playerId, confirmed) {
      requireAdmin();
      const row = db.match_players.find((mp) => mp.match_id === matchId && mp.player_id === playerId);
      if (row) row.confirmed = Boolean(confirmed);
      persist();
    },

    async confirmAll(matchId) {
      requireAdmin();
      for (const row of db.match_players) if (row.match_id === matchId) row.confirmed = true;
      persist();
    },

    async setMatchDeleted(matchId, deleted) {
      requireAdmin();
      const match = db.matches.find((m) => m.id === matchId);
      if (match) match.deleted_at = deleted ? new Date().toISOString() : null;
      persist();
    },

    async importBackup(backup) {
      requireAdmin();
      const upsert = (list, row, same) => {
        const index = list.findIndex((item) => same(item, row));
        if (index >= 0) list[index] = { ...list[index], ...row };
        else list.push(row);
      };
      for (const p of backup.players) upsert(db.players, p, (a, b) => a.id === b.id);
      for (const m of backup.matches) upsert(db.matches, m, (a, b) => a.id === b.id);
      const restored = new Set(backup.matches.map((m) => m.id));
      db.match_players = db.match_players.filter((mp) => !restored.has(mp.match_id));
      for (const mp of backup.match_players) {
        upsert(db.match_players, mp, (a, b) => a.match_id === b.match_id && a.player_id === b.player_id);
      }
      for (const s of backup.seasons) upsert(db.seasons, s, (a, b) => a.id === b.id);
      persist();
      return {
        players: backup.players.length,
        matches: backup.matches.length,
        match_players: backup.match_players.length,
        seasons: backup.seasons.length,
      };
    },

    // Demo only: start over with fresh sample data.
    async resetDemo() {
      db = { ...buildSeed(), seasons: [] };
      persist();
    },
  };
}
