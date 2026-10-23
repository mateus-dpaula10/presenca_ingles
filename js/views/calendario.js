// Calendário do mês: toque nos dias para marcar presença ou evento da empresa. Ao lado, a porcentagem do
// mês (dias de evento ficam fora da conta), quanto falta para a meta e a lista de eventos.
import { state, hoje, regrasAtuais, alternarDia, definirMarca, renomearEvento, desmarcar } from '../store.js';
import { gradeDoMes, situacao, resumoMes, nomeMes, nomeDia, mesDe, somarMeses, ehMes, diaDaSemana, SEMANA_CURTA, NOTA_MAX } from '../domain.js';
import { esc, plural } from '../utils.js';
import { toast, openDialog, sheetHeader } from '../ui.js';
import { icon } from '../icons.js';
import { anel, avisoMeta } from './comum.js';

// O modo (o que o toque marca) fica lembrado neste aparelho; o nome do evento vale até sair da tela.
const CHAVE_MODO = 'presenca:modo';
let modo = (() => { try { return localStorage.getItem(CHAVE_MODO) === 'evento' ? 'evento' : 'presenca'; } catch { return 'presenca'; } })();
let nomeEvento = '';

const ROTULO = { presenca: 'presença', evento: 'evento da empresa, fora da conta', falta: 'falta', aula: 'aula a fazer', livre: 'sem aula' };
const MARCA = { presenca: 'check', evento: 'flag', falta: 'x' };

export const mesDaRota = (sub) => (ehMes(sub) ? sub : mesDe(hoje()));

function celula(iso, r, h) {
  const marca = state.marcas.get(iso);
  const s = situacao(iso, marca, r, h);
  const ehHoje = iso === h;
  const rotulo = `${nomeDia(iso)}${ehHoje ? ' (hoje)' : ''}: ${ROTULO[s]}${marca?.nota ? `, ${marca.nota}` : ''}`;
  return `<button type="button" class="dia s-${s} ${ehHoje ? 'hoje' : ''}" id="d-${iso}" data-dia="${iso}" aria-label="${esc(rotulo)}" title="${esc(marca?.nota || '')}">
    <span class="dia-n">${Number(iso.slice(8))}</span>${MARCA[s] ? icon(MARCA[s], { size: 15 }) : ''}</button>`;
}

function itemEvento(m, r) {
  const semAula = !r.dias_aula.includes(diaDaSemana(m.data));
  return `<li>
    <span class="ev-data"><strong>${Number(m.data.slice(8))}</strong><span>${SEMANA_CURTA[diaDaSemana(m.data)]}</span></span>
    <span class="lista-txt"><strong>${esc(m.nota || 'Evento da empresa')}</strong>${semAula ? '<br><span class="muted small">Não era dia de aula</span>' : ''}</span>
    <button type="button" class="icon-btn small" data-editar-evento="${m.data}" aria-label="Editar o evento de ${esc(nomeDia(m.data))}">${icon('edit', { size: 18 })}</button>
  </li>`;
}

export function render({ sub }) {
  const mes = mesDaRota(sub);
  const h = hoje();
  const r = regrasAtuais();
  const res = resumoMes(mes, state.marcas, r, h);
  const [ano] = mes.split('-');
  const eventos = [...state.marcas.values()].filter((m) => m.tipo === 'evento' && mesDe(m.data) === mes).sort((a, b) => a.data.localeCompare(b.data));
  const futuro = mes > mesDe(h);
  const celulas = gradeDoMes(mes).map((iso) => (iso ? celula(iso, r, h) : '<span class="dia vazio" aria-hidden="true"></span>')).join('');
  const opcaoModo = (valor, ic, texto) => `<label><input type="radio" name="modo" id="modo-${valor}" value="${valor}" ${modo === valor ? 'checked' : ''}>
    <span class="m-${valor}">${icon(ic, { size: 18 })}${texto}</span></label>`;

  return `
    <header class="page-head">
      <div>
        <p class="page-kicker">Presença nas aulas</p>
        <h1 class="page-title"><span class="cap">${esc(nomeMes(mes).split(' de ')[0])}</span> <span class="ano">${ano}</span></h1>
      </div>
      <div class="head-actions">
        <a class="icon-btn" href="#/calendario/${somarMeses(mes, -1)}" aria-label="Mês anterior">${icon('left')}</a>
        ${mes !== mesDe(h) ? '<a class="btn ghost small" href="#/calendario">Hoje</a>' : ''}
        <a class="icon-btn" href="#/calendario/${somarMeses(mes, 1)}" aria-label="Próximo mês">${icon('right')}</a>
      </div>
    </header>

    <div class="cal-layout">
      <section class="block resumo" aria-labelledby="h-resumo">
        <h2 id="h-resumo" class="sr-only">Presença em ${esc(nomeMes(mes))}</h2>
        <div class="resumo-topo">
          ${anel(res, r.meta)}
          <div class="resumo-txt">
            <p class="resumo-num">${res.aulas ? `<strong>${res.presencas}</strong> de ${plural(res.aulas, 'aula', 'aulas')}` : 'Nenhuma aula contada'}</p>
            <p class="muted small">${futuro ? 'Este mês ainda não começou. Os eventos já dá para marcar.' : res.restam ? `Contando até ${state.marcas.has(h) ? 'hoje' : 'ontem'}. ${res.restam === 1 ? 'Ainda vem 1 aula' : `Ainda vêm ${res.restam} aulas`}.` : 'Mês completo.'}</p>
          </div>
        </div>
        ${avisoMeta(res)}
        <dl class="mini-kpis kpis-4">
          <div><dt>Presenças</dt><dd class="t-presenca">${res.presencas}</dd></div>
          <div><dt>Faltas</dt><dd class="t-falta">${res.faltas}</dd></div>
          <div><dt>Eventos</dt><dd class="t-evento">${res.eventos}</dd></div>
          <div><dt>Restam</dt><dd>${res.restam}</dd></div>
        </dl>
        ${res.eventos ? `<p class="field-hint">${res.eventos === 1 ? 'O dia de evento da empresa fica' : `Os ${res.eventos} dias de evento da empresa ficam`} fora da conta: não é presença nem falta.</p>` : ''}
      </section>

      <section class="block cal-bloco" aria-labelledby="h-cal">
        <h2 id="h-cal" class="sr-only">Calendário de ${esc(nomeMes(mes))}</h2>
        <fieldset class="segmented modo">
          <legend class="field-label">Tocar no dia marca</legend>
          ${opcaoModo('presenca', 'check', 'Presença')}
          ${opcaoModo('evento', 'flag', 'Evento da empresa')}
        </fieldset>
        ${modo === 'evento' ? `<label class="field nome-evento" for="nome-evento"><span class="field-label">Nome do evento <small>(opcional)</small></span>
          <input id="nome-evento" type="text" maxlength="${NOTA_MAX}" placeholder="Ex.: convenção, treinamento, viagem" value="${esc(nomeEvento)}" autocomplete="off" enterkeyhint="done">
          <span class="field-hint">Vale para os dias que você tocar a seguir.</span></label>` : ''}
        <div class="cal">
          <div class="cal-semana" aria-hidden="true">${SEMANA_CURTA.map((d) => `<span>${d}</span>`).join('')}</div>
          <div class="cal-dias">${celulas}</div>
        </div>
        <ul class="legenda" aria-label="Legenda">
          <li><span class="leg s-presenca"></span>Presença</li>
          <li><span class="leg s-falta"></span>Falta</li>
          <li><span class="leg s-evento"></span>Evento</li>
          <li><span class="leg s-aula"></span>Aula a fazer</li>
          <li><span class="leg s-livre"></span>Sem aula</li>
        </ul>
        <p class="field-hint">Toque de novo para desmarcar. Dia de aula que passou sem presença conta como falta.</p>
      </section>

      <section class="block eventos" aria-labelledby="h-eventos">
        <div class="block-head"><h2 id="h-eventos">${icon('flag', { size: 20 })}Eventos da empresa</h2></div>
        ${eventos.length
          ? `<ul class="lista-simples">${eventos.map((m) => itemEvento(m, r)).join('')}</ul>`
          : '<p class="muted small">Nenhum neste mês. Escolha “Evento da empresa” acima e toque nos dias.</p>'}
      </section>
    </div>`;
}

function dialogoEvento(data) {
  const m = state.marcas.get(data);
  if (m?.tipo !== 'evento') return;
  const dlg = openDialog(`
    <form class="sheet-body" novalidate>
      ${sheetHeader('Evento da empresa')}
      <p class="muted cap">${esc(nomeDia(data))}</p>
      <label class="field" for="ev-nome"><span class="field-label">Nome do evento</span>
        <input id="ev-nome" name="nome" type="text" maxlength="${NOTA_MAX}" value="${esc(m.nota)}" autocomplete="off" autofocus></label>
      <div class="actions">
        <button type="button" class="btn ghost danger-text" data-tirar>${icon('trash', { size: 18 })}Tirar o evento</button>
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>`);
  dlg.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    renomearEvento(data, e.target.nome.value);
    dlg.close();
  });
  dlg.querySelector('[data-tirar]').addEventListener('click', () => {
    desmarcar(data);
    dlg.close();
    toast('Evento tirado. O dia volta para a conta.', { action: { label: 'Desfazer', run: () => definirMarca(data, m) } });
  });
}

export function mount(root, ctx) {
  root.addEventListener('change', (e) => {
    if (e.target.name !== 'modo') return;
    modo = e.target.value;
    try { localStorage.setItem(CHAVE_MODO, modo); } catch { /* só não lembra */ }
    ctx.rerender();
  });
  root.addEventListener('input', (e) => { if (e.target.id === 'nome-evento') nomeEvento = e.target.value; });
  root.addEventListener('keydown', (e) => { if (e.target.id === 'nome-evento' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  root.addEventListener('click', (e) => {
    const dia = e.target.closest('[data-dia]');
    if (dia) {
      const data = dia.dataset.dia;
      const antes = state.marcas.get(data) || null;
      const r = alternarDia(data, modo, nomeEvento);
      if (r.erro) { toast(esc(r.erro), { tone: 'alert' }); return; }
      navigator.vibrate?.(8);
      // Trocar evento por presença (ou o contrário) apaga o que estava: dá para voltar.
      if (antes && r.marca && antes.tipo !== r.marca.tipo) {
        toast(antes.tipo === 'evento' ? `Evento${antes.nota ? ` “${esc(antes.nota)}”` : ''} trocado por presença.` : 'Presença trocada por evento.', {
          action: { label: 'Desfazer', run: () => definirMarca(data, antes) },
        });
      }
      return;
    }
    const ev = e.target.closest('[data-editar-evento]');
    if (ev) dialogoEvento(ev.dataset.editarEvento);
  });
}
