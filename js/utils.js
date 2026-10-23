// Utilitários puros: datas locais, porcentagem e HTML seguro.

const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Proporção (0,857) como "85,7%". Nulo vira "—". */
export const fmtPct = (ratio) => (ratio == null || !Number.isFinite(ratio) ? '—' : PCT.format(ratio));

const pad = (n) => String(n).padStart(2, '0');
export { pad };

/** Data local de hoje no formato YYYY-MM-DD (sem armadilha de fuso UTC). */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

export const fmtDate = (iso) => (iso ? DATE.format(parseISODate(iso)) : '—');

/** Escapa texto para interpolar em HTML. Use SEMPRE em dado digitado pelo usuário. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Pluralização simples pt-BR. */
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
