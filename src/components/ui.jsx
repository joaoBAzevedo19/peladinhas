// Small shared interface pieces.
import { useEffect, useRef, useState } from 'react';
import { BackIcon, MinusIcon, PlusIcon } from './Icons.jsx';
import { RESULT_LABEL, RESULT_NAME } from '../lib/stats.js';
import { PLAYERS_PER_MATCH } from '../lib/config.js';

export function PageHeader({ title, back, action }) {
  return (
    <header className="page-head">
      {back && (
        <a className="back-link" href={back}>
          <BackIcon />
          <span>Voltar</span>
        </a>
      )}
      <div className="page-head-row">
        <h1>{title}</h1>
        {action}
      </div>
    </header>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, label, size }) {
  const n = Number(value) || 0;
  return (
    <div className={`stepper ${size === 'lg' ? 'stepper-lg' : ''}`} role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, n - 1))} disabled={n <= min} aria-label={`Menos ${label}`}>
        <MinusIcon />
      </button>
      <output aria-live="polite">{n}</output>
      <button type="button" onClick={() => onChange(Math.min(max, n + 1))} disabled={n >= max} aria-label={`Mais ${label}`}>
        <PlusIcon />
      </button>
    </div>
  );
}

// Segmented control. options: [{value, label, className?}]
export function Segmented({ value, onChange, options, label, allowEmpty = false, small }) {
  return (
    <div className={`segmented ${small ? 'segmented-sm' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`${selected ? 'is-selected' : ''} ${opt.className || ''}`}
            onClick={() => onChange(selected && allowEmpty ? null : opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ResultBadge({ result }) {
  if (!result) return null;
  return (
    <span className={`result-badge result-${result}`} title={RESULT_NAME[result]}>
      {RESULT_LABEL[result]}
    </span>
  );
}

export function TeamTag({ team }) {
  if (!team) return null;
  return <span className={`team-tag team-${team.toLowerCase()}`}>{team}</span>;
}

// Confirmation slots: one cell per place in the match (5 vs 5 = 10).
export function Slots({ confirmed, called }) {
  const total = Math.max(PLAYERS_PER_MATCH, called);
  return (
    <div className="slots" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < confirmed ? 'slot is-on' : i < called ? 'slot is-called' : 'slot'} />
      ))}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

// Destructive action that needs a second tap to confirm.
export function ConfirmButton({ children, confirmLabel, onConfirm, className = 'btn btn-ghost' }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const timer = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(timer);
  }, [armed]);
  return armed ? (
    <button type="button" className="btn btn-danger" onClick={() => { setArmed(false); onConfirm(); }}>
      {confirmLabel}
    </button>
  ) : (
    <button type="button" className={className} onClick={() => setArmed(true)}>
      {children}
    </button>
  );
}

// Pop-up window (native <dialog>). Closes with Esc, the × button or a tap
// outside the box.
export function Dialog({ open, onClose, title, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="dialog-box">
          <div className="dialog-head">
            <h2 className="dialog-title">{title}</h2>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="Fechar">×</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} key={toast.id}>
      <span>{toast.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Fechar">×</button>
    </div>
  );
}
