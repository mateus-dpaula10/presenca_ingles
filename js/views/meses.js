// Todos os meses, do início até agora: a porcentagem de cada um (eventos fora da conta) e o total.
import { state, hoje, regrasAtuais } from '../store.js';
import { mesesComDados, resumoMes, somarResumos, nomeMes, mesDe } from '../domain.js';
import { esc, fmtDate, fmtPct, plural } from '../utils.js';
import { anel, classeMeta } from './comum.js';

function itemMes(res, meta, atual) {
  const largura = res.pct == null ? 0 : Math.round(res.pct * 1000) / 10;
  const extras = [
    res.eventos ? plural(res.eventos, 'evento', 'eventos') : '',
    res.restam ? (res.restam === 1 ? '1 aula a fazer' : `${res.restam} aulas a fazer`) : '',
  ].filter(Boolean);
  return `<li><a class="item-mes ${res.mes === atual ? 'atual' : ''}" href="#/calendario/${res.mes}">
    <span class="item-txt">
      <span class="item-titulo"><span class="cap">${esc(nomeMes(res.mes))}</span>${res.mes === atual ? ' <span class="selo agora">Este mês</span>' : ''}</span>
      <span class="barra ${classeMeta(res.pct, meta)}" style="--w:${largura}%;--meta:${meta}%" aria-hidden="true"><span></span></span>
      <span class="muted small">${res.aulas ? `${res.presencas} de ${plural(res.aulas, 'aula', 'aulas')}` : 'Nenhuma aula contada'}${extras.length ? ` · ${extras.join(' · ')}` : ''}</span>
    </span>
    <span class="mes-pct ${classeMeta(res.pct, meta)}">${fmtPct(res.pct)}</span>
  </a></li>`;
}

export function render() {
  const h = hoje();
  const r = regrasAtuais();
  const meses = mesesComDados(state.marcas, r, h).map((m) => resumoMes(m, state.marcas, r, h));
  const total = somarResumos(meses);
  return `
    <header class="page-head"><div>
      <h1 class="page-title">Meses</h1>
      <p class="page-sub">Contando desde ${esc(fmtDate(r.inicio))}${state.ajustes.inicio ? '' : ', o primeiro dia marcado (dá para mudar em Ajustes)'}.</p>
    </div></header>

    <section class="block resumo" aria-labelledby="h-total">
      <div class="block-head"><h2 id="h-total">Desde o início</h2></div>
      <div class="resumo-topo">
        ${anel(total, r.meta)}
        <div class="resumo-txt">
          <p class="resumo-num">${total.aulas ? `<strong>${total.presencas}</strong> de ${plural(total.aulas, 'aula', 'aulas')}` : 'Nenhuma aula contada'}</p>
          <p class="muted small">${plural(total.faltas, 'falta', 'faltas')} · ${plural(total.eventos, 'dia de evento', 'dias de evento')} fora da conta${r.meta ? ` · meta ${r.meta}%` : ''}</p>
        </div>
      </div>
    </section>

    <ul class="lista-meses">${meses.map((m) => itemMes(m, r.meta, mesDe(h))).join('')}</ul>`;
}
