// "Jogos": next match, other scheduled matches and matches waiting for a result.
import { useData } from '../data/DataContext.jsx';
import { PageHeader, Slots, Empty } from '../components/ui.jsx';
import { UpcomingRow, PlayedRow } from '../components/MatchRows.jsx';
import { AlertIcon, PlusIcon } from '../components/Icons.jsx';
import { formatDayMonth, formatTime, formatWeekday, relativeDay, formatDate } from '../lib/dates.js';
import { BACKUP_REMINDER_DAYS, RESULT_GRACE_HOURS } from '../lib/config.js';
import { getLastBackup } from '../lib/backup.js';
import { isPlayed } from '../lib/stats.js';

function NextMatch({ match, lineup, playersById }) {
  const confirmed = lineup.filter((e) => e.confirmed);
  const pending = lineup.filter((e) => !e.confirmed);
  const name = (e) => playersById.get(e.player_id)?.name ?? '?';
  return (
    <a className="hero" href={`#/jogo/${match.id}`}>
      <div className="hero-top">
        <span className="hero-when">{relativeDay(match.starts_at)}</span>
        <span className="hero-place">{match.location || 'Local por definir'}</span>
      </div>
      <div className="hero-board">
        <div>
          <span className="hero-weekday">{formatWeekday(match.starts_at)}</span>
          <span className="hero-date">{formatDayMonth(match.starts_at)}</span>
        </div>
        <span className="hero-time">{formatTime(match.starts_at)}</span>
      </div>
      <div className="hero-slots">
        <Slots confirmed={confirmed.length} called={lineup.length} />
        <span>
          {confirmed.length} {confirmed.length === 1 ? 'confirmado' : 'confirmados'}
          {lineup.length > 0 && ` de ${lineup.length} convocados`}
        </span>
      </div>
      {lineup.length > 0 && (
        <ul className="hero-names">
          {confirmed.map((e) => (
            <li key={e.player_id} className="is-confirmed">{name(e)}</li>
          ))}
          {pending.map((e) => (
            <li key={e.player_id}>{name(e)}</li>
          ))}
        </ul>
      )}
      {match.notes && <p className="hero-notes">{match.notes}</p>}
    </a>
  );
}

function BackupReminder({ hasPlayed }) {
  const last = getLastBackup();
  const days = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
  if (!hasPlayed || days < BACKUP_REMINDER_DAYS) return null;
  return (
    <a className="notice" href="#/gerir">
      <AlertIcon />
      <span>
        {last
          ? `A última cópia de segurança neste dispositivo é de ${formatDate(last)}.`
          : 'Ainda não descarregaste nenhuma cópia de segurança neste dispositivo.'}{' '}
        <u>Descarregar agora</u>
      </span>
    </a>
  );
}

export default function Upcoming() {
  const { matches, lineupsByMatch, playersById, isAdmin } = useData();
  const now = Date.now();
  const grace = RESULT_GRACE_HOURS * 3600 * 1000;

  const scheduled = matches.filter((m) => m.status === 'scheduled');
  const upcoming = scheduled.filter((m) => new Date(m.starts_at).getTime() + grace >= now);
  const awaiting = scheduled.filter((m) => new Date(m.starts_at).getTime() + grace < now).reverse();
  const lastPlayed = [...matches].reverse().find(isPlayed);
  const [next, ...later] = upcoming;
  const lineup = (m) => lineupsByMatch.get(m.id) || [];

  return (
    <div className="page">
      <PageHeader
        title="Jogos"
        action={
          isAdmin && (
            <a className="btn btn-primary btn-sm" href="#/novo">
              <PlusIcon /> Novo jogo
            </a>
          )
        }
      />

      {isAdmin && <BackupReminder hasPlayed={Boolean(lastPlayed)} />}

      {awaiting.length > 0 && (
        <section className="section">
          <h2 className="section-title">À espera de resultado</h2>
          <div className="list">
            {awaiting.map((m) => (
              <a key={m.id} className="row row-awaiting" href={isAdmin ? `#/jogo/${m.id}/resultado` : `#/jogo/${m.id}`}>
                <div className="row-main">
                  <span className="row-title">
                    {formatWeekday(m.starts_at)}, {formatDate(m.starts_at)}
                  </span>
                  <span className="row-sub">{isAdmin ? 'Toca para registar o resultado' : 'O resultado ainda não foi registado'}</span>
                </div>
                {isAdmin && <span className="btn btn-primary btn-sm">Registar</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {next ? (
        <section className="section">
          <h2 className="section-title">Próximo jogo</h2>
          <NextMatch match={next} lineup={lineup(next)} playersById={playersById} />
        </section>
      ) : (
        <Empty title="Não há jogos marcados.">
          {isAdmin ? (
            <a className="btn btn-primary" href="#/novo">Marcar jogo</a>
          ) : (
            <p>Quando o próximo jogo for marcado, aparece aqui.</p>
          )}
        </Empty>
      )}

      {later.length > 0 && (
        <section className="section">
          <h2 className="section-title">Mais à frente</h2>
          <div className="list">
            {later.map((m) => (
              <UpcomingRow key={m.id} match={m} lineup={lineup(m)} />
            ))}
          </div>
        </section>
      )}

      {lastPlayed && (
        <section className="section">
          <h2 className="section-title">Último resultado</h2>
          <div className="list">
            <PlayedRow match={lastPlayed} lineup={lineup(lastPlayed)} playersById={playersById} />
          </div>
        </section>
      )}
    </div>
  );
}
