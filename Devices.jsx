import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Battery, BatteryLow, BatteryMedium, ChevronDown, ChevronRight, Copy, Info, Search, Signal } from 'lucide-react';
import { Badge, Callout, Card, KeyValue, QueryState, Select, SourceBadge } from '../components/ui.jsx';
import { Modal } from '../components/Modal.jsx';
import { useDevices, useDeviceState } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';
import { onlineStatus, typeMeta } from '../lib/devices.js';
import { fmtDateTime, fmtNum, fmtRelative } from '../lib/format.js';

const STATUS = {
  online: { tone: 'success', label: 'Online' },
  offline: { tone: 'danger', label: 'Brak sygnału' },
  unknown: { tone: 'neutral', label: 'Stan nieznany' },
  stale: { tone: 'neutral', label: 'Nieaktywne' },
};

function BatteryInfo({ value }) {
  if (value === undefined || value === null) return <span className="subtle">zasilanie sieciowe / brak danych</span>;
  const Icon = value < 25 ? BatteryLow : value < 60 ? BatteryMedium : Battery;
  const tone = value < 25 ? 'var(--danger-text)' : 'inherit';
  return (
    <span className="row-nowrap" style={{ justifyContent: 'flex-end', color: tone, gap: 5 }}>
      <Icon size={14} />
      {fmtNum(value, 0)}%
    </span>
  );
}

export default function Devices() {
  const devicesQ = useDevices({ poll: true });
  const stateQ = useDeviceState();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState(null);
  const [showStale, setShowStale] = useState(false);
  const state = stateQ.data ?? {};

  const devices = devicesQ.data ?? [];
  const counts = useMemo(() => devices.reduce((acc, d) => ({ ...acc, [d.type]: (acc[d.type] ?? 0) + 1 }), {}), [devices]);
  const filtered = devices.filter((d) => {
    if (type && d.type !== type) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return [d.name, d.ieee, d.model, d.location, typeMeta(d.type).label].some((v) => v?.toLowerCase().includes(q));
  });
  // Stare rekordy (np. po ponownym sparowaniu czujnika) pokazujemy osobno – historia zostaje w bazie.
  const active = filtered.filter((d) => !d.stale);
  const stale = filtered.filter((d) => d.stale);

  const renderCard = (d) => {
    const meta = typeMeta(d.type);
    const st = state[d.id];
    const status = STATUS[d.stale ? 'stale' : onlineStatus(st?.last_seen ?? d.lastSeen, d.type)];
    return (
      <button key={d.id} type="button" className="card device-card" style={d.stale ? { opacity: 0.7 } : undefined} onClick={() => setSelected(d.id)}>
        <div className="row-nowrap" style={{ gap: 12, alignItems: 'flex-start' }}>
          <span className={`icon-box lg tone-${d.stale ? 'neutral' : meta.tone}`}>
            <meta.icon size={19} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="device-name">{d.name}</div>
            <div className="subtle" style={{ fontSize: 12.5 }}>
              {meta.short}
              {d.model ? ` · ${d.model}` : ''}
            </div>
          </div>
          <Badge tone={status.tone} dot>
            {status.label}
          </Badge>
        </div>
        <KeyValue
          items={[
            ['IEEE', <span className="mono">{d.ieee || '–'}</span>],
            ['Lokalizacja', d.location ?? '–'],
            ['Bateria', <BatteryInfo value={st?.battery} />],
            [
              'Sygnał',
              st?.linkquality !== undefined ? (
                <span className="row-nowrap" style={{ justifyContent: 'flex-end', gap: 5 }}>
                  <Signal size={13} /> LQI {st.linkquality}
                </span>
              ) : (
                '–'
              ),
            ],
            ['Ostatni raport', fmtRelative(st?.last_seen ?? d.lastSeen)],
          ]}
        />
      </button>
    );
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: 'success', title: 'Skopiowano', description: text });
    } catch {
      toast({ tone: 'warning', title: 'Nie udało się skopiować', description: text });
    }
  };

  const sel = selected ? devices.find((d) => d.id === selected) : null;
  const selState = sel ? state[sel.id] : null;

  return (
    <div className="stack-lg">
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="row-nowrap" style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
          <Search size={16} className="subtle" style={{ position: 'absolute', left: 11 }} />
          <input className="input" style={{ paddingLeft: 34 }} placeholder="Szukaj po nazwie, adresie IEEE, modelu…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Szukaj urządzeń" />
        </div>
        <Select
          className="select-auto"
          value={type}
          onChange={setType}
          options={[{ value: '', label: `Wszystkie typy (${devices.length})` }, ...Object.entries(counts).map(([t, n]) => ({ value: t, label: `${typeMeta(t).short} (${n})` }))]}
          aria-label="Filtr typu"
        />
        <span className="spacer" />
        <SourceBadge source={devicesQ.source} reason={devicesQ.reason} />
      </div>

      <Callout icon={Info} tone="info">
        Lista pochodzi z <code>GET /api/devices</code> (tabela <code>devices</code>), a stan i bateria z <code>GET /api/state</code>. Typ urządzenia jest rozpoznawany
        automatycznie po modelu i nazwie – można go poprawić w <Link to="/ustawienia">Ustawieniach</Link>.
      </Callout>

      <QueryState query={devicesQ} endpoint="GET /api/devices" owner="Osoba 2" emptyText="W bazie nie ma jeszcze urządzeń. Backend doda je sam po połączeniu z Zigbee2MQTT.">
        {() =>
          filtered.length === 0 ? (
            <p className="subtle">Brak urządzeń spełniających kryteria.</p>
          ) : (
            <div className="stack-lg">
              {active.length > 0 ? <div className="device-grid">{active.map(renderCard)}</div> : <p className="subtle">Brak aktywnych urządzeń.</p>}
              {stale.length > 0 && (
                <div className="stack">
                  <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowStale((v) => !v)} aria-expanded={showStale}>
                    {showStale ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <Archive size={16} />
                    Nieaktywne / stare urządzenia ({stale.length})
                  </button>
                  {showStale && (
                    <>
                      <p className="subtle" style={{ fontSize: 13 }}>
                        Urządzenia bez kontaktu od ponad 3 dni albo usunięte z Zigbee2MQTT – np. stare rekordy po ponownym sparowaniu czujnika (nowy adres IEEE).
                        Panel ich nie używa, a historia ich pomiarów zostaje w bazie.
                      </p>
                      <div className="device-grid">{stale.map(renderCard)}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        }
      </QueryState>

      <Modal open={Boolean(sel)} title={sel?.name ?? ''} onClose={() => setSelected(null)} wide>
        {sel && (
          <div className="stack">
            <div className="row">
              <Badge tone={typeMeta(sel.type).tone}>{typeMeta(sel.type).label}</Badge>
              {sel.type !== sel.detectedType && <Badge tone="warning">typ ustawiony ręcznie</Badge>}
              <SourceBadge source={stateQ.source} reason={stateQ.reason} />
            </div>
            <div className="grid-2">
              <Card title="Identyfikacja">
                <KeyValue
                  items={[
                    ['ID w bazie', String(sel.id)],
                    [
                      'Adres IEEE',
                      <button type="button" className="btn btn-ghost btn-sm" style={{ height: 22, padding: '0 4px' }} onClick={() => copy(sel.ieee)}>
                        <span className="mono">{sel.ieee}</span> <Copy size={12} />
                      </button>,
                    ],
                    ['Model', sel.model],
                    ['Producent', sel.vendor],
                    ['Lokalizacja', sel.location],
                    ['Ostatni raport', fmtDateTime(selState?.last_seen ?? sel.lastSeen)],
                  ]}
                />
              </Card>
              <Card title="Tematy MQTT">
                <div className="stack" style={{ gap: 10, fontSize: 13 }}>
                  <div>
                    <div className="subtle" style={{ fontSize: 12 }}>Odczyt (subskrypcja backendu)</div>
                    <code className="inline-code">zigbee2mqtt/{sel.ieee}</code>
                  </div>
                  <div>
                    <div className="subtle" style={{ fontSize: 12 }}>Sterowanie (POST /api/command)</div>
                    <code className="inline-code">zigbee2mqtt/{sel.ieee}/set</code>
                  </div>
                </div>
              </Card>
            </div>
            <div className="grid-2">
              <div>
                <div className="section-title">Ostatni stan (payload MQTT)</div>
                <pre className="code-block">{selState ? JSON.stringify(selState, null, 2) : 'Brak danych – backend nie udostępnia jeszcze GET /api/state.'}</pre>
              </div>
              <div>
                <div className="section-title">Wiersz z tabeli devices</div>
                <pre className="code-block">{JSON.stringify(sel.raw, null, 2)}</pre>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

