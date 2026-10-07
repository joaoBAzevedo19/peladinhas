// Pick the teams of a scheduled match once every called-up player has
// confirmed, by hand or by a random draw. Saving fills in the team of each
// player in the line-up.
import { useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { PageHeader, Segmented, Empty } from '../components/ui.jsx';
import { formatDate, formatWeekday } from '../lib/dates.js';
import { ShuffleIcon } from '../components/Icons.jsx';
import { canPickTeams, drawTeams } from '../lib/stats.js';
import { navigate } from '../hooks/useHashRoute.js';

const TEAM_OPTIONS = [
  { value: 'A', label: 'A', className: 'opt-a' },
  { value: 'B', label: 'B', className: 'opt-b' },
];

export default function TeamsForm({ id }) {
  const { allMatches, lineupsByMatch } = useData();
  const match = allMatches.find((m) => m.id === id);
  const lineup = (match && lineupsByMatch.get(match.id)) || [];
  const back = match ? `#/jogo/${match.id}` : '#/jogos';

  let problem = null;
  if (!match) problem = 'Jogo não encontrado.';
  else if (match.deleted_at || match.status !== 'scheduled') problem = 'Só se geram equipas para jogos agendados.';
  else if (!canPickTeams(lineup)) problem = 'Ainda há convocados por confirmar.';

  if (problem) {
    return (
      <div className="page">
        <PageHeader title="Gerar equipas" back={back} />
        <Empty title={problem}>
          <a className="btn" href={back}>Voltar ao jogo</a>
        </Empty>
      </div>
    );
  }
  return <TeamsFormInner match={match} lineup={lineup} back={back} />;
}

function TeamsFormInner({ match, lineup, back }) {
  const { playersById, run } = useData();
  const [teams, setTeams] = useState(() => Object.fromEntries(lineup.map((e) => [e.player_id, e.team])));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const name = (e) => playersById.get(e.player_id)?.name ?? '?';
  const count = (team) => lineup.filter((e) => teams[e.player_id] === team).length;
  const missing = lineup.filter((e) => !teams[e.player_id]).length;

  const setTeam = (playerId, team) => {
    setError('');
    setTeams((t) => ({ ...t, [playerId]: team }));
  };

  const draw = () => {
    setError('');
    setTeams(drawTeams(lineup.map((e) => e.player_id)));
  };

  const save = async (event) => {
    event.preventDefault();
    if (missing > 0) return setError('Põe todos os jogadores numa equipa (toca em A ou B ao lado do nome).');
    if (count('A') === 0 || count('B') === 0) return setError('Cada equipa precisa de pelo menos um jogador.');
    const payload = lineup.map(({ player_id, confirmed }) => ({
      player_id,
      confirmed,
      team: teams[player_id],
      goals: 0,
      own_goals: 0,
    }));
    setSaving(true);
    try {
      await run((api) => api.saveMatch(match, payload), 'Equipas confirmadas.');
      navigate(`/jogo/${match.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="page page-form" onSubmit={save} noValidate>
      <PageHeader title="Gerar equipas" back={back} />
      <p className="hint">
        {formatWeekday(match.starts_at)}, {formatDate(match.starts_at)}
      </p>

      <section className="section">
        <h2 className="section-title">
          Equipas{' '}
          <span className="muted">
            A: {count('A')}, B: {count('B')}
            {missing > 0 && `, ${missing} sem equipa`}
          </span>
        </h2>
        <p className="hint">Sorteia as equipas ou toca em A ou B para pôr cada jogador numa equipa.</p>
        <button type="button" className="btn btn-block teams-draw" onClick={draw}>
          <ShuffleIcon />
          Sortear equipas
        </button>

        <ul className="player-list">
          {lineup.map((e) => {
            const team = teams[e.player_id];
            return (
              <li key={e.player_id} className={`prow prow-result ${team ? `has-team team-${team.toLowerCase()}` : ''}`}>
                <span className="prow-label">{name(e)}</span>
                <Segmented
                  small
                  allowEmpty
                  value={team}
                  options={TEAM_OPTIONS}
                  label={`Equipa de ${name(e)}`}
                  onChange={(value) => setTeam(e.player_id, value)}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <div className="form-bar">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-bar-buttons">
          <a className="btn" href={back}>Cancelar</a>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'A guardar…' : 'Confirmar equipas'}
          </button>
        </div>
      </div>
    </form>
  );
}
