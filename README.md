# Peladinhas

Webapp para gerir as peladinhas (futebol 5 contra 5 entre amigos): calendário com convocados e confirmações, histórico de jogos com resultados e marcadores, e classificação por jogador.

Ao abrir a app aparece um ecrã de **PIN** (6 algarismos):

- **Jogadores:** entram com o PIN de convidado e veem tudo. Só leitura.
- **Administrador:** entra com o PIN de administrador para marcar jogos, registar resultados e gerir jogadores.

Para trocar de perfil: o administrador usa *Gerir > Sair*; o convidado usa o ícone de sair no canto superior direito. Ambos voltam ao ecrã de PIN.

Stack: React + Vite (frontend), Supabase (base de dados e login), GitHub Pages (alojamento). Tudo nos planos gratuitos.

---

## 1. Experimentar já, sem configurar nada

Precisas do [Node.js](https://nodejs.org) 22 ou mais recente.

```bash
npm install
npm run dev
```

Abre o endereço que aparece (normalmente http://localhost:5173). Sem chaves do Supabase, a app arranca em **modo demonstração**: tem dados de exemplo, guarda tudo só nesse browser e os PIN são `000000` (convidado) e `111111` (administrador).

Se já tiveres o `.env.local` preenchido, `npm run dev` liga-se ao Supabase e esses PIN não funcionam (lá valem os PIN das contas do ponto 2.2). Para usar o modo demonstração na mesma, corre `npm run dev:demo`.

`npm test` corre os testes das regras de pontuação e das datas.

## 2. Pôr a funcionar a sério (uma vez, cerca de 20 minutos)

### 2.1 Base de dados no Supabase

1. Cria uma conta em [supabase.com](https://supabase.com) e um projeto novo (região na Europa, por exemplo Frankfurt ou Irlanda). Guarda a palavra-passe da base de dados.
2. No projeto, abre **SQL Editor**, cola o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e carrega em **Run**.

### 2.2 Contas do PIN (convidado e administrador)

Cada PIN é a palavra-passe de uma conta do Supabase. Os emails das contas estão em `PIN_ACCOUNTS`, em [`src/lib/config.js`](src/lib/config.js). São emails fictícios (`example.com`), porque o repositório é público.

1. Em **Authentication > Users**, carrega em **Add user > Create new user** e cria as duas contas, ambas com **Auto Confirm User** marcado:
   - `peladinhas.convidado@example.com`, com o PIN de convidado como palavra-passe (6 algarismos);
   - `peladinhas.admin@example.com`, com o PIN de administrador como palavra-passe (6 algarismos, diferente do de convidado).
2. No **SQL Editor**, dá permissões de administrador **só** à conta de administrador:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'peladinhas.admin@example.com';
   ```

   Para mudar um PIN, muda a palavra-passe da conta em **Authentication > Users**.

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
3. **Equipas:** quando todos os convocados confirmarem, o botão *Gerar equipas* fica ativo. Carrega em *Sortear equipas* e escolhe o método: *Aleatória* (ao acaso), *Por rating* (a média de OVR das duas equipas fica o mais próxima possível) ou *Por eficácia* (a média de golos por jogo na época do jogo fica o mais próxima possível; quem ainda não jogou nessa época conta como 0). Depois de um sorteio por rating, cada jogador mostra o seu OVR e cada equipa a média de OVR; por eficácia, cada jogador mostra os golos que marcou na época. As equipas ficam sempre do mesmo tamanho (com número ímpar, uma fica com mais um). Também podes pôr cada jogador na equipa A ou B à mão. Podes sortear de novo ou acertar à mão antes de carregar em *Confirmar equipas*. O jogo passa a mostrar as equipas (podes mudá-las em *Alterar equipas*). Se convocares alguém novo depois disso, voltas a ter de gerar as equipas.
4. **Depois do jogo:** *Registar resultado* (as equipas já vêm preenchidas), indica os golos e guarda. A classificação atualiza-se sozinha.
5. **Cópia de segurança:** *Gerir > Descarregar cópia* e guarda o ficheiro (por exemplo no Google Drive). A app lembra-te se passarem mais de 7 dias.

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
| OVR (overall) | Só informativo: aparece na classificação mas não mexe nos pontos nem na ordem. Cada jogador começa num OVR inicial (50 por defeito, editável em *Gerir > Jogadores*) e acumula ao longo de todas as épocas, sempre entre 1 e 99 |
| OVR por jogo | Vitória +2, empate 0, derrota −3, +1 por golo (autogolos não contam). Faltar a um jogo (não convocado ou convocado sem equipa) não muda o OVR |
| OVR por goleada | Ganhar por 6 ou mais golos: +2 extra para toda a equipa. Perder por 6 ou mais: −3 extra |
| OVR no histórico | Ao filtrar o *Histórico* por um jogador, cada jogo mostra a variação de OVR desse jogo: a verde se subiu, a vermelho se desceu. É a variação real: quem já está em 99 (ou em 1) mostra ±0 |
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
