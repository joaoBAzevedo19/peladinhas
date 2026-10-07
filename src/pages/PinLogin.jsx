// Entry screen: everyone types a PIN (guest or admin) before seeing the app.
import { useState } from 'react';
import { api } from '../lib/api/index.js';
import { friendlyError } from '../lib/api/errors.js';
import { isValidPin } from '../lib/api/pin.js';
import { PIN_LENGTH } from '../lib/config.js';

export default function PinLogin() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.signInWithPin(pin);
      // The session change swaps this screen for the app.
    } catch (err) {
      setError(friendlyError(err).message);
      setPin('');
      setBusy(false);
    }
  };

  return (
    <main className="pin-screen">
      <form className="card pin-card" onSubmit={submit}>
        <p className="pin-brand">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="2.2" fill="var(--team-a)" />
            <path d="M12 2v20" stroke="currentColor" strokeWidth="2" opacity=".45" />
          </svg>
          Peladinhas
        </p>
        <label className="field">
          <span className="field-label">PIN de acesso</span>
          <input
            className="pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={PIN_LENGTH}
            placeholder={'•'.repeat(PIN_LENGTH)}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
            aria-describedby={error ? 'pin-error' : undefined}
            autoFocus
          />
        </label>
        {error && <p id="pin-error" className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !isValidPin(pin)}>
          {busy ? 'A entrar…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
