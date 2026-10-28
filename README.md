# Presença

Calendário de presença nas aulas: toque nos dias em que foi à aula e nos dias de **evento da empresa**.
A porcentagem de cada mês ignora os dias de evento (não contam nem como presença nem como falta).
Mesmo padrão da Caderneta e do Treinos: front em HTML/CSS/JS puro (sem build), back no Supabase
(plano gratuito).

## O que faz

- **Calendário**: escolha o que o toque marca (**Presença** ou **Evento da empresa**) e toque nos dias; toque de
  novo para desmarcar. O evento pode ter nome (convenção, treinamento…), que vale para os dias tocados em seguida
  e dá para trocar depois na lista "Eventos da empresa". Trocar evento por presença (ou o contrário) mostra
  "Desfazer".
- **Porcentagem do mês**: presenças ÷ (presenças + faltas). Dia de aula que passou sem presença é falta; dia de
  evento sai da conta; hoje e os próximos dias ficam como "restam". Presença em dia sem aula (reposição no sábado)
  conta a favor.
- **Meta** (padrão 75%): o app diz se já está garantida, em quantas das aulas restantes ainda precisa ir ou se não
  dá mais para chegar nela no mês.
- **Meses**: todos os meses desde o início, com a porcentagem de cada um e o total.
- **Ajustes**: dias da semana que têm aula (padrão segunda a sexta), meta e início das aulas (vazio = a partir do
  primeiro dia marcado, para quem começa a usar no meio do mês não ganhar faltas nos dias anteriores).
- Presença só até hoje; evento dá para marcar com antecedência.

## Rodar

Com `js/config.js` vazio, o app abre em **modo local**: os dados ficam no navegador e vêm exemplos
(mês passado e o atual). Em **Ajustes** dá para "Começar do zero" ou "Restaurar exemplo".
Qualquer servidor estático serve. Pelo Laragon, a pasta precisa estar em `C:\laragon\www` (ex.:
`http://localhost/presenca/`); ou, nesta pasta: `npx serve .`

## Ligar ao Supabase (login)

O login segue o mesmo esquema dos outros apps (e-mail e senha, confirmação por link, "esqueci a senha").
Está ligado ao projeto **apps** (`vujhnbiohitufdjpdbvq`), o mesmo da Caderneta e do Treinos: as tabelas ficam no
schema **`presenca`**, separado dos outros. As contas são do projeto, mas o Presença tem a própria lista de
usuários (`presenca.usuarios`): conta da Caderneta ou do Treinos não entra aqui.

1. **SQL Editor → New query**: cole e rode `supabase/schema.sql`.
2. **Project Settings → Data API → Exposed schemas**: adicione `presenca` e salve. Sem isso o app mostra
   “O schema "presenca" ainda não foi liberado”.
3. **Authentication → URL Configuration → Redirect URLs**: adicione o endereço do app (`http://localhost/presenca/`
   e, depois, o da Cloudflare). Não mexa no *Site URL* se o projeto for de outro app.
4. Preencha `SUPABASE_URL` e `SUPABASE_KEY` (a chave **publishable**, nunca a service_role) em `js/config.js`.
5. Abra o app e use **Criar conta**.

Segurança: as tabelas têm RLS. Só quem está em `presenca.usuarios` usa o app, e cada um só lê e grava as próprias
linhas (`dono = auth.uid()`). Quem cria a conta pelo Presença entra na lista sozinho (gatilho em `auth.users` que
olha o `app: 'presenca'` do cadastro). Conta que já existia no projeto é barrada no login com um aviso; para
liberar, rode o `insert` do fim do `schema.sql` com o e-mail dela. Limite do Supabase: o mesmo e-mail é a mesma
conta (mesma senha) em todos os apps do projeto.

## App instalável (PWA)

Igual aos outros: instala no celular (Ajustes → Instalar app; no iPhone, Safari → Compartilhar → Adicionar à Tela
de Início). `sw.js` guarda a interface no aparelho e, a cada publicação na Cloudflare, `scripts/versionar.mjs`
carimba a versão e o app oferece "Atualizar". Não commite um `sw.js` carimbado.

## Publicar

Suba a pasta como está no Cloudflare (Workers com arquivos estáticos, `wrangler.jsonc`) ou em qualquer host estático.
Ficam de fora (`.assetsignore`): `tests/`, `scripts/`, `supabase/`, `package.json`.

## Testes

`npm test` testa as regras (grade do mês, situação de cada dia, evento fora da conta, meta, lista de meses).
Node 18 ou mais novo.

## Estrutura

```
index.html, css/styles.css, icons/, manifest.webmanifest, sw.js
js/config.js      conexão (vazia = modo local)
js/api.js         Supabase ou localStorage, mesma interface; login; dados de exemplo
js/store.js       estado em memória + ações (marcar é otimista, com fila de gravação) + tempo real
js/domain.js      regras puras (testadas): contagem do mês, meta, calendário
js/views/*.js     telas: calendario, meses, ajustes, entrar; comum (anel da porcentagem e aviso da meta)
supabase/schema.sql
```
