// Estado do app em memória + ações que gravam no banco (api.js) e avisam as telas.
// Marcar um dia é OTIMISTA (a tela muda na hora, para dar para tocar vários dias seguidos sem esperar a
// rede): as gravações vão numa fila, uma por vez, e se alguma falhar o app recarrega o que está no banco.
import { api } from './api.js';
import { normalizarAjustes, regras, alternarMarca, NOTA_MAX } from './domain.js';
import { debounce, todayISO } from './utils.js';

export const state = {
  usuario: null, // { id, email }
  marcas: new Map(), // 'YYYY-MM-DD' → { data, tipo: 'presenca' | 'evento', nota }
  ajustes: normalizarAjustes(null),
  carregado: false,
};

const ouvintes = new Set();
/** motivo: 'carga' | 'local' | 'remoto' */
export const onChange = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
export const avisar = (motivo) => ouvintes.forEach((fn) => fn(motivo));

const paraMapa = (linhas) => new Map(linhas.map((l) => [String(l.data).slice(0, 10), { data: String(l.data).slice(0, 10), tipo: l.tipo, nota: l.nota || '' }]));

export async function carregarTudo(motivo = 'carga') {
  const [dias, ajustes] = await Promise.all([api.listarDias(), api.lerAjustes()]);
  state.marcas = paraMapa(dias);
  state.ajustes = normalizarAjustes(ajustes);
  state.carregado = true;
  avisar(motivo);
}

// ---------- Fila de gravação ----------

let fila = Promise.resolve();
let gravando = 0;
let aoFalhar = () => {};
/** A tela avisa o erro (toast); o store só recarrega. */
export const quandoFalharGravacao = (fn) => { aoFalhar = fn; };

function gravar(fn) {
  gravando++;
  fila = fila.then(fn).catch(async (err) => {
    console.error('[presenca] gravação', err);
    aoFalhar(err);
    try { await carregarTudo('remoto'); } catch { /* sem rede: fica como está até a próxima carga */ }
  }).finally(() => { gravando--; });
  return fila;
}

// ---------- Tempo real ----------

// Mudança vinda de outro aparelho: recarrega tudo (é pouco dado), com um respiro para juntar várias
// mudanças seguidas e sem atropelar as gravações que ainda estão na fila deste aparelho.
const recarregar = debounce(async () => {
  if (gravando) { recarregar(); return; }
  try { await carregarTudo('remoto'); } catch (err) { console.warn('[presenca] tempo real:', err.message); }
}, 700);

let pararDeOuvir = null;
export async function ouvirMudancas() {
  pararDeOuvir?.();
  pararDeOuvir = await api.ouvir(() => recarregar());
}
export function pararTempoReal() { pararDeOuvir?.(); pararDeOuvir = null; }

// ---------- Consultas ----------

export const hoje = () => todayISO();
/** Ajustes + início efetivo (sem início, conta do primeiro dia marcado). */
export const regrasAtuais = () => regras(state.ajustes, state.marcas, hoje());

// ---------- Ações ----------

/** Toque num dia com o modo escolhido. Devolve { erro } se não der (presença em dia que ainda não chegou). */
export function alternarDia(data, tipo, nota = '') {
  const atual = state.marcas.get(data) || null;
  const nova = alternarMarca(atual, { data, tipo, nota }, hoje());
  if (nova?.erro) return nova;
  if (nova) state.marcas.set(data, nova); else state.marcas.delete(data);
  avisar('local');
  gravar(() => (nova ? api.salvarDia(nova) : api.apagarDia(data)));
  return { marca: nova };
}

/** Volta um dia para uma marca exata (o "Desfazer" depois de trocar evento por presença e vice-versa). */
export function definirMarca(data, marca) {
  if (marca) state.marcas.set(data, marca); else state.marcas.delete(data);
  avisar('local');
  return gravar(() => (marca ? api.salvarDia(marca) : api.apagarDia(data)));
}

/** Troca o nome de um evento já marcado. */
export function renomearEvento(data, nota) {
  const atual = state.marcas.get(data);
  if (atual?.tipo !== 'evento') return;
  const nova = { ...atual, nota: String(nota).trim().slice(0, NOTA_MAX) };
  state.marcas.set(data, nova);
  avisar('local');
  return gravar(() => api.salvarDia(nova));
}

export function desmarcar(data) {
  if (!state.marcas.has(data)) return;
  state.marcas.delete(data);
  avisar('local');
  return gravar(() => api.apagarDia(data));
}

/** Ajustes gravam primeiro e só então mudam na tela (é um formulário com botão Salvar). */
export async function salvarAjustes(dados) {
  const a = normalizarAjustes(dados);
  await api.salvarAjustes(a);
  state.ajustes = a;
  avisar('local');
}
