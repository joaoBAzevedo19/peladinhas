// List rows for upcoming and played matches.
import { ChevronRight } from './Icons.jsx';
import { ResultBadge, Slots } from './ui.jsx';
import { formatDayMonth, formatTime, formatWeekday, formatWeekdayShort, zonedParts } from '../lib/dates.js';
import { resultForTeam } from '../lib/stats.js';

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function scorersText(lineup, playersById) {
  const parts = [];
  for (const entry of lineup) {
    const name = playersById.get(entry.player_id)?.name ?? '?';
    if (entry.goals > 0) parts.push({ goals: entry.goals, text: entry.goals > 1 ? `${name} ${entry.goals}` : name });
    if (entry.own_goals > 0) parts.push({ goals: 0, text: `${name} (AG${entry.own_goals > 1 ? ` ×${entry.own_goals}` : ''})` });
  }
  return parts.sort((a, b) => b.goals - a.goals).map((p) => p.text).join(', ');
}

export function UpcomingRow({ match, lineup }) {
  const p = zonedParts(match.starts_at);
  const called = lineup.length;
  const confirmed = lineup.filter((e) => e.confirmed).length;
  return (
    <a className="row row-upcoming" href={`#/jogo/${match.id}`}>
      <div className="date-block">
        <span className="date-day">{String(p.day).padStart(2, '0')}</span>
        <span className="date-month">{MONTHS_SHORT[p.month - 1]}</span>
      </div>
      <div className="row-main">
        <span className="row-title">
          {formatWeekday(match.starts_at)}, {formatTime(match.starts_at)}
        </span>
        <span className="row-sub">{match.location || 'Local por definir'}</span>
        <Slots confirmed={confirmed} called={called} />
      </div>
      <div className="row-side">
        <span className="count">
          <strong>{confirmed}</strong>/{Math.max(called, 10)}
        </span>
        <ChevronRight />
      </div>
    </a>
  );
}

export function PlayedRow({ match, lineup, playersById, focusPlayerId }) {
  const cancelled = match.status === 'cancelled';
  const focus = focusPlayerId ? lineup.find((e) => e.player_id === focusPlayerId) : null;
  const focusResult = focus ? resultForTeam(match, focus.team) : null;
  const scorers = cancelled ? match.notes || 'Jogo cancelado' : scorersText(lineup, playersById);

  return (
    <a className={`row row-played ${cancelled ? 'is-cancelled' : ''}`} href={`#/jogo/${match.id}`}>
      <div className="date-stack">
        <span className="date-dm">{formatDayMonth(match.starts_at)}</span>
        <span className="date-wd">{formatWeekdayShort(match.starts_at)}</span>
      </div>
      <div className="row-main">
        {cancelled ? (
          <span className="row-title muted">Cancelado</span>
        ) : (
          <span className="scoreline" aria-label={`Equipa A ${match.score_a}, Equipa B ${match.score_b}`}>
            <span className="score-team team-a">A</span>
            <span className="score-num">{match.score_a}</span>
            <span className="score-sep">–</span>
            <span className="score-num">{match.score_b}</span>
            <span className="score-team team-b">B</span>
          </span>
        )}
        {scorers && <span className="row-sub truncate">{scorers}</span>}
      </div>
      <div className="row-side">
        {focus && focusResult && (
          <span className="focus-stat">
            <ResultBadge result={focusResult} />
            {focus.goals > 0 && <span className="focus-goals">{focus.goals} {focus.goals === 1 ? 'golo' : 'golos'}</span>}
          </span>
        )}
        <ChevronRight />
      </div>
    </a>
  );
}
