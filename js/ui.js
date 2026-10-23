// Peças de interface compartilhadas: avisos (toasts), diálogos e pedaços de HTML repetidos.
import { esc } from './utils.js';
import { icon } from './icons.js';

export function toast(message, { tone = 'info', action, timeout = 4500 } = {}) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${tone}`;
  el.innerHTML = `<span>${message}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { action.run(); el.remove(); });
    el.appendChild(btn);
  }
  root.appendChild(el);
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

/** Abre um <dialog> genérico com o HTML informado. Retorna o elemento. */
export function openDialog(html, { id = 'generic-dialog', onClose, classe = '' } = {}) {
  const dlg = document.getElementById(id);
  if (!dlg._wired) {
    // Um único ouvinte permanente; o handler da vez fica em dlg._onClose. O evento 'close' chega depois
    // (tarefa na fila): se o diálogo já foi reaberto com outro conteúdo, o evento atrasado é ignorado.
    dlg.addEventListener('close', () => {
      if (dlg.open) return;
      const fn = dlg._onClose; dlg._onClose = null; fn?.();
    });
    dlg._wired = true;
  }
  if (dlg._onClose) { const prev = dlg._onClose; dlg._onClose = null; prev(); }
  dlg._onClose = onClose || null;
  dlg.className = `sheet ${classe}`.trim();
  dlg.innerHTML = html;
  const close = () => dlg.close();
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  dlg.onclick = (e) => { if (e.target === dlg) close(); };
  if (!dlg.open) dlg.showModal();
  const first = dlg.querySelector('[autofocus]') || dlg.querySelector('input, select, textarea, button:not([data-close])');
  first?.focus();
  return dlg;
}

export function sheetHeader(title, id = 'generic-dialog-title') {
  return `<header class="sheet-head">
    <h2 id="${id}">${esc(title)}</h2>
    <button type="button" class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button>
  </header>`;
}

/** Confirmação acessível (substitui window.confirm). */
export function confirmDialog({ title, text, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const dlg = openDialog(`
      <form method="dialog" class="sheet-body confirm">
        ${sheetHeader(title)}
        <p>${text}</p>
        <div class="actions">
          <button type="button" class="btn ghost" data-close ${danger ? 'autofocus' : ''}>Cancelar</button>
          <button type="submit" class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirmLabel)}</button>
        </div>
      </form>`, { onClose: () => resolve(answer) });
    dlg.querySelector('[data-ok]').addEventListener('click', () => { answer = true; });
  });
}

export function emptyState({ title, text, action }) {
  return `<div class="empty">
    <p class="empty-title">${esc(title)}</p>
    <p>${text}</p>
    ${action || ''}
  </div>`;
}

/** Trava o botão enquanto a ação roda e mostra o erro em toast. Devolve o resultado (ou undefined se falhou). */
export async function enquanto(botao, fn) {
  const antes = botao?.disabled;
  if (botao) { botao.disabled = true; botao.setAttribute('aria-busy', 'true'); }
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(esc(err.message || 'Algo deu errado.'), { tone: 'alert', timeout: 7000 });
    return undefined;
  } finally {
    if (botao) { botao.disabled = antes; botao.removeAttribute('aria-busy'); }
  }
}
