// "Gerir": sign-out, players, backups and deleted matches.
import { useRef, useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import { PageHeader } from '../components/ui.jsx';
import { PlusIcon } from '../components/Icons.jsx';
import { signOut } from '../lib/api/index.js';
import { friendlyError } from '../lib/api/errors.js';
import { buildBackup, downloadJson, getLastBackup, parseBackup, setLastBackup } from '../lib/backup.js';
import { formatDate, formatDateTime, formatWeekday } from '../lib/dates.js';

function PlayerRow({ player, run }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.name);

  const saveName = async () => {
    if (name.trim() === player.name) return setEditing(false);
    try {
      await run((a) => a.updatePlayer(player.id, { name }), 'Nome atualizado.');
      setEditing(false);
    } catch {
      // Shown in the toast.
    }
  };

  return (
    <li className="admin-player">
      {editing ? (
        <form
          className="inline-edit"
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Nome do jogador" autoFocus />
          <button type="submit" className="btn btn-primary btn-sm">Guardar</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setName(player.name); setEditing(false); }}>
            Cancelar
          </button>
        </form>
      ) : (
        <>
          <button type="button" className="admin-player-name" onClick={() => setEditing(true)} title="Mudar o nome">
            {player.name}
          </button>
          <button
            type="button"
            className={`toggle-chip toggle-soft ${player.active ? 'is-on' : ''}`}
            aria-pressed={player.active}
            onClick={() =>
              run(
                (a) => a.updatePlayer(player.id, { active: !player.active }),
                player.active ? `${player.name} passou a inativo.` : `${player.name} está ativo outra vez.`,
              ).catch(() => {})
            }
          >
            {player.active ? 'Ativo' : 'Inativo'}
          </button>
        </>
      )}
    </li>
  );
}

function Players({ players, run }) {
  const [name, setName] = useState('');
  const active = players.filter((p) => p.active);
  const inactive = players.filter((p) => !p.active);

  const add = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    try {
      await run((a) => a.addPlayer(clean), `${clean} adicionado.`);
      setName('');
    } catch {
      // Shown in the toast.
    }
  };

  return (
    <section className="section">
      <h2 className="section-title">
        Jogadores <span className="muted">{active.length} ativos</span>
      </h2>
      <form className="add-player" onSubmit={add}>
        <input
          type="text"
          value={name}
          maxLength={40}
          placeholder="Nome do jogador"
          aria-label="Nome do jogador"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!name.trim()}>
          <PlusIcon /> Adicionar
        </button>
      </form>
      <p className="hint">
        Toca num nome para o mudar. Um jogador inativo deixa de aparecer nas convocatórias, mas o histórico dele mantém-se.
      </p>
      <ul className="list admin-players">
        {active.map((p) => (
          <PlayerRow key={p.id} player={p} run={run} />
        ))}
        {inactive.map((p) => (
          <PlayerRow key={p.id} player={p} run={run} />
        ))}
      </ul>
    </section>
  );
}

function Backups({ raw, run, showToast, mode }) {
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null);
  const [lastBackup, setLast] = useState(getLastBackup());

  const download = () => {
    const now = new Date().toISOString();
    downloadJson(`peladinhas-copia-${now.slice(0, 10)}.json`, buildBackup(raw));
    setLastBackup(now);
    setLast(now);
    showToast('Cópia descarregada.');
  };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (err) {
      showToast(friendlyError(err).message, 'error');
    }
  };

  const restore = async () => {
    const data = pending;
    setPending(null);
    try {
      const result = await run((a) => a.importBackup(data));
      showToast(`Cópia restaurada: ${result.matches} jogos e ${result.players} jogadores.`);
    } catch {
      // Shown in the toast.
    }
  };

  return (
    <section className="section">
      <h2 className="section-title">Cópia de segurança</h2>
      <div className="card">
        <p>
          Descarrega uma cópia depois de cada jogo e guarda o ficheiro num sítio seguro, como o Google Drive.
          É a garantia de que o histórico nunca se perde.
        </p>
        <p className="muted small">
          {lastBackup
            ? `Última cópia neste dispositivo: ${formatDateTime(lastBackup)}.`
            : 'Ainda não descarregaste nenhuma cópia neste dispositivo.'}
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={download}>Descarregar cópia</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Restaurar cópia</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pick} />
        </div>
        {pending && (
          <div className="notice notice-inline">
            <span>
              Cópia de {formatDateTime(pending.exported_at)} com {pending.matches.length} jogos e {pending.players.length} jogadores.
              Os jogos da cópia substituem as versões atuais; nada é apagado.
            </span>
            <div className="button-row">
              <button type="button" className="btn btn-primary btn-sm" onClick={restore}>Restaurar esta cópia</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPending(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {mode === 'demo' && (
          <p className="muted small">
            No modo demonstração podes também{' '}
            <button
              type="button"
              className="link"
              onClick={() => run((a) => a.resetDemo(), 'Dados de exemplo repostos.').catch(() => {})}
            >
              repor os dados de exemplo
            </button>
            .
          </p>
        )}
      </div>
    </section>
  );
}

function DeletedMatches({ matches, run }) {
  if (matches.length === 0) return null;
  return (
    <section className="section">
      <h2 className="section-title">Jogos eliminados</h2>
      <p className="hint">Não aparecem a ninguém, mas continuam guardados.</p>
      <ul className="list">
        {matches.map((m) => (
          <li key={m.id} className="row">
            <a className="row-main" href={`#/jogo/${m.id}`}>
              <span className="row-title">{formatWeekday(m.starts_at)}, {formatDate(m.starts_at)}</span>
              <span className="row-sub">
                {m.status === 'played' ? `Resultado ${m.score_a}–${m.score_b}` : 'Sem resultado'}
              </span>
            </a>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => run((a) => a.setMatchDeleted(m.id, false), 'Jogo restaurado.').catch(() => {})}
            >
              Restaurar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Admin() {
  const { session, isAdmin, players, deletedMatches, raw, run, showToast, mode } = useData();

  return (
    <div className="page">
      <PageHeader title="Gerir" />

      {session && !isAdmin && (
        <div className="card">
          <p>Entraste como <strong>convidado</strong>: podes ver tudo, mas não alterar.</p>
          <p className="muted">Para gerir, sai e entra com o PIN de administrador.</p>
          <button type="button" className="btn" onClick={signOut}>Sair</button>
        </div>
      )}

      {session && isAdmin && (
        <>
          <p className="signed-in">
            Entraste como <strong>administrador</strong>.{' '}
            <button type="button" className="link" onClick={signOut}>Sair</button>
          </p>
          <Players players={players} run={run} />
          <Backups raw={raw} run={run} showToast={showToast} mode={mode} />
          <DeletedMatches matches={deletedMatches} run={run} />
        </>
      )}
    </div>
  );
}
