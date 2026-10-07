// Backend that talks to Supabase. Security lives in the database
// (supabase/schema.sql): anyone can read, only admins can write, and
// nothing can be deleted through the API.
import { createClient } from '@supabase/supabase-js';
import { friendlyError, AppError } from './errors.js';
import { PIN_ACCOUNTS } from '../config.js';
import { checkPin } from './pin.js';

// Supabase returns at most 1000 rows per request, so tables are read in pages.
const PAGE_SIZE = 1000;

export function createSupabaseApi(url, key) {
  const client = createClient(url, key);

  async function fetchAll(table, orderColumns) {
    const rows = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = client.from(table).select('*');
      for (const column of orderColumns) query = query.order(column, { ascending: true });
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw friendlyError(error);
      rows.push(...data);
      if (data.length < PAGE_SIZE) return rows;
    }
  }

  const toSession = (session) => (session ? { email: session.user.email } : null);

  return {
    mode: 'supabase',

    async loadAll() {
      try {
        const [players, matches, match_players, seasons] = await Promise.all([
          fetchAll('players', ['id']),
          fetchAll('matches', ['id']),
          fetchAll('match_players', ['match_id', 'player_id']),
          // Until schema.sql is run again the table is missing: show no
          // registered seasons instead of failing the whole app.
          fetchAll('seasons', ['id']).catch(() => []),
        ]);
        return { players, matches, match_players, seasons };
      } catch (error) {
        if (/ligação/.test(error.message)) {
          throw new AppError(
            'Não foi possível ligar à base de dados. Se a app esteve sem uso mais de uma semana, ' +
              'o administrador tem de reativar o projeto no painel do Supabase.',
          );
        }
        throw error;
      }
    },

    async getSession() {
      const { data } = await client.auth.getSession();
      return toSession(data.session);
    },

    onAuthChange(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => callback(toSession(session)));
      return () => data.subscription.unsubscribe();
    },

    // The PIN is the password of the guest or the admin account: try both.
    async signInWithPin(pin) {
      checkPin(pin);
      for (const email of [PIN_ACCOUNTS.guest, PIN_ACCOUNTS.admin]) {
        const { error } = await client.auth.signInWithPassword({ email, password: pin });
        if (!error) return;
        if (!/invalid login credentials/i.test(error.message)) throw friendlyError(error);
      }
      throw new AppError('PIN incorreto.');
    },

    async signOut() {
      await client.auth.signOut();
    },

    async checkAdmin() {
      const { data, error } = await client.rpc('is_admin');
      if (error) throw friendlyError(error);
      return data === true;
    },

    async addPlayer(name) {
      const { data, error } = await client.from('players').insert({ name: name.trim() }).select().single();
      if (error) throw friendlyError(error);
      return data;
    },

    async updatePlayer(id, patch) {
      const { data, error } = await client.from('players').update(patch).eq('id', id).select();
      if (error) throw friendlyError(error);
      if (!data.length) throw new AppError('Sem permissão. Entra como administrador em Gerir.');
    },

    // season: {name, total_matches, starts_on ("2026-10-07")}
    async addSeason(season) {
      const { data, error } = await client
        .from('seasons')
        .insert({ name: season.name.trim(), total_matches: season.total_matches, starts_on: season.starts_on })
        .select()
        .single();
      if (error) throw friendlyError(error);
      return data;
    },

    // match: {id?, starts_at, location, status, score_a, score_b, notes}
    // players: [{player_id, team, confirmed, goals, own_goals}]
    async saveMatch(match, players) {
      const { data, error } = await client.rpc('save_match', { p_match: match, p_players: players });
      if (error) throw friendlyError(error);
      return data;
    },

    async setConfirmed(matchId, playerId, confirmed) {
      const { data, error } = await client
        .from('match_players')
        .update({ confirmed })
        .eq('match_id', matchId)
        .eq('player_id', playerId)
        .select();
      if (error) throw friendlyError(error);
      if (!data.length) throw new AppError('Sem permissão. Entra como administrador em Gerir.');
    },

    // One UPDATE over the whole call-up, so it is atomic.
    async confirmAll(matchId) {
      const { data, error } = await client
        .from('match_players')
        .update({ confirmed: true })
        .eq('match_id', matchId)
        .select();
      if (error) throw friendlyError(error);
      if (!data.length) throw new AppError('Sem permissão. Entra como administrador em Gerir.');
    },

    async setMatchDeleted(matchId, deleted) {
      const { data, error } = await client
        .from('matches')
        .update({ deleted_at: deleted ? new Date().toISOString() : null })
        .eq('id', matchId)
        .select();
      if (error) throw friendlyError(error);
      if (!data.length) throw new AppError('Sem permissão. Entra como administrador em Gerir.');
    },

    async importBackup(backup) {
      const { data, error } = await client.rpc('import_backup', { p_data: backup });
      if (error) throw friendlyError(error);
      return data;
    },
  };
}
