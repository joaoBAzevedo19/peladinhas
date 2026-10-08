// Pick the teams of a scheduled match once every called-up player has
// confirmed, by hand or by a draw (random, balanced by OVR or balanced by
// goals per match in the match's season). After a balanced draw each player
// shows the value used (OVR or season goals). Saving fills in the team of
// each player in the line-up.
import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { PageHeader, Segmented, Empty, Dialog, TeamTag } from '../components/ui.jsx';
import { formatDate, formatWeekday } from '../lib/dates.js';
import { ShuffleIcon } from '../components/Icons.jsx';
import { canPickTeams, drawTeams, balanceTeams, seasonGoals, seasonKeyOf, teamAverages } from '../lib/stats.js';
import { LOCALE } from '../lib/config.js';
import { navigate } from '../hooks/useHashRoute.js';

const TEAM_OPTIONS = [
  { value: 'A', label: 'A', className: 'opt-a' },
  { value: 'B', label: 'B', className: 'opt-b' },
];

// Draw methods offered in the pop-up. `average` labels the team averages
// shown after a balanced draw.
const DRAW_METHODS = [
  { value: 'random', label: 'Aleatória', help: 'Divide os jogadores ao acaso.' },
  {
    value: 'rating',
    label: 'Por rating',
    help: 'Equipas com a média de OVR o mais próxima possível.',
    average: 'Média de OVR',
    digits: 1,
  },
  {
    value: 'efficacy',
    label: 'Por eficácia',
    help: 'Equipas com a média de golos por jogo nesta época o mais próxima possível. Quem ainda não jogou na época conta como 0.',
    average: 'Média de golos por jogo',
    digits: 2,
  },
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
  const { playersById, run, overalls, matches, lineupsByMatch, seasons } = useData();
  const [teams, setTeams] = useState(() => Object.fromEntries(lineup.map((e) => [e.player_id, e.team])));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [method, setMethod] = useState(null);

  // Efficacy uses the season the match belongs to.
  const seasonKey = seasonKeyOf(match, seasons);
  const seasonLabel = seasons.find((s) => s.id === seasonKey)?.name ?? seasonKey;
  const goals = useMemo(
    () => seasonGoals(matches, lineupsByMatch, seasonKey, seasons),
    [matches, lineupsByMatch, seasonKey, seasons],
  );
  const values = useMemo(
    () => ({ rating: overalls, efficacy: new Map([...goals].map(([id, g]) => [id, g.perMatch])) }),
    [overalls, goals],
  );
  const drawn = DRAW_METHODS.find((m) => m.value === method);

  // Value shown next to each player after a balanced draw.
  const playerStat = (id) => {
    if (method === 'rating') {
      return <><span className="prow-stat-num">{overalls.get(id) ?? '–'}</span> <abbr title="Overall">OVR</abbr></>;
    }
    if (method === 'efficacy') {
      const n = goals.get(id)?.goals ?? 0;
      return <><span className="prow-stat-num">{n}</span> {n === 1 ? 'golo' : 'golos'}</>;
    }
    return null;
  };

  const name = (e) => playersById.get(e.player_id)?.name ?? '?';
  const count = (team) => lineup.filter((e) => teams[e.player_id] === team).length;
  const missing = lineup.filter((e) => !teams[e.player_id]).length;

  const setTeam = (playerId, team) => {
    setError('');
    setTeams((t) => ({ ...t, [playerId]: team }));
  };

  const draw = (chosen) => {
    const ids = lineup.map((e) => e.player_id);
    setError('');
    setTeams(chosen === 'random' ? drawTeams(ids) : balanceTeams(ids, values[chosen]));
    setMethod(chosen);
    setChoosing(false);
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
        <button type="button" className="btn btn-block teams-draw" onClick={() => setChoosing(true)}>
          <ShuffleIcon />
          Sortear equipas
        </button>
        {method === 'efficacy' && <p className="hint teams-averages">Golos de cada jogador na época {seasonLabel}.</p>}
        {drawn?.average && <TeamAverages label={drawn.average} digits={drawn.digits} averages={teamAverages(teams, values[method])} />}

        <ul className="player-list">
          {lineup.map((e) => {
            const team = teams[e.player_id];
            const stat = playerStat(e.player_id);
            return (
              <li key={e.player_id} className={`prow prow-result ${team ? `has-team team-${team.toLowerCase()}` : ''}`}>
                <span className="prow-who">
                  <span className="prow-label">{name(e)}</span>
                  {stat && <span className="prow-stat">{stat}</span>}
                </span>
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

      <Dialog open={choosing} onClose={() => setChoosing(false)} title="Sortear equipas">
        <p className="hint dialog-help">Escolhe como dividir os jogadores.</p>
        <div className="draw-methods">
          {DRAW_METHODS.map((m) => (
            <button key={m.value} type="button" className="draw-method" onClick={() => draw(m.value)}>
              <span className="draw-method-label">{m.label}</span>
              <span className="draw-method-help">{m.help}</span>
            </button>
          ))}
        </div>
      </Dialog>

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

// Average of each team for the balanced draw just made (updates when a
// player is moved by hand).
function TeamAverages({ label, digits, averages }) {
  const format = (n) =>
    n == null ? '–' : n.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (
    <p className="hint teams-averages">
      {label}: <TeamTag team="A" /> {format(averages.A)} · <TeamTag team="B" /> {format(averages.B)}
    </p>
  );
}
