# CLAUDE.md — Peladinhas

> Este ficheiro aplica-se a `Desktop/Peladinhas/`. O `Desktop/CLAUDE.md` (Xtinguish, NiceGUI, Java) é de **outro projeto**:
> ignora tudo o que lá está quando trabalhares aqui. Em caso de conflito, vale este ficheiro.

## O que é

Webapp para gerir as peladinhas semanais (futsal 5 contra 5 entre amigos): calendário com convocados e
confirmações, histórico de jogos com resultados e marcadores, e classificação por jogador e por época.

- **Entrada por PIN** (`src/pages/PinLogin.jsx`): a app abre num ecrã de PIN de 6 algarismos. Cada PIN é a palavra-passe
  de uma conta Supabase fixa (`PIN_ACCOUNTS` em `config.js`). Solução provisória, para facilitar acessos e testes.
- **Jogadores:** PIN de convidado. Só leitura (a conta não está em `admins`). Não veem o separador *Gerir*; saem pelo ícone no topo.
- **Administrador:** PIN de administrador (conta listada em `admins`) e é o único que escreve. *Gerir > Sair* volta ao PIN.
- A leitura continua pública na base de dados (RLS): o PIN de convidado é uma porta na UI, não proteção de dados.
- Utilização típica: telemóvel, uma vez por semana, um grupo de ~15 pessoas. Poucas centenas de jogos no total.
- Custo zero é um requisito: tudo nos planos gratuitos (Supabase, GitHub Pages, GitHub Actions).

Decisões de produto e de modelo de dados: [decisions.pdf](decisions.pdf). Instruções para o utilizador final: [README.md](README.md).
Quando uma decisão mudar ou surgir uma nova, avisa o utilizador para atualizar o `decisions.pdf`.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 8, **JavaScript (sem TypeScript)**, CSS próprio (sem frameworks de UI) |
| "Backend" | Supabase: Postgres + Auth + API REST automática (PostgREST). **Não há servidor próprio.** |
| Lógica no servidor | Funções SQL (`save_match`, `import_backup`) e políticas RLS em [supabase/schema.sql](supabase/schema.sql) |
| Alojamento | GitHub Pages, publicado pelo workflow [deploy.yml](.github/workflows/deploy.yml) a cada push para `main` |
| Testes | `node:test` nativo (sem Jest/Vitest) |
| Node | ≥ 22.12 |

Não acrescentes dependências sem necessidade clara e sem perguntar. Hoje há só três dependências de runtime (`react`, `react-dom`, `@supabase/supabase-js`). Isso é deliberado.

## Comandos

```bash
npm install
npm run dev      # http://localhost:5173 (Supabase se o .env.local tiver chaves)
npm run dev:demo # modo demo mesmo com .env.local preenchido (PIN 000000 / 111111)
npm test         # regras de pontuação, épocas e datas
npm run build    # gera dist/ (o CI corre testes + build antes de publicar)
```

- Sem `.env.local` (ou com as variáveis vazias), a app arranca em **modo demonstração**: dados de exemplo em localStorage, e qualquer login serve.
- **Atenção:** o `.env.local` deste computador aponta para o **Supabase de produção**. Não cries, edites nem apagues dados reais para testar. Para testar escritas, usa o modo demo (`npm run dev:demo`) ou pergunta primeiro.

## Arquitetura

```
Browser (React)
  └─ DataContext ── carrega tudo uma vez (loadAll) e recarrega depois de cada escrita
       └─ api (src/lib/api/index.js)
            ├─ supabase.js ── Supabase (produção)
            └─ demo.js     ── localStorage (sem chaves)
Supabase
  ├─ tabelas + RLS (leitura pública, escrita só para admins, sem DELETE)
  └─ funções SQL security definer (escritas compostas e transacionais)
```

| Caminho | Responsabilidade |
|---|---|
| `src/lib/config.js` | Regras da liga (pontos, época, hora habitual, etc.). Para mudar uma regra, é só aqui. |
| `src/lib/stats.js` | Classificação, resultados e épocas. Funções puras e testadas. |
| `src/lib/dates.js` | Datas em hora de Lisboa. Única forma aceite de formatar ou converter datas. |
| `src/lib/api/` | Interface de dados: `supabase.js` e `demo.js` têm **a mesma interface**; `errors.js` traduz erros. |
| `src/lib/backup.js` | Exportar e validar cópias JSON. |
| `src/data/DataContext.jsx` | Estado global: dados, sessão, `isAdmin`, `run()`, toasts. |
| `src/components/` | `ui.jsx` (peças partilhadas: PageHeader, Dialog, Segmented, ConfirmButton…), `Icons.jsx`, `MatchRows.jsx`. |
| `src/pages/` | Um ficheiro por ecrã. Router por hash (`#/jogos`, `#/jogo/<id>`) em `App.jsx` + `hooks/useHashRoute.js`. |
| `supabase/schema.sql` | Estrutura da base de dados, RLS, funções e permissões. |
| `tests/` | Testes de `stats.js` e `dates.js`. |

## Invariantes (não quebrar)

1. **Nada se apaga.** Jogos: soft delete (`deleted_at`), restauráveis em *Gerir*. Jogadores: `active = false`. Nenhum papel da API tem `DELETE`, nem o admin.
2. **Cada edição de um jogo guarda a versão anterior** em `match_revisions` (feito dentro de `save_match`).
3. **A classificação é sempre calculada** a partir dos jogos e nunca é guardada na base de dados.
4. **A segurança vive na base de dados (RLS + grants), não na UI.** Esconder um botão a quem não é admin é só conforto. A proteção real tem de estar no SQL.
5. **Só a chave pública** (`sb_publishable_…` / anon) entra na app. A `service_role`/secret key nunca entra no código, no `.env.local` nem no CI da app.
6. **O modo demo espelha o Supabase.** Qualquer método novo na API existe nos dois backends, com as mesmas validações e mensagens.
7. **Cópias de segurança completas.** Uma tabela nova com dados do utilizador entra em `buildBackup`, `parseBackup` (tolerante a cópias antigas sem ela), `import_backup` (SQL) e `importBackup` (demo).
8. **Retrocompatibilidade de dados.** Uma app publicada com código novo pode correr contra uma base de dados que ainda não tem a alteração. Leituras de estruturas novas devem degradar sem rebentar a app (ver `fetchAll('seasons').catch(() => [])`).

## Base de dados (Supabase / Postgres)

### Alterações ao schema

- **Estado atual:** um único `supabase/schema.sql` **idempotente**, corrido no SQL Editor do Supabase. Enquanto for assim:
  - usa sempre `create table if not exists`, `create index if not exists`, `create or replace function`, `drop policy if exists` + `create policy`;
  - colunas novas em tabelas existentes vão em `alter table … add column if not exists …` (o `create table if not exists` **não** altera tabelas que já existem);
  - o ficheiro tem de poder ser corrido de novo em produção sem erro e sem perder dados.
- **Objetivo (preferido):** migrar para migrations do Supabase CLI (`supabase/migrations/<timestamp>_<nome>.sql`, aplicadas com `supabase db push`). Quando existirem:
  - cada alteração é um ficheiro novo, criado com `supabase migration new <nome>`;
  - uma migration já aplicada **nunca** se edita. Para corrigir, cria-se outra;
  - `schema.sql` deixa de ser a fonte de verdade (fica a migration inicial).
- Depois de qualquer alteração ao SQL, diz explicitamente ao utilizador que tem de a aplicar no Supabase. Não o podes fazer por ele.
- Alterações destrutivas (renomear/remover colunas, mudar tipos) seguem *expand → migrate → contract*: adicionar o novo, pôr a app a usá-lo, publicar, e só depois remover o antigo. Pergunta sempre antes.

### Modelo e convenções

- Tabelas e colunas em inglês, `snake_case`, plural (`players`, `match_players`). Chaves `uuid` com `gen_random_uuid()`; `created_at timestamptz default now()`.
- Validações no Postgres (`check`, `not null`, índices únicos como `lower(btrim(name))`), repetidas no `demo.js` com as mesmas mensagens.
- Datas e horas: `timestamptz` (guardado em UTC). Dias sem hora: `date`. A conversão para Lisboa faz-se só no frontend (`dates.js`).
- Tabelas atuais: `players`, `matches`, `match_players`, `match_revisions`, `admins`, `seasons`.

### Segurança

- **Toda a tabela nova** tem `enable row level security`, política de `select` (pública ou restrita), políticas de `insert`/`update` com `public.is_admin()`, e entra no bloco `revoke all` / `grant` (nunca `delete`).
- Escritas que tocam várias tabelas ou precisam de ser atómicas fazem-se numa função `security definer` com `set search_path = ''`, nomes totalmente qualificados (`public.x`), verificação `if not public.is_admin()` no início, e `grant execute` só a `authenticated`.
- Erros levantados nas funções têm mensagens em português e `errcode` conhecido (`42501`, `23514`, `P0002`), mapeados em `errors.js`.

### Plano gratuito

- Não há backups automáticos: a cópia JSON em *Gerir* é a rede de segurança (lembrete após `BACKUP_REMINDER_DAYS`).
- Os projetos pausam após 7 dias sem atividade: o workflow [keepalive.yml](.github/workflows/keepalive.yml) faz uma leitura duas vezes por semana. Não o removas.
- Limite de 1000 linhas por pedido: lê sempre com `fetchAll` (paginado).

## Camada de dados no frontend

- As páginas **não** chamam o Supabase diretamente. Usam `useData()`. As escritas passam sempre por `run((api) => api.metodo(...), 'Mensagem de sucesso.')`, que grava, recarrega tudo e mostra o toast.
- Um método novo implica: `supabase.js` + `demo.js` (com `requireAdmin()` e as mesmas validações) + mensagens em `errors.js`, se houver erros novos da base de dados.
- Os dados são poucos: recarregar tudo depois de cada escrita é intencional. Não introduzas caches, React Query, Redux, etc.
- Os valores derivados (mapas, ordenações, filtros) calculam-se em `DataContext` (`useMemo`) ou em funções puras de `stats.js`. Não os guardes em estado.

## Frontend (React + CSS)

### Código

- Componentes funcionais e hooks; um ecrã por ficheiro em `src/pages/` (PascalCase). Componentes auxiliares usados só num ecrã ficam no próprio ficheiro, e os partilhados vão para `components/ui.jsx`.
- Comentário curto no topo de cada ficheiro a dizer o que faz. Comentários de código em **inglês**, texto da interface em **português de Portugal**.
- Lógica de negócio (pontos, épocas, resultados) vai para `src/lib/` como funções puras com testes. Não a escrevas dentro dos componentes.
- Datas: usa sempre `dates.js` (`formatDate`, `dateKey`, `localInputToIso`…). Nunca `toLocaleString()` solto nem `new Date('2026-10-07')` para dias.
- Regras configuráveis: vão para `config.js`. Não ponhas números mágicos nas páginas.
- Rotas novas: um `case` em `Routes` (`App.jsx`). Ecrãs de escrita ficam dentro de `<AdminOnly>`, e ações de admin dentro de ecrãs públicos ficam atrás de `isAdmin`.

### Interface e texto

- Português de Portugal, tom direto e curto ("Guardar", "Cancelar", "Jogo restaurado."). Datas `dd/mm/aaaa`, horas 24 h, fuso `Europe/Lisbon`.
- Mensagens de erro: em português, a dizer o que fazer ("Sem ligação ao servidor. Verifica a internet e tenta novamente."). Nunca mostres erros técnicos crus.
- Ações destrutivas: `ConfirmButton` (dois toques). Formulários curtos em pop-up: `Dialog` (`<dialog>` nativo). Mostra os erros dentro do pop-up, porque o toast fica por trás.
- Sem `alert()`/`confirm()` nativos.

### Estilo (CSS)

- Um único [src/styles.css](src/styles.css), sem frameworks nem CSS-in-JS. Classes em `kebab-case`, modificadores `is-*` (`is-active`, `is-leader`).
- **Cores só por tokens** (`var(--ink)`, `var(--surface)`, `var(--team-a)`…). Um token novo tem de ser definido no tema claro **e** no escuro (`prefers-color-scheme: dark`).
- Identidade visual: pavilhão de futsal. Azul-marinho, laranja para a equipa A, azul para a B, números em *Barlow Condensed*.
- **Mobile-first:** pensado para ~360–430 px de largura. Alvos de toque ≥ 44 px, inputs com `font-size: 16px` (evita zoom no iOS), sem scroll horizontal da página (tabelas largas dentro de `.table-wrap`). Respeita `env(safe-area-inset-*)` e a barra de navegação inferior.

### Acessibilidade

- HTML semântico: `button` para ações, `a` para navegação, `label` em todos os campos, `th scope` nas tabelas, `abbr title` nas abreviaturas (J, V, E, D).
- `aria-label` em botões só com ícone, `role="alert"` em erros, `aria-pressed`/`aria-checked` em toggles e controlos segmentados. O foco visível (`:focus-visible`) nunca se remove.

## Web / alojamento

- **Router por hash**, porque o GitHub Pages não reescreve URLs. Mantém `base: './'` no `vite.config.js`.
- PWA leve: `public/manifest.webmanifest` + ícones ("Adicionar ao ecrã principal"). Não há service worker; não acrescentes um sem discutir (risco de servir versões antigas).
- Variáveis de build: `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY`, como **variáveis** (não secrets) do repositório, porque são públicas. Tudo o que começa por `VITE_` fica visível no bundle: nunca lá ponhas segredos.
- O repositório é público (Pages gratuito). Não há dados pessoais além de nomes próprios e resultados. Não acrescentes emails, telefones ou outros dados pessoais sem discutir privacidade.
- `.env.local`, `dist/` e `node_modules/` nunca vão para o Git.

## Testes e verificação

- `npm test` tem de passar antes de qualquer commit. O CI bloqueia a publicação se falhar.
- Lógica nova em `src/lib/` (pontos, épocas, datas, validações) leva teste em `tests/`. Inclui casos de fronteira: mudança de hora, 31/08 vs 01/09 em Lisboa, empates.
- Mudanças de UI: verifica com `npm run dev:demo` (**modo demo**), em largura de telemóvel, nos temas claro e escuro, como visitante e como admin.
- Corre `npm run build` para apanhar erros de import/JSX.

## Git e fluxo de trabalho

- O repositório Git é `peladinhas-app/`. O trabalho faz-se em ramos (ex.: `MVP02`) e `main` = produção (cada push publica).
- Commits só quando o utilizador pedir. Mensagens curtas no imperativo, a explicar o porquê.
- Uma alteração que inclui SQL: no resumo final, indica claramente "**correr no Supabase:** …".
- Antes de mexer em algo com impacto em dados reais (schema, restauro, scripts contra produção), confirma com o utilizador.

## Checklist para uma funcionalidade nova

1. SQL: tabela/colunas + RLS + grants + (se preciso) função `security definer`, de forma idempotente (ou migration nova).
2. API: método em `supabase.js` **e** `demo.js`, com as mesmas validações; erros em `errors.js`.
3. Cópias: `backup.js` + `import_backup` + `importBackup`, se houver dados novos.
4. Lógica pura em `src/lib/` + testes.
5. UI em português, mobile-first, tokens de cor, acessível; ações de admin atrás de `isAdmin`.
6. `npm test` + `npm run build` + verificação em modo demo.
7. Atualizar o README (se mudar algo para o utilizador ou o administrador) e lembrar a atualização do `decisions.pdf`.
