// Loads all data once, keeps it in memory and reloads after every change.
// The data set is small (a few hundred matches), so this keeps the app
// simple and every screen consistent.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api/index.js';
import { friendlyError } from '../lib/api/errors.js';
import { computeOverallTimeline } from '../lib/stats.js';

const DataContext = createContext(null);

const byName = (a, b) => a.name.localeCompare(b.name, 'pt');

export function DataProvider({ children }) {
  const [data, setData] = useState({ players: [], matches: [], match_players: [], seasons: [] });
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, kind = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ message, kind, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000);
  }, []);

  const reload = useCallback(async () => {
    try {
      const next = await api.loadAll();
      setData(next);
      setStatus('ready');
      setError(null);
    } catch (err) {
      setError(friendlyError(err).message);
      setStatus((current) => (current === 'ready' ? 'ready' : 'error'));
      throw err;
    }
  }, []);

  // Session and admin status.
  useEffect(() => {
    let active = true;
    api.getSession().then(
      (s) => {
        if (!active) return;
        setSession(s);
        setAuthReady(true);
      },
      () => active && setAuthReady(true),
    );
    const unsubscribe = api.onAuthChange((s) => setSession(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!session) {
      setIsAdmin(false);
    } else {
      api.checkAdmin().then(
        (value) => active && setIsAdmin(value),
        () => active && setIsAdmin(false),
      );
    }
    return () => {
      active = false;
    };
  }, [session]);

  // Admins also see deleted matches, so reload when the role changes.
  useEffect(() => {
    reload().catch(() => {});
  }, [reload, isAdmin]);

  // Runs a write, reloads the data and shows the result.
  const run = useCallback(
    async (action, successMessage) => {
      try {
        const result = await action(api);
        await reload();
        if (successMessage) showToast(successMessage);
        return result;
      } catch (err) {
        const friendly = friendlyError(err);
        showToast(friendly.message, 'error');
        throw friendly;
      }
    },
    [reload, showToast],
  );

  const derived = useMemo(() => {
    const players = [...data.players].sort(byName);
    const playersById = new Map(players.map((p) => [p.id, p]));
    const matches = [...data.matches].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const visibleMatches = matches.filter((m) => !m.deleted_at);
    const deletedMatches = matches.filter((m) => m.deleted_at);
    const lineupsByMatch = new Map();
    for (const row of data.match_players) {
      if (!lineupsByMatch.has(row.match_id)) lineupsByMatch.set(row.match_id, []);
      lineupsByMatch.get(row.match_id).push(row);
    }
    for (const rows of lineupsByMatch.values()) {
      rows.sort((a, b) => byName(playersById.get(a.player_id) ?? { name: '' }, playersById.get(b.player_id) ?? { name: '' }));
    }
    const locations = [...new Set(visibleMatches.map((m) => m.location).filter(Boolean))].reverse();
    const seasons = data.seasons ?? [];
    // Current OVR of every player and its change per match (deleted matches never count).
    const { overalls, changes: overallChanges } = computeOverallTimeline({ players, matches: visibleMatches, lineupsByMatch });
    return {
      players, playersById, matches: visibleMatches, allMatches: matches, deletedMatches, lineupsByMatch, locations, seasons, overalls,
      overallChanges,
    };
  }, [data]);

  const value = {
    ...derived,
    raw: data,
    status,
    error,
    session,
    authReady,
    isAdmin,
    mode: api.mode,
    reload,
    run,
    toast,
    showToast,
    dismissToast: () => setToast(null),
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}
