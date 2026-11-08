# Migração para Supabase

O código da aplicação usa exclusivamente Supabase Auth e PostgreSQL. Os registros completos são armazenados em `public.app_documents` (`path`, `collection`, `data JSONB`, `updated_at`). Essa escolha preserva os campos clínicos, históricos, subregistros e IDs existentes sem perder informações na conversão. Todas as telas usam esse armazenamento; não há leitura paralela das antigas tabelas relacionais.

## Ativação

1. Use Node.js 22 ou superior. Execute `npm ci`.
2. No SQL Editor do projeto Supabase, execute `supabase/migrations/202611080001_supabase_only.sql` (ou `database-schema.sql`, com o mesmo conteúdo). O SQL cria armazenamento, índices, RLS e funções transacionais. Ele preserva as tabelas relacionais antigas e restringe seu acesso público.
3. Copie `.env.example` para `.env.local` e configure URL, chave pública e `SUPABASE_SERVICE_ROLE_KEY`. A chave privada é usada apenas no servidor/scripts.
4. Desative o cadastro público em Authentication > Providers > Email: as contas são provisionadas por um administrador.
5. Para uma instalação nova, preencha `BOOTSTRAP_ADMIN_*` e execute `npm run supabase:admin`. O script recusa execução se já houver ADMIN; não existe senha padrão. Depois, remova a senha de bootstrap do ambiente.
6. Entre em `/login` e cadastre unidades, gerentes e ACS em Configurações. Associe microáreas aos ACS. Usuários sem perfil, inativos ou sem unidade não recebem acesso. Senhas de contas criadas pela interface exigem pelo menos 8 caracteres.

## Dados existentes

A alteração do código não copia dados da nuvem automaticamente. Nesta cópia não foram encontradas credenciais nem exportação dos dados antigos; nenhuma instância externa foi modificada.

Antes da troca de produção, mantenha backup e suspenda temporariamente as escritas no sistema antigo. Exporte os documentos completos, incluindo subcoleções, para um JSON plano:

```json
[
  { "path": "unidades/USF-003", "data": { "nome": "USF Arrozal 3", "codigo": "USF-003", "ativo": true } },
  { "path": "usuarios/uid-antigo", "data": { "uid": "uid-antigo", "nome": "Nome", "email": "usuario@exemplo.com", "perfil": "GERENTE", "unidadeId": "USF-003", "ativo": true } },
  { "path": "pacientes/id-antigo", "data": { "nome": "Nome", "unidadeId": "USF-003", "microareaCodigo": "01", "historicoAcoes": [], "historicoCargas": [] } }
]
```

Execute `npm run supabase:import -- migration-data.json` para validar sem escrever. Execute novamente com `--apply` para importar. O script reconcilia contas pelo e-mail, remapeia UIDs em vínculos e caminhos e importa os documentos numa transação. A importação recusa conflitos com documentos já existentes; não sobrescreve dados silenciosamente. Se houver erro depois de criar contas, essas contas podem permanecer sem perfil e, portanto, sem acesso; a execução seguinte as reconhece pelo e-mail.

As senhas antigas não são transferidas. Contas novas recebem senha aleatória sem envio de e-mail; um administrador deve definir a senha pelo sistema antes do primeiro acesso. Não execute o bootstrap se o arquivo a importar já contiver um ADMIN; importe primeiro e defina a senha dessa conta no painel Supabase.

Para dados das tabelas relacionais antigas, execute `node --env-file=.env.local scripts/export-relational.cjs migration-data-relational.json`. Esse script lê as tabelas antigas com a chave privada, consolida pacientes, aferições, atendimentos, áreas e perfis no formato importável e preserva uma cópia de cada linha em `legacy_records`. Ele não altera o banco remoto. Revise vínculos de área, perfis e microáreas antes de importar. Registros convertidos são marcados para revisão; a prioridade clínica precisa ser conferida. As tabelas antigas não são apagadas. Compare contagens, CPFs/CNS, históricos e amostras por unidade antes de encerrar a operação antiga. Se houver dados nos dois sistemas, reconcilie as duplicidades antes da importação; não importe as duas exportações cegamente.

## Segurança e verificação

As políticas RLS usam o perfil ativo vinculado ao UUID do Supabase Auth. ADMIN tem acesso global; GERENTE atua na própria unidade; ACS acessa pacientes das microáreas atribuídas. O cliente não pode promover o próprio perfil. APIs administrativas exigem token válido e validam perfil, unidade e conta de destino. Operações de prontuário e lotes usam transações PostgreSQL.

`npm run test:migration` executa testes SQL locais de RLS e atomicidade com PostgreSQL embarcado. `npx tsc --noEmit` valida tipos. `npm run build -- --webpack` permite validar com Webpack quando Turbopack falha no Windows. Os testes locais não substituem o teste de login e importação no projeto Supabase configurado.
