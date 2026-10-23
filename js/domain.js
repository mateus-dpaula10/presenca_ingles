// Regras puras do app (sem tela e sem banco), testadas em tests/domain.test.js.
// Dia sempre como texto 'YYYY-MM-DD' no fuso do aparelho; mês como 'YYYY-MM'.
//
// Como a porcentagem é contada:
//  - dia de aula = dia da semana marcado em Ajustes (padrão: segunda a sexta), a partir do início;
//  - presença conta a favor (até em dia que normalmente não tem aula, como uma reposição no sábado);
//  - dia de aula que já passou sem presença conta como falta;
//  - EVENTO DA EMPRESA não conta para nada: o dia sai da conta (nem presença, nem falta);
//  - hoje e os dias que ainda vão chegar ficam como "restam" até serem marcados.
import { parseISODate, pad } from './utils.js';

export const TIPOS = { presenca: 'Presença', evento: 'Evento da empresa' };
export const SEMANA_CURTA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const NOTA_MAX = 80;

export const AJUSTES_PADRAO = Object.freeze({ dias_aula: Object.freeze([1, 2, 3, 4, 5]), meta: 75, inicio: null });

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-\d{2}$/;
export const ehDia = (s) => ISO.test(String(s || ''));
export const ehMes = (s) => MES.test(String(s || ''));

/** Ajustes vindos do banco (ou de um formulário) em formato confiável. */
export function normalizarAjustes(a) {
  const dias = Array.isArray(a?.dias_aula)
    ? [...new Set(a.dias_aula.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((x, y) => x - y)
    : [...AJUSTES_PADRAO.dias_aula];
  const metaNum = a?.meta === '' || a?.meta == null ? NaN : Number(a.meta);
  const meta = Number.isFinite(metaNum) ? Math.min(100, Math.max(0, Math.round(metaNum))) : AJUSTES_PADRAO.meta;
  return { dias_aula: dias, meta, inicio: ehDia(a?.inicio) ? a.inicio : null };
}

// ---------- Calendário ----------

export const mesDe = (iso) => String(iso).slice(0, 7);

export function somarMeses(mes, n) {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function diasDoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const total = new Date(y, m, 0).getDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${pad(i + 1)}`);
}

export const diaDaSemana = (iso) => parseISODate(iso).getDay();

/** Células do mês para a grade de 7 colunas (domingo primeiro); null = espaço vazio antes/depois. */
export function gradeDoMes(mes) {
  const dias = diasDoMes(mes);
  const celulas = [...Array(diaDaSemana(dias[0])).fill(null), ...dias];
  while (celulas.length % 7) celulas.push(null);
  return celulas;
}

/** "outubro de 2026". */
export function nomeMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

/** "terça, 14 de outubro". */
export function nomeDia(iso) {
  const d = parseISODate(iso);
  return `${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

// ---------- Contagem ----------

/**
 * Regras que valem para a conta: os ajustes e o início efetivo. Sem início nos Ajustes, conta a partir do
 * primeiro dia marcado (senão, quem começa a usar no dia 22 veria os dias 1 a 21 como falta).
 */
export function regras(ajustes, marcas, hoje) {
  const a = normalizarAjustes(ajustes);
  let inicio = a.inicio;
  if (!inicio) {
    for (const data of marcas.keys()) if (!inicio || data < inicio) inicio = data;
  }
  return { ...a, inicio: inicio || hoje };
}

/** 'presenca' | 'evento' | 'falta' | 'aula' (hoje ou ainda vai chegar) | 'livre' (sem aula ou antes do início). */
export function situacao(iso, marca, r, hoje) {
  if (marca?.tipo === 'evento') return 'evento';
  if (marca?.tipo === 'presenca') return 'presenca';
  if (iso < r.inicio || !r.dias_aula.includes(diaDaSemana(iso))) return 'livre';
  return iso < hoje ? 'falta' : 'aula';
}

/** Quanto falta para a meta: em quantas das aulas restantes ainda precisa ir. */
export function metaDoMes({ presencas, aulas, restam }, meta) {
  const total = aulas + restam;
  if (!total) return null;
  // -1e-9: 0,75 × 20 dá 15,000000000000002 em ponto flutuante.
  const precisa = Math.max(0, Math.ceil((meta / 100) * total - 1e-9) - presencas);
  return {
    meta,
    precisa,
    restam,
    possivel: precisa <= restam,
    podeFaltar: Math.max(0, restam - precisa),
    melhor: (presencas + restam) / total, // indo em todas as que faltam
    pior: presencas / total, // faltando em todas as que faltam
  };
}

/** Resumo de um mês: presenças, faltas, eventos (fora da conta), aulas que restam e a porcentagem. */
export function resumoMes(mes, marcas, r, hoje) {
  const res = { mes, presencas: 0, faltas: 0, eventos: 0, restam: 0 };
  for (const iso of diasDoMes(mes)) {
    const s = situacao(iso, marcas.get(iso), r, hoje);
    if (s === 'presenca') res.presencas++;
    else if (s === 'falta') res.faltas++;
    else if (s === 'evento') res.eventos++;
    else if (s === 'aula') res.restam++;
  }
  res.aulas = res.presencas + res.faltas; // as que já contam
  res.pct = res.aulas ? res.presencas / res.aulas : null;
  res.alvo = metaDoMes(res, r.meta);
  return res;
}

/** Meses com alguma coisa para mostrar (do início até o mês atual, mais os futuros que já têm marca), do mais novo ao mais antigo. */
export function mesesComDados(marcas, r, hoje) {
  let ultimo = mesDe(hoje);
  for (const data of marcas.keys()) if (mesDe(data) > ultimo) ultimo = mesDe(data);
  const lista = [];
  for (let m = mesDe(r.inicio); m <= ultimo && lista.length < 240; m = somarMeses(m, 1)) lista.push(m);
  return lista.reverse();
}

/** Soma de vários meses (o total desde o início). */
export function somarResumos(resumos) {
  const t = resumos.reduce((acc, x) => ({
    presencas: acc.presencas + x.presencas, faltas: acc.faltas + x.faltas, eventos: acc.eventos + x.eventos, restam: acc.restam + x.restam,
  }), { presencas: 0, faltas: 0, eventos: 0, restam: 0 });
  t.aulas = t.presencas + t.faltas;
  t.pct = t.aulas ? t.presencas / t.aulas : null;
  return t;
}

/**
 * O que acontece ao tocar num dia com o modo escolhido: marca, troca ou desmarca.
 * Devolve a marca nova (null = desmarcar) ou { erro }.
 */
export function alternarMarca(atual, { data, tipo, nota = '' }, hoje) {
  if (atual?.tipo === tipo) return null;
  if (tipo === 'presenca' && data > hoje) return { erro: 'Esse dia ainda não chegou: presença só até hoje. Eventos dá para marcar antes.' };
  return { data, tipo, nota: tipo === 'evento' ? String(nota).trim().slice(0, NOTA_MAX) : '' };
}
