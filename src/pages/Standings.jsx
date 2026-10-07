// "Classificação": per-player table for a season or for all seasons.
import { useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { PageHeader, Empty, Dialog } from '../components/ui.jsx';
import { PlusIcon } from '../components/Icons.jsx';
import { computeStandings, isPlayed, listSeasons, seasonKeyOf } from '../lib/stats.js';
import { currentSeason, dateKey } from '../lib/dates.js';
import { POINTS } from '../lib/config.js';
import { navigate } from '../hooks/useHashRoute.js';

// Pop-up form for "+ Nova época". Calls onCreated with the new season.
function NewSeasonForm({ run, onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [startsOn, setStartsOn] = useState(dateKey(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const totalNumber = Number(total);
  const valid = name.trim() && Number.isInteger(totalNumber) && totalNumber >= 1 && totalNumber <= 200 && startsOn;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      const season = await run(
        (a) => a.addSeason({ name: name.trim(), total_matches: totalNumber, starts_on: startsOn }),
        `Época ${name.trim()} criada.`,
      );
      onCreated(season);
    } catch (err) {
      // The toast is hidden behind the pop-up, so show it here too.
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span className="field-label">Nome da época</span>
        <input
          type="text"
          value={name}
          maxLength={40}
          placeholder="Ex.: 2026/27"
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Nº de jogos</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            step={1}
            value={total}
            placeholder="Ex.: 30"
            onChange={(e) => setTotal(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">Data de início</span>
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
        </label>
      </div>
      <p className="field-help dialog-help">
        Os jogos a partir desta data passam a contar para a nova época.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="button-row dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
          {busy ? 'A criar…' : 'Criar época'}
        </button>
      </div>
    </form>
  );
}

export default function Standings() {
  const { matches, lineupsByMatch, playersById, seasons: registered, isAdmin, run } = useData();
  const seasons = listSeasons(matches, registered);
  const today = dateKey(new Date());
  // Default: the latest registered season that has started, otherwise the
  // automatic season of today.
  const current =
    seasons.find((s) => (s.starts_on ? s.starts_on <= today : s.key === currentSeason())) ?? seasons[0];
  const fallback = current?.key || '';
  const [season, setSeason] = useState(fallback);
  const [creating, setCreating] = useState(false);
  const selected = season === 'all' || seasons.some((s) => s.key === season) ? season : fallback;
  const selectedSeason = seasons.find((s) => s.key === selected);

  const rows = computeStandings({
    matches,
    lineupsByMatch,
    playersById,
    season: selected === 'all' ? null : selected || null,
    seasons: registered,
  });
  const playedInSeason = selectedSeason?.total_matches
    ? matches.filter((m) => isPlayed(m) && seasonKeyOf(m, registered) === selected).length
    : 0;
  const openPlayer = (id) => {
    const epoca = selected && selected !== 'all' ? `&epoca=${encodeURIComponent(selected)}` : '';
    navigate(`/historico?jogador=${id}${epoca}`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Classificação"
        action={
          isAdmin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              <PlusIcon /> Nova época
            </button>
          )
        }
      />

      <div className="filters">
        <label className="field field-inline">
          <span>Época</span>
          <select value={selected} onChange={(e) => setSeason(e.target.value)}>
            {seasons.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
            <option value="all">Todas as épocas</option>
          </select>
        </label>
      </div>

      {selectedSeason?.total_matches && (
        <p className="hint season-progress">
          {playedInSeason} de {selectedSeason.total_matches} jogos jogados
        </p>
      )}

      {rows.length === 0 ? (
        <Empty title="Ainda não há jogos registados nesta época.">
          <p>A tabela é calculada automaticamente a partir dos resultados.</p>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="standings">
            <thead>
              <tr>
                <th scope="col" className="c-rank"><abbr title="Posição">#</abbr></th>
                <th scope="col" className="c-name">Jogador</th>
                <th scope="col" className="c-pts"><abbr title="Pontos">Pts</abbr></th>
                <th scope="col"><abbr title="Jogos (presenças)">J</abbr></th>
                <th scope="col"><abbr title="Vitórias">V</abbr></th>
                <th scope="col"><abbr title="Empates">E</abbr></th>
                <th scope="col"><abbr title="Derrotas">D</abbr></th>
                <th scope="col"><abbr title="Golos">G</abbr></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.player_id}
                  className={r.rank === 1 ? 'is-leader' : ''}
                  onClick={() => openPlayer(r.player_id)}
                >
                  <td className="c-rank">{r.rank}</td>
                  <th scope="row" className="c-name">
                    <button type="button" onClick={(e) => { e.stopPropagation(); openPlayer(r.player_id); }}>
                      {r.name}
                    </button>
                  </th>
                  <td className="c-pts">{r.points}</td>
                  <td>{r.played}</td>
                  <td>{r.wins}</td>
                  <td>{r.draws}</td>
                  <td>{r.losses}</td>
                  <td>{r.goals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="footnote">
        Vitória {POINTS.win} pontos, empate {POINTS.draw}, derrota {POINTS.loss}, para cada jogador da equipa.
        Em caso de igualdade, conta o número de vitórias e depois os golos. Autogolos não contam como golos.
        Toca num jogador para ver os jogos dele.
      </p>

      {isAdmin && (
        <Dialog open={creating} onClose={() => setCreating(false)} title="Nova época">
          <NewSeasonForm
            run={run}
            onCancel={() => setCreating(false)}
            onCreated={(created) => {
              setCreating(false);
              setSeason(created.id);
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
