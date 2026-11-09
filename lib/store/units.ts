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
} from "@/lib/store/documents";
import { db } from "@/lib/store/documents";
import { Patient } from "@/types/dcnt";

export interface HealthUnit {
  id: string;
  nome: string;
  nomeNormalizado: string;
  codigo: string;
  cnes?: string;
  tipo: string; // ex: "USF" | "UBDS" | "UBS"
  municipio?: string;
  responsavelNome?: string;
  responsavelCargo?: string;
  gerenteId?: string | null;
  gerenteNome?: string | null;
  gerenteEmail?: string | null;
  ativo: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export function normalizeUnitId(unitId?: string | null): string {
  const clean = (unitId || "").trim();
  if (!clean) return "USF-003";
  const upper = clean.toUpperCase();
  if (
    upper === "USF-003" ||
    upper === "USF ARROZAL 3" ||
    upper === "ARROZAL" ||
    upper === "USF ARROZAL" ||
    upper === "UNIDADE DE SAUDE ARROZAL"
  ) {
    return "USF-003";
  }
  return clean;
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

// 1. Obter todas as Unidades de Saúde ativas com normalização e suporte a múltiplas unidades
export async function getAllActiveUnitsFromStore(): Promise<HealthUnit[]> {
  const rows = await getDocs(collection(db, "unidades"));
  const unitMap = new Map<string, HealthUnit>();

  rows.docs.forEach((row) => {
    const data = row.data() as Partial<HealthUnit>;
    const rawId = row.id || data.id || data.codigo || "";
    const normId = normalizeUnitId(rawId);
    const unit: HealthUnit = {
      id: normId,
      codigo: normId,
      nome: data.nome || `Unidade ${normId}`,
      nomeNormalizado:
        data.nomeNormalizado ||
        (data.nome || normId)
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim(),
      tipo: data.tipo || "USF",
      municipio: data.municipio || "Piraí",
      responsavelNome: data.responsavelNome || data.gerenteNome || undefined,
      responsavelCargo: data.responsavelCargo || (data.gerenteNome ? "Gerente de Unidade" : undefined),
      gerenteId: data.gerenteId || null,
      gerenteNome: data.gerenteNome || null,
      gerenteEmail: data.gerenteEmail || null,
      cnes: data.cnes || undefined,
      ativo: data.ativo !== false,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };

    if (unit.ativo) {
      if (!unitMap.has(normId) || (data.gerenteNome && !unitMap.get(normId)?.gerenteNome)) {
        unitMap.set(normId, unit);
      }
    }
  });

  if (unitMap.size === 0) {
    unitMap.set("USF-003", {
      id: "USF-003",
      codigo: "USF-003",
      nome: "USF Arrozal 3",
      nomeNormalizado: "USF ARROZAL 3",
      tipo: "USF",
      municipio: "Piraí (Arrozal)",
      responsavelNome: "Gerente Arrozal",
      responsavelCargo: "Gerente de Unidade",
      ativo: true,
    });
  }

  return Array.from(unitMap.values());
}

// 2. Cadastrar nova Unidade de Saúde usando o código como ID do documento
export async function createHealthUnit(
  data: Omit<HealthUnit, "id" | "nomeNormalizado" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<string> {
  const rawCodigo = data.codigo || data.id || data.nome || "";
  const cleanCodigo = normalizeUnitId(rawCodigo);
  const uRef = doc(db, "unidades", cleanCodigo);
  const nomeNorm = (data.nome || cleanCodigo)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  await setDoc(
    uRef,
    {
      ...data,
      id: cleanCodigo,
      codigo: cleanCodigo,
      nomeNormalizado: nomeNorm,
      municipio: data.municipio || "Piraí",
      tipo: data.tipo || "USF",
      ativo: data.ativo !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return cleanCodigo;
}

// 3. Atualizar Unidade de Saúde
export async function updateHealthUnit(id: string, updates: Partial<HealthUnit>): Promise<void> {
  const cleanId = normalizeUnitId(id);
  const uRef = doc(db, "unidades", cleanId);
  const payload: any = {
    ...updates,
    updatedAt: serverTimestamp(),
  };
  if (updates.nome) {
    payload.nomeNormalizado = updates.nome
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }
  if (updates.codigo) {
    payload.codigo = normalizeUnitId(updates.codigo);
  }
  await updateDoc(uRef, payload);
}

// 4. Garantir existência de Microárea na coleção 'microareas'
export async function ensureUnitMicroareaInStore(
  unidadeId: string,
  microareaOriginalStr: string
): Promise<{ microareaId: string; codigo: string; tipoMicroarea: TipoMicroarea }> {
  const normUnitId = normalizeUnitId(unidadeId);
  if (!normUnitId || !microareaOriginalStr) {
    return { microareaId: "", codigo: "NAO_INFORMADA", tipoMicroarea: "NAO_INFORMADA" };
  }

  const rawUpper = microareaOriginalStr.trim().toUpperCase();
  let tipoMicroarea: TipoMicroarea = "NORMAL";
  let codigoClean = microareaOriginalStr.replace(/\D/g, "").trim();

  if (rawUpper.includes("FORA") || rawUpper.includes("FORA DA AREA")) {
    tipoMicroarea = "FORA_AREA";
    codigoClean = "FORA_AREA";
  } else if (
    rawUpper.includes("NAO INFORMADA") ||
    rawUpper.includes("NÃO INFORMADA") ||
    rawUpper === "-" ||
    !codigoClean
  ) {
    tipoMicroarea = "NAO_INFORMADA";
    codigoClean = "NAO_INFORMADA";
  } else {
    codigoClean = codigoClean.padStart(2, "0");
  }

  const microareaId = `ma_${normUnitId}_${codigoClean}`;
  const maRef = doc(db, "microareas", microareaId);

  try {
    const maSnap = await getDoc(maRef);
    if (!maSnap.exists()) {
      await setDoc(maRef, {
        id: microareaId,
        unidadeId: normUnitId,
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
    throw err;
  }

  return { microareaId, codigo: codigoClean, tipoMicroarea };
}

// 5. Buscar todas as Microáreas de uma Unidade com desduplicação
export async function getMicroareasByUnit(unidadeId: string): Promise<MicroareaDoc[]> {
  const normUnitId = normalizeUnitId(unidadeId);
  const maMap = new Map<string, MicroareaDoc>();

  try {
    const querySnapshot = await getDocs(collection(db, "microareas"));

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as Partial<MicroareaDoc>;
      const rawUnit = data.unidadeId || (docSnap.id.startsWith("ma_") ? docSnap.id.split("_")[1] : "");
      const docUnitId = normalizeUnitId(rawUnit);
      if (docUnitId !== normUnitId) return;

      const digits = (data.codigo || "").replace(/\D/g, "").trim();
      const cleanCode = digits ? digits.padStart(2, "0") : data.codigo || docSnap.id;
      const tipo =
        data.tipoMicroarea ||
        (cleanCode.includes("FORA")
          ? "FORA_AREA"
          : cleanCode.includes("NAO")
          ? "NAO_INFORMADA"
          : "NORMAL");

      const docItem: MicroareaDoc = {
        id: docSnap.id,
        unidadeId: normUnitId,
        codigo: cleanCode,
        nome: data.nome || (tipo === "NORMAL" ? `Microárea ${cleanCode}` : String(cleanCode)),
        acsId: data.acsId || null,
        acsNome: data.acsNome || null,
        tipoMicroarea: tipo as TipoMicroarea,
        ativo: data.ativo !== false,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };

      const existing = maMap.get(cleanCode);
      if (!existing) {
        maMap.set(cleanCode, docItem);
      } else {
        // Prioriza documento canônico (ma_...) ou que já possua ACS atribuído
        if (
          (!existing.acsId && docItem.acsId) ||
          (docSnap.id.startsWith("ma_") && !existing.id.startsWith("ma_"))
        ) {
          maMap.set(cleanCode, docItem);
        }
      }
    });
  } catch (err) {
    // Tratar erros
  }

  const list = Array.from(maMap.values());
  list.sort((a, b) => {
    if (a.tipoMicroarea !== "NORMAL") return 1;
    if (b.tipoMicroarea !== "NORMAL") return -1;
    return parseInt(a.codigo || "0", 10) - parseInt(b.codigo || "0", 10);
  });
  return list;
}

// 6. Associar ou Transferir ACS a uma Microárea com sincronização
export async function assignAcsToMicroarea(
  microareaId: string,
  acsId: string | null,
  acsNome?: string | null,
  requesterUid: string = "sistema"
): Promise<{ success: boolean; transferred: boolean; previousAcsId?: string | null }> {
  let maRef = doc(db, "microareas", microareaId);
  let maSnap = await getDoc(maRef);

  // Fallback caso seja passado o código puro (ex: "56") ou chave sem ma_
  if (!maSnap.exists()) {
    const allSnapshot = await getDocs(collection(db, "microareas"));
    const found = allSnapshot.docs.find(
      (d) =>
        d.id === microareaId ||
        d.data().codigo === microareaId ||
        d.id.endsWith(`_${microareaId.padStart(2, "0")}`)
    );
    if (found) {
      maRef = doc(db, "microareas", found.id);
      maSnap = await getDoc(maRef);
    }
  }

  if (!maSnap.exists()) {
    throw new Error(`Microárea '${microareaId}' não encontrada.`);
  }

  const currentData = maSnap.data() as MicroareaDoc;
  const normUnitId = normalizeUnitId(currentData.unidadeId);
  const previousAcsId = currentData.acsId;
  const isTransfer = !!(previousAcsId && previousAcsId !== acsId);

  await updateDoc(maRef, {
    unidadeId: normUnitId,
    acsId: acsId || null,
    acsNome: acsNome || null,
    updatedAt: serverTimestamp(),
  });

  // Sincronizar microareaIds no documento do usuário ACS
  if (acsId) {
    try {
      const userRef = doc(db, "usuarios", acsId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const uData = userSnap.data();
        const existingMAs: string[] = Array.isArray(uData.microareaIds) ? uData.microareaIds : [];
        const maCode = currentData.codigo || microareaId;
        if (!existingMAs.includes(maCode) && !existingMAs.includes(maRef.id)) {
          await updateDoc(userRef, {
            microareaIds: [...existingMAs, maCode],
            unidadeId: normUnitId,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch {
      // Ignorar se coleção usuarios não estiver acessível
    }
  }

  // Se for transferência e havia ACS anterior, desvincular do usuário anterior
  if (previousAcsId && previousAcsId !== acsId) {
    try {
      const prevUserRef = doc(db, "usuarios", previousAcsId);
      const prevUserSnap = await getDoc(prevUserRef);
      if (prevUserSnap.exists()) {
        const prevData = prevUserSnap.data();
        const prevMAs: string[] = Array.isArray(prevData.microareaIds) ? prevData.microareaIds : [];
        const maCode = currentData.codigo || microareaId;
        const filteredMAs = prevMAs.filter((c) => c !== maCode && c !== maRef.id);
        await updateDoc(prevUserRef, {
          microareaIds: filteredMAs,
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Ignorar
    }
  }

  const logTipo: AuditLogType = isTransfer
    ? "MICROAREA_TRANSFERIDA"
    : acsId
    ? "MICROAREA_ATRIBUIDA"
    : "MICROAREA_DESVINCULADA";

  await recordAuditLog({
    tipo: logTipo,
    usuarioId: requesterUid,
    unidadeId: normUnitId,
    acsId: acsId || previousAcsId,
    microareaId: maRef.id,
    acao: isTransfer
      ? `Responsabilidade da ${currentData.nome} transferida para ${acsNome || acsId}`
      : acsId
      ? `${currentData.nome} atribuída a ${acsNome || acsId}`
      : `Associação da ${currentData.nome} removida`,
  });

  return { success: true, transferred: isTransfer, previousAcsId };
}

// 7. Buscar todos os Perfis ACS de uma Unidade com desduplicação rigorosa por e-mail e UID
export async function getAcsUsersByUnit(unidadeId: string): Promise<UserProfileDoc[]> {
  const normUnitId = normalizeUnitId(unidadeId);
  const mapByEmail = new Map<string, UserProfileDoc>();

  try {
    const q = query(collection(db, "usuarios"), where("perfil", "==", "ACS"));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      const raw = docSnap.data();
      const userUnit = normalizeUnitId(raw.unidadeId);
      if (userUnit !== normUnitId) return;

      const data = {
        ...raw,
        unidadeId: normUnitId,
        uid: raw.authUid || docSnap.id,
      } as UserProfileDoc;
      const key = (data.email || docSnap.id).toLowerCase().trim();

      if (!mapByEmail.has(key)) {
        mapByEmail.set(key, data);
      } else {
        const existing = mapByEmail.get(key)!;
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

// 8. Buscar todos os Perfis de Usuários no Store
export async function getAllUserProfilesFromStore(): Promise<UserProfileDoc[]> {
  const list: UserProfileDoc[] = [];
  try {
    const q = query(collection(db, "usuarios"));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((docSnap) => {
      const raw = docSnap.data();
      list.push({
        uid: docSnap.id,
        ...raw,
        unidadeId: raw.unidadeId ? normalizeUnitId(raw.unidadeId) : undefined,
      } as UserProfileDoc);
    });
  } catch (err) {
    // Tratar erro
  }
  return list;
}

// 9. Criar ou Atualizar Documento de Perfil de Usuário com normalização de unidade
export async function createUserProfileDocument(
  data: Omit<UserProfileDoc, "uid" | "createdAt" | "updatedAt"> & { uid?: string }
): Promise<string> {
  const cleanEmail = (data.email || "").toLowerCase().trim();
  const normUnitId = data.unidadeId ? normalizeUnitId(data.unidadeId) : undefined;
  const docData = {
    ...data,
    ...(normUnitId ? { unidadeId: normUnitId } : {}),
  };

  // Verificar se já existe um documento com o mesmo e-mail para evitar duplicidade
  if (cleanEmail) {
    const existingQ = query(collection(db, "usuarios"), where("email", "==", cleanEmail));
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingId = existingDoc.id;
      const uRef = doc(db, "usuarios", existingId);
      await updateDoc(uRef, {
        ...docData,
        updatedAt: serverTimestamp(),
      });
      return existingId;
    }
  }

  const docId = data.uid || `user_${Date.now()}`;
  const userRef = doc(db, "usuarios", docId);

  await setDoc(userRef, {
    uid: docId,
    ...docData,
    ativo: data.ativo !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (data.perfil === "ACS" && normUnitId) {
    await recordAuditLog({
      tipo: "ACS_CRIADO",
      usuarioId: "admin",
      unidadeId: normUnitId,
      acsId: docId,
      acao: `Perfil ACS criado para ${data.nome}`,
    });
  }

  return userRef.id;
}

export const createAcsUser = (data: { nome: string; email: string; unidadeId: string; telefone?: string }) =>
  createUserProfileDocument({ ...data, perfil: "ACS", ativo: true });

// 11. Obter mapa com a contagem real de pacientes por Microárea (derivado de paciente.microarea)
export async function getPatientCountMapByMicroarea(unidadeId: string): Promise<Record<string, number>> {
  const normUnitId = normalizeUnitId(unidadeId);
  const countMap: Record<string, number> = {};
  try {
    const pSnap = await getDocs(collection(db, "pacientes"));
    pSnap.forEach((docSnap) => {
      const d = docSnap.data();
      const patUnit = normalizeUnitId(d.unidadeId);
      if (patUnit === normUnitId) {
        const rawMA = d.microarea || "Não informada";
        const digits = rawMA.replace(/\D/g, "").trim();
        const codeClean = digits ? digits.padStart(2, "0") : "NAO_INFORMADA";
        countMap[codeClean] = (countMap[codeClean] || 0) + 1;
        if (digits && digits !== codeClean) {
          countMap[digits] = countMap[codeClean];
        }
      }
    });
  } catch (err) {
    throw err;
  }
  return countMap;
}

// 12. Migração Segura: Vincular pacientes existentes às novas entidades de Microárea
export async function migrateExistingPatientsMicroareaLinks(): Promise<{ updatedCount: number }> {
  let updatedCount = 0;
  try {
    const units = await getAllActiveUnitsFromStore();
    const defaultUnitId = units.length > 0 ? units[0].id : "USF-003";

    const pSnap = await getDocs(collection(db, "pacientes"));
    for (const pDoc of pSnap.docs) {
      const data = pDoc.data();
      const rawMA = data.microarea || data.microareaOriginal || "Não informada";
      const normUnit = normalizeUnitId(data.unidadeId || defaultUnitId);

      const { microareaId, codigo } = await ensureUnitMicroareaInStore(
        normUnit,
        rawMA
      );

      const pRef = doc(db, "pacientes", pDoc.id);
      await updateDoc(pRef, {
        unidadeId: normUnit,
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
  const normUnitId = normalizeUnitId(unidadeId);
  const microareas = await getMicroareasByUnit(normUnitId);
  const acsUsers = await getAcsUsersByUnit(normUnitId);
  const countMap = await getPatientCountMapByMicroarea(normUnitId);

  let totalPatients = 0;
  let semMicroarea = 0;
  let foraArea = 0;

  try {
    const pSnap = await getDocs(collection(db, "pacientes"));
    pSnap.forEach((docSnap) => {
      const d = docSnap.data();
      const patUnit = normalizeUnitId(d.unidadeId);
      if (patUnit === normUnitId) {
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
    unidadeId: normUnitId,
    totalMicroareas: microareas.length,
    microareasSemACS: semACS,
    totalACS: acsUsers.length,
    totalPacientes: totalPatients,
    pacientesSemMicroarea: semMicroarea,
    pacientesForaArea: foraArea,
    patientCountMap: countMap,
  };
}
