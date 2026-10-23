// Pedaços usados por mais de uma tela: o anel da porcentagem e o aviso de quanto falta para a meta.
import { esc, fmtPct, plural } from '../utils.js';
import { icon } from '../icons.js';

/** Acima, abaixo ou sem meta (meta 0 = desligada). */
export function classeMeta(pct, meta) {
  if (pct == null) return 'vazio';
  if (!meta) return 'neutro';
  return pct * 100 >= meta - 1e-9 ? 'ok' : 'abaixo';
}

/** Anel com a porcentagem no meio. */
export function anel(res, meta, { pequeno = false } = {}) {
  const p = res.pct == null ? 0 : Math.round(res.pct * 1000) / 10;
  const rotulo = res.pct == null ? 'Nenhuma aula contada ainda' : `Presença de ${fmtPct(res.pct)}${meta ? `, meta de ${meta}%` : ''}`;
  return `<div class="anel ${classeMeta(res.pct, meta)} ${pequeno ? 'pequeno' : ''}" style="--p:${p}" role="img" aria-label="${esc(rotulo)}">
    <span aria-hidden="true">${fmtPct(res.pct)}</span></div>`;
}

const aulas = (n) => plural(n, 'aula que falta', 'aulas que faltam');

/** Recado da meta do mês: garantida, quanto precisa ou que não dá mais. */
export function avisoMeta(res) {
  const a = res.alvo;
  if (!a || !a.meta) return '';
  const meta = `${a.meta}%`;
  const caixa = (tom, ic, texto) => `<p class="callout ${tom}">${icon(ic, { size: 18 })} ${texto}</p>`;
  if (!a.restam) {
    return classeMeta(res.pct, a.meta) === 'ok'
      ? caixa('good', 'check', `Mês fechado na meta de ${meta}.`)
      : caixa('alert', 'alert', `Mês fechado abaixo da meta de ${meta}.`);
  }
  if (!a.possivel) return caixa('alert', 'alert', `Mesmo indo nas ${aulas(a.restam)}, o mês fecha em ${fmtPct(a.melhor)}: abaixo da meta de ${meta}.`);
  if (a.precisa === 0) return caixa('good', 'check', `Meta de ${meta} garantida, mesmo faltando ${a.restam === 1 ? 'na aula que falta' : `nas ${a.restam} aulas que faltam`}.`);
  if (a.precisa === a.restam) {
    return caixa('warn', 'target', `Para fechar com ${meta}: ${a.restam === 1 ? 'ir na aula que falta' : `ir em todas as ${a.restam} aulas que faltam`}, sem faltar.`);
  }
  return caixa('info', 'target', `Para fechar com ${meta}: ir em ${a.precisa} das ${aulas(a.restam)} (dá para faltar em ${a.podeFaltar === 1 ? 'uma' : `até ${a.podeFaltar}`}).`);
}
