// League rules and app settings. Change values here only.

// Points per result, given to every player of the team.
export const POINTS = { win: 3, draw: 1, loss: 0 };

// Seasons run from September to August (e.g. 2026/27).
export const SEASON_START_MONTH = 9;

// All dates are shown and entered in Portuguese mainland time.
export const TIME_ZONE = 'Europe/Lisbon';
export const LOCALE = 'pt-PT';

// Default kick-off for new matches: Wednesday (3) at 21:00.
export const DEFAULT_KICKOFF = { weekday: 3, hour: 21, minute: 0 };

// Number of players per match (5 vs 5), used for the confirmation slots.
export const PLAYERS_PER_MATCH = 10;

// Remind the admin to download a backup after this many days.
export const BACKUP_REMINDER_DAYS = 7;

// A scheduled match counts as "waiting for result" this long after kick-off.
export const RESULT_GRACE_HOURS = 2;
