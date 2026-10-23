// Conexão com o Supabase. Deixe em branco para usar o MODO LOCAL (dados só neste navegador, com exemplos),
// útil para conhecer e montar o app antes de ligar o banco.
// Só a chave PÚBLICA ("publishable" / anon) pode ficar aqui: sozinha ela não dá acesso a dado nenhum
// (cada pessoa só lê e grava as próprias linhas, veja supabase/schema.sql). NUNCA coloque a service_role.
//
// Pode ser o mesmo projeto dos Criativos/Treinos (o plano grátis só permite 2 projetos ativos): as tabelas
// deste app ficam no schema "presenca", separadas das outras.
export const SUPABASE_URL = '';
export const SUPABASE_KEY = '';

// Schema das tabelas do app no banco (precisa estar em Project Settings → Data API → Exposed schemas).
export const SUPABASE_SCHEMA = 'presenca';

// Cliente oficial empacotado no próprio app (mesma versão da Caderneta, dos Criativos e do Treinos). Caminho relativo a js/.
export const SUPABASE_LIB = 'vendor/supabase-js-2.117.2.umd.js';

// Onde o supabase-js guarda a sessão (localStorage).
export const AUTH_STORAGE_KEY = 'presenca:auth';

export const MODO_LOCAL = !SUPABASE_URL || !SUPABASE_KEY;
