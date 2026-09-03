const fs = require('fs');
const path = require('path');

// 1. Carregar variáveis de ambiente de .env.local do projeto
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        val = val.replace(/\\n/g, '\n');
        process.env[key] = val;
      }
    }
  });
}

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'projetodashboard-d151e';
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

console.log('=== ATUALIZADOR E POVOADOR DA NUVEM FIREBASE ===');
console.log('Projeto Firebase:', projectId);
console.log('Email do Service Account:', clientEmail ? clientEmail : 'Não informado (Usando credencial padrão)');

if (!getApps().length) {
  if (clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else {
    initializeApp({ projectId });
  }
}

const db = getFirestore();
const auth = getAuth();

async function runCloudSync() {
  const results = {
    unidades: 0,
    microareas: 0,
    usuariosAuth: 0,
    usuariosFirestore: 0,
    pacientes: 0,
    erros: [],
  };

  try {
    // A. ATUALIZAR / SEED NAS UNIDADES DE SAÚDE
    console.log('\n--- 1. Sincronizando Unidades de Saúde no Cloud Firestore ---');
    const unidadesData = [
      {
        id: 'USF-003',
        nome: 'USF Arrozal 3',
        nomeNormalizado: 'USF ARROZAL 3',
        codigo: 'USF-003',
        cnes: '1234567',
        tipo: 'USF',
        ativo: true,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'USF-001',
        nome: 'USF Saúde da Família - Central',
        nomeNormalizado: 'USF SAUDE DA FAMILIA CENTRAL',
        codigo: 'USF-001',
        cnes: '7654321',
        tipo: 'USF',
        ativo: true,
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const u of unidadesData) {
      await db.collection('unidades').doc(u.id).set(u, { merge: true });
      results.unidades++;
      console.log(`✓ Unidade configurada: ${u.nome} (${u.codigo})`);
    }

    // B. ATUALIZAR / SEED NAS MICROÁREAS
    console.log('\n--- 2. Sincronizando Microáreas e ACSs no Cloud Firestore ---');
    const microareasData = [
      { id: 'ma_USF-003_01', unidadeId: 'USF-003', codigo: '01', nome: 'Microárea 01', acsNome: 'Ana Maria Souza', acsId: 'acs-ana-souza', tipoMicroarea: 'NORMAL', ativo: true },
      { id: 'ma_USF-003_02', unidadeId: 'USF-003', codigo: '02', nome: 'Microárea 02', acsNome: 'Carlos Eduardo Silva', acsId: 'acs-carlos-silva', tipoMicroarea: 'NORMAL', ativo: true },
      { id: 'ma_USF-003_03', unidadeId: 'USF-003', codigo: '03', nome: 'Microárea 03', acsNome: 'Fernanda Oliveira', acsId: 'acs-fernanda-oliveira', tipoMicroarea: 'NORMAL', ativo: true },
      { id: 'ma_USF-003_04', unidadeId: 'USF-003', codigo: '04', nome: 'Microárea 04', acsNome: 'João Pedro Santos', acsId: 'acs-joao-santos', tipoMicroarea: 'NORMAL', ativo: true },
      { id: 'ma_USF-003_05', unidadeId: 'USF-003', codigo: '05', nome: 'Microárea 05', acsNome: 'Mariana Costa', acsId: 'acs-mariana-costa', tipoMicroarea: 'NORMAL', ativo: true },
      { id: 'ma_USF-003_06', unidadeId: 'USF-003', codigo: '06', nome: 'Microárea 06', acsNome: 'Roberto Lima', acsId: 'acs-roberto-lima', tipoMicroarea: 'NORMAL', ativo: true },
    ];

    for (const ma of microareasData) {
      await db.collection('microareas').doc(ma.id).set({
        ...ma,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      results.microareas++;
      console.log(`✓ Microárea ${ma.codigo} sincronizada: ${ma.acsNome}`);
    }

    // C. RECONCILIAR E CRIAR USUÁRIOS NO FIREBASE AUTH & FIRESTORE
    console.log('\n--- 3. Reconciliando Usuários no Firebase Auth e Firestore ---');
    const usuariosParaSincronizar = [
      {
        uid: 'admin-sistema',
        nome: 'Administrador DCNT Saúde',
        email: 'admin.dcnt@saude.gov.br',
        perfil: 'ADMIN',
        unidadeId: 'USF-003',
        ativo: true,
        tempPassword: 'AdminPass123!',
      },
      {
        uid: 'gerente-arrozal-3',
        nome: 'Gerente USF Arrozal 3',
        email: 'gerente.arrozal3@usf.gov.br',
        perfil: 'GERENTE',
        unidadeId: 'USF-003',
        ativo: true,
        tempPassword: 'GerentePass123!',
      },
      {
        uid: 'acs-ana-souza',
        nome: 'Ana Maria Souza',
        email: 'ana.souza@usf.gov.br',
        perfil: 'ACS',
        unidadeId: 'USF-003',
        microareaIds: ['ma_USF-003_01'],
        ativo: true,
        tempPassword: 'AcsPass123!',
      },
      {
        uid: 'acs-carlos-silva',
        nome: 'Carlos Eduardo Silva',
        email: 'carlos.silva@usf.gov.br',
        perfil: 'ACS',
        unidadeId: 'USF-003',
        microareaIds: ['ma_USF-003_02'],
        ativo: true,
        tempPassword: 'AcsPass123!',
      },
      {
        uid: 'acs-fernanda-oliveira',
        nome: 'Fernanda Oliveira',
        email: 'fernanda.oliveira@usf.gov.br',
        perfil: 'ACS',
        unidadeId: 'USF-003',
        microareaIds: ['ma_USF-003_03'],
        ativo: true,
        tempPassword: 'AcsPass123!',
      },
    ];

    for (const u of usuariosParaSincronizar) {
      let authUid = null;
      try {
        const existingAuthUser = await auth.getUserByEmail(u.email);
        authUid = existingAuthUser.uid;
        console.log(`✓ Conta Auth já existente no Firebase Auth: ${u.email} (UID: ${authUid})`);
      } catch (authNotFound) {
        try {
          const newAuthUser = await auth.createUser({
            email: u.email,
            password: u.tempPassword,
            displayName: u.nome,
          });
          authUid = newAuthUser.uid;
          results.usuariosAuth++;
          console.log(`+ Nova Conta Auth criada com sucesso: ${u.email} (Senha provisória: ${u.tempPassword})`);
        } catch (createErr) {
          console.error(`! Alerta ao criar Auth para ${u.email}:`, createErr.message);
          results.erros.push(`Auth ${u.email}: ${createErr.message}`);
        }
      }

      const docUid = authUid || u.uid;
      await db.collection('usuarios').doc(docUid).set({
        uid: docUid,
        nome: u.nome,
        email: u.email,
        perfil: u.perfil,
        unidadeId: u.unidadeId,
        microareaIds: u.microareaIds || [],
        authUid: authUid,
        authAtiva: true,
        ativo: u.ativo,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      results.usuariosFirestore++;
      console.log(`  -> Perfil Firestore atualizado [${u.perfil}] para ${u.nome}`);
    }

    // D. ATUALIZAR / SEED NOS PACIENTES NO FIRESTORE
    console.log('\n--- 4. Sincronizando Pacientes no Cloud Firestore ---');
    const pacientesSeed = [
      {
        id: 'pat-101',
        nome: 'Maria das Graças Silva',
        cpf: '123.456.789-01',
        cns: '700102030405061',
        idade: 67,
        sexo: 'Feminino',
        telefone: '(11) 98765-4321',
        unidadeId: 'USF-003',
        unidadeNome: 'USF Arrozal 3',
        microarea: 'Microárea 01',
        microareaId: 'ma_USF-003_01',
        microareaCodigo: '01',
        acsNome: 'Ana Maria Souza',
        pesoAtual: 84.5,
        alturaAtual: 1.58,
        imcAtual: 33.85,
        pressaoSistolicaAtual: 158,
        pressaoDiastolicaAtual: 96,
        dataUltimaPA: '2026-07-15',
        dataUltimaVisitaACS: '2026-04-10',
        dataUltimaConsulta: '2026-05-20',
        prioridade: 'Alta',
        motivosPrioridade: 'PA muito elevada (158/96 mmHg) e ausência de visita ACS há mais de 3 meses.',
        identificacaoConfiavel: true,
        requerRevisao: false,
        ultimaImportacaoId: 'import-seed-initial',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'pat-102',
        nome: 'José Antonio dos Santos',
        cpf: '234.567.890-12',
        cns: '700203040506072',
        idade: 72,
        sexo: 'Masculino',
        telefone: '(11) 97654-3210',
        unidadeId: 'USF-003',
        unidadeNome: 'USF Arrozal 3',
        microarea: 'Microárea 03',
        microareaId: 'ma_USF-003_03',
        microareaCodigo: '03',
        acsNome: 'Fernanda Oliveira',
        pesoAtual: 78.0,
        alturaAtual: 1.70,
        imcAtual: 26.99,
        pressaoSistolicaAtual: 145,
        pressaoDiastolicaAtual: 90,
        dataUltimaPA: '2025-12-05',
        dataUltimaVisitaACS: '2025-11-01',
        dataUltimaConsulta: '2025-12-05',
        prioridade: 'Alta',
        motivosPrioridade: 'Sem aferição de PA há mais de 8 meses e idoso tabagista sem visita há mais de 6 meses.',
        identificacaoConfiavel: true,
        requerRevisao: false,
        ultimaImportacaoId: 'import-seed-initial',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'pat-103',
        nome: 'Ana Claudia Ramos',
        cpf: '345.678.901-23',
        cns: '700304050607083',
        idade: 54,
        sexo: 'Feminino',
        telefone: '(11) 96543-2109',
        unidadeId: 'USF-003',
        unidadeNome: 'USF Arrozal 3',
        microarea: 'Microárea 02',
        microareaId: 'ma_USF-003_02',
        microareaCodigo: '02',
        acsNome: 'Carlos Eduardo Silva',
        pesoAtual: 92.0,
        alturaAtual: 1.62,
        imcAtual: 35.06,
        pressaoSistolicaAtual: 125,
        pressaoDiastolicaAtual: 80,
        dataUltimaPA: '2026-06-10',
        dataUltimaVisitaACS: '2026-05-18',
        dataUltimaConsulta: '2026-06-10',
        prioridade: 'Média',
        motivosPrioridade: 'Diabetes tipo 2 com Obesidade Grau II em acompanhamento nutricional pendente.',
        identificacaoConfiavel: true,
        requerRevisao: false,
        ultimaImportacaoId: 'import-seed-initial',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'pat-104',
        nome: 'Raimundo Nonato Oliveira',
        cpf: '456.789.012-34',
        cns: '700405060708094',
        idade: 61,
        sexo: 'Masculino',
        telefone: '(11) 95432-1098',
        unidadeId: 'USF-003',
        unidadeNome: 'USF Arrozal 3',
        microarea: 'Microárea 04',
        microareaId: 'ma_USF-003_04',
        microareaCodigo: '04',
        acsNome: 'João Pedro Santos',
        pesoAtual: 88.0,
        alturaAtual: 1.75,
        imcAtual: 28.73,
        pressaoSistolicaAtual: 162,
        pressaoDiastolicaAtual: 98,
        dataUltimaPA: '2026-08-02',
        dataUltimaVisitaACS: '2026-07-20',
        dataUltimaConsulta: '2026-08-02',
        prioridade: 'Alta',
        motivosPrioridade: 'Hipertensão com PA Estágio 2 (162/98 mmHg). Necessita reavaliação médica.',
        identificacaoConfiavel: true,
        requerRevisao: false,
        ultimaImportacaoId: 'import-seed-initial',
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'pat-105',
        nome: 'Francisca Helena Souza',
        cpf: '567.890.123-45',
        cns: '700506070809105',
        idade: 78,
        sexo: 'Feminino',
        telefone: '(11) 94321-0987',
        unidadeId: 'USF-003',
        unidadeNome: 'USF Arrozal 3',
        microarea: 'Microárea 05',
        microareaId: 'ma_USF-003_05',
        microareaCodigo: '05',
        acsNome: 'Mariana Costa',
        pesoAtual: 62.0,
        alturaAtual: 1.52,
        imcAtual: 26.83,
        pressaoSistolicaAtual: 130,
        pressaoDiastolicaAtual: 82,
        dataUltimaPA: '2026-08-10',
        dataUltimaVisitaACS: '2026-08-12',
        dataUltimaConsulta: '2026-08-10',
        prioridade: 'Acompanhado',
        motivosPrioridade: 'Idosa em acompanhamento regular com PA controlada e visita em dia.',
        identificacaoConfiavel: true,
        requerRevisao: false,
        ultimaImportacaoId: 'import-seed-initial',
        updatedAt: new Date().toISOString(),
      }
    ];

    for (const p of pacientesSeed) {
      await db.collection('pacientes').doc(p.id).set(p, { merge: true });
      results.pacientes++;
      console.log(`✓ Paciente gravado no Cloud Firestore: ${p.nome} [Microárea ${p.microareaCodigo}]`);
    }

    console.log('\n==================================================');
    console.log('✅ ATUALIZAÇÃO E SINCRONIZAÇÃO DA NUVEM CONCLUÍDA!');
    console.log('==================================================');
    console.log(`- Unidades de Saúde: ${results.unidades}`);
    console.log(`- Microáreas: ${results.microareas}`);
    console.log(`- Novos Usuários Criados no Auth: ${results.usuariosAuth}`);
    console.log(`- Usuários Sincronizados no Firestore: ${results.usuariosFirestore}`);
    console.log(`- Pacientes Sincronizados: ${results.pacientes}`);
    if (results.erros.length > 0) {
      console.log(`- Avisos/Erros (${results.erros.length}):`, results.erros);
    }
  } catch (err) {
    console.error('❌ Erro durante a atualização da nuvem:', err);
    process.exit(1);
  }
}

runCloudSync();
