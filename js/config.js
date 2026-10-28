// Conexão com o Supabase. Deixe em branco para usar o MODO LOCAL (dados só neste navegador, com exemplos),
// útil para conhecer e montar o app antes de ligar o banco.
// Só a chave PÚBLICA ("publishable" / anon) pode ficar aqui: sozinha ela não dá acesso a dado nenhum
// (cada pessoa só lê e grava as próprias linhas, veja supabase/schema.sql). NUNCA coloque a service_role.

// Projeto Supabase "apps" (vujhnbiohitufdjpdbvq), o mesmo da Caderneta e do Treinos. As tabelas da Presença ficam
// no schema "presenca", separadas das dos outros apps; o login é comum aos três.
// Para voltar ao modo local, apague as duas.
export const SUPABASE_URL = 'https://vujhnbiohitufdjpdbvq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Mt-0LqMiEwJq_Uv2Uf9ygw__FDmEN79';

// Schema das tabelas do app no banco (precisa estar em Project Settings → Data API → Exposed schemas).
export const SUPABASE_SCHEMA = 'presenca';

// Cliente oficial empacotado no próprio app (mesma versão da Caderneta e do Treinos). Caminho relativo a js/.
export const SUPABASE_LIB = 'vendor/supabase-js-2.117.2.umd.js';

// Onde o supabase-js guarda a sessão (localStorage).
export const AUTH_STORAGE_KEY = 'presenca:auth';

export const MODO_LOCAL = !SUPABASE_URL || !SUPABASE_KEY;
