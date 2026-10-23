// Ajustes: como a presença é contada (dias de aula, meta, início), conta e tema, instalar o app e,
// no modo local, restaurar o exemplo ou começar do zero.
import { state, salvarAjustes } from '../store.js';
import { api, MODO_LOCAL } from '../api.js';
import { SEMANA_CURTA, SEMANA } from '../domain.js';
import { esc } from '../utils.js';
import { toast, enquanto, confirmDialog, openDialog, sheetHeader } from '../ui.js';
import { icon } from '../icons.js';
import { aplicarTema, lerTema } from '../tema.js';
import { instalacao } from '../pwa.js';

function blocoInstalar() {
  if (instalacao.instalado()) return '<p class="muted small">Aberto como app instalado neste aparelho.</p>';
  if (instalacao.disponivel()) {
    return `<button type="button" class="btn primary small" data-instalar>${icon('download', { size: 18 })}Instalar app</button>
      <p class="field-hint">Fica com ícone na tela inicial e abre em tela cheia, como um aplicativo.</p>`;
  }
  if (instalacao.ios()) return '<p class="field-hint">Para instalar no iPhone: no Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>';
  return '<p class="field-hint">Para instalar: no menu do navegador, procure <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</p>';
}

let pararInstalar = null;

// Segunda primeiro: é como a semana de aula costuma ser pensada.
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

export function render() {
  const tema = lerTema();
  const a = state.ajustes;
  return `
    <header class="page-head"><div><h1 class="page-title">Ajustes</h1></div></header>

    ${MODO_LOCAL ? `
      <section class="block destaque-local" aria-labelledby="h-local">
        <div class="block-head"><h2 id="h-local">Modo local</h2></div>
        <p>Os dados estão só neste navegador. Para ter login e ver os mesmos dias em qualquer aparelho, rode
          <code>supabase/schema.sql</code> no Supabase e preencha <code>js/config.js</code> (passo a passo no README).</p>
        <div class="actions left">
          <button type="button" class="btn ghost small" data-zerar>Começar do zero</button>
          <button type="button" class="btn ghost small" data-restaurar>Restaurar exemplo</button>
        </div>
      </section>` : ''}

    <div class="cols">
      <section class="block" aria-labelledby="h-aulas">
        <div class="block-head"><h2 id="h-aulas">Como a presença é contada</h2></div>
        <form id="form-aulas" novalidate>
          <fieldset class="checks-inline">
            <legend class="field-label">Dias que têm aula</legend>
            ${ORDEM_SEMANA.map((d) => `<label class="check-pill"><input type="checkbox" name="dias" value="${d}" id="aj-dia-${d}" ${a.dias_aula.includes(d) ? 'checked' : ''}>
              <span title="${SEMANA[d]}">${SEMANA_CURTA[d]}</span></label>`).join('')}
          </fieldset>
          <div class="grid-2">
            <label class="field" for="aj-meta"><span class="field-label">Meta de presença <small>(%)</small></span>
              <input id="aj-meta" name="meta" type="number" min="0" max="100" step="1" inputmode="numeric" value="${a.meta}">
              <span class="field-hint">0 desliga o aviso da meta.</span></label>
            <label class="field" for="aj-inicio"><span class="field-label">Início das aulas <small>(opcional)</small></span>
              <input id="aj-inicio" name="inicio" type="date" value="${esc(a.inicio || '')}">
              <span class="field-hint">Vazio: conta a partir do primeiro dia marcado.</span></label>
          </div>
          <p class="callout info">${icon('info', { size: 18 })} Dia de aula que passou sem presença conta como falta. Dia de <strong>evento da empresa</strong> não conta: sai da porcentagem do mês.</p>
          <div class="actions left"><button type="submit" class="btn primary">Salvar</button></div>
        </form>
      </section>

      <section class="block" aria-labelledby="h-conta">
        <div class="block-head"><h2 id="h-conta">Sua conta</h2></div>
        ${MODO_LOCAL ? '<p class="muted">Modo local: sem login.</p>' : `<p><strong>${esc(state.usuario?.email || '')}</strong></p>`}
        <fieldset class="segmented small"><legend class="field-label">Tema</legend>
          ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<label><input type="radio" name="tema" value="${v}" ${tema === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </fieldset>
        <div class="instalar" id="instalar">${blocoInstalar()}</div>
        ${MODO_LOCAL ? '' : `<div class="actions left">
          <button type="button" class="btn ghost small" data-senha>Trocar senha</button>
          <button type="button" class="btn ghost small" data-sair>${icon('logout', { size: 18 })}Sair</button></div>`}
      </section>
    </div>`;
}

/** Trocar a própria senha, direto (sem depender de e-mail). */
function dialogoMinhaSenha() {
  const dlg = openDialog(`
    <form class="sheet-body" novalidate>
      ${sheetHeader('Trocar minha senha')}
      <label class="field" for="ms-nova"><span class="field-label">Senha nova</span>
        <input id="ms-nova" name="nova" type="password" minlength="8" autocomplete="new-password" required autofocus></label>
      <label class="field" for="ms-conf"><span class="field-label">Repita a senha nova</span>
        <input id="ms-conf" name="conf" type="password" minlength="8" autocomplete="new-password" required></label>
      <div class="actions">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button type="submit" class="btn primary">Trocar senha</button>
      </div>
    </form>`);
  const f = dlg.querySelector('form');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (f.nova.value.length < 8) { toast('A senha precisa ter pelo menos 8 caracteres.', { tone: 'alert' }); return; }
    if (f.nova.value !== f.conf.value) { toast('As duas senhas não são iguais.', { tone: 'alert' }); return; }
    const ok = await enquanto(e.submitter, async () => { await api.novaSenha(f.nova.value); return true; });
    if (ok) { dlg.close(); toast('Senha trocada. Use a nova no próximo acesso.'); }
  });
}

export function mount(root) {
  pararInstalar?.();
  pararInstalar = instalacao.aoMudar(() => {
    const el = document.getElementById('instalar');
    if (el) el.innerHTML = blocoInstalar();
  });

  root.querySelector('#form-aulas').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const dias = [...f.querySelectorAll('input[name=dias]:checked')].map((x) => Number(x.value));
    const meta = f.meta.value.trim();
    if (meta !== '' && !(Number(meta) >= 0 && Number(meta) <= 100)) { toast('A meta vai de 0 a 100%.', { tone: 'alert' }); return; }
    if (!dias.length) {
      const ok = await confirmDialog({ title: 'Nenhum dia de aula?', text: 'Sem dia de aula, nenhum dia vira falta: só as presenças marcadas contam. Salvar assim?', confirmLabel: 'Salvar assim' });
      if (!ok) return;
    }
    const ok = await enquanto(e.submitter, async () => { await salvarAjustes({ dias_aula: dias, meta: meta === '' ? 75 : meta, inicio: f.inicio.value || null }); return true; });
    if (ok) toast('Ajustes salvos. A porcentagem já foi recalculada.');
  });

  root.addEventListener('change', (e) => {
    if (e.target.name === 'tema') aplicarTema(e.target.value);
  });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if ('instalar' in d) {
      const r = await instalacao.pedir();
      if (r === 'accepted') toast('App instalado. Procure o ícone “Presença”.');
    } else if ('sair' in d) { await api.sair(); location.reload(); }
    else if ('senha' in d) dialogoMinhaSenha();
    else if ('restaurar' in d) {
      const ok = await confirmDialog({ title: 'Restaurar exemplo?', text: 'Tudo o que você marcou no modo local é apagado e os dados de exemplo voltam.', confirmLabel: 'Restaurar', danger: true });
      if (ok) { api.restaurarExemplo(); location.hash = '#/calendario'; location.reload(); }
    } else if ('zerar' in d) {
      const ok = await confirmDialog({ title: 'Começar do zero?', text: 'Apaga todos os dias marcados neste navegador (presenças e eventos) e volta os ajustes ao padrão.', confirmLabel: 'Apagar tudo', danger: true });
      if (ok) { api.comecarDoZero(); location.hash = '#/calendario'; location.reload(); }
    }
  });
}
