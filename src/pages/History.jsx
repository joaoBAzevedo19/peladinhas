// "Histórico": played and cancelled matches, filterable by season and player.
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { PageHeader, Empty } from '../components/ui.jsx';
import { PlayedRow } from '../components/MatchRows.jsx';
import { formatMonthYear, monthKey, seasonOf } from '../lib/dates.js';
import { listSeasons, playerSummary } from '../lib/stats.js';

export default function History({ query }) {
  const { matches, lineupsByMatch, playersById, players } = useData();
  const [season, setSeason] = useState(query.epoca || '');
  const [playerId, setPlayerId] = useState(query.jogador || '');

  // Links from the standings (#/historico?jogador=...) update the filter.
  useEffect(() => {
    if (query.jogador !== undefined) setPlayerId(query.jogador);
    if (query.epoca !== undefined) setSeason(query.epoca);
  }, [query.jogador, query.epoca]);

  const seasons = listSeasons(matches);

  const filtered = useMemo(() => {
    return matches
      .filter((m) => m.status === 'played' || m.status === 'cancelled')
      .filter((m) => !season || seasonOf(m.starts_at) === season)
      .filter((m) => {
        if (!playerId) return true;
        if (m.status !== 'played') return false;
        return (lineupsByMatch.get(m.id) || []).some((e) => e.player_id === playerId && e.team);
      })
      .reverse();
  }, [matches, lineupsByMatch, season, playerId]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const m of filtered) {
      const key = monthKey(m.starts_at);
      if (!map.has(key)) map.set(key, { label: formatMonthYear(m.starts_at), items: [] });
      map.get(key).items.push(m);
    }
    return [...map.values()];
  }, [filtered]);

  const summary = playerId ? playerSummary(playerId, filtered, lineupsByMatch) : null;
  const selectedName = playerId ? playersById.get(playerId)?.name : null;
  // Players who appear in at least one line-up (active ones first).
  const options = players.filter((p) => p.active || matches.some((m) => (lineupsByMatch.get(m.id) || []).some((e) => e.player_id === p.id)));

  return (
    <div className="page">
      <PageHeader title="Histórico" />

      <div className="filters">
        <label className="field field-inline">
          <span>Época</span>
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            <option value="">Todas as épocas</option>
            {seasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field field-inline">
          <span>Jogador</span>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">Todos os jogadores</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (inativo)'}</option>
            ))}
          </select>
        </label>
      </div>

      {summary && (
        <div className="statline" aria-label={`Resumo de ${selectedName}`}>
          <div><strong>{summary.played}</strong><span>Jogos</span></div>
          <div><strong>{summary.wins}</strong><span>Vitórias</span></div>
          <div><strong>{summary.draws}</strong><span>Empates</span></div>
          <div><strong>{summary.losses}</strong><span>Derrotas</span></div>
          <div><strong>{summary.goals}</strong><span>Golos</span></div>
          <div><strong>{summary.points}</strong><span>Pontos</span></div>
        </div>
      )}

      {groups.length === 0 ? (
        <Empty title={playerId ? `${selectedName ?? 'Este jogador'} ainda não jogou neste período.` : 'Ainda não há jogos registados.'}>
          <p>Os jogos aparecem aqui depois de o resultado ser registado.</p>
        </Empty>
      ) : (
        groups.map((group) => (
          <section className="section" key={group.label}>
            <h2 className="section-title">{group.label}</h2>
            <div className="list">
              {group.items.map((m) => (
                <PlayedRow
                  key={m.id}
                  match={m}
                  lineup={lineupsByMatch.get(m.id) || []}
                  playersById={playersById}
                  focusPlayerId={playerId || null}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
