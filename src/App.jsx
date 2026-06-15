import { useState, useRef, useCallback, useEffect } from 'react';
import Gate from './components/Gate.jsx';
import { buildResults, overallVerdict, EMPTY_DECLARED } from './lib/compare.js';
import { analyzeLabel, fileToBase64, verifyAccess, getStoredCode, clearCode } from './api.js';

// ── Palette & design tokens ──────────────────────────────────────────────────
// Government-adjacent but modern: federal navy + amber verification accent.
// JetBrains Mono for field values, Inter for UI copy. Signature element: an
// animated scan-line sweep over the label image during analysis.
const COLORS = {
  navy: '#1B2A4A',
  navyMid: '#253554',
  navyLight: '#E8ECF4',
  amber: '#D97706',
  amberBg: '#FFFBEB',
  green: '#15803D',
  greenBg: '#F0FDF4',
  red: '#B91C1C',
  redBg: '#FEF2F2',
  gray: '#6B7280',
  grayLight: '#F3F4F6',
  white: '#FFFFFF',
  border: '#D1D5DB'
};

// ── Status badge ─────────────────────────────────────────────────────────────
function Badge({ status }) {
  const map = {
    pass: { bg: COLORS.greenBg, color: COLORS.green, text: '✓ PASS' },
    fail: { bg: COLORS.redBg, color: COLORS.red, text: '✕ FAIL' },
    warn: { bg: COLORS.amberBg, color: COLORS.amber, text: '⚠ REVIEW' },
    missing: { bg: COLORS.redBg, color: COLORS.red, text: '⊘ MISSING' },
    skip: { bg: COLORS.grayLight, color: COLORS.gray, text: 'N/A' }
  };
  const s = map[status] || map.skip;
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 700,
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 4,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap'
      }}
    >
      {s.text}
    </span>
  );
}

// ── Application-data form ─────────────────────────────────────────────────────
function LabelForm({ declared, onChange }) {
  const fields = [
    { key: 'brand_name', label: 'Brand Name *', placeholder: 'e.g. OLD TOM DISTILLERY' },
    { key: 'class_type', label: 'Class / Type *', placeholder: 'e.g. Kentucky Straight Bourbon Whiskey' },
    { key: 'alcohol_content', label: 'Alcohol Content *', placeholder: 'e.g. 45% Alc./Vol. (90 Proof)' },
    { key: 'net_contents', label: 'Net Contents *', placeholder: 'e.g. 750 mL' },
    { key: 'producer_name', label: 'Producer / Bottler *', placeholder: 'e.g. Old Tom Distillery' },
    { key: 'producer_address', label: 'Producer Address', placeholder: 'e.g. Louisville, KY 40201' },
    { key: 'country_of_origin', label: 'Country of Origin', placeholder: 'Leave blank if domestic' },
    { key: 'government_warning', label: 'Government Warning', placeholder: 'Leave blank to auto-check against TTB standard' }
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
      {fields.map((f) => (
        <div
          key={f.key}
          style={{ gridColumn: f.key === 'government_warning' || f.key === 'producer_address' ? '1 / -1' : 'auto' }}
        >
          <label
            style={{
              display: 'block',
              fontWeight: 600,
              fontSize: 12,
              color: COLORS.navy,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            {f.label}
          </label>
          {f.key === 'government_warning' ? (
            <textarea
              value={declared[f.key]}
              onChange={(e) => onChange({ ...declared, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                fontSize: 13,
                fontFamily: 'Inter, sans-serif',
                resize: 'vertical',
                boxSizing: 'border-box',
                color: COLORS.navy
              }}
            />
          ) : (
            <input
              type="text"
              value={declared[f.key]}
              onChange={(e) => onChange({ ...declared, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                fontSize: 13,
                fontFamily: 'Inter, sans-serif',
                boxSizing: 'border-box',
                color: COLORS.navy
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Results panel ─────────────────────────────────────────────────────────────
function ResultsPanel({ results, applicationId }) {
  const totals = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const passed = totals.pass || 0;
  const failed = (totals.fail || 0) + (totals.missing || 0);
  const warned = totals.warn || 0;
  const overall = overallVerdict(results);
  const overallLabel = { fail: 'REJECTED', warn: 'NEEDS REVIEW', pass: 'APPROVED' }[overall];
  const overallColor = { fail: COLORS.red, warn: COLORS.amber, pass: COLORS.green }[overall];
  const overallBg = { fail: COLORS.redBg, warn: COLORS.amberBg, pass: COLORS.greenBg }[overall];

  return (
    <div>
      <div
        style={{
          background: overallBg,
          border: `2px solid ${overallColor}`,
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: overallColor,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 4
            }}
          >
            Overall Determination {applicationId ? `· App #${applicationId}` : ''}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: overallColor, fontFamily: "'JetBrains Mono', monospace" }}>
            {overallLabel}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: COLORS.gray }}>
          <div>{passed} passed</div>
          {warned > 0 && <div style={{ color: COLORS.amber }}>{warned} need review</div>}
          {failed > 0 && <div style={{ color: COLORS.red }}>{failed} failed</div>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.map((r) => (
          <div
            key={r.key}
            style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '12px 16px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: r.extracted || r.declared ? 8 : 0
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.navy }}>{r.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {r.required && (
                  <span
                    style={{
                      fontSize: 10,
                      color: COLORS.gray,
                      background: COLORS.grayLight,
                      padding: '1px 6px',
                      borderRadius: 3
                    }}
                  >
                    REQUIRED
                  </span>
                )}
                <Badge status={r.status} />
              </div>
            </div>
            {(r.extracted || r.declared) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div style={{ background: COLORS.grayLight, borderRadius: 6, padding: '6px 10px' }}>
                  <div
                    style={{
                      color: COLORS.gray,
                      fontWeight: 600,
                      marginBottom: 2,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    On Label
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: r.extracted ? COLORS.navy : COLORS.gray,
                      fontStyle: r.extracted ? 'normal' : 'italic'
                    }}
                  >
                    {r.key === 'government_warning' && r.extracted
                      ? r.extracted.length > 120
                        ? r.extracted.slice(0, 120) + '…'
                        : r.extracted
                      : r.extracted || 'Not detected'}
                  </div>
                </div>
                <div style={{ background: COLORS.navyLight, borderRadius: 6, padding: '6px 10px' }}>
                  <div
                    style={{
                      color: COLORS.navyMid,
                      fontWeight: 600,
                      marginBottom: 2,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em'
                    }}
                  >
                    In Application
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: r.declared ? COLORS.navy : COLORS.gray,
                      fontStyle: r.declared ? 'normal' : 'italic'
                    }}
                  >
                    {r.declared || '—'}
                  </div>
                </div>
              </div>
            )}
            {r.note && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color:
                    r.status === 'pass'
                      ? COLORS.green
                      : r.status === 'fail' || r.status === 'missing'
                      ? COLORS.red
                      : COLORS.amber,
                  fontWeight: 600
                }}
              >
                {r.note}
              </div>
            )}
            {r.gwFmt && r.status !== 'pass' && (
              <div style={{ marginTop: 6, fontSize: 11, color: COLORS.gray }}>
                Formatting: bold/caps header detected: {r.gwFmt.has_bold_caps_header ? 'Yes' : 'No'}
                {r.gwFmt.notes ? ` · ${r.gwFmt.notes}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function DropZone({ onFile, preview, scanning }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !preview && inputRef.current?.click()}
      style={{
        border: `2px dashed ${dragging ? COLORS.amber : COLORS.border}`,
        borderRadius: 10,
        background: dragging ? COLORS.amberBg : COLORS.grayLight,
        cursor: preview ? 'default' : 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.2s',
        minHeight: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      {preview ? (
        <>
          <img
            src={preview}
            alt="Label preview"
            style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }}
          />
          {scanning && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(27,42,74,0.08)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: 3,
                  background: `linear-gradient(90deg, transparent, ${COLORS.amber}, transparent)`,
                  animation: 'scanline 1.4s ease-in-out infinite'
                }}
              />
              <div
                style={{
                  background: 'rgba(27,42,74,0.85)',
                  color: COLORS.white,
                  padding: '10px 20px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  marginTop: 60
                }}
              >
                Analyzing label…
              </div>
            </div>
          )}
          {!scanning && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFile(null);
              }}
              aria-label="Remove image"
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: COLORS.navy,
                color: COLORS.white,
                border: 'none',
                borderRadius: 20,
                width: 26,
                height: 26,
                cursor: 'pointer',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {'×'}
            </button>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontWeight: 700, color: COLORS.navy, marginBottom: 4, fontSize: 15 }}>
            Drop label image here
          </div>
          <div style={{ color: COLORS.gray, fontSize: 13 }}>or click to browse · JPG, PNG, WEBP</div>
        </div>
      )}
    </div>
  );
}

// ── Batch row ─────────────────────────────────────────────────────────────────
function BatchRow({ item, idx, onRemove }) {
  const statusColor =
    { pass: COLORS.green, fail: COLORS.red, warn: COLORS.amber, analyzing: COLORS.amber, error: COLORS.red, pending: COLORS.gray }[
      item.status
    ] || COLORS.gray;
  const statusLabel =
    { pass: 'APPROVED', fail: 'REJECTED', warn: 'REVIEW', analyzing: 'Analyzing…', error: 'ERROR', pending: 'Pending' }[
      item.status
    ] || '—';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: COLORS.white,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        marginBottom: 8
      }}
    >
      {item.preview && (
        <img
          src={item.preview}
          alt=""
          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: `1px solid ${COLORS.border}` }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 13,
            color: COLORS.navy,
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {item.file.name}
        </div>
        {item.appId && <div style={{ fontSize: 11, color: COLORS.gray }}>App #{item.appId}</div>}
        {item.error && <div style={{ fontSize: 11, color: COLORS.red }}>{item.error}</div>}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          fontSize: 12,
          color: statusColor,
          minWidth: 80,
          textAlign: 'right'
        }}
      >
        {statusLabel}
      </div>
      {item.status === 'pending' && (
        <button
          onClick={() => onRemove(idx)}
          aria-label="Remove from queue"
          style={{ background: 'none', border: 'none', color: COLORS.gray, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
        >
          {'×'}
        </button>
      )}
    </div>
  );
}

// ── Main app (post-gate) ──────────────────────────────────────────────────────
function Verifier({ providerLabel, quota, onQuota, onLocked }) {
  const [mode, setMode] = useState('single');

  // Single mode
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [declared, setDeclared] = useState(EMPTY_DECLARED);
  const [applicationId, setApplicationId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Batch mode
  const [batchItems, setBatchItems] = useState([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const batchInputRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file) {
      setImageFile(null);
      setPreview(null);
      setResults(null);
      setError(null);
      return;
    }
    setImageFile(file);
    setResults(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  // Map an ApiError to a friendly message; bounce to the gate on auth failure.
  const describeError = (e) => {
    if (e.code === 'unauthorized') {
      clearCode();
      onLocked();
      return 'Session expired — please re-enter the access code.';
    }
    if (e.code === 'rate_limited') return e.message;
    if (e.code === 'too_large') return e.message;
    return e.message || 'Analysis failed. Please try again.';
  };

  const runAnalysis = async () => {
    if (!imageFile) return;
    setScanning(true);
    setError(null);
    setResults(null);
    try {
      const b64 = await fileToBase64(imageFile);
      const { extracted, remaining } = await analyzeLabel(b64, imageFile.type);
      if (remaining != null) onQuota(remaining);
      setResults(buildResults(extracted, declared));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setScanning(false);
    }
  };

  const addBatchFiles = (files) => {
    const newItems = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((f) => ({ file: f, preview: URL.createObjectURL(f), status: 'pending', results: null, error: null, appId: '' }));
    setBatchItems((prev) => [...prev, ...newItems]);
  };

  const removeBatchItem = (idx) => setBatchItems((prev) => prev.filter((_, i) => i !== idx));

  const runBatch = async () => {
    setBatchRunning(true);
    for (let i = 0; i < batchItems.length; i++) {
      if (batchItems[i].status !== 'pending') continue;
      setBatchItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status: 'analyzing' } : it)));
      try {
        const b64 = await fileToBase64(batchItems[i].file);
        const { extracted, remaining } = await analyzeLabel(b64, batchItems[i].file.type);
        if (remaining != null) onQuota(remaining);
        const res = buildResults(extracted, EMPTY_DECLARED);
        const status = overallVerdict(res);
        setBatchItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, status, results: res } : it)));
      } catch (e) {
        setBatchItems((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: 'error', error: e.message } : it))
        );
        // Stop the batch on auth/rate-limit failures — every later call would fail too.
        if (e.code === 'unauthorized') {
          clearCode();
          onLocked();
          break;
        }
        if (e.code === 'rate_limited') break;
      }
    }
    setBatchRunning(false);
  };

  return (
    <div style={{ background: COLORS.grayLight, minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ background: COLORS.navy, color: COLORS.white }}>
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                background: COLORS.amber,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: COLORS.navy,
                fontWeight: 800,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13
              }}
            >
              TTB
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.01em' }}>TTB Label Verifier</div>
              <div
                style={{
                  fontSize: 11,
                  color: '#94A3B8',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontWeight: 500
                }}
              >
                AI-Powered Compliance Review {'·'} Prototype
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'right' }}>
            <div>Model: {providerLabel}</div>
            {quota != null && <div style={{ color: COLORS.amber }}>{quota} scans left this hour</div>}
          </div>
        </div>
        {/* Mode tabs */}
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            gap: 0,
            borderTop: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          {['single', 'batch'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: mode === m ? COLORS.amber : 'transparent',
                color: mode === m ? COLORS.navy : '#94A3B8',
                border: 'none',
                cursor: 'pointer',
                padding: '10px 20px',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                transition: 'all 0.15s'
              }}
            >
              {m === 'single' ? 'Single Label' : 'Batch Upload'}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px' }}>
        {mode === 'single' && (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>
            <div>
              <div
                style={{
                  background: COLORS.white,
                  borderRadius: 10,
                  border: `1px solid ${COLORS.border}`,
                  padding: 20,
                  marginBottom: 16
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: COLORS.navy,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 12
                  }}
                >
                  Label Image
                </div>
                <DropZone onFile={handleFile} preview={preview} scanning={scanning} />
              </div>
              <div
                style={{
                  background: COLORS.white,
                  borderRadius: 10,
                  border: `1px solid ${COLORS.border}`,
                  padding: 20,
                  marginBottom: 16
                }}
              >
                <label
                  style={{
                    display: 'block',
                    fontWeight: 700,
                    fontSize: 12,
                    color: COLORS.navy,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 6
                  }}
                >
                  Application ID (Optional)
                </label>
                <input
                  type="text"
                  value={applicationId}
                  onChange={(e) => setApplicationId(e.target.value)}
                  placeholder="e.g. COLA-2024-001234"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 6,
                    fontSize: 13,
                    color: COLORS.navy,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                onClick={runAnalysis}
                disabled={!imageFile || scanning}
                style={{
                  width: '100%',
                  padding: 14,
                  background: imageFile && !scanning ? COLORS.amber : COLORS.border,
                  color: imageFile && !scanning ? COLORS.navy : COLORS.gray,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: imageFile && !scanning ? 'pointer' : 'not-allowed',
                  letterSpacing: '0.02em',
                  transition: 'all 0.15s'
                }}
              >
                {scanning ? 'Analyzing…' : 'Run Verification'}
              </button>
              {error && (
                <div
                  style={{
                    marginTop: 12,
                    background: COLORS.redBg,
                    border: `1px solid ${COLORS.red}`,
                    color: COLORS.red,
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontSize: 13,
                    fontWeight: 600
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            <div>
              {!results && (
                <div style={{ background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: 24 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      color: COLORS.navy,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 16
                    }}
                  >
                    Application Data
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.gray, marginBottom: 16 }}>
                    Enter the fields from the COLA application. The AI extracts the same fields from the label image and
                    compares them. Leave a field blank to skip it.
                  </div>
                  <LabelForm declared={declared} onChange={setDeclared} />
                </div>
              )}
              {results && (
                <div style={{ background: COLORS.white, borderRadius: 10, border: `1px solid ${COLORS.border}`, padding: 24 }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: COLORS.navy,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em'
                      }}
                    >
                      Verification Results
                    </div>
                    <button
                      onClick={() => setResults(null)}
                      style={{ fontSize: 12, color: COLORS.amber, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                    >
                      {'←'} Edit Application Data
                    </button>
                  </div>
                  <ResultsPanel results={results} applicationId={applicationId} />
                </div>
              )}
            </div>
          </div>
        )}

        {mode === 'batch' && (
          <div style={{ maxWidth: 760 }}>
            <div
              style={{
                background: COLORS.white,
                borderRadius: 10,
                border: `1px solid ${COLORS.border}`,
                padding: 24,
                marginBottom: 20
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  color: COLORS.navy,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 8
                }}
              >
                Batch Label Upload
              </div>
              <div style={{ fontSize: 13, color: COLORS.gray, marginBottom: 16 }}>
                Upload multiple label images for rapid screening. Each label is analyzed against TTB standard
                requirements. Subject to the same usage limits, so very large batches may pause.
              </div>
              <div
                onClick={() => batchInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addBatchFiles(e.dataTransfer.files);
                }}
                style={{
                  border: `2px dashed ${COLORS.border}`,
                  borderRadius: 8,
                  padding: 20,
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: COLORS.grayLight
                }}
              >
                <div style={{ fontWeight: 700, color: COLORS.navy, fontSize: 14, marginBottom: 4 }}>
                  Drop label images or click to browse
                </div>
                <div style={{ color: COLORS.gray, fontSize: 12 }}>Select multiple files at once {'·'} JPG, PNG, WEBP</div>
              </div>
              <input
                ref={batchInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => addBatchFiles(e.target.files)}
              />
            </div>

            {batchItems.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: COLORS.navy }}>
                    {batchItems.length} label{batchItems.length !== 1 ? 's' : ''} queued
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setBatchItems([])}
                      disabled={batchRunning}
                      style={{
                        fontSize: 12,
                        color: COLORS.gray,
                        background: 'none',
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: 6,
                        padding: '6px 14px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Clear All
                    </button>
                    <button
                      onClick={runBatch}
                      disabled={batchRunning || batchItems.every((i) => i.status !== 'pending')}
                      style={{
                        fontSize: 13,
                        color: COLORS.navy,
                        background: COLORS.amber,
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 20px',
                        cursor: 'pointer',
                        fontWeight: 800,
                        opacity: batchRunning ? 0.6 : 1
                      }}
                    >
                      {batchRunning ? 'Analyzing…' : 'Analyze All'}
                    </button>
                  </div>
                </div>
                {batchItems.map((item, idx) => (
                  <div key={idx}>
                    <div
                      onClick={() => item.results && setExpandedBatch(expandedBatch === idx ? null : idx)}
                      style={{ cursor: item.results ? 'pointer' : 'default' }}
                    >
                      <BatchRow item={item} idx={idx} onRemove={removeBatchItem} />
                    </div>
                    {expandedBatch === idx && item.results && (
                      <div
                        style={{
                          background: COLORS.white,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 8,
                          padding: 20,
                          marginBottom: 12,
                          marginTop: -4
                        }}
                      >
                        <ResultsPanel results={item.results} applicationId={item.appId} />
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ marginTop: 12, fontSize: 12, color: COLORS.gray }}>
                  Click any analyzed row to expand field-by-field results.
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer
        style={{
          textAlign: 'center',
          padding: 24,
          color: COLORS.gray,
          fontSize: 11,
          borderTop: `1px solid ${COLORS.border}`,
          marginTop: 40
        }}
      >
        TTB Label Verifier {'—'} AI Prototype {'·'} Not for official use {'·'} Results require agent review
      </footer>
    </div>
  );
}

// ── Root: gate -> verifier ────────────────────────────────────────────────────
export default function App() {
  const [gate, setGate] = useState({ checked: false, unlocked: false, info: null });
  const [quota, setQuota] = useState(null);

  // On load, if a code is already stored, validate it silently.
  useEffect(() => {
    const code = getStoredCode();
    if (!code) {
      setGate({ checked: true, unlocked: false, info: null });
      return;
    }
    verifyAccess(code)
      .then((info) => {
        setGate({ checked: true, unlocked: true, info });
        if (info.rate?.enforced) setQuota(info.rate.remaining);
      })
      .catch(() => {
        clearCode();
        setGate({ checked: true, unlocked: false, info: null });
      });
  }, []);

  const handleUnlock = (info) => {
    setGate({ checked: true, unlocked: true, info });
    if (info.rate?.enforced) setQuota(info.rate.remaining);
  };

  const handleLocked = () => {
    setGate({ checked: true, unlocked: false, info: null });
    setQuota(null);
  };

  if (!gate.checked) {
    return <div style={{ minHeight: '100vh', background: COLORS.grayLight }} />;
  }
  if (!gate.unlocked) {
    return <Gate onUnlock={handleUnlock} />;
  }

  const providerLabel =
    { gemini: 'Gemini Flash', claude: 'Claude Haiku', ollama: 'Ollama (local)' }[gate.info?.provider] ||
    gate.info?.provider ||
    'AI';

  return (
    <Verifier providerLabel={providerLabel} quota={quota} onQuota={setQuota} onLocked={handleLocked} />
  );
}
