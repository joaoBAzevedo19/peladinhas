# Peladinhas

Webapp para gerir as peladinhas (futebol 5 contra 5 entre amigos): calendário com convocados e confirmações, histórico de jogos com resultados e marcadores, e classificação por jogador.

- **Jogadores:** abrem o link no telemóvel e veem tudo, sem conta.
- **Administrador:** entra em *Gerir* com email e palavra-passe para marcar jogos, registar resultados e gerir jogadores.

Stack: React + Vite (frontend), Supabase (base de dados e login), GitHub Pages (alojamento). Tudo nos planos gratuitos.

---

## 1. Experimentar já, sem configurar nada

Precisas do [Node.js](https://nodejs.org) 22 ou mais recente.

```bash
npm install
npm run dev
```

Abre o endereço que aparece (normalmente http://localhost:5173). Sem chaves do Supabase, a app arranca em **modo demonstração**: tem dados de exemplo, guarda tudo só nesse browser e em *Gerir* aceita qualquer email e palavra-passe.

`npm test` corre os testes das regras de pontuação e das datas.

## 2. Pôr a funcionar a sério (uma vez, cerca de 20 minutos)

### 2.1 Base de dados no Supabase

1. Cria uma conta em [supabase.com](https://supabase.com) e um projeto novo (região na Europa, por exemplo Frankfurt ou Irlanda). Guarda a palavra-passe da base de dados.
2. No projeto, abre **SQL Editor**, cola o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e carrega em **Run**.

### 2.2 Conta de administrador

1. Em **Authentication > Users**, carrega em **Add user > Create new user**, indica o teu email e uma palavra-passe e marca **Auto Confirm User**.
2. No **SQL Editor**, corre (com o teu email):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'o-teu-email@exemplo.pt';
   ```

3. Nas definições de **Authentication** (secção de registos de utilizadores), desliga **Allow new users to sign up**. Não é obrigatório, porque quem não está na tabela `admins` não consegue alterar nada, mas evita contas inúteis.

### 2.3 Chaves

Em **Project Settings > API Keys** copia:

- o **Project URL** (`https://xxxx.supabase.co`);
- a chave pública: a **Publishable key** (começa por `sb_publishable_`) ou, em projetos mais antigos, a **anon key**.

Esta chave é pública por natureza: vai dentro da app e qualquer pessoa a pode ver. A segurança está nas regras da base de dados (ver secção 4). **Nunca** uses a `secret` / `service_role` key na app.

Para testar no teu computador com os dados reais, copia `.env.example` para `.env.local`, preenche os dois valores e corre `npm run dev`.

### 2.4 Publicar no GitHub Pages

1. Cria um repositório no GitHub (por exemplo `peladinhas`) e envia este código para o ramo `main`.
2. Em **Settings > Pages**, escolhe **Source: GitHub Actions**.
3. Em **Settings > Secrets and variables > Actions > Variables**, cria duas variáveis de repositório:
   - `VITE_SUPABASE_URL` com o Project URL;
   - `VITE_SUPABASE_KEY` com a chave pública.
4. Em **Actions**, corre o workflow **Publicar no GitHub Pages** (ou faz um novo push). Ao fim de um ou dois minutos a app fica em `https://<o-teu-utilizador>.github.io/peladinhas/`.

Partilha esse link no grupo. No telemóvel, "Adicionar ao ecrã principal" deixa a app com ícone próprio.

Nota: com uma conta GitHub gratuita, o repositório tem de ser público para usar o Pages. O código não tem segredos, mas tem em conta que qualquer pessoa com o link da app consegue ver os nomes e os resultados.

## 3. Rotina de cada semana

1. **Marcar o jogo:** *Jogos > Novo jogo*. A data vem preenchida com a próxima quarta-feira às 21:00 e os convocados do último jogo.
2. **Confirmações:** abre o jogo e toca no nome de quem confirmou.
3. **Depois do jogo:** *Registar resultado*, põe cada jogador na equipa A ou B, indica os golos e guarda. A classificação atualiza-se sozinha.
4. **Cópia de segurança:** *Gerir > Descarregar cópia* e guarda o ficheiro (por exemplo no Google Drive). A app lembra-te se passarem mais de 7 dias.

## 4. Como os dados ficam protegidos

- A base de dados só aceita alterações de contas que estejam na tabela `admins`. Toda a gente pode ler.
- Ninguém consegue apagar registos através da app, nem o administrador. "Eliminar jogo" apenas o esconde; pode ser restaurado em *Gerir*. Jogadores são desativados, nunca apagados.
- Cada vez que um jogo é editado, a versão anterior fica guardada na tabela `match_revisions`.
- O plano gratuito do Supabase **não faz cópias automáticas**: a cópia JSON descarregada em *Gerir* é a garantia final. *Restaurar cópia* volta a pôr os jogos e jogadores do ficheiro sem apagar nada.
- O plano gratuito pausa projetos sem atividade durante uma semana. O workflow **Manter o Supabase ativo** faz uma leitura duas vezes por semana para o evitar. Se mesmo assim o projeto for pausado, reativa-o no painel do Supabase: os dados não se perdem. O GitHub desativa workflows agendados em repositórios sem alterações há 60 dias e avisa por email; basta reativá-lo em **Actions**.

## 5. Regras

Definidas em [`src/lib/config.js`](src/lib/config.js):

| Regra | Valor |
|---|---|
| Vitória / empate / derrota | 3 / 1 / 0 pontos, para cada jogador da equipa |
| Presença | Conta quando o jogador está numa equipa de um jogo jogado |
| Golos | Por jogador; autogolos ficam registados à parte e não contam como golos |
| Época | De setembro a agosto (ex.: 2026/27); a classificação tem também "Todas as épocas" |
| Desempate | Pontos, depois vitórias, depois golos |
| Resultado | O resultado introduzido decide os pontos; se não bater certo com os golos individuais, a app avisa |

## 6. Estrutura

| Ficheiro | Para que serve |
|---|---|
| `supabase/schema.sql` | Tabelas, regras de acesso e funções `save_match` / `import_backup` |
| `src/lib/config.js` | Pontos, época, dia e hora habituais |
| `src/lib/stats.js` | Cálculo da classificação e dos resultados |
| `src/lib/dates.js` | Datas em hora de Lisboa, formato dd/mm/aaaa e 24 h |
| `src/lib/api/` | Ligação ao Supabase (`supabase.js`) e modo demonstração (`demo.js`, `seed.js`) |
| `src/lib/backup.js` | Exportar e validar cópias de segurança |
| `src/data/DataContext.jsx` | Carrega os dados e partilha-os pelas páginas |
| `src/pages/` | Jogos, Histórico, Classificação, página do jogo, formulário e Gerir |
| `src/styles.css` | Estilos (tema claro e escuro) |
| `.github/workflows/` | Publicação no GitHub Pages e manutenção do Supabase ativo |
| `tests/` | Testes das regras (`npm test`) |
