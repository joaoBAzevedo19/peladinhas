// JSON backups: the safety net for the match history. The free Supabase
// plan has no automatic backups, so the admin downloads one regularly.
import { AppError } from './api/errors.js';

const LAST_BACKUP_KEY = 'peladinhas-last-backup';

export function buildBackup({ players, matches, match_players }) {
  return {
    app: 'peladinhas',
    version: 1,
    exported_at: new Date().toISOString(),
    players,
    matches,
    match_players,
  };
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AppError('O ficheiro não é uma cópia válida (JSON ilegível).');
  }
  const ok =
    data?.app === 'peladinhas' &&
    Array.isArray(data.players) &&
    Array.isArray(data.matches) &&
    Array.isArray(data.match_players);
  if (!ok) throw new AppError('O ficheiro não é uma cópia da Peladinhas.');
  return data;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getLastBackup() {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

export function setLastBackup(iso) {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso);
  } catch {
    // Not critical: only used for the reminder.
  }
}
