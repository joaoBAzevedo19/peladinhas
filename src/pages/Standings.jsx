// "Classificação": per-player table for a season or for all seasons.
import { useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { PageHeader, Empty } from '../components/ui.jsx';
import { computeStandings, listSeasons } from '../lib/stats.js';
import { currentSeason } from '../lib/dates.js';
import { POINTS } from '../lib/config.js';
import { navigate } from '../hooks/useHashRoute.js';

export default function Standings() {
  const { matches, lineupsByMatch, playersById } = useData();
  const seasons = listSeasons(matches);
  const fallback = seasons.includes(currentSeason()) ? currentSeason() : seasons[0] || '';
  const [season, setSeason] = useState(fallback);
  const selected = season === 'all' || seasons.includes(season) ? season : fallback;

  const rows = computeStandings({
    matches,
    lineupsByMatch,
    playersById,
    season: selected === 'all' ? null : selected || null,
  });
  const openPlayer = (id) => {
    const epoca = selected && selected !== 'all' ? `&epoca=${encodeURIComponent(selected)}` : '';
    navigate(`/historico?jogador=${id}${epoca}`);
  };

  return (
    <div className="page">
      <PageHeader title="Classificação" />

      <div className="filters">
        <label className="field field-inline">
          <span>Época</span>
          <select value={selected} onChange={(e) => setSeason(e.target.value)}>
            {seasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
            <option value="all">Todas as épocas</option>
          </select>
        </label>
      </div>

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
    </div>
  );
}
