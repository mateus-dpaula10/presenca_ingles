// Acesso a dados e conta. Duas implementações com a mesma interface:
//  - Supabase (login, tempo real), quando js/config.js tem URL e chave;
//  - local (localStorage deste navegador, com dados de exemplo), para usar e conhecer o app antes de configurar.
//
// Decisões (as mesmas da Caderneta e do Treinos):
//  - supabase-js empacotado em js/vendor/ e carregado só quando precisa;
//  - flowType 'implicit' + detectSessionInUrl desligado: o link do e-mail volta com os tokens no hash e o app
//    lê e limpa esse hash ANTES do roteador (capturarRetornoEmail).
//
// Dados: "dias" (uma linha por dia marcado: presença ou evento) e "ajustes" (uma linha por pessoa).
// Cada pessoa só enxerga as próprias linhas; não há papéis. As contas são do projeto Supabase inteiro (Caderneta,
// Treinos...), mas só usa o Presença quem está em presenca.usuarios: entra lá quem se cadastra por este app.
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SCHEMA, SUPABASE_LIB, AUTH_STORAGE_KEY, MODO_LOCAL } from './config.js';
import { todayISO, addDays } from './utils.js';
import { diasDoMes, diaDaSemana, mesDe, somarMeses } from './domain.js';

export { MODO_LOCAL };

// ---------- Mensagens de erro em português ----------

export function mensagemErro(error) {
  const msg = String(error?.message || error || '');
  const code = String(error?.code || '');
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/already registered|already been registered/i.test(msg)) return 'Esse e-mail já tem conta (neste ou em outro app). Use “Entrar” ou cadastre outro e-mail.';
  if (/password should be at least|weak password/i.test(msg)) return 'A senha precisa ter pelo menos 8 caracteres, misturando letras e números.';
  if (/rate limit|too many|over_email_send_rate_limit/i.test(msg + code)) return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (/row-level security|permission denied|sem permissão/i.test(msg) || code === '42501') return 'Sem permissão para isso.';
  if (code === 'PGRST106' || /invalid schema|schema must be one of/i.test(msg)) return 'O schema "presenca" ainda não foi liberado no Supabase (Project Settings → Data API → Exposed schemas).';
  if (code === '23514' || /check constraint/i.test(msg)) return 'Algum campo está fora do permitido (tamanho ou formato).';
  return msg || 'Algo deu errado. Tente de novo.';
}

const falhar = (error) => { const e = new Error(mensagemErro(error)); e.original = error; throw e; };

// ---------- Supabase ----------

let clientPromise = null;

function carregarLib() {
  if (globalThis.supabase?.createClient) return Promise.resolve(globalThis.supabase);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL(SUPABASE_LIB, import.meta.url).href;
    s.async = true;
    s.onload = () => (globalThis.supabase?.createClient ? resolve(globalThis.supabase) : reject(new Error('supabase-js não carregou')));
    s.onerror = () => { s.remove(); reject(new Error('Não foi possível carregar o módulo de conexão.')); };
    document.head.appendChild(s);
  });
}

function cliente() {
  if (!clientPromise) {
    clientPromise = carregarLib().then((lib) => lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
      db: { schema: SUPABASE_SCHEMA },
      auth: { storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'implicit' },
    })).catch((err) => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

const appUrl = () => `${location.origin}${location.pathname}`;

/** Id da conta logada (vai em "dono": o banco confere que é o mesmo do login). */
async function meuId(c) {
  const { data } = await c.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) falhar('Sua sessão expirou. Entre de novo.');
  return id;
}

const supa = {
  async listarDias() {
    const c = await cliente();
    const { data, error } = await c.from('dias').select('data, tipo, nota').order('data');
    if (error) falhar(error);
    return data;
  },
  /** Marca (ou troca) o dia. Uma linha por dia: gravar de novo o mesmo dia só substitui. */
  async salvarDia({ data, tipo, nota }) {
    const c = await cliente();
    const { error } = await c.from('dias').upsert({ dono: await meuId(c), data, tipo, nota, atualizado_em: new Date().toISOString() }, { onConflict: 'dono,data' });
    if (error) falhar(error);
  },
  async apagarDia(data) {
    const c = await cliente();
    const { error } = await c.from('dias').delete().eq('data', data);
    if (error) falhar(error);
  },
  async lerAjustes() {
    const c = await cliente();
    const { data, error } = await c.from('ajustes').select('dias_aula, meta, inicio').maybeSingle();
    if (error) falhar(error);
    return data; // null = nunca salvou: o app usa o padrão
  },
  async salvarAjustes(ajustes) {
    const c = await cliente();
    const { error } = await c.from('ajustes').upsert({ dono: await meuId(c), ...ajustes, atualizado_em: new Date().toISOString() }, { onConflict: 'dono' });
    if (error) falhar(error);
  },
  /** Avisa quando os dias ou os ajustes mudam (em outro aparelho, por exemplo). Devolve função para parar. */
  async ouvir(aoMudar) {
    const c = await cliente();
    const id = await meuId(c);
    const canal = c.channel('app-presenca')
      .on('postgres_changes', { event: '*', schema: SUPABASE_SCHEMA, table: 'dias', filter: `dono=eq.${id}` }, () => aoMudar('dias'))
      .on('postgres_changes', { event: '*', schema: SUPABASE_SCHEMA, table: 'ajustes', filter: `dono=eq.${id}` }, () => aoMudar('ajustes'))
      .subscribe();
    return () => c.removeChannel(canal);
  },

  // Conta
  async usuario() {
    const c = await cliente();
    const { data } = await c.auth.getSession();
    return data.session?.user || null;
  },
  /** A conta logada está liberada no Presença? (conta só da Caderneta/Treinos: não) */
  async ehUsuario() {
    const c = await cliente();
    const { data, error } = await c.from('usuarios').select('id').maybeSingle();
    if (error) falhar(error);
    return !!data;
  },
  async entrar(email, senha) {
    const c = await cliente();
    const { data, error } = await c.auth.signInWithPassword({ email, password: senha });
    if (error) falhar(error);
    return data.user;
  },
  async cadastrar(email, senha) {
    const c = await cliente();
    // data.app = 'presenca': o gatilho do banco põe a conta nova na lista do Presença (presenca.usuarios).
    const { data, error } = await c.auth.signUp({ email, password: senha, options: { emailRedirectTo: appUrl(), data: { app: 'presenca' } } });
    if (error) falhar(error);
    // E-mail que já tem conta: com confirmação ligada o Supabase não dá erro, devolve a conta sem "identities".
    if (data.user && !data.user.identities?.length) falhar('User already registered');
    // Com confirmação de e-mail ligada, não vem sessão: a pessoa precisa clicar no link.
    return { user: data.user, precisaConfirmar: !data.session };
  },
  async recuperar(email) {
    const c = await cliente();
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    if (error) falhar(error);
  },
  async novaSenha(senha) {
    const c = await cliente();
    const { error } = await c.auth.updateUser({ password: senha });
    if (error) falhar(error);
  },
  async sair() {
    const c = await cliente();
    await c.auth.signOut({ scope: 'local' });
  },
  async aoMudarSessao(cb) {
    const c = await cliente();
    c.auth.onAuthStateChange((evento, sessao) => cb(evento, sessao?.user || null));
  },
  async aplicarRetorno(cb) {
    const c = await cliente();
    const { error } = await c.auth.setSession({ access_token: cb.access_token, refresh_token: cb.refresh_token });
    if (error) falhar(error);
  },
};

// ---------- Local (localStorage) ----------

const CHAVE_LOCAL = 'presenca:local';

/** Mês passado e o atual até ontem: quase tudo presença, com algumas faltas e eventos da empresa. */
function exemplo() {
  const hoje = todayISO();
  const anterior = somarMeses(mesDe(hoje), -1);
  const dias = [];
  const uteis = (mes) => diasDoMes(mes).filter((d) => d < hoje && diaDaSemana(d) >= 1 && diaDaSemana(d) <= 5);
  uteis(anterior).forEach((d, i) => {
    if (i === 6) dias.push({ data: d, tipo: 'evento', nota: 'Convenção de vendas' });
    else if (i === 7) dias.push({ data: d, tipo: 'evento', nota: 'Convenção de vendas' });
    else if (i !== 3 && i !== 15) dias.push({ data: d, tipo: 'presenca', nota: '' });
  });
  uteis(mesDe(hoje)).forEach((d, i) => {
    if (i === 4) dias.push({ data: d, tipo: 'evento', nota: 'Treinamento da empresa' });
    else if (i !== 2) dias.push({ data: d, tipo: 'presenca', nota: '' });
  });
  // Um evento já marcado para a frente (próxima sexta que ainda não chegou).
  let sexta = addDays(hoje, 1);
  while (diaDaSemana(sexta) !== 5) sexta = addDays(sexta, 1);
  dias.push({ data: sexta, tipo: 'evento', nota: 'Reunião geral' });
  return { dias, ajustes: { dias_aula: [1, 2, 3, 4, 5], meta: 75, inicio: `${anterior}-01` } };
}

function lerLocal() {
  try {
    const raw = localStorage.getItem(CHAVE_LOCAL);
    if (raw) return JSON.parse(raw);
  } catch { /* sem armazenamento ou corrompido: recomeça com o exemplo */ }
  const db = exemplo();
  gravarLocal(db);
  return db;
}
function gravarLocal(db) {
  try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(db)); } catch { /* só não persiste */ }
}

const local = {
  async listarDias() { return structuredClone(lerLocal().dias).sort((a, b) => a.data.localeCompare(b.data)); },
  async salvarDia(linha) {
    const db = lerLocal();
    db.dias = db.dias.filter((d) => d.data !== linha.data);
    db.dias.push({ data: linha.data, tipo: linha.tipo, nota: linha.nota || '' });
    gravarLocal(db);
  },
  async apagarDia(data) {
    const db = lerLocal();
    db.dias = db.dias.filter((d) => d.data !== data);
    gravarLocal(db);
  },
  async lerAjustes() { return structuredClone(lerLocal().ajustes || null); },
  async salvarAjustes(ajustes) {
    const db = lerLocal();
    db.ajustes = { ...ajustes };
    gravarLocal(db);
  },
  /** Outra aba do mesmo navegador mexeu nos dados. */
  async ouvir(aoMudar) {
    const fn = (e) => { if (e.key === CHAVE_LOCAL) aoMudar('tudo'); };
    window.addEventListener('storage', fn);
    return () => window.removeEventListener('storage', fn);
  },
  async usuario() { return { id: 'local', email: 'voce@modo-local' }; },
  async ehUsuario() { return true; },
  async entrar() { return { id: 'local', email: 'voce@modo-local' }; },
  async cadastrar() { return { precisaConfirmar: false }; },
  async recuperar() {},
  async novaSenha() {},
  async sair() {},
  async aoMudarSessao() {},
  async aplicarRetorno() {},
  /** Volta os dados de exemplo (só no modo local). */
  restaurarExemplo() { gravarLocal(exemplo()); },
  /** Apaga tudo e começa sem nenhum dia marcado (só no modo local). */
  comecarDoZero() { gravarLocal({ dias: [], ajustes: null }); },
};

export const api = MODO_LOCAL ? local : supa;

// ---------- Retorno de link de e-mail ----------

let retornoCapturado = null;

/**
 * Lê o retorno de um link de e-mail (confirmação, recuperação de senha) e LIMPA a URL na hora,
 * para os tokens não ficarem no histórico nem confundirem o roteador por hash. Chamar no início do boot.
 */
export function capturarRetornoEmail() {
  const hash = location.hash.replace(/^#/, '');
  const query = new URLSearchParams(location.search);
  const hp = new URLSearchParams(hash.startsWith('/') ? '' : hash);
  const tem = (k) => hp.has(k) || query.has(k);
  if (!tem('access_token') && !tem('error_description') && !tem('error_code')) return null;
  const val = (k) => hp.get(k) ?? query.get(k);
  retornoCapturado = tem('access_token')
    ? { tipo: 'sessao', evento: val('type') || 'signup', access_token: val('access_token'), refresh_token: val('refresh_token') }
    : { tipo: 'erro', codigo: val('error_code') || val('error') || '', descricao: val('error_description') || '' };
  for (const k of ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'error', 'error_code', 'error_description', 'provider_token', 'sb']) query.delete(k);
  const qs = query.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}#/calendario`);
  return retornoCapturado;
}

export const pegarRetornoEmail = () => { const r = retornoCapturado; retornoCapturado = null; return r; };
