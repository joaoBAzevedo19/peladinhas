// Match page: scoreboard for played matches; call-up list or confirmed teams
// for scheduled ones; and the admin actions.
import { useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { PageHeader, Empty, ConfirmButton, TeamTag } from '../components/ui.jsx';
import { BallIcon, CheckIcon, AlertIcon } from '../components/Icons.jsx';
import { formatDate, formatTime, formatWeekday, formatDateTime } from '../lib/dates.js';
import { resultForTeam, scoreMismatch, canPickTeams, teamsConfirmed } from '../lib/stats.js';
import { navigate } from '../hooks/useHashRoute.js';

const STATUS_LABEL = { scheduled: 'Agendado', played: 'Jogado', cancelled: 'Cancelado' };
const ALL = 'all';

const toPayload = (lineup) =>
  lineup.map(({ player_id, team, confirmed, goals, own_goals }) => ({ player_id, team, confirmed, goals, own_goals }));

function Scoreboard({ match, lineup, playersById }) {
  const name = (e) => playersById.get(e.player_id)?.name ?? '?';
  const sides = ['A', 'B'].map((team) => ({
    team,
    score: team === 'A' ? match.score_a : match.score_b,
    result: resultForTeam(match, team),
    players: lineup.filter((e) => e.team === team),
  }));
  const absent = lineup.filter((e) => !e.team);
  const winner = sides.find((s) => s.result === 'win');

  return (
    <>
      <div className="board" aria-label={`Equipa A ${match.score_a}, Equipa B ${match.score_b}`}>
        {sides.map((s, i) => (
          <div key={s.team} className={`board-side team-${s.team.toLowerCase()} ${s.result === 'win' ? 'is-winner' : ''}`}>
            <span className="board-label">Equipa {s.team}</span>
            <span className="board-score">{s.score}</span>
            {i === 0 && <span className="board-sep" aria-hidden="true">–</span>}
          </div>
        ))}
      </div>
      <p className="board-result">{winner ? `Vitória da Equipa ${winner.team}` : 'Empate'}</p>

      <div className="teams">
        {sides.map((s) => (
          <ul key={s.team} className={`team-list team-${s.team.toLowerCase()}`} aria-label={`Equipa ${s.team}`}>
            {s.players.map((e) => (
              <li key={e.player_id}>
                <span className="team-player">{name(e)}</span>
                <span className="team-goals">
                  {e.goals > 0 && (
                    <span className="goal-count" title={`${e.goals} ${e.goals === 1 ? 'golo' : 'golos'}`}>
                      <BallIcon />
                      {e.goals > 1 && e.goals}
                    </span>
                  )}
                  {e.own_goals > 0 && (
                    <span className="own-goal" title="Autogolo">AG{e.own_goals > 1 && ` ${e.own_goals}`}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ))}
      </div>

      {absent.length > 0 && (
        <p className="muted small">Convocados que não jogaram: {absent.map(name).join(', ')}.</p>
      )}
    </>
  );
}

// Teams picked before kick-off (scheduled match, every player on a side).
function Teams({ match, lineup, playersById, isAdmin }) {
  const name = (e) => playersById.get(e.player_id)?.name ?? '?';
  return (
    <section className="section">
      <h2 className="section-title">Equipas</h2>
      <div className="teams">
        {['A', 'B'].map((team) => {
          const players = lineup.filter((e) => e.team === team);
          return (
            <div key={team}>
              <p className={`teams-head team-${team.toLowerCase()}`}>
                Equipa {team} <span className="muted">{players.length}</span>
              </p>
              <ul className={`team-list team-${team.toLowerCase()}`} aria-label={`Equipa ${team}`}>
                {players.map((e) => (
                  <li key={e.player_id}>
                    <span className="team-player">{name(e)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {isAdmin && (
        <p className="hint teams-change">
          <a className="link" href={`#/jogo/${match.id}/equipas`}>Alterar equipas</a>
        </p>
      )}
    </section>
  );
}

function CallUps({ match, lineup, playersById, isAdmin, run }) {
  const [busy, setBusy] = useState(null);
  const confirmed = lineup.filter((e) => e.confirmed).length;
  const name = (e) => playersById.get(e.player_id)?.name ?? '?';

  const editable = isAdmin && match.status === 'scheduled';
  const pending = lineup.length - confirmed;

  // busy holds the player being saved, or ALL while confirming everyone.
  const save = async (key, action, successMessage) => {
    setBusy(key);
    try {
      await run(action, successMessage);
    } catch {
      // Error already shown in the toast.
    } finally {
      setBusy(null);
    }
  };
  const toggle = (entry) =>
    save(entry.player_id, (api) => api.setConfirmed(match.id, entry.player_id, !entry.confirmed));
  const confirmAll = () => save(ALL, (api) => api.confirmAll(match.id), 'Todos os convocados confirmados.');

  if (lineup.length === 0) {
    return (
      <Empty title="Ainda não há convocados.">
        {isAdmin && <a className="btn" href={`#/jogo/${match.id}/editar`}>Escolher convocados</a>}
      </Empty>
    );
  }

  return (
    <section className="section">
      <h2 className="section-title">
        Convocados <span className="muted">{confirmed} de {lineup.length} confirmados</span>
      </h2>
      {editable && (
        <>
          <p className="hint">Toca num jogador para marcar ou desmarcar a confirmação.</p>
          {pending > 0 && (
            <button type="button" className="btn btn-block callups-all" disabled={busy !== null} onClick={confirmAll}>
              <CheckIcon /> {busy === ALL ? 'A confirmar…' : `Confirmar todos (${pending})`}
            </button>
          )}
        </>
      )}
      <ul className="list callups">
        {lineup.map((e) => {
          const content = (
            <>
              <span className="callup-name">
                {name(e)} <TeamTag team={e.team} />
              </span>
              <span className={`callup-state ${e.confirmed ? 'is-confirmed' : ''}`}>
                {e.confirmed ? (
                  <>
                    <CheckIcon /> Confirmado
                  </>
                ) : (
                  'Por confirmar'
                )}
              </span>
            </>
          );
          return (
            <li key={e.player_id}>
              {editable ? (
                <button
                  type="button"
                  className="row callup"
                  aria-pressed={e.confirmed}
                  disabled={busy === e.player_id || busy === ALL}
                  onClick={() => toggle(e)}
                >
                  {content}
                </button>
              ) : (
                <div className="row callup">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function MatchDetail({ id }) {
  const { allMatches, lineupsByMatch, playersById, isAdmin, run } = useData();
  const match = allMatches.find((m) => m.id === id);

  if (!match) {
    return (
      <div className="page">
        <PageHeader title="Jogo" back="#/jogos" />
        <Empty title="Jogo não encontrado.">
          <p>Pode ter sido eliminado. Volta à lista de jogos.</p>
        </Empty>
      </div>
    );
  }

  const lineup = lineupsByMatch.get(id) || [];
  const played = match.status === 'played';
  const back = match.status === 'scheduled' ? '#/jogos' : '#/historico';
  const mismatch = played ? scoreMismatch(match, lineup) : null;
  const scheduled = match.status === 'scheduled';
  const hasTeams = scheduled && teamsConfirmed(lineup);
  const teamsAllowed = canPickTeams(lineup);

  const setStatus = (status, message) =>
    run((api) => api.saveMatch({ ...match, status }, toPayload(lineup)), message).catch(() => {});
  const setDeleted = (deleted, message) =>
    run((api) => api.setMatchDeleted(match.id, deleted), message).catch(() => {});

  return (
    <div className="page">
      <PageHeader title={`${formatWeekday(match.starts_at)}, ${formatDate(match.starts_at)}`} back={back} />

      <p className="match-meta">
        <span className={`status-pill status-${match.status}`}>{STATUS_LABEL[match.status]}</span>
        <span>{formatTime(match.starts_at)}</span>
        {match.location && <span>{match.location}</span>}
      </p>

      {match.deleted_at && (
        <div className="notice notice-danger">
          <AlertIcon />
          <span>Este jogo foi eliminado em {formatDateTime(match.deleted_at)} e não aparece a ninguém.</span>
        </div>
      )}

      {played ? (
        <Scoreboard match={match} lineup={lineup} playersById={playersById} />
      ) : hasTeams ? (
        <Teams match={match} lineup={lineup} playersById={playersById} isAdmin={isAdmin} />
      ) : (
        <CallUps match={match} lineup={lineup} playersById={playersById} isAdmin={isAdmin} run={run} />
      )}

      {isAdmin && mismatch && (
        <div className="notice">
          <AlertIcon />
          <span>
            {mismatch
              .map((m) => `Os golos individuais da Equipa ${m.team} somam ${m.counted}, mas o resultado diz ${m.score}.`)
              .join(' ')}{' '}
            Os pontos contam pelo resultado.
          </span>
        </div>
      )}

      {match.notes && match.status !== 'cancelled' && (
        <section className="section">
          <h2 className="section-title">Notas</h2>
          <p className="notes">{match.notes}</p>
        </section>
      )}
      {match.notes && match.status === 'cancelled' && <p className="notes">{match.notes}</p>}

      {isAdmin && (
        <section className="section actions">
          {match.deleted_at ? (
            <button type="button" className="btn btn-primary" onClick={() => setDeleted(false, 'Jogo restaurado.')}>
              Restaurar jogo
            </button>
          ) : (
            <>
              {hasTeams && (
                <a className="btn btn-primary" href={`#/jogo/${match.id}/resultado`}>Registar resultado</a>
              )}
              {scheduled && !hasTeams && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!teamsAllowed}
                    aria-describedby={teamsAllowed ? undefined : 'teams-locked'}
                    onClick={() => navigate(`/jogo/${match.id}/equipas`)}
                  >
                    Gerar equipas
                  </button>
                  {!teamsAllowed && (
                    <p id="teams-locked" className="hint actions-hint">
                      Fica disponível quando todos os convocados tiverem confirmado.
                    </p>
                  )}
                </>
              )}
              {played && <a className="btn btn-primary" href={`#/jogo/${match.id}/editar`}>Editar resultado</a>}
              {match.status === 'cancelled' && (
                <button type="button" className="btn btn-primary" onClick={() => setStatus('scheduled', 'Jogo reaberto.')}>
                  Reabrir jogo
                </button>
              )}
              {!played && <a className="btn" href={`#/jogo/${match.id}/editar`}>Editar jogo</a>}
              {scheduled && !hasTeams && (
                <ConfirmButton className="btn" confirmLabel="Confirmar cancelamento" onConfirm={() => setStatus('cancelled', 'Jogo cancelado.')}>
                  Cancelar jogo
                </ConfirmButton>
              )}
              <ConfirmButton
                className="btn btn-ghost btn-danger-text"
                confirmLabel="Eliminar mesmo"
                onConfirm={() => setDeleted(true, 'Jogo eliminado. Podes restaurá-lo aqui ou em Gerir.')}
              >
                Eliminar jogo
              </ConfirmButton>
            </>
          )}
        </section>
      )}
    </div>
  );
}
