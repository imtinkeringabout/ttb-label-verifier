import { useState } from 'react';
import { verifyAccess, storeCode } from '../api.js';

const C = {
  navy: '#1B2A4A',
  amber: '#D97706',
  white: '#FFFFFF',
  gray: '#6B7280',
  border: '#D1D5DB',
  red: '#B91C1C',
  redBg: '#FEF2F2',
  grayLight: '#F3F4F6'
};

// Access gate. Validates the shared code against /api/health before unlocking the
// app, so a wrong code never even reaches the analyze endpoint.
export default function Gate({ onUnlock }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      storeCode(trimmed);
      const info = await verifyAccess(trimmed);
      onUnlock(info);
    } catch (err) {
      setError(err.code === 'unauthorized' ? 'Incorrect access code.' : err.message || 'Could not verify access.');
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !code.trim();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.grayLight,
        padding: 20
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 32,
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 10px 30px rgba(27,42,74,0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 42,
              height: 42,
              background: C.navy,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.amber,
              fontWeight: 800,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14
            }}
          >
            TTB
          </div>
          <div>
            <div style={{ fontWeight: 800, color: C.navy, fontSize: 16 }}>Label Verifier</div>
            <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Restricted Prototype
            </div>
          </div>
        </div>

        <label
          style={{
            display: 'block',
            fontWeight: 600,
            fontSize: 12,
            color: C.navy,
            marginBottom: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}
        >
          Access Code
        </label>
        <input
          autoFocus
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter access code"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 14,
            boxSizing: 'border-box',
            color: C.navy
          }}
        />

        {error && (
          <div
            style={{
              marginTop: 10,
              background: C.redBg,
              color: C.red,
              border: `1px solid ${C.red}`,
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              fontWeight: 600
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={disabled}
          style={{
            marginTop: 16,
            width: '100%',
            padding: 12,
            background: disabled ? C.border : C.amber,
            color: disabled ? C.gray : C.navy,
            border: 'none',
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 14,
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        >
          {busy ? 'Verifying…' : 'Unlock'}
        </button>

        <div style={{ marginTop: 14, fontSize: 11, color: C.gray, textAlign: 'center' }}>
          Access is rate-limited. For evaluation use only.
        </div>
      </form>
    </div>
  );
}
