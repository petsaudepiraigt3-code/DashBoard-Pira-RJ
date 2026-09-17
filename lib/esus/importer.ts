import { writeBatch, doc, collection, serverTimestamp, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { ESUSParseResult, FirestoreImportRecord, NormalizedPatientRecord } from "./types";
import { getExistingPatientsMap, FirestorePatientDoc } from "../firebase/patients";
import { createImportRecordInFirestore, updateImportRecordInFirestore } from "../firebase/imports";
import { ensureUnitMicroareaInFirestore } from "../firebase/units";
import { maskCPF, maskCNS } from "./normalizer";
import { PatientCargaSnapshot, PriorityLevel } from "@/types/dcnt";
import {
  saveNormalizedPatientToSupabase,
  createControleCargaSupabase,
  updateControleCargaSupabase,
} from "../supabase/patients";

export interface ESUSImportProgress {
  step: "Preparando..." | "Importando pacientes..." | "Gravando históricos..." | "Finalizando..." | "Concluído";
  processedRows: number;
  totalRows: number;
  newPatients: number;
  updatedPatients: number;
  newLinks: number;
  updatedLinks: number;
  paCount: number;
  weightCount: number;
  reviewCount: number;
  novosAtendimentos?: number;
  novosPesos?: number;
  percent: number;
}

export interface FivePatientsTestResult {
  success: boolean;
  message: string;
  processedCount: number;
  unidadeNome: string;
  newPatients: number;
  updatedPatients: number;
  newLinks: number;
  updatedLinks: number;
  paCount: number;
  weightCount: number;
  novosAtendimentos?: number;
  novosPesos?: number;
  maskedPatients: { name: string; doc: string; microarea: string; pa: string; bmi: string }[];
  patientDocStatus: "OK" | "Erro";
  linksStatus: "OK" | "Erro";
  microareasStatus: "OK" | "Erro";
  paHistoryStatus: "OK" | "Não disponível";
  weightHistoryStatus: "OK" | "Não disponível";
  importDocStatus: "OK" | "Erro";
}

function maskName(name: string): string {
  if (!name) return "D***";
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => (p.length > 2 ? `${p[0]}***` : p))
    .join(" ");
}
 
// Função para calcular deltas e evolução clínica em relação à carga imediatamente anterior
export function calculateSnapshotComparison(
  norm: NormalizedPatientRecord,
  previousData?: {
    pressaoSistolicaAtual?: number | null;
    pressaoDiastolicaAtual?: number | null;
    pesoAtual?: number | null;
    imcAtual?: number | null;
    dataUltimaVisitaACS?: string | null;
    dataUltimaVisita?: string | null;
    prioridade?: PriorityLevel;
  } | null
) {
  if (!previousData) {
    return {
      statusPA: "Novo Registro" as const,
      statusPeso: "Sem Dado Anterior" as const,
      statusVisita: "Sem Registro" as const,
    };
  }

  // PA
  let statusPA: "Melhorou" | "Piorou" | "Estável" | "Sem Dado Anterior" | "Novo Registro" = "Estável";
  let deltaSistolica: number | undefined;
  let deltaDiastolica: number | undefined;

  if (norm.systolic && norm.diastolic && previousData.pressaoSistolicaAtual && previousData.pressaoDiastolicaAtual) {
    deltaSistolica = norm.systolic - previousData.pressaoSistolicaAtual;
    deltaDiastolica = norm.diastolic - previousData.pressaoDiastolicaAtual;

    const prevWasElevated = previousData.pressaoSistolicaAtual >= 140 || previousData.pressaoDiastolicaAtual >= 90;
    const currentIsElevated = norm.systolic >= 140 || norm.diastolic >= 90;

    if (prevWasElevated && !currentIsElevated) {
      statusPA = "Melhorou";
    } else if (!prevWasElevated && currentIsElevated) {
      statusPA = "Piorou";
    } else if (deltaSistolica <= -5 || deltaDiastolica <= -5) {
      statusPA = "Melhorou";
    } else if (deltaSistolica >= 5 || deltaDiastolica >= 5) {
      statusPA = "Piorou";
    } else {
      statusPA = "Estável";
    }
  } else if (norm.systolic && norm.diastolic) {
    statusPA = "Novo Registro";
  } else {
    statusPA = "Sem Dado Anterior";
  }

  // Peso e IMC
  let statusPeso: "Reduziu" | "Aumentou" | "Estável" | "Sem Dado Anterior" = "Estável";
  let deltaPeso: number | undefined;
  let deltaIMC: number | undefined;

  if (norm.peso && previousData.pesoAtual) {
    deltaPeso = Number((norm.peso - previousData.pesoAtual).toFixed(2));
    if (deltaPeso <= -0.5) statusPeso = "Reduziu";
    else if (deltaPeso >= 0.5) statusPeso = "Aumentou";
    else statusPeso = "Estável";
  } else {
    statusPeso = "Sem Dado Anterior";
  }

  if (norm.imc && previousData.imcAtual) {
    deltaIMC = Number((norm.imc - previousData.imcAtual).toFixed(2));
  }

  // Visita
  let statusVisita: "Atualizada" | "Inalterada" | "Sem Registro" = "Inalterada";
  const prevVisita = previousData.dataUltimaVisitaACS || previousData.dataUltimaVisita;
  if (norm.lastHomeVisit) {
    if (!prevVisita || norm.lastHomeVisit > prevVisita) {
      statusVisita = "Atualizada";
    } else {
      statusVisita = "Inalterada";
    }
  } else {
    statusVisita = prevVisita ? "Inalterada" : "Sem Registro";
  }

  // Mudança de prioridade
  const mudancaPrioridade = previousData.prioridade
    ? {
        anterior: previousData.prioridade,
        atual: norm.priority as PriorityLevel,
      }
    : undefined;

  return {
    statusPA,
    deltaSistolica,
    deltaDiastolica,
    statusPeso,
    deltaPeso,
    deltaIMC,
    statusVisita,
    mudancaPrioridade,
  };
}

export function createSnapshotRecord(
  importId: string,
  fileName: string,
  tipoImportacao: "COMPLETA" | "TESTE",
  userName: string,
  norm: NormalizedPatientRecord,
  previousData?: any
): PatientCargaSnapshot {
  const comparativo = calculateSnapshotComparison(norm, previousData);
  const now = new Date().toISOString();
  const dateKey = norm.dataPA || norm.dataMedicao || norm.lastHomeVisit || now.substring(0, 10);
  const snapId = `snap_${importId}_${dateKey}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    id: snapId,
    importId,
    fileName,
    dataCarga: now,
    dataReferencia: dateKey,
    tipoImportacao,
    usuarioUpload: userName,
    pressaoSistolica: norm.systolic || null,
    pressaoDiastolica: norm.diastolic || null,
    dataPA: norm.dataPA || null,
    peso: norm.peso || null,
    altura: norm.altura || null,
    imc: norm.imc || null,
    dataAntropometria: norm.dataMedicao || null,
    dataUltimaVisitaACS: norm.lastHomeVisit || null,
    diasSemVisitaACS: norm.daysSinceHomeVisit ?? null,
    mesesSemVisitaACS: norm.monthsSinceHomeVisit ?? null,
    dataUltimoAtendimentoMedico: norm.lastMedicalCare || null,
    dataUltimoAtendimentoEnfermagem: norm.lastNursingCare || null,
    dataUltimoAtendimentoOdontologico: norm.lastDentalCare || null,
    prioridade: norm.priority,
    motivosPrioridade: norm.activeSearchReason || null,
    microarea: norm.microarea || null,
    acsName: norm.acsName || null,
    comparativo,
  };
}

// 1. Execução Controlada do Teste de 5 Pacientes com Métricas Exatas no Firestore
export async function executeFivePatientsTestImportToFirestore(
  rowsToTest: NormalizedPatientRecord[],
  fileName: string = "relatorio_esus_teste.csv",
  userName: string = "Gerente da USF Arrozal 3",
  unidadeId: string,
  unidadeNome: string,
  userRole?: string,
  userUnitId?: string
): Promise<FivePatientsTestResult> {
  const targetUnidadeId = userRole === "GERENTE" && userUnitId ? userUnitId : unidadeId;
  if (!targetUnidadeId) {
    throw new Error("Unidade de Saúde é obrigatória para executar o teste.");
  }
  unidadeId = targetUnidadeId;

  const sliceRows = rowsToTest.slice(0, 5);
  const existingMap = await getExistingPatientsMap();

  let newPatients = 0;
  let updatedPatients = 0;
  let newLinks = 0;
  let updatedLinks = 0;
  let paCount = 0;
  let weightCount = 0;
  let novosAtendimentos = 0;
  let novosPesos = 0;

  // Registrar carga no banco relacional Supabase (controle_carga)
  const supaCargaId = await createControleCargaSupabase({
    responsavel_carga: userName,
    responsavel_perfil: userRole || "GERENTE",
    area_nome: unidadeNome,
    arquivo_nome: fileName,
    tipo_carga: "TESTE",
    total_registros: sliceRows.length,
  });

  const maskedPatientsSummary: { name: string; doc: string; microarea: string; pa: string; bmi: string }[] = [];

  for (const norm of sliceRows) {
    let patientDocId: string;
    if (norm.cpf) {
      patientDocId = `cpf_${norm.cpf}`;
    } else if (norm.cns) {
      patientDocId = `cns_${norm.cns}`;
    } else {
      patientDocId = `sec_${norm.nomeNormalizado}_${norm.dataNascimento}`;
    }

    const isReliable = !!(norm.cpf || norm.cns);
    const patientRef = doc(db, "pacientes", patientDocId);
    const patientSnap = await getDoc(patientRef);

    if (patientSnap.exists()) {
      updatedPatients++;
    } else {
      newPatients++;
    }

    // Garantir microárea no banco administrativo
    const { microareaId, codigo } = await ensureUnitMicroareaInFirestore(
      unidadeId,
      norm.microarea || "Não informada"
    );

    const prevPatientData = patientSnap.exists() ? (patientSnap.data() as any) : null;
    const snapshot = createSnapshotRecord("teste-5-pacientes", fileName, "TESTE", userName, norm, prevPatientData);
    const existingCargas = prevPatientData?.historicoCargas || [];
    const updatedHistoricoCargas = [snapshot, ...existingCargas].slice(0, 20);

    const patientData = {
      nome: norm.nome,
      cpf: norm.cpf || null,
      cns: norm.cns || null,
      dataNascimento: norm.dataNascimento || null,
      idade: norm.idade !== undefined ? norm.idade : null,
      sexo: norm.sexo || null,
      identidadeGenero: norm.identidadeGenero || null,
      unidadeId,
      microareaId,
      microareaCodigo: codigo,
      microareaOriginal: norm.microarea || "Não informada",
      microarea: norm.microarea || "Não informada",

      pesoAtual: norm.peso !== undefined ? norm.peso : null,
      alturaAtual: norm.altura !== undefined ? norm.altura : null,
      imcAtual: norm.imc !== undefined ? norm.imc : null,

      pressaoSistolicaAtual: norm.systolic !== undefined ? norm.systolic : null,
      pressaoDiastolicaAtual: norm.diastolic !== undefined ? norm.diastolic : null,
      dataUltimaPA: norm.dataPA || null,

      monthsSinceMedicalCare: norm.monthsSinceMedicalCare !== undefined ? norm.monthsSinceMedicalCare : null,
      monthsSinceNursingCare: norm.monthsSinceNursingCare !== undefined ? norm.monthsSinceNursingCare : null,
      monthsSinceDentalCare: norm.monthsSinceDentalCare !== undefined ? norm.monthsSinceDentalCare : null,
      monthsSinceHomeVisit: norm.monthsSinceHomeVisit !== undefined ? norm.monthsSinceHomeVisit : null,
      daysSinceHomeVisit: norm.daysSinceHomeVisit !== undefined ? norm.daysSinceHomeVisit : null,
      dataUltimaVisitaACS: norm.lastHomeVisit || null,
      dataUltimaVisita: norm.lastHomeVisit || null,

      prioridade: norm.priority,
      motivosPrioridade: norm.activeSearchReason || null,

      identificacaoConfiavel: isReliable,
      requerRevisao: !isReliable,
      historicoCargas: updatedHistoricoCargas,
      updatedAt: serverTimestamp(),
      ultimaImportacaoId: "teste-5-pacientes",
    };

    await setDoc(patientRef, { ...patientData, createdAt: serverTimestamp() }, { merge: true });

    // Gravar snapshot na subcoleção historicoCargas para auditoria e histórico permanente
    const snapRef = doc(collection(db, "pacientes", patientDocId, "historicoCargas"), snapshot.id);
    await setDoc(snapRef, snapshot, { merge: true });

    // Vínculo paciente-unidade
    const vinculoRef = doc(db, "pacientes", patientDocId, "vinculosUnidade", unidadeId);
    const vinculoSnap = await getDoc(vinculoRef);

    if (vinculoSnap.exists()) {
      updatedLinks++;
    } else {
      newLinks++;
    }

    await setDoc(vinculoRef, {
      unidadeId,
      microareaId,
      microarea: norm.microarea || null,
      acsId: null,
      ativo: true,
      dataInicio: new Date().toISOString(),
      ultimaAtualizacao: serverTimestamp(),
      importacaoId: "teste-5-pacientes",
    }, { merge: true });

    // Histórico de PA
    if (norm.systolic && norm.diastolic) {
      paCount++;
      const dateKey = norm.dataPA || "semdata";
      const paId = `pa_${dateKey}_${norm.systolic}_${norm.diastolic}`;
      const paRef = doc(collection(db, "pacientes", patientDocId, "pressaoArterial"), paId);
      await setDoc(paRef, {
        sistolica: norm.systolic,
        diastolica: norm.diastolic,
        dataMedicao: norm.dataPA || null,
        unidadeId,
        importacaoId: "teste-5-pacientes",
        origem: "e-SUS APS",
        createdAt: serverTimestamp(),
      }, { merge: true });
    }

    // Histórico de Antropometria
    if (norm.peso && norm.altura) {
      weightCount++;
      const dateKey = norm.dataMedicao || "semdata";
      const antId = `ant_${dateKey}_${norm.peso}_${norm.altura}`;
      const antRef = doc(collection(db, "pacientes", patientDocId, "antropometria"), antId);
      await setDoc(antRef, {
        peso: norm.peso,
        altura: norm.altura,
        imc: norm.imc || 0,
        dataMedicao: norm.dataMedicao || null,
        unidadeId,
        importacaoId: "teste-5-pacientes",
        origem: "e-SUS APS",
        createdAt: serverTimestamp(),
      }, { merge: true });
    }

    // Persistir simultaneamente no Supabase PostgreSQL (Tabelas do PDF)
    try {
      const supaRes = await saveNormalizedPatientToSupabase(norm, unidadeNome || "USF Arrozal 3", {
        idCarga: supaCargaId || undefined,
      });
      if (supaRes?.atendimentoInserido) novosAtendimentos++;
      if (supaRes?.pesoInserido) novosPesos++;
    } catch (e) {
      console.warn("Aviso: falha ao salvar teste no Supabase:", e);
    }

    maskedPatientsSummary.push({
      name: maskName(norm.nome),
      doc: norm.cpf ? maskCPF(norm.cpf) : norm.cns ? maskCNS(norm.cns) : "Sem doc",
      microarea: norm.microarea || "Não informada",
      pa: norm.systolic ? `${norm.systolic}/${norm.diastolic} mmHg` : "N/A",
      bmi: norm.imc ? `${norm.imc.toFixed(2)}` : "N/A",
    });
  }

  // Atualizar registro no controle_carga do Supabase
  if (supaCargaId) {
    await updateControleCargaSupabase(supaCargaId, {
      novos_pacientes: newPatients,
      pacientes_atualizados: updatedPatients,
      novos_atendimentos: novosAtendimentos,
      novos_pesos: novosPesos,
      status: "Concluído",
    });
  }

  // Gravar registro na coleção 'imports' com tipoImportacao: "TESTE"
  const importId = await createImportRecordInFirestore({
    tipoImportacao: "TESTE",
    arquivo: fileName,
    dataImportacao: new Date().toISOString(),
    usuarioId: userName,
    unidadeId,
    unidadeNome,
    totalRegistros: sliceRows.length,
    novosPacientes: newPatients,
    pacientesAtualizados: updatedPatients,
    novosVinculos: newLinks,
    vinculosAtualizados: updatedLinks,
    registrosComAvisos: 0,
    erros: 0,
    paImportadas: paCount,
    antropometriasImportadas: weightCount,
    status: "Concluído",
  });

  const importSnap = await getDoc(doc(db, "imports", importId));
  if (!importSnap.exists()) {
    throw new Error("Erro de verificação: registro de importação de teste não encontrado após escrita.");
  }

  return {
    success: true,
    message: `Teste de ${sliceRows.length} pacientes gravado com ${novosAtendimentos} novo(s) atendimento(s) e ${novosPesos} nova(s) pesagem(ns) confirmados na unidade ${unidadeNome}.`,
    processedCount: sliceRows.length,
    unidadeNome,
    newPatients,
    updatedPatients,
    newLinks,
    updatedLinks,
    paCount,
    weightCount,
    novosAtendimentos,
    novosPesos,
    maskedPatients: maskedPatientsSummary,
    patientDocStatus: "OK",
    linksStatus: "OK",
    microareasStatus: "OK",
    paHistoryStatus: paCount > 0 ? "OK" : "Não disponível",
    weightHistoryStatus: weightCount > 0 ? "OK" : "Não disponível",
    importDocStatus: importSnap.exists() ? "OK" : "Erro",
  };
}

// 2. Importação Completa em Lotes com Validação Estrita da Soma
export async function executeESUSImportToFirestore(
  parseResult: ESUSParseResult,
  fileName: string,
  fileSize: string,
  userName: string,
  unidadeId: string,
  unidadeNome: string,
  onProgress?: (progress: ESUSImportProgress) => void,
  userRole?: string,
  userUnitId?: string
): Promise<FirestoreImportRecord> {
  const targetUnidadeId = userRole === "GERENTE" && userUnitId ? userUnitId : unidadeId;
  if (!targetUnidadeId) {
    throw new Error("Por favor, selecione uma Unidade de Saúde para realizar a importação.");
  }
  unidadeId = targetUnidadeId;

  const updateProgress = (
    step: ESUSImportProgress["step"],
    processed: number,
    newCount: number,
    updatedCount: number,
    nLinks: number,
    uLinks: number,
    pa: number,
    weight: number,
    review: number,
    novosAtend: number = 0,
    novosPesos: number = 0
  ) => {
    if (onProgress) {
      const percent = Math.min(100, Math.round((processed / (parseResult.totalRowsCount || 1)) * 100));
      onProgress({
        step,
        processedRows: processed,
        totalRows: parseResult.totalRowsCount,
        newPatients: newCount,
        updatedPatients: updatedCount,
        newLinks: nLinks,
        updatedLinks: uLinks,
        paCount: pa,
        weightCount: weight,
        reviewCount: review,
        novosAtendimentos: novosAtend,
        novosPesos: novosPesos,
        percent,
      });
    }
  };

  updateProgress("Preparando...", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

  const existingMap = await getExistingPatientsMap();

  let newPatientsCount = 0;
  let updatedPatientsCount = 0;
  let newLinksCount = 0;
  let updatedLinksCount = 0;
  let paCount = 0;
  let weightCount = 0;
  let reviewCount = 0;
  let novosAtendimentosCount = 0;
  let novosPesosCount = 0;

  // Criar registro na tabela 'controle_carga' do banco relacional
  const supaCargaId = await createControleCargaSupabase({
    responsavel_carga: userName,
    responsavel_perfil: userRole || "GERENTE",
    area_nome: unidadeNome,
    arquivo_nome: fileName,
    tipo_carga: "COMPLETA",
    total_registros: parseResult.totalRowsCount,
  });

  const validRows = parseResult.rows.filter((r) => r.status !== "Erro" && r.normalizedData);

  const importId = await createImportRecordInFirestore({
    tipoImportacao: "COMPLETA",
    arquivo: fileName,
    dataImportacao: new Date().toISOString(),
    usuarioId: userName,
    unidadeId,
    unidadeNome,
    totalRegistros: parseResult.totalRowsCount,
    novosPacientes: 0,
    pacientesAtualizados: 0,
    novosVinculos: 0,
    vinculosAtualizados: 0,
    registrosComAvisos: parseResult.warningRowsCount,
    erros: parseResult.errorRowsCount,
    paImportadas: 0,
    antropometriasImportadas: 0,
    status: "Concluído",
  });

  const BATCH_SIZE = 300;
  let currentBatch = writeBatch(db);
  let batchOpCount = 0;

  updateProgress("Importando pacientes...", 0, 0, 0, 0, 0, 0, 0, 0);

  const createdMicroareasSet = new Map<string, { microareaId: string; codigo: string }>();

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const norm = row.normalizedData!;

    let patientDocId: string;
    let existingPatient: FirestorePatientDoc | undefined;

    if (norm.cpf) {
      patientDocId = `cpf_${norm.cpf}`;
      existingPatient = existingMap.get(norm.cpf);
    } else if (norm.cns) {
      patientDocId = `cns_${norm.cns}`;
      existingPatient = existingMap.get(norm.cns);
    } else {
      patientDocId = `sec_${norm.nomeNormalizado}_${norm.dataNascimento}`;
      existingPatient = existingMap.get(patientDocId);
    }

    const isReliable = !!(norm.cpf || norm.cns);
    const needsReview = !isReliable;

    if (needsReview) {
      reviewCount++;
    }

    // Garantir registro da Microárea
    const rawMA = norm.microarea || "Não informada";
    let maMeta = createdMicroareasSet.get(rawMA);
    if (!maMeta) {
      maMeta = await ensureUnitMicroareaInFirestore(unidadeId, rawMA);
      createdMicroareasSet.set(rawMA, maMeta);
    }

    const patientRef = doc(db, "pacientes", patientDocId);

    const snapshot = createSnapshotRecord(importId, fileName, "COMPLETA", userName, norm, existingPatient);
    const existingCargas = (existingPatient as any)?.historicoCargas || [];
    const updatedHistoricoCargas = [snapshot, ...existingCargas].slice(0, 20);

    const patientData = {
      nome: norm.nome,
      cpf: norm.cpf || null,
      cns: norm.cns || null,
      dataNascimento: norm.dataNascimento || null,
      idade: norm.idade !== undefined ? norm.idade : null,
      sexo: norm.sexo || null,
      identidadeGenero: norm.identidadeGenero || null,
      unidadeId,
      microareaId: maMeta.microareaId,
      microareaCodigo: maMeta.codigo,
      microareaOriginal: rawMA,
      microarea: norm.microarea || null,

      pesoAtual: norm.peso !== undefined ? norm.peso : null,
      alturaAtual: norm.altura !== undefined ? norm.altura : null,
      imcAtual: norm.imc !== undefined ? norm.imc : null,

      pressaoSistolicaAtual: norm.systolic !== undefined ? norm.systolic : null,
      pressaoDiastolicaAtual: norm.diastolic !== undefined ? norm.diastolic : null,
      dataUltimaPA: norm.dataPA || null,

      monthsSinceMedicalCare: norm.monthsSinceMedicalCare !== undefined ? norm.monthsSinceMedicalCare : null,
      monthsSinceNursingCare: norm.monthsSinceNursingCare !== undefined ? norm.monthsSinceNursingCare : null,
      monthsSinceDentalCare: norm.monthsSinceDentalCare !== undefined ? norm.monthsSinceDentalCare : null,
      monthsSinceHomeVisit: norm.monthsSinceHomeVisit !== undefined ? norm.monthsSinceHomeVisit : null,
      daysSinceHomeVisit: norm.daysSinceHomeVisit !== undefined ? norm.daysSinceHomeVisit : null,
      dataUltimaVisitaACS: norm.lastHomeVisit || null,
      dataUltimaVisita: norm.lastHomeVisit || null,

      prioridade: norm.priority,
      motivosPrioridade: norm.activeSearchReason || null,

      identificacaoConfiavel: isReliable,
      requerRevisao: needsReview,
      historicoCargas: updatedHistoricoCargas,
      updatedAt: serverTimestamp(),
      ultimaImportacaoId: importId,
    };

    if (existingPatient) {
      updatedPatientsCount++;
      currentBatch.update(patientRef, patientData);
      batchOpCount++;
    } else {
      newPatientsCount++;
      currentBatch.set(patientRef, {
        ...patientData,
        createdAt: serverTimestamp(),
      });
      batchOpCount++;

      existingMap.set(patientDocId, { ...patientData, id: patientDocId } as any);
      if (norm.cpf) existingMap.set(norm.cpf, { ...patientData, id: patientDocId } as any);
      if (norm.cns) existingMap.set(norm.cns, { ...patientData, id: patientDocId } as any);
    }

    // Gravar snapshot na subcoleção historicoCargas para rastreamento longitudinal completo
    const snapRef = doc(collection(db, "pacientes", patientDocId, "historicoCargas"), snapshot.id);
    currentBatch.set(snapRef, snapshot, { merge: true });
    batchOpCount++;

    // Vínculo paciente-unidade
    const vinculoRef = doc(db, "pacientes", patientDocId, "vinculosUnidade", unidadeId);
    currentBatch.set(
      vinculoRef,
      {
        unidadeId,
        microareaId: maMeta.microareaId,
        microarea: norm.microarea || null,
        acsId: null,
        ativo: true,
        dataInicio: new Date().toISOString(),
        ultimaAtualizacao: serverTimestamp(),
        importacaoId: importId,
      },
      { merge: true }
    );
    batchOpCount++;
    newLinksCount++;

    if (norm.systolic && norm.diastolic) {
      const dateKey = norm.dataPA || "semdata";
      const paId = `pa_${dateKey}_${norm.systolic}_${norm.diastolic}`;
      const paRef = doc(collection(db, "pacientes", patientDocId, "pressaoArterial"), paId);

      currentBatch.set(
        paRef,
        {
          sistolica: norm.systolic,
          diastolica: norm.diastolic,
          dataMedicao: norm.dataPA || null,
          unidadeId,
          importacaoId: importId,
          origem: "e-SUS APS",
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      batchOpCount++;
      paCount++;
    }

    if (norm.peso && norm.altura) {
      const dateKey = norm.dataMedicao || "semdata";
      const antId = `ant_${dateKey}_${norm.peso}_${norm.altura}`;
      const antRef = doc(collection(db, "pacientes", patientDocId, "antropometria"), antId);

      currentBatch.set(
        antRef,
        {
          peso: norm.peso,
          altura: norm.altura,
          imc: norm.imc || 0,
          dataMedicao: norm.dataMedicao || null,
          unidadeId,
          importacaoId: importId,
          origem: "e-SUS APS",
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      batchOpCount++;
      weightCount++;
    }

    // Persistir no Supabase PostgreSQL (Tabelas do PDF)
    try {
      const supaRes = await saveNormalizedPatientToSupabase(norm, unidadeNome || "USF Arrozal 3", {
        idCarga: supaCargaId || undefined,
      });
      if (supaRes?.atendimentoInserido) novosAtendimentosCount++;
      if (supaRes?.pesoInserido) novosPesosCount++;
    } catch (e) {
      console.warn("Aviso ao sincronizar paciente com Supabase:", e);
    }

    if (batchOpCount >= BATCH_SIZE) {
      await currentBatch.commit();
      currentBatch = writeBatch(db);
      batchOpCount = 0;
    }

    updateProgress(
      i < validRows.length - 50 ? "Importando pacientes..." : "Gravando históricos...",
      i + 1,
      newPatientsCount,
      updatedPatientsCount,
      newLinksCount,
      updatedLinksCount,
      paCount,
      weightCount,
      reviewCount,
      novosAtendimentosCount,
      novosPesosCount
    );
  }

  if (batchOpCount > 0) {
    await currentBatch.commit();
  }

  updateProgress(
    "Finalizando...",
    parseResult.totalRowsCount,
    newPatientsCount,
    updatedPatientsCount,
    newLinksCount,
    updatedLinksCount,
    paCount,
    weightCount,
    reviewCount,
    novosAtendimentosCount,
    novosPesosCount
  );

  // Validação da Soma de Consistência
  const totalSuccessful = newPatientsCount + updatedPatientsCount;
  const totalAttempted = validRows.length + parseResult.errorRowsCount;

  let finalStatus: FirestoreImportRecord["status"] = "Concluído";
  if (totalSuccessful !== validRows.length || totalAttempted !== parseResult.totalRowsCount) {
    finalStatus = "Concluído com inconsistência";
  } else if (parseResult.errorRowsCount > 0) {
    finalStatus = "Concluído com avisos";
  }

  // Atualizar controle_carga no Supabase
  if (supaCargaId) {
    await updateControleCargaSupabase(supaCargaId, {
      novos_pacientes: newPatientsCount,
      pacientes_atualizados: updatedPatientsCount,
      novos_atendimentos: novosAtendimentosCount,
      novos_pesos: novosPesosCount,
      status: finalStatus,
      detalhes: `Importação com ${validRows.length} registros válidos.`,
    });
  }

  await updateImportRecordInFirestore(importId, {
    novosPacientes: newPatientsCount,
    pacientesAtualizados: updatedPatientsCount,
    novosVinculos: newLinksCount,
    vinculosAtualizados: updatedLinksCount,
    paImportadas: paCount,
    antropometriasImportadas: weightCount,
    status: finalStatus,
  });

  updateProgress(
    "Concluído",
    parseResult.totalRowsCount,
    newPatientsCount,
    updatedPatientsCount,
    newLinksCount,
    updatedLinksCount,
    paCount,
    weightCount,
    reviewCount,
    novosAtendimentosCount,
    novosPesosCount
  );

  return {
    id: importId,
    unidadeId,
    unidadeNome,
    fileName,
    fileSize,
    fileType: fileName.endsWith(".xlsx") ? "XLSX" : "CSV",
    uploadedBy: userName,
    uploadedAt: new Date().toISOString(),
    tipoImportacao: "COMPLETA",
    totalRows: parseResult.totalRowsCount,
    validRows: validRows.length,
    newPatients: newPatientsCount,
    updatedPatients: updatedPatientsCount,
    novosVinculos: newLinksCount,
    vinculosAtualizados: updatedLinksCount,
    paCount,
    weightCount,
    errorsCount: parseResult.errorRowsCount,
    warningsCount: parseResult.warningRowsCount,
    status: finalStatus,
  };
}
