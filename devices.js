import {
  Thermometer,
  Lightbulb,
  PlugZap,
  ToggleRight,
  Gamepad2,
  CircleDot,
  Radar,
  Siren,
  KeyRound,
  Gauge,
  Cpu,
  Router,
} from 'lucide-react';

// Typy urządzeń rozpoznawane przez panel. Kolejność reguł ma znaczenie (pierwsze dopasowanie wygrywa).
export const DEVICE_TYPES = {
  env: { label: 'Czujnik temperatury i wilgotności', short: 'Temp. / wilgotność', icon: Thermometer, tone: 'warning' },
  light: { label: 'Oświetlenie RGB', short: 'Żarówka RGB', icon: Lightbulb, tone: 'accent' },
  strip: { label: 'Listwa zasilająca z pomiarem energii', short: 'Listwa', icon: PlugZap, tone: 'success' },
  switch: { label: 'Wyjście binarne', short: 'Wyjście binarne', icon: ToggleRight, tone: 'info' },
  remote: { label: 'Pilot scen (wejścia binarne)', short: 'Pilot scen', icon: Gamepad2, tone: 'violet' },
  button: { label: 'Przycisk (wejście binarne)', short: 'Przycisk', icon: CircleDot, tone: 'violet' },
  occupancy: { label: 'Czujnik ruchu i obecności', short: 'Obecność', icon: Radar, tone: 'info' },
  vibration: { label: 'Czujnik wibracji z syreną', short: 'Wibracje / syrena', icon: Siren, tone: 'danger' },
  access: { label: 'Kontrola dostępu RFID / PIN', short: 'RFID / PIN', icon: KeyRound, tone: 'accent' },
  heatmeter: { label: 'Ciepłomierz', short: 'Ciepłomierz', icon: Gauge, tone: 'danger' },
  gateway: { label: 'Bramka ZigBee (koordynator)', short: 'Bramka ZigBee', icon: Router, tone: 'neutral' },
  other: { label: 'Inne urządzenie', short: 'Inne', icon: Cpu, tone: 'neutral' },
};

// Typy z kolumny devices.device_type w bazie (ENUM). Jednoznaczne mapujemy wprost,
// ogólne (wejście/wyjście binarne, inny czujnik) doprecyzowujemy po modelu i nazwie.
const DB_TYPES = { ENV_SENSOR: 'env', RGB_LIGHT: 'light', RFID_KEYPAD: 'access', HEAT_METER: 'heatmeter', GATEWAY: 'gateway' };
const DB_CANDIDATES = {
  BINARY_INPUT: ['remote', 'button'],
  BINARY_OUTPUT: ['strip', 'switch'],
  OTHER_SENSOR: ['occupancy', 'vibration', 'env', 'heatmeter', 'access'],
};
const DB_FALLBACK = { BINARY_INPUT: 'button', BINARY_OUTPUT: 'switch', OTHER_SENSOR: 'other' };

const RULES = [
  ['heatmeter', /ciep[łl]omierz|heat ?meter|heatmeter|licznik ciep/],
  ['access', /rfid|\bpin\b|keypad|klawiatur|access|dost[ęe]p|czytnik|reader/],
  ['light', /p3z|bulb|[żz]ar[óo]wk|light|lamp|rgb|ts050[35]/],
  ['strip', /a11z|listw|strip|ts011f|socket|gniazd|plug|power ?bar/],
  ['remote', /ts0044|pilot|remote|scene ?switch|scen/],
  ['button', /snzb-01|button|przycisk/],
  ['occupancy', /snzb-06|occupan|presence|obecno|motion|ruch|radar|pir/],
  ['vibration', /\be14\b|vibrat|wibrac|siren|syren|alarm/],
  ['env', /\be5\b|ts0201|snzb-02|temp|humid|wilgot|t\/h|klimat|climate/],
  ['switch', /relay|przeka[źz]nik|switch|wyj[śs]ci|output|rygiel|zamek|lock|ds18b20/],
];

export function detectType(row) {
  const declared = String(row.device_type ?? row.type ?? '').trim();
  if (DEVICE_TYPES[declared.toLowerCase()]) return declared.toLowerCase(); // typy panelu (np. dane demo)
  const dbType = declared.toUpperCase();
  if (DB_TYPES[dbType]) return DB_TYPES[dbType];

  const haystack = [
    DB_CANDIDATES[dbType] ? null : declared,
    row.category,
    row.model,
    row.model_id,
    row.device_model,
    row.vendor,
    row.manufacturer,
    row.description,
    row.friendly_name,
    row.name,
    row.device_name,
  ]
    .filter((v) => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  const allowed = DB_CANDIDATES[dbType];
  for (const [type, re] of RULES) {
    if ((!allowed || allowed.includes(type)) && re.test(haystack)) return type;
  }
  return DB_FALLBACK[dbType] ?? 'other';
}

// Wiersz z tabeli `devices` → obiekt używany w panelu (location = nazwa pomieszczenia z tabeli rooms).
// Po ponownym sparowaniu czujnik dostaje nowy adres IEEE, a stary rekord zostaje w bazie.
// Taki rekord uznajemy za nieaktywny: backend oznaczył go jako niesparowany (is_paired = 0)
// albo nie odezwał się od ponad 3 dni. Rekordy bez last_seen (np. koordynator) są aktywne.
const STALE_AFTER_MS = 3 * 24 * 3600e3;

function isStale(row, lastSeen) {
  if (row.is_paired !== undefined && row.is_paired !== null && !Number(row.is_paired)) return true;
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() > STALE_AFTER_MS;
}

export function normalizeDevice(row, overrides = {}) {
  const id = row.device_id ?? row.id;
  const ieee = row.ieee_address ?? row.ieee ?? row.address ?? '';
  const detected = detectType(row);
  const lastSeen = row.last_seen ?? row.updated_at ?? null;
  return {
    id,
    ieee,
    name: row.friendly_name ?? row.name ?? row.device_name ?? (ieee || `Urządzenie ${id}`),
    model: row.model ?? row.model_id ?? row.device_model ?? null,
    vendor: row.vendor ?? row.manufacturer ?? null,
    location: row.location ?? row.room ?? null,
    lastSeen,
    stale: isStale(row, lastSeen),
    detectedType: detected,
    type: overrides[id] || detected,
    raw: row,
  };
}

export const typeMeta = (type) => DEVICE_TYPES[type] ?? DEVICE_TYPES.other;

const lastSeenMs = (d) => (d.lastSeen ? new Date(d.lastSeen).getTime() || 0 : 0);

// Urządzenia danego typu: najpierw aktywne, od najświeższego kontaktu. Nieaktywne (stare rekordy)
// pomijamy, gdy jest aktywne urządzenie tego samego typu – widoki biorące pierwsze urządzenie
// (Pulpit, Środowisko, test sygnalizacji) wybierają wtedy nowe, a nie stare.
export function devicesOfType(devices, ...types) {
  const list = (devices ?? []).filter((d) => types.includes(d.type));
  const typesWithActive = new Set(list.filter((d) => !d.stale).map((d) => d.type));
  return list
    .filter((d) => !d.stale || !typesWithActive.has(d.type))
    .map((d, index) => ({ d, index }))
    .sort((a, b) => Number(a.d.stale) - Number(b.d.stale) || lastSeenMs(b.d) - lastSeenMs(a.d) || a.index - b.index)
    .map(({ d }) => d);
}

// Urządzenia bateryjne raportują rzadko – jak w availability Zigbee2MQTT dostają dłuższy limit.
const PASSIVE = new Set(['env', 'remote', 'button', 'vibration', 'heatmeter']);

export function onlineStatus(lastSeen, type) {
  if (!lastSeen) return 'unknown';
  const age = Date.now() - new Date(lastSeen).getTime();
  const limit = PASSIVE.has(type) ? 25 * 3600e3 : 2 * 3600e3;
  return age < limit ? 'online' : 'offline';
}
