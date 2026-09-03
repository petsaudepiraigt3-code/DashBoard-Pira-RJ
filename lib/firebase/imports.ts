import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";
import { FirestoreImportRecord } from "../esus/types";

export interface CreateImportPayload {
  tipoImportacao?: "TESTE" | "COMPLETA";
  arquivo: string;
  dataImportacao: string;
  usuarioId: string;
  unidadeId: string;
  unidadeNome: string;
  totalRegistros: number;
  novosPacientes: number;
  pacientesAtualizados: number;
  novosVinculos: number;
  vinculosAtualizados: number;
  registrosComAvisos: number;
  erros: number;
  paImportadas: number;
  antropometriasImportadas: number;
  status: "Concluído" | "Concluído com avisos" | "Concluído com inconsistência" | "Falhou";
}

// 1. Criar novo registro de importação vinculado a uma Unidade de Saúde
export async function createImportRecordInFirestore(
  importData: CreateImportPayload
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, "imports"), {
      tipoImportacao: importData.tipoImportacao || "COMPLETA",
      arquivo: importData.arquivo,
      dataImportacao: importData.dataImportacao,
      usuarioId: importData.usuarioId,
      unidadeId: importData.unidadeId,
      unidadeNome: importData.unidadeNome,
      totalRegistros: importData.totalRegistros,
      novosPacientes: importData.novosPacientes,
      pacientesAtualizados: importData.pacientesAtualizados,
      novosVinculos: importData.novosVinculos,
      vinculosAtualizados: importData.vinculosAtualizados,
      registrosComAvisos: importData.registrosComAvisos,
      erros: importData.erros,
      paImportadas: importData.paImportadas,
      antropometriasImportadas: importData.antropometriasImportadas,
      status: importData.status,
      createdAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (err) {
    throw err;
  }
}

// 2. Atualizar registro de importação ao finalizar processamento
export async function updateImportRecordInFirestore(
  importId: string,
  updates: {
    novosPacientes?: number;
    pacientesAtualizados?: number;
    novosVinculos?: number;
    vinculosAtualizados?: number;
    paImportadas?: number;
    antropometriasImportadas?: number;
    status?: "Concluído" | "Concluído com avisos" | "Concluído com inconsistência" | "Falhou";
  }
): Promise<void> {
  try {
    const docRef = doc(db, "imports", importId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Tratar silenciosamente
  }
}

// 3. Buscar histórico de importações do Firestore
export async function getImportHistoryFromFirestore(): Promise<FirestoreImportRecord[]> {
  const history: FirestoreImportRecord[] = [];
  try {
    const q = query(collection(db, "imports"), orderBy("dataImportacao", "desc"), limit(20));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      let tipo: "TESTE" | "COMPLETA" = "COMPLETA";
      if (
        data.tipoImportacao === "TESTE" ||
        data.tipo === "teste" ||
        data.tipo === "teste-5-pacientes" ||
        data.tipo === "teste-1-paciente"
      ) {
        tipo = "TESTE";
      }

      history.push({
        id: docSnap.id,
        unidadeId: data.unidadeId || "unidade-default",
        unidadeNome: data.unidadeNome || "USF Arrozal 3",
        fileName: data.arquivo || "relatorio.csv",
        fileSize: "N/A",
        fileType: data.arquivo?.endsWith(".xlsx") ? "XLSX" : "CSV",
        uploadedBy: data.usuarioId || "Usuário Sistema",
        uploadedAt: data.dataImportacao || data.createdAt || new Date().toISOString(),
        tipoImportacao: tipo,
        totalRows: data.totalRegistros || 0,
        validRows: data.totalRegistros || 0,
        newPatients: data.novosPacientes || 0,
        updatedPatients: data.pacientesAtualizados || 0,
        novosVinculos: data.novosVinculos || 0,
        vinculosAtualizados: data.vinculosAtualizados || 0,
        paCount: data.paImportadas || 0,
        weightCount: data.antropometriasImportadas || 0,
        errorsCount: data.erros || 0,
        warningsCount: data.registrosComAvisos || 0,
        status: data.status || "Concluído",
      });
    });
  } catch (err) {
    // Retorno resiliente
  }
  return history;
}
