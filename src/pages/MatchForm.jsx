// Create or edit a match. The same screen handles call-ups (scheduled
// matches) and results (teams, score and goals).
import { useMemo, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { PageHeader, Segmented, Stepper } from '../components/ui.jsx';
import { CheckIcon, AlertIcon, PlusIcon } from '../components/Icons.jsx';
import {
  formatDate,
  formatTime,
  formatWeekday,
  isoToLocalInput,
  localInputToIso,
  nextKickoffInput,
} from '../lib/dates.js';
import { goalsFromLineup } from '../lib/stats.js';
import { navigate } from '../hooks/useHashRoute.js';

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Agendado' },
  { value: 'played', label: 'Jogado' },
  { value: 'cancelled', label: 'Cancelado' },
];
const TEAM_OPTIONS = [
  { value: 'A', label: 'A', className: 'opt-a' },
  { value: 'B', label: 'B', className: 'opt-b' },
];

const emptyEntry = () => ({ called: false, confirmed: false, team: null, goals: 0, own_goals: 0 });

function initialState({ id, mode, allMatches, lineupsByMatch, locations }) {
  const match = id ? allMatches.find((m) => m.id === id) : null;

  if (!match) {
    // New match: next free Wednesday 21:00, last location, last call-ups.
    const taken = allMatches.filter((m) => !m.deleted_at && m.status !== 'cancelled').map((m) => m.starts_at);
    const previous = [...allMatches].reverse().find((m) => !m.deleted_at && (lineupsByMatch.get(m.id) || []).length);
    const entries = {};
    for (const e of previous ? lineupsByMatch.get(previous.id) : []) {
      entries[e.player_id] = { ...emptyEntry(), called: true };
    }
    return {
      startsAt: nextKickoffInput(new Date(), taken),
      location: locations[0] || '',
      status: 'scheduled',
      scoreA: 0,
      scoreB: 0,
      notes: '',
      entries,
    };
  }

  const entries = {};
  for (const e of lineupsByMatch.get(match.id) || []) {
    entries[e.player_id] = {
      called: true,
      confirmed: e.confirmed,
      team: e.team,
      goals: e.goals || 0,
      own_goals: e.own_goals || 0,
    };
  }
  return {
    startsAt: isoToLocalInput(match.starts_at),
    location: match.location,
    status: mode === 'result' ? 'played' : match.status,
    scoreA: match.score_a ?? 0,
    scoreB: match.score_b ?? 0,
    notes: match.notes,
    entries,
  };
}

export default function MatchForm({ id, mode }) {
  const { allMatches } = useData();
  if (id && !allMatches.some((m) => m.id === id)) {
    return (
      <div className="page">
        <PageHeader title="Jogo" back="#/jogos" />
        <div className="empty">
          <p className="empty-title">Jogo não encontrado.</p>
        </div>
      </div>
    );
  }
  return <MatchFormInner id={id} mode={mode} />;
}

function MatchFormInner({ id, mode }) {
  const { allMatches, lineupsByMatch, players, locations, run } = useData();
  const existing = id ? allMatches.find((m) => m.id === id) : null;
  const [form, setForm] = useState(() => initialState({ id, mode, allMatches, lineupsByMatch, locations }));
  const [shownIds] = useState(() => new Set(Object.keys(form.entries)));
  const [showAll, setShowAll] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const played = form.status === 'played';
  const set = (patch) => {
    setError('');
    setForm((f) => ({ ...f, ...patch }));
  };
  const entry = (playerId) => form.entries[playerId] || emptyEntry();
  const setEntry = (playerId, patch) => {
    setError('');
    setForm((f) => ({
      ...f,
      entries: { ...f.entries, [playerId]: { ...(f.entries[playerId] || emptyEntry()), ...patch } },
    }));
  };
  const confirmAllCalled = () => {
    setError('');
    setForm((f) => ({
      ...f,
      entries: Object.fromEntries(
        Object.entries(f.entries).map(([id, e]) => [id, e.called ? { ...e, confirmed: true } : e]),
      ),
    }));
  };
  const startsIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(form.startsAt) ? localInputToIso(form.startsAt) : null;

  // Players listed in the form: active ones plus anyone already in the line-up.
  const listed = useMemo(
    () => players.filter((p) => p.active || form.entries[p.id]),
    [players, form.entries],
  );
  const inLineup = listed.filter((p) => shownIds.has(p.id) || entry(p.id).called || entry(p.id).team);
  const visible = played && !showAll && inLineup.length >= 2 ? inLineup : listed;
  const hiddenCount = listed.length - visible.length;

  const lineupRows = Object.entries(form.entries).map(([player_id, e]) => ({ player_id, ...e }));
  const teamCount = (team) => lineupRows.filter((e) => e.team === team).length;
  const calledCount = lineupRows.filter((e) => e.called).length;
  const confirmedCount = lineupRows.filter((e) => e.called && e.confirmed).length;
  const tallies = goalsFromLineup(lineupRows);
  const mismatch = played && (tallies.A !== form.scoreA || tallies.B !== form.scoreB);

  const title = !existing ? 'Novo jogo' : mode === 'result' ? 'Registar resultado' : played ? 'Editar resultado' : 'Editar jogo';
  const back = existing ? `#/jogo/${existing.id}` : '#/jogos';

  const addPlayer = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const player = await run((api) => api.addPlayer(name), `${name} adicionado.`);
      shownIds.add(player.id);
      setEntry(player.id, { called: true });
      setNewName('');
    } catch {
      // Shown in the toast.
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.startsAt) return setError('Indica a data e a hora do jogo.');
    if (played && (teamCount('A') === 0 || teamCount('B') === 0)) {
      return setError('Põe pelo menos um jogador em cada equipa (toca em A ou B ao lado do nome).');
    }
    const payload = lineupRows
      .filter((e) => e.called || e.team)
      .map((e) => ({
        player_id: e.player_id,
        team: e.team,
        confirmed: e.confirmed,
        goals: played && e.team ? e.goals : 0,
        own_goals: played && e.team ? e.own_goals : 0,
      }));
    const match = {
      id: existing?.id,
      starts_at: localInputToIso(form.startsAt),
      location: form.location,
      status: form.status,
      score_a: played ? form.scoreA : null,
      score_b: played ? form.scoreB : null,
      notes: form.notes,
    };
    setSaving(true);
    try {
      const savedId = await run((api) => api.saveMatch(match, payload), played ? 'Resultado guardado.' : 'Jogo guardado.');
      navigate(`/jogo/${savedId}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <form className="page page-form" onSubmit={save} noValidate>
      <PageHeader title={title} back={back} />

      <div className="field">
        <span className="field-label">Estado</span>
        <Segmented value={form.status} onChange={(status) => set({ status })} options={STATUS_OPTIONS} label="Estado do jogo" />
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field-label">Data e hora</span>
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => set({ startsAt: e.target.value })}
            required
          />
          {startsIso && (
            <span className="field-help">
              {formatWeekday(startsIso)}, {formatDate(startsIso)} às {formatTime(startsIso)}
            </span>
          )}
        </label>
        <label className="field">
          <span className="field-label">Local</span>
          <input
            type="text"
            list="known-locations"
            value={form.location}
            placeholder="Ex.: Pavilhão Municipal"
            onChange={(e) => set({ location: e.target.value })}
          />
          <datalist id="known-locations">
            {locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
      </div>

      {played && (
        <section className="section">
          <h2 className="section-title">Resultado</h2>
          <div className="score-inputs">
            <div className="score-input team-a">
              <span>Equipa A</span>
              <Stepper size="lg" value={form.scoreA} onChange={(scoreA) => set({ scoreA })} label="golos da Equipa A" />
            </div>
            <div className="score-input team-b">
              <span>Equipa B</span>
              <Stepper size="lg" value={form.scoreB} onChange={(scoreB) => set({ scoreB })} label="golos da Equipa B" />
            </div>
          </div>
          {mismatch && (tallies.A > 0 || tallies.B > 0) && (
            <div className="notice notice-inline">
              <AlertIcon />
              <span>
                Os golos dos jogadores dão {tallies.A}–{tallies.B}.{' '}
                <button type="button" className="link" onClick={() => set({ scoreA: tallies.A, scoreB: tallies.B })}>
                  Usar {tallies.A}–{tallies.B} como resultado
                </button>{' '}
                ou guarda assim, se houver golos sem marcador.
              </span>
            </div>
          )}
        </section>
      )}

      <section className="section">
        <h2 className="section-title">
          {played ? 'Equipas e golos' : 'Convocados'}{' '}
          <span className="muted">
            {played
              ? `A: ${teamCount('A')}, B: ${teamCount('B')}`
              : `${calledCount} convocados, ${confirmedCount} confirmados`}
          </span>
        </h2>
        <p className="hint">
          {played
            ? 'Toca em A ou B para pôr cada jogador numa equipa e depois indica os golos.'
            : 'Toca no nome para convocar. Marca “Confirmou” quando o jogador confirmar.'}
        </p>
        {!played && confirmedCount < calledCount && (
          <button type="button" className="btn btn-block callups-all" onClick={confirmAllCalled}>
            <CheckIcon /> Confirmar todos ({calledCount - confirmedCount})
          </button>
        )}

        <ul className="player-list">
          {visible.map((p) => {
            const e = entry(p.id);
            return played ? (
              <li key={p.id} className={`prow prow-result ${e.team ? `has-team team-${e.team.toLowerCase()}` : ''}`}>
                <span className="prow-label">{p.name}</span>
                <Segmented
                  small
                  allowEmpty
                  value={e.team}
                  options={TEAM_OPTIONS}
                  label={`Equipa de ${p.name}`}
                  onChange={(team) => setEntry(p.id, { team, called: e.called || Boolean(team) })}
                />
                {e.team && (
                  <div className="prow-goals">
                    <span>Golos</span>
                    <Stepper value={e.goals} max={30} onChange={(goals) => setEntry(p.id, { goals })} label={`golos de ${p.name}`} />
                    <span>Autogolos</span>
                    <Stepper value={e.own_goals} max={10} onChange={(own_goals) => setEntry(p.id, { own_goals })} label={`autogolos de ${p.name}`} />
                  </div>
                )}
              </li>
            ) : (
              <li key={p.id} className="prow prow-callup">
                <button
                  type="button"
                  className={`prow-name ${e.called ? 'is-on' : ''}`}
                  aria-pressed={e.called}
                  onClick={() =>
                    setEntry(p.id, e.called ? { called: false, confirmed: false, team: null } : { called: true })
                  }
                >
                  <span className="tick">{e.called && <CheckIcon />}</span>
                  {p.name}
                  {!p.active && <span className="muted"> (inativo)</span>}
                </button>
                <button
                  type="button"
                  className={`toggle-chip ${e.confirmed ? 'is-on' : ''}`}
                  aria-pressed={e.confirmed}
                  disabled={!e.called}
                  onClick={() => setEntry(p.id, { confirmed: !e.confirmed })}
                >
                  Confirmou
                </button>
              </li>
            );
          })}
        </ul>

        {played && hiddenCount > 0 && (
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setShowAll(true)}>
            Mostrar todos os jogadores ({hiddenCount} fora da convocatória)
          </button>
        )}

        <div className="add-player">
          <input
            type="text"
            value={newName}
            maxLength={40}
            placeholder="Nome de um jogador novo"
            aria-label="Nome de um jogador novo"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPlayer();
              }
            }}
          />
          <button type="button" className="btn" onClick={addPlayer} disabled={!newName.trim()}>
            <PlusIcon /> Adicionar
          </button>
        </div>
      </section>

      <label className="field">
        <span className="field-label">Notas</span>
        <textarea
          rows={2}
          value={form.notes}
          placeholder={form.status === 'cancelled' ? 'Motivo do cancelamento (opcional)' : 'Opcional'}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </label>

      <div className="form-bar">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-bar-buttons">
          <a className="btn" href={back}>Cancelar</a>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'A guardar…' : played ? 'Guardar resultado' : 'Guardar jogo'}
          </button>
        </div>
      </div>
    </form>
  );
}
