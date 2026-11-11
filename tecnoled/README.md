# Tecno LED — site com contas de usuário, orçamentos e painel administrativo

Site institucional (front-end estático em JavaScript puro) + back-end **Node.js / Express** + banco **MySQL 8.0**.
Um único processo Node serve o site, a API (`/api/...`) e as páginas privadas.

```
tecnoled/
├─ frontend/
│  ├─ index.html, css/, js/app.js, images/     ← site público (o que já existia, agora ligado à API)
│  ├─ pages/    login, cadastro, esqueci-senha, redefinir-senha, 404
│  ├─ private/  cliente.html, admin.html       ← NUNCA servidas diretamente; só após checar sessão/função
│  ├─ css/conta.css · js/api.js, auth.js, cliente.js, admin.js
├─ backend/
│  ├─ server.js
│  ├─ src/ config/ routes/ controllers/ middlewares/ models/ services/ utils/
│  ├─ scripts/  init-db.js · seed.js · create-admin.js
│  └─ tests/    unit.test.js · e2e.js
├─ database/    schema.sql · seed-data.json
├─ .env.example · package.json · README.md
```

## 1. Requisitos
- Node.js 18.17 ou superior
- MySQL 8.0 (ou superior)
- Uma conta SMTP para enviar e-mails (recuperação de senha). Em desenvolvimento dá para usar `MAIL_MODE=file`.

## 2. Instalação (passo a passo)

**a) Crie o banco e o usuário no MySQL** (como administrador do MySQL):
```sql
CREATE DATABASE tecnoled CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'tecnoled'@'localhost' IDENTIFIED BY 'UMA_SENHA_FORTE';
GRANT ALL PRIVILEGES ON tecnoled.* TO 'tecnoled'@'localhost';
FLUSH PRIVILEGES;
```
**b) Instale e configure:**
```bash
npm install
cp .env.example .env        # edite o .env (banco, APP_URL, SMTP)
```
**c) Crie as tabelas e importe o catálogo:**
```bash
npm run db:init             # executa database/schema.sql (pode rodar de novo sem perder dados)
npm run db:seed             # 7 categorias, 11 produtos e contatos iniciais (não sobrescreve nada existente)
```
Se preferir, rode o SQL manualmente: `mysql -u tecnoled -p tecnoled < database/schema.sql`.

**d) Crie o primeiro administrador** (único caminho para criar um ADMIN; o cadastro público só cria CLIENTE):
```bash
npm run criar-admin
```
Pergunta nome, e-mail, telefone e senha (digitada sem aparecer na tela). Também aceita `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_TELEFONE`, `ADMIN_SENHA` como variáveis de ambiente para automação.

**e) Inicie:**
```bash
npm start                   # http://localhost:3000
npm run dev                 # recarrega ao editar (desenvolvimento)
```

## 3. Endereços
| Endereço | O que é | Acesso |
|---|---|---|
| `/` | Site público (catálogo, orçamento, contato) | todos |
| `/cadastro`, `/entrar`, `/esqueci-senha`, `/redefinir-senha` | Autenticação | todos |
| `/conta` | Área do cliente | logado (CLIENTE) |
| `/admin` | Painel administrativo | logado (ADMIN). Cliente recebe 404 |

## 4. Configurando o e-mail (SMTP)
No `.env`: `MAIL_MODE=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
- Porta **587** → `SMTP_SECURE=false` (STARTTLS). Porta **465** → `SMTP_SECURE=true`.
- Hospedagem/e-mail do próprio domínio: use o servidor SMTP que o provedor informa (geralmente `smtp.seudominio.com.br` ou `mail.seudominio.com.br`).
- Gmail / Google Workspace: ative a verificação em duas etapas e gere uma **senha de app**; use `smtp.gmail.com`, porta 587.
- Serviços transacionais (Brevo, Amazon SES, Mailgun, SendGrid) também funcionam; use as credenciais SMTP deles. Configure SPF/DKIM do domínio para os e-mails não caírem no spam.
- `ORCAMENTO_NOTIFICAR_EMAIL` (opcional): a equipe recebe um e-mail a cada novo orçamento.
- `MAIL_MODE=file` grava os e-mails em `backend/.mail-outbox/` (só fora de produção) — útil para testar sem SMTP.

**Teste rápido do SMTP:** peça "Esqueci minha senha" com o e-mail de uma conta existente e confira a caixa de entrada. Falhas de envio aparecem no log do servidor (`falha ao enviar e-mail de redefinição`) sem expor dados sensíveis.

## 5. Como funciona (resumo técnico)
- **Senhas:** bcrypt (custo 12), 8–72 caracteres, com letra e número. Nunca em texto puro.
- **Sessão:** token aleatório de 256 bits no cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` e prefixo `__Host-` em produção). No banco fica só o **SHA-256** do token (tabela `sessoes`). "Permanecer conectado" = cookie persistente de `SESSION_LEMBRAR_DIAS`; sem ele, cookie de sessão do navegador e validade de `SESSION_HORAS`. Nada de LocalStorage para autenticação.
- **CSRF:** toda escrita autenticada exige o cabeçalho `X-CSRF-Token` (token por sessão); além disso o servidor confere o `Origin` e exige `Content-Type: application/json`.
- **Força bruta:** 5 falhas por e-mail (ou 30 por IP) em 15 min bloqueiam o login (tabela `tentativas_login`, sobrevive a reinícios) + limites de requisição por IP em cadastro, login, recuperação e orçamento. Resposta de login sempre genérica e com tempo equalizado (sem revelar se o e-mail existe).
- **Recuperação de senha:** resposta idêntica exista ou não o e-mail; token de 256 bits, **só o hash é gravado**, validade de `RESET_TOKEN_MINUTOS`, uso único (marcado de forma atômica), invalida tokens anteriores; o link usa `#token=` (fragmento: não vai para logs do servidor nem para o cabeçalho Referer) e a página remove o token da URL. Ao redefinir, **todas as sessões** da conta são encerradas.
- **SQL Injection:** todas as consultas são parametrizadas; buscas com `LIKE` escapam `% _ \`.
- **Permissões:** `requireRole('ADMIN')` em toda a API `/api/admin/*`; páginas `/admin` e `/conta` só são entregues após checar a sessão no servidor. O cliente só lê orçamentos filtrados por `usuario_id` (de outro usuário → 404).
- **Cabeçalhos:** CSP restritiva, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS em produção.
- **Logs:** estruturados em JSON, com remoção automática de campos como senha/token/cookie.

### Decisões que diferem levemente do roteiro
- `produtos.categoria` virou **`categoria_id`** (chave estrangeira para a nova tabela `categorias`), para o admin poder gerenciar categorias de verdade.
- Tabelas extras: `categorias`, `orcamento_historico` (linha do tempo de status), `configuracoes` (informações comerciais), `tentativas_login`.
- `orcamentos` guarda também os dados de contato e `produto_nome` (cópia): visitantes sem conta continuam podendo pedir orçamento e o histórico sobrevive se um produto for excluído.
- No cadastro, informar "e-mail já cadastrado" é pedido do roteiro (item 17.1); por isso o endpoint tem limite de 10 tentativas/hora por IP. Já login e recuperação **não** revelam se o e-mail existe.
- O site continua abrindo o WhatsApp ao enviar o orçamento, mas agora também **registra** o pedido no banco. Se a API estiver fora do ar, o WhatsApp ainda funciona.
- O catálogo e os contatos do site vêm do banco (`/api/public/catalogo` e `/config`); se a API falhar, o site usa os dados que já estavam embutidos no `app.js`.
- Imagens de produto novos: o painel aceita um caminho `images/arquivo.webp` (envie o arquivo para a pasta `frontend/images/` do servidor) ou um endereço `https://`. Não há upload de arquivos pelo painel.

## 6. Colocando em produção
1. `NODE_ENV=production`, `APP_URL=https://seudominio.com.br` (obrigatório HTTPS), `MAIL_MODE=smtp`. O servidor **recusa iniciar** em produção com `APP_URL` sem https ou sem SMTP.
2. Atrás de Nginx/Apache/Cloudflare/painel de hospedagem: `TRUST_PROXY=1` (para o IP real e cookies `Secure` corretos). O proxy deve enviar `X-Forwarded-For` e `X-Forwarded-Proto`.
3. Mantenha o processo vivo com PM2 ou systemd:
   ```bash
   npm install -g pm2
   pm2 start backend/server.js --name tecnoled --update-env && pm2 save && pm2 startup
   ```
4. Exemplo de Nginx (HTTPS via Certbot/Let's Encrypt):
   ```nginx
   server {
     listen 443 ssl http2;
     server_name seudominio.com.br;
     # ssl_certificate ... (gerado pelo certbot)
     client_max_body_size 1m;
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
5. Usuário do MySQL com acesso só ao banco `tecnoled`; faça **backup diário** do banco (`mysqldump`). O `.env` nunca deve ir para o Git nem ficar acessível pela web (ele fica fora da pasta `frontend/`).
6. Os limites de requisição ficam em memória do processo; se um dia rodar várias instâncias, use um limitador compartilhado (ex.: Redis). O bloqueio de login por tentativas já é compartilhado, pois fica no MySQL.
7. Revise com sua assessoria jurídica os textos de **Política de Privacidade** e **Termos de Uso** (rotas `#privacidade` e `#termos` em `frontend/js/app.js`).

## 7. Testes
```bash
npm test            # testes unitários (validadores, CPF/CNPJ, senha, limitador, tokens, logs). Sem banco.
```
**Teste de ponta a ponta** (precisa de MySQL e servidor rodando). Suba um servidor de teste e rode:
```bash
# terminal 1 (limites relaxados só para a bateria de testes; ignorado em produção)
MAIL_MODE=file RATE_LIMIT_MULT=20 npm start
# terminal 2
E2E_ADMIN_EMAIL=seu-admin@dominio.com E2E_ADMIN_SENHA='sua senha' npm run test:e2e
```
Ele exercita: cadastro (válido, duplicado, senha fraca, CPF inválido, tentativa de virar ADMIN), login certo/errado, logout, "permanecer conectado", CSRF e origem, bloqueio por força bruta, recuperação de senha completa (e-mail, token de uso único, reuso recusado, sessões encerradas), perfil e troca de senha, orçamentos de visitante e de cliente, isolamento entre clientes, os seis status, painel admin (usuários, orçamentos, produtos, categorias, informações comerciais), bloqueio de cliente em rotas admin e cabeçalhos de segurança. Os dados de teste usam `e2e-<timestamp>-*@example.com`.

## 8. Rotina do dia a dia
- **Novos pedidos:** `/admin` → Orçamentos. Ao mudar o status você pode escrever uma mensagem que o cliente vê no histórico; a "nota interna" é só da equipe.
- **Produtos/categorias/contatos:** menus do painel. Alterações aparecem no site em até 1 minuto (cache curto).
- **Outro administrador:** `npm run criar-admin` no servidor.
- **Cliente esqueceu a senha:** ele mesmo usa "Esqueci minha senha". Conta suspeita? Painel → Clientes → Desativar (encerra as sessões).
