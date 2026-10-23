// Ponto de entrada: conta, carga dos dados, rotas por hash e atualização em tempo real.
import { state, carregarTudo, ouvirMudancas, pararTempoReal, onChange, quandoFalharGravacao } from './store.js';
import { api, MODO_LOCAL, capturarRetornoEmail, pegarRetornoEmail } from './api.js';
import { aplicarTema, lerTema } from './tema.js';
import { toast } from './ui.js';
import { esc } from './utils.js';
import { icon } from './icons.js';
import { nomeMes } from './domain.js';
import * as calendario from './views/calendario.js';
import * as meses from './views/meses.js';
import * as ajustes from './views/ajustes.js';
import { telaEntrar, pedirNovaSenha } from './views/entrar.js';
import { registrarSW, vigiarConexao } from './pwa.js';

// Retorno de link de e-mail (confirmação/recuperação): lê os tokens e limpa a URL ANTES do roteador.
capturarRetornoEmail();

const ROTAS = {
  calendario: { view: calendario, label: 'Calendário', icon: 'calendar', titulo: (sub) => nomeMes(calendario.mesDaRota(sub)) },
  meses: { view: meses, label: 'Meses', icon: 'chart' },
  ajustes: { view: ajustes, label: 'Ajustes', icon: 'settings' },
};

const main = document.getElementById('main');
const shell = document.getElementById('shell');
const authRoot = document.getElementById('auth-root');
let ultimaRota = '';
let avisoPendente = null;
let pedirSenhaPendente = false; // voltou de um link de recuperação: pede a senha nova

function lerHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path] = raw.split('?');
  const [nome, sub = ''] = path.split('/');
  return { rota: ROTAS[nome] ? nome : 'calendario', sub: decodeURIComponent(sub) };
}

function montarNav() {
  document.getElementById('nav-list').innerHTML = Object.entries(ROTAS).map(([key, r]) => `
    <li><a href="#/${key}" data-route="${key}">${icon(r.icon)}<span>${r.label}</span></a></li>`).join('');
}

function render({ manterRolagem = false } = {}) {
  if (!state.carregado) return;
  const { rota, sub } = lerHash();
  const def = ROTAS[rota];
  const chave = `${rota}/${sub}`;
  const novaRota = chave !== ultimaRota;
  const y = window.scrollY;
  const focoId = main.contains(document.activeElement) ? document.activeElement.id : '';
  const ctx = { sub, rerender: () => render({ manterRolagem: true }) };
  // Contêiner novo a cada desenho: os ouvintes que a tela registra nele morrem junto (não acumulam).
  const vista = document.createElement('div');
  vista.className = `vista vista-${rota}`;
  vista.innerHTML = def.view.render(ctx);
  main.replaceChildren(vista);
  def.view.mount?.(vista, ctx);
  // Devolve o foco do teclado (ex.: o dia que acabou de ser tocado).
  if (focoId && !novaRota) main.querySelector(`#${CSS.escape(focoId)}`)?.focus({ preventScroll: true });
  avisoPendente?.remove();
  avisoPendente = null;
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === rota) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const titulo = def.titulo?.(sub) || def.label;
  document.title = `${titulo.charAt(0).toUpperCase()}${titulo.slice(1)} | Presença`;
  if (novaRota) {
    ultimaRota = chave;
    if (!manterRolagem) window.scrollTo(0, 0);
    if (document.activeElement && document.activeElement !== document.body && !document.querySelector('dialog[open]')) {
      main.focus({ preventScroll: true });
    }
  } else if (manterRolagem) {
    window.scrollTo(0, y);
  }
}

function eventos() {
  window.addEventListener('hashchange', () => render());

  onChange((motivo) => {
    const digitando = main.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)
      && !['radio', 'checkbox'].includes(document.activeElement.type) && document.activeElement.id !== 'nome-evento';
    if (motivo === 'remoto' && (digitando || document.querySelector('dialog[open]'))) {
      // Não tira o cursor de quem está digitando: avisa e deixa a pessoa escolher a hora.
      if (!avisoPendente) avisoPendente = toast('Há novidades.', { timeout: 0, action: { label: 'Atualizar', run: () => render({ manterRolagem: true }) } });
      return;
    }
    render({ manterRolagem: true });
  });

  quandoFalharGravacao((err) => toast(`Não foi possível salvar: ${esc(err.message)} O calendário voltou ao que está salvo.`, { tone: 'alert', timeout: 8000 }));

  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => aplicarTema(lerTema()));
}

function mostrarEntrar(opcoes) {
  pararTempoReal();
  shell.hidden = true;
  Object.assign(state, { usuario: null, carregado: false });
  telaEntrar(authRoot, opcoes);
}

async function sair() {
  await api.sair();
  mostrarEntrar();
}

async function entrarNoApp(usuario) {
  state.usuario = usuario;
  authRoot.innerHTML = '<p class="carregando" role="status">Carregando seu calendário…</p>';
  try {
    await carregarTudo();
  } catch (err) {
    console.error('[presenca] carga', err);
    authRoot.innerHTML = `<main class="auth"><div class="auth-card"><h1 class="auth-title">Não foi possível carregar</h1>
      <p>${esc(err.message)}</p><div class="actions left"><button class="btn primary" type="button" data-tentar>Tentar de novo</button>
      ${MODO_LOCAL ? '' : '<button class="btn ghost" type="button" data-sair>Sair</button>'}</div></div></main>`;
    authRoot.querySelector('[data-tentar]').addEventListener('click', () => entrarNoApp(usuario));
    authRoot.querySelector('[data-sair]')?.addEventListener('click', sair);
    return;
  }
  authRoot.innerHTML = '';
  montarNav();
  shell.hidden = false;
  ultimaRota = '';
  render();
  ouvirMudancas().catch((err) => console.warn('[presenca] tempo real indisponível:', err.message));
}

async function boot() {
  aplicarTema(lerTema());
  eventos();
  if (MODO_LOCAL) document.getElementById('faixa-local').hidden = false;
  vigiarConexao(toast);
  registrarSW((aplicar) => toast('Nova versão do app disponível.', { timeout: 0, action: { label: 'Atualizar', run: aplicar } }));

  const retorno = pegarRetornoEmail();
  if (retorno?.tipo === 'erro') {
    toast(/expired|invalid/i.test(retorno.descricao) ? 'O link do e-mail expirou ou já foi usado. Peça outro.' : esc(retorno.descricao || 'Link inválido.'), { tone: 'alert', timeout: 9000 });
  } else if (retorno?.tipo === 'sessao') {
    try {
      await api.aplicarRetorno(retorno);
      pedirSenhaPendente = retorno.evento === 'recovery' || retorno.evento === 'invite';
      if (retorno.evento === 'signup') toast('E-mail confirmado.');
    } catch (err) {
      toast(esc(err.message), { tone: 'alert', timeout: 9000 });
    }
  }

  let usuario = null;
  try { usuario = await api.usuario(); } catch (err) { toast(esc(err.message), { tone: 'alert', timeout: 0 }); }
  state.usuario = usuario; // antes de ouvir a sessão: o evento inicial não pode abrir o app em dobro

  await api.aoMudarSessao((evento, user) => {
    if (evento === 'SIGNED_OUT') { if (state.usuario) mostrarEntrar(); return; }
    if (evento === 'PASSWORD_RECOVERY') { pedirNovaSenha(); return; }
    if (evento === 'SIGNED_IN' && user && user.email !== state.usuario?.email) entrarNoApp(user);
  });

  if (!usuario) { mostrarEntrar(); return; }
  await entrarNoApp(usuario);
  if (pedirSenhaPendente) { pedirSenhaPendente = false; pedirNovaSenha({ titulo: 'Defina sua senha' }); }
}

boot();
