import { Patient, PatientActionRecord } from "@/types/dcnt";

export interface PendingReturnItem {
  patient: Patient;
  actionId: string;
  actionType: string;
  actionDate: string; // YYYY-MM-DD
  returnDate: string; // YYYY-MM-DD
  status: "Atrasado" | "Hoje" | "Agendado";
}

/**
 * Extrai e normaliza dataAcao e createdAt de um registro de ação.
 */
export function getActionDateTime(act: PatientActionRecord): { date: string; created: string } {
  const date = (act.dataAcao || "").substring(0, 10);
  let created = "";
  if (act.createdAt) {
    if (typeof act.createdAt === "string") {
      created = act.createdAt;
    } else if (typeof act.createdAt === "number") {
      created = new Date(act.createdAt).toISOString();
    } else if (typeof act.createdAt === "object" && typeof (act.createdAt as any).toDate === "function") {
      created = (act.createdAt as any).toDate().toISOString();
    } else if (typeof act.createdAt === "object" && typeof (act.createdAt as any).seconds === "number") {
      created = new Date((act.createdAt as any).seconds * 1000).toISOString();
    }
  }
  return { date, created };
}

/**
 * Comparador cronológico estrito para Ações Operacionais (Ordem Cronológica Direta: Mais Antiga -> Mais Recente):
 * 1º dataAcao ASC
 * 2º createdAt / timestamp de criação ASC
 * 3º id ASC (fallback seguro)
 */
export function compareActionsChronological(a: PatientActionRecord, b: PatientActionRecord): number {
  const dtA = getActionDateTime(a);
  const dtB = getActionDateTime(b);

  if (dtA.date !== dtB.date) {
    return dtA.date.localeCompare(dtB.date);
  }

  if (dtA.created !== dtB.created) {
    return dtA.created.localeCompare(dtB.created);
  }

  return (a.id || "").localeCompare(b.id || "");
}

/**
 * Retorna a data local atual formatada em YYYY-MM-DD sem problemas de fuso horário/timezone (offset UTC).
 */
export function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Computa o Próximo Retorno Ativo para um determinado paciente,
 * analisando a sequência cronológica real de seu histórico de ações registradas.
 * Aceita overrideTodayStr para testes unitários com datas simuladas.
 */
export function computeActiveReturnForPatient(
  p: Patient,
  overrideTodayStr?: string
): PendingReturnItem | null {
  const historico = p.historicoAcoes || [];
  if (!historico || historico.length === 0) return null;

  // Ordena todas as ações cronologicamente (da mais antiga para a mais recente)
  // 1º dataAcao ASC, 2º createdAt ASC
  const sorted = [...historico].sort(compareActionsChronological);

  let active: {
    actionId: string;
    actionType: string;
    actionDate: string;
    returnDate: string;
  } | null = null;

  for (const act of sorted) {
    const returnDateStr = act.proximoRetorno ? act.proximoRetorno.trim().substring(0, 10) : "";
    if (returnDateStr) {
      active = {
        actionId: act.id,
        actionType: act.tipoAcao,
        actionDate: (act.dataAcao || "").substring(0, 10),
        returnDate: returnDateStr,
      };
    } else {
      // Regra 5: Se existir uma ação posterior ou mais recente na sequência de eventos que NÃO possua
      // uma nova previsão de retorno, considerar a pendência anterior concluída/encerrada.
      active = null;
    }
  }

  if (!active) return null;

  // Classificação Temporal dinâmica em relação à data atual (ou data simulada para testes)
  const todayStr = overrideTodayStr || getTodayString();

  let status: "Atrasado" | "Hoje" | "Agendado";
  if (active.returnDate < todayStr) {
    status = "Atrasado";
  } else if (active.returnDate === todayStr) {
    status = "Hoje";
  } else {
    status = "Agendado";
  }

  return {
    patient: p,
    actionId: active.actionId,
    actionType: active.actionType,
    actionDate: active.actionDate,
    returnDate: active.returnDate,
    status,
  };
}

/**
 * Obtém a lista de pendências de retorno de uma lista de pacientes,
 * ordenadas por prioridade: Atrasados -> Hoje -> Agendados (e dentro de cada grupo pela data de retorno mais antiga).
 * Aceita overrideTodayStr para testes unitários com datas simuladas.
 */
export function getSortedPendingReturns(
  patients: Patient[],
  overrideTodayStr?: string
): PendingReturnItem[] {
  const pending: PendingReturnItem[] = [];

  for (const p of patients) {
    const item = computeActiveReturnForPatient(p, overrideTodayStr);
    if (item) {
      pending.push(item);
    }
  }

  // Ordenação prioritária:
  // 1. Atrasados
  // 2. Hoje
  // 3. Agendados
  // Dentro de cada grupo, ordenar por returnDate (mais antiga primeiro)
  const statusRank: Record<string, number> = {
    Atrasado: 1,
    Hoje: 2,
    Agendado: 3,
  };

  pending.sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    return a.returnDate.localeCompare(b.returnDate);
  });

  return pending;
}
