// Testes das regras puras: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarAjustes, somarMeses, diasDoMes, gradeDoMes, nomeMes, nomeDia, regras, situacao, resumoMes, metaDoMes,
  mesesComDados, somarResumos, alternarMarca,
} from '../js/domain.js';

const marcas = (lista) => new Map(lista.map(([data, tipo, nota = '']) => [data, { data, tipo, nota }]));
const SEG_SEX = { dias_aula: [1, 2, 3, 4, 5], meta: 75, inicio: '2026-10-01' };

test('ajustes vindos de qualquer lugar ficam num formato só', () => {
  assert.deepEqual(normalizarAjustes(null), { dias_aula: [1, 2, 3, 4, 5], meta: 75, inicio: null });
  assert.deepEqual(normalizarAjustes({ dias_aula: ['3', 1, 1, 9, -1], meta: '80', inicio: '2026-02-03' }), { dias_aula: [1, 3], meta: 80, inicio: '2026-02-03' });
  assert.equal(normalizarAjustes({ meta: 150 }).meta, 100);
  assert.equal(normalizarAjustes({ meta: '' }).meta, 75);
  assert.equal(normalizarAjustes({ meta: 0 }).meta, 0);
  assert.equal(normalizarAjustes({ inicio: 'ontem' }).inicio, null);
});

test('meses e grade do calendário', () => {
  assert.equal(somarMeses('2026-12', 1), '2027-01');
  assert.equal(somarMeses('2026-01', -1), '2025-12');
  assert.equal(diasDoMes('2028-02').length, 29);
  assert.equal(diasDoMes('2026-02').length, 28);
  const g = gradeDoMes('2026-10'); // 1º de outubro de 2026 é quinta
  assert.equal(g.length % 7, 0);
  assert.deepEqual(g.slice(0, 5), [null, null, null, null, '2026-10-01']);
  assert.equal(nomeMes('2026-10'), 'outubro de 2026');
  assert.equal(nomeDia('2026-10-14'), 'quarta, 14 de outubro');
});

test('sem início nos ajustes, conta a partir do primeiro dia marcado', () => {
  const m = marcas([['2026-10-20', 'presenca'], ['2026-10-14', 'evento']]);
  assert.equal(regras({}, m, '2026-10-22').inicio, '2026-10-14');
  assert.equal(regras({}, new Map(), '2026-10-22').inicio, '2026-10-22');
  assert.equal(regras({ inicio: '2026-09-01' }, m, '2026-10-22').inicio, '2026-09-01');
});

test('situação de cada dia', () => {
  const r = regras(SEG_SEX, new Map(), '2026-10-22');
  const hoje = '2026-10-22';
  assert.equal(situacao('2026-10-21', null, r, hoje), 'falta'); // quarta que passou
  assert.equal(situacao('2026-10-22', null, r, hoje), 'aula'); // hoje ainda não conta
  assert.equal(situacao('2026-10-23', null, r, hoje), 'aula');
  assert.equal(situacao('2026-10-24', null, r, hoje), 'livre'); // sábado
  assert.equal(situacao('2026-09-30', null, r, hoje), 'livre'); // antes do início
  assert.equal(situacao('2026-10-21', { tipo: 'evento' }, r, hoje), 'evento');
  assert.equal(situacao('2026-10-24', { tipo: 'presenca' }, r, hoje), 'presenca'); // reposição no sábado
});

test('evento da empresa sai da conta da porcentagem', () => {
  // Outubro/2026 até o dia 21: 15 dias úteis (1, 2, 5–9, 12–16, 19–21).
  const hoje = '2026-10-22';
  const uteis = diasDoMes('2026-10').filter((d) => d < hoje && ![0, 6].includes(new Date(`${d}T12:00`).getDay()));
  assert.equal(uteis.length, 15);
  const lista = uteis.map((d) => [d, 'presenca']);
  lista[0][1] = 'evento'; // dia 1: evento
  lista[1][1] = 'evento'; // dia 2: evento
  lista.splice(2, 1); // dia 5: falta (sem marca)
  const m = marcas(lista);
  const r = regras(SEG_SEX, m, hoje);
  const res = resumoMes('2026-10', m, r, hoje);
  assert.equal(res.eventos, 2);
  assert.equal(res.faltas, 1);
  assert.equal(res.presencas, 12);
  assert.equal(res.aulas, 13); // 15 dias úteis − 2 eventos
  assert.equal(res.pct, 12 / 13);
  assert.equal(res.restam, 7); // 22, 23, 26–30
});

test('mês que ainda não começou: nada conta, tudo resta', () => {
  const r = regras(SEG_SEX, new Map(), '2026-10-22');
  const res = resumoMes('2026-11', marcas([['2026-11-10', 'evento']]), r, '2026-10-22');
  assert.equal(res.pct, null);
  assert.equal(res.aulas, 0);
  assert.equal(res.eventos, 1);
  assert.equal(res.restam, 20); // 21 dias úteis − 1 evento
});

test('quanto falta para a meta', () => {
  assert.equal(metaDoMes({ presencas: 0, aulas: 0, restam: 0 }, 75), null);
  // 20 aulas no mês, meta 75% = 15. Já foi em 10, faltou 2, restam 8: precisa de 5.
  const a = metaDoMes({ presencas: 10, aulas: 12, restam: 8 }, 75);
  assert.equal(a.precisa, 5);
  assert.equal(a.podeFaltar, 3);
  assert.equal(a.possivel, true);
  // Já garantida.
  const b = metaDoMes({ presencas: 16, aulas: 16, restam: 4 }, 75);
  assert.equal(b.precisa, 0);
  assert.equal(b.podeFaltar, 4);
  // Impossível: faltou demais.
  const c = metaDoMes({ presencas: 5, aulas: 12, restam: 8 }, 75);
  assert.equal(c.possivel, false);
  assert.equal(c.melhor, 13 / 20);
});

test('lista de meses do início até agora, e meses futuros com evento', () => {
  const m = marcas([['2026-12-05', 'evento']]);
  const r = regras({ inicio: '2026-08-10' }, m, '2026-10-22');
  assert.deepEqual(mesesComDados(m, r, '2026-10-22'), ['2026-12', '2026-11', '2026-10', '2026-09', '2026-08']);
  const t = somarResumos([{ presencas: 10, faltas: 2, eventos: 1, restam: 0 }, { presencas: 5, faltas: 3, eventos: 0, restam: 4 }]);
  assert.equal(t.aulas, 20);
  assert.equal(t.pct, 15 / 20);
});

test('tocar num dia: marca, troca de tipo ou desmarca', () => {
  const hoje = '2026-10-22';
  assert.deepEqual(alternarMarca(null, { data: '2026-10-20', tipo: 'presenca' }, hoje), { data: '2026-10-20', tipo: 'presenca', nota: '' });
  assert.equal(alternarMarca({ tipo: 'presenca' }, { data: '2026-10-20', tipo: 'presenca' }, hoje), null);
  assert.equal(alternarMarca({ tipo: 'presenca' }, { data: '2026-10-20', tipo: 'evento', nota: ' Convenção ' }, hoje).nota, 'Convenção');
  assert.ok(alternarMarca(null, { data: '2026-10-23', tipo: 'presenca' }, hoje).erro);
  assert.equal(alternarMarca(null, { data: '2026-10-23', tipo: 'evento' }, hoje).tipo, 'evento');
  assert.equal(alternarMarca(null, { data: '2026-10-23', tipo: 'evento', nota: 'x'.repeat(200) }, hoje).nota.length, 80);
});
