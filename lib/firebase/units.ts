import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { Patient } from "@/types/dcnt";

export interface HealthUnit {
  id: string;
  nome: string;
  nomeNormalizado: string;
  codigo: string;
  cnes?: string;
  tipo: string; // ex: "USF" | "UBDS" | "UBS"
  ativo: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export type TipoMicroarea = "NORMAL" | "FORA_AREA" | "NAO_INFORMADA";

export interface MicroareaDoc {
  id: string;
  unidadeId: string;
  codigo: string;
  nome: string;
  acsId: string | null;
  acsNome?: string | null;
  tipoMicroarea: TipoMicroarea;
  ativo: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface UserProfileDoc {
  uid: string;
  nome: string;
  email: string;
  telefone?: string;
  perfil: "ADMIN" | "GERENTE" | "ACS";
  unidadeId?: string;
  microareaIds?: string[];
  authUid?: string | null;
  authAtiva?: boolean;
  ativo: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export type AuditLogType =
  | "ACS_CRIADO"
  | "ACS_ATIVADO"
  | "ACS_DESATIVADO"
  | "MICROAREA_ATRIBUIDA"
  | "MICROAREA_TRANSFERIDA"
  | "MICROAREA_DESVINCULADA";

export interface AuditLogDoc {
  id?: string;
  tipo: AuditLogType;
  usuarioId: string;
  unidadeId: string;
  acsId?: string | null;
  microareaId?: string | null;
  acao: string;
  createdAt: any;
}

// Registro em auditLogs
export async function recordAuditLog(log: Omit<AuditLogDoc, "id" | "createdAt">): Promise<void> {
  try {
    await addDoc(collection(db, "auditLogs"), {
      ...log,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    // Tratar erro silenciosamente
  }
}

// 1. Obter todas as Unidades de Saúde ativas. Se o banco estiver limpo, semeia a unidade inicial padrão.
export async function getAllActiveUnitsFromFirestore(): Promise<HealthUnit[]> {
  const units: HealthUnit[] = [];
  try {
    const q = query(collection(db, "unidades"));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      units.push({ id: docSnap.id, ...docSnap.data() } as HealthUnit);
    });

    if (units.length === 0) {
      const defaultUnits: Omit<HealthUnit, "id">[] = [
        {
          nome: "USF Arrozal 3",
          nomeNormalizado: "USF ARROZAL 3",
          codigo: "USF-003",
          cnes: "1234567",
          tipo: "USF",
          ativo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          nome: "USF Saúde da Família - Central",
          nomeNormalizado: "USF SAUDE DA FAMILIA CENTRAL",
          codigo: "USF-001",
          cnes: "7654321",
          tipo: "USF",
          ativo: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      for (const u of defaultUnits) {
        const uRef = doc(collection(db, "unidades"));
        await setDoc(uRef, u);
        units.push({ id: uRef.id, ...u });
      }
    }
  } catch (err) {
    // Tratar erros
  }
  return units;
}

// 2. Cadastrar nova Unidade de Saúde
export async function createHealthUnit(data: Omit<HealthUnit, "id" | "nomeNormalizado" | "createdAt" | "updatedAt">): Promise<string> {
  const uRef = doc(collection(db, "unidades"));
  const nomeNorm = data.nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  
  await setDoc(uRef, {
    ...data,
    nomeNormalizado: nomeNorm,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return uRef.id;
}

// 3. Atualizar Unidade de Saúde
export async function updateHealthUnit(id: string, updates: Partial<HealthUnit>): Promise<void> {
  const uRef = doc(db, "unidades", id);
  await updateDoc(uRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

// 4. Garantir existência de Microárea na coleção 'microareas'
export async function ensureUnitMicroareaInFirestore(
  unidadeId: string,
  microareaOriginalStr: string
): Promise<{ microareaId: string; codigo: string; tipoMicroarea: TipoMicroarea }> {
  if (!unidadeId || !microareaOriginalStr) {
    return { microareaId: "", codigo: "NAO_INFORMADA", tipoMicroarea: "NAO_INFORMADA" };
  }

  const rawUpper = microareaOriginalStr.trim().toUpperCase();
  let tipoMicroarea: TipoMicroarea = "NORMAL";
  let codigoClean = microareaOriginalStr.replace(/\D/g, "").trim();

  if (rawUpper.includes("FORA") || rawUpper.includes("FORA DA AREA")) {
    tipoMicroarea = "FORA_AREA";
    codigoClean = "FORA_AREA";
  } else if (rawUpper.includes("NAO INFORMADA") || rawUpper.includes("NÃO INFORMADA") || rawUpper === "-" || !codigoClean) {
    tipoMicroarea = "NAO_INFORMADA";
    codigoClean = "NAO_INFORMADA";
  }

  const microareaId = `ma_${unidadeId}_${codigoClean}`;
  const maRef = doc(db, "microareas", microareaId);

  try {
    const maSnap = await getDoc(maRef);
    if (!maSnap.exists()) {
      await setDoc(maRef, {
        unidadeId,
        codigo: codigoClean,
        nome: tipoMicroarea === "NORMAL" ? `Microárea ${codigoClean}` : rawUpper,
        acsId: null,
        acsNome: null,
        tipoMicroarea,
        ativo: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    // Tratar silenciosamente
  }

  return { microareaId, codigo: codigoClean, tipoMicroarea };
}

// 5. Buscar todas as Microáreas de uma Unidade
export async function getMicroareasByUnit(unidadeId: string): Promise<MicroareaDoc[]> {
  const list: MicroareaDoc[] = [];
  try {
    const q = query(collection(db, "microareas"), where("unidadeId", "==", unidadeId));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as MicroareaDoc);
    });

    list.sort((a, b) => {
      if (a.tipoMicroarea !== "NORMAL") return 1;
      if (b.tipoMicroarea !== "NORMAL") return -1;
      return parseInt(a.codigo || "0", 10) - parseInt(b.codigo || "0", 10);
    });
  } catch (err) {
    // Tratar erros
  }
  return list;
}

// 6. Associar ou Transferir ACS a uma Microárea
export async function assignAcsToMicroarea(
  microareaId: string,
  acsId: string | null,
  acsNome?: string | null,
  requesterUid: string = "sistema"
): Promise<{ success: boolean; transferred: boolean; previousAcsId?: string | null }> {
  const maRef = doc(db, "microareas", microareaId);
  const maSnap = await getDoc(maRef);

  if (!maSnap.exists()) {
    throw new Error("Microárea não encontrada.");
  }

  const currentData = maSnap.data() as MicroareaDoc;
  const previousAcsId = currentData.acsId;
  const isTransfer = !!(previousAcsId && previousAcsId !== acsId);

  await updateDoc(maRef, {
    acsId: acsId || null,
    acsNome: acsNome || null,
    updatedAt: serverTimestamp(),
  });

  const logTipo: AuditLogType = isTransfer
    ? "MICROAREA_TRANSFERIDA"
    : acsId
    ? "MICROAREA_ATRIBUIDA"
    : "MICROAREA_DESVINCULADA";

  await recordAuditLog({
    tipo: logTipo,
    usuarioId: requesterUid,
    unidadeId: currentData.unidadeId,
    acsId: acsId || previousAcsId,
    microareaId,
    acao: isTransfer
      ? `Responsabilidade da ${currentData.nome} transferida para ${acsNome || acsId}`
      : acsId
      ? `${currentData.nome} atribuída a ${acsNome || acsId}`
      : `Associação da ${currentData.nome} removida`,
  });

  return { success: true, transferred: isTransfer, previousAcsId };
}

// 7. Buscar todos os Perfis ACS de uma Unidade com desduplicação rigorosa por e-mail
export async function getAcsUsersByUnit(unidadeId: string): Promise<UserProfileDoc[]> {
  const mapByEmail = new Map<string, UserProfileDoc>();
  try {
    const q = query(
      collection(db, "usuarios"),
      where("perfil", "==", "ACS"),
      where("unidadeId", "==", unidadeId)
    );
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      const data = { uid: docSnap.id, ...docSnap.data() } as UserProfileDoc;
      const key = (data.email || docSnap.id).toLowerCase().trim();

      if (!mapByEmail.has(key)) {
        mapByEmail.set(key, data);
      } else {
        const existing = mapByEmail.get(key)!;
        // Prioriza o documento que possui authAtiva === true ou que corresponde ao Auth UID
        if ((data.authAtiva || data.authUid === data.uid) && !existing.authAtiva) {
          mapByEmail.set(key, data);
        }
      }
    });
  } catch (err) {
    // Tratar erro
  }
  return Array.from(mapByEmail.values());
}

// 8. Buscar todos os Perfis de Usuários no Firestore
export async function getAllUserProfilesFromFirestore(): Promise<UserProfileDoc[]> {
  const list: UserProfileDoc[] = [];
  try {
    const q = query(collection(db, "usuarios"));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      list.push({ uid: docSnap.id, ...docSnap.data() } as UserProfileDoc);
    });
  } catch (err) {
    // Tratar erro
  }
  return list;
}

// 9. Criar ou Atualizar Documento de Perfil de Usuário sem duplicar e-mails existentes
export async function createUserProfileDocument(
  data: Omit<UserProfileDoc, "uid" | "createdAt" | "updatedAt"> & { uid?: string }
): Promise<string> {
  const cleanEmail = (data.email || "").toLowerCase().trim();

  // Verificar se já existe um documento com o mesmo e-mail para evitar duplicidade
  if (cleanEmail) {
    const existingQ = query(collection(db, "usuarios"), where("email", "==", cleanEmail));
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingId = existingDoc.id;
      const uRef = doc(db, "usuarios", existingId);
      await updateDoc(uRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      return existingId;
    }
  }

  const docId = data.uid || `user_${Date.now()}`;
  const userRef = doc(db, "usuarios", docId);

  await setDoc(userRef, {
    uid: docId,
    ...data,
    ativo: data.ativo !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (data.perfil === "ACS" && data.unidadeId) {
    await recordAuditLog({
      tipo: "ACS_CRIADO",
      usuarioId: "admin",
      unidadeId: data.unidadeId,
      acsId: docId,
      acao: `Perfil ACS criado para ${data.nome}`,
    });
  }

  return userRef.id;
}

export const createAcsUser = (data: { nome: string; email: string; unidadeId: string; telefone?: string }) =>
  createUserProfileDocument({ ...data, perfil: "ACS", ativo: true });

// 10. Garante Perfil Piloto para "Gerente da USF Arrozal 3"
export async function seedTestManagerProfileForArrozal3(): Promise<void> {
  try {
    const units = await getAllActiveUnitsFromFirestore();
    const arrozal3 = units.find((u) => u.codigo === "USF-003") || units[0];

    const managerRef = doc(db, "usuarios", "gerente-arrozal-3");
    const snap = await getDoc(managerRef);

    if (!snap.exists()) {
      await setDoc(managerRef, {
        uid: "gerente-arrozal-3",
        nome: "Gerente Arrozal 3",
        email: "gerente.arrozal3@usf.gov.br",
        perfil: "GERENTE",
        unidadeId: arrozal3.id,
        ativo: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    // Ignorar
  }
}

// 11. Obter mapa com a contagem real de pacientes por Microárea (derivado de paciente.microarea)
export async function getPatientCountMapByMicroarea(unidadeId: string): Promise<Record<string, number>> {
  const countMap: Record<string, number> = {};
  try {
    const pSnap = await getDocs(collection(db, "pacientes"));
    pSnap.forEach((docSnap) => {
      const d = docSnap.data();
      const uId = d.unidadeId || "USF-003";
      if (uId === unidadeId || !d.unidadeId) {
        const rawMA = d.microarea || "Não informada";
        const codeClean = rawMA.replace(/\D/g, "").trim() || "NAO_INFORMADA";
        countMap[codeClean] = (countMap[codeClean] || 0) + 1;
      }
    });
  } catch (err) {
    // Tratar silenciosamente
  }
  return countMap;
}

// 12. Migração Segura: Vincular pacientes existentes às novas entidades de Microárea
export async function migrateExistingPatientsMicroareaLinks(): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  try {
    const units = await getAllActiveUnitsFromFirestore();
    const defaultUnitId = units.length > 0 ? units[0].id : "USF-003";

    const pSnap = await getDocs(collection(db, "pacientes"));
    for (const pDoc of pSnap.docs) {
      const data = pDoc.data();
      const rawMA = data.microarea || data.microareaOriginal || "Não informada";

      const { microareaId, codigo } = await ensureUnitMicroareaInFirestore(
        data.unidadeId || defaultUnitId,
        rawMA
      );

      const pRef = doc(db, "pacientes", pDoc.id);
      await updateDoc(pRef, {
        unidadeId: data.unidadeId || defaultUnitId,
        microareaId,
        microareaCodigo: codigo,
        microareaOriginal: rawMA,
        updatedAt: serverTimestamp(),
      });
      updatedCount++;
    }
  } catch (err) {
    // Tratar silenciosamente
  }
  return { updatedCount };
}

// 13. Diagnóstico Administrativo Completo da Unidade
export async function getUnitAdministrativeDiagnostics(unidadeId: string) {
  const microareas = await getMicroareasByUnit(unidadeId);
  const acsUsers = await getAcsUsersByUnit(unidadeId);
  const countMap = await getPatientCountMapByMicroarea(unidadeId);

  let totalPatients = 0;
  let semMicroarea = 0;
  let foraArea = 0;

  try {
    const pSnap = await getDocs(collection(db, "pacientes"));
    pSnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d.unidadeId === unidadeId || !d.unidadeId) {
        totalPatients++;
        const maUpper = (d.microarea || "").toUpperCase();
        if (maUpper.includes("FORA")) foraArea++;
        if (maUpper.includes("NAO INFORMADA") || maUpper === "-" || !d.microarea) semMicroarea++;
      }
    });
  } catch (err) {
    // Ignorar
  }

  const semACS = microareas.filter((m) => !m.acsId && m.tipoMicroarea === "NORMAL").length;

  return {
    unidadeId,
    totalMicroareas: microareas.length,
    microareasSemACS: semACS,
    totalACS: acsUsers.length,
    totalPacientes: totalPatients,
    pacientesSemMicroarea: semMicroarea,
    pacientesForaArea: foraArea,
    patientCountMap: countMap,
  };
}
