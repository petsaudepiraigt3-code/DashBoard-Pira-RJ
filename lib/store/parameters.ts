import { db, doc, getDoc, setDoc } from "@/lib/store/documents";
import { DcntParameters } from "@/types/dcnt";

export const DEFAULT_DCNT_PARAMETERS: DcntParameters = {
  monthsWithoutPA: 6,
  monthsWithoutVisit: 3,
  monthsWithoutMedicalCare: 6,
  elderlyAgeCutoff: 60,
  childUnder2AgeCutoff: 2,
  childUnder2HighPriority: true,
  obesityImcCutoff: 30,
  overweightImcCutoff: 25,
  systolicAlteradaCutoff: 140,
  diastolicAlteradaCutoff: 90,
  priorityWeights: {
    alteredPA: 4,
    outdatedPA: 2,
    outdatedVisit: 2,
    elderly: 1,
    childUnder2: 6,
    obesity: 1,
    multipleConditions: 2,
  },
  priorityCutoffs: {
    high: 6,
    medium: 3,
    attention: 1,
  },
};

const COLLECTION_NAME = "parametros";
const DOCUMENT_ID = "dcnt";
const FALLBACK_COLLECTION = "diagnostico";
const FALLBACK_DOCUMENT_ID = "parametros-dcnt";

function normalizeParameters(data: Partial<DcntParameters>): DcntParameters {
  return {
    monthsWithoutPA: Number(data.monthsWithoutPA ?? DEFAULT_DCNT_PARAMETERS.monthsWithoutPA),
    monthsWithoutVisit: Number(data.monthsWithoutVisit ?? DEFAULT_DCNT_PARAMETERS.monthsWithoutVisit),
    monthsWithoutMedicalCare: Number(
      data.monthsWithoutMedicalCare ?? DEFAULT_DCNT_PARAMETERS.monthsWithoutMedicalCare
    ),
    elderlyAgeCutoff: Number(data.elderlyAgeCutoff ?? DEFAULT_DCNT_PARAMETERS.elderlyAgeCutoff),
    childUnder2AgeCutoff: Number(
      data.childUnder2AgeCutoff ?? DEFAULT_DCNT_PARAMETERS.childUnder2AgeCutoff ?? 2
    ),
    childUnder2HighPriority: Boolean(
      data.childUnder2HighPriority ?? DEFAULT_DCNT_PARAMETERS.childUnder2HighPriority ?? true
    ),
    obesityImcCutoff: Number(data.obesityImcCutoff ?? DEFAULT_DCNT_PARAMETERS.obesityImcCutoff),
    overweightImcCutoff: Number(data.overweightImcCutoff ?? DEFAULT_DCNT_PARAMETERS.overweightImcCutoff),
    systolicAlteradaCutoff: Number(
      data.systolicAlteradaCutoff ?? DEFAULT_DCNT_PARAMETERS.systolicAlteradaCutoff
    ),
    diastolicAlteradaCutoff: Number(
      data.diastolicAlteradaCutoff ?? DEFAULT_DCNT_PARAMETERS.diastolicAlteradaCutoff
    ),
    priorityWeights: {
      alteredPA: Number(
        data.priorityWeights?.alteredPA ?? DEFAULT_DCNT_PARAMETERS.priorityWeights.alteredPA
      ),
      outdatedPA: Number(
        data.priorityWeights?.outdatedPA ?? DEFAULT_DCNT_PARAMETERS.priorityWeights.outdatedPA
      ),
      outdatedVisit: Number(
        data.priorityWeights?.outdatedVisit ?? DEFAULT_DCNT_PARAMETERS.priorityWeights.outdatedVisit
      ),
      elderly: Number(
        data.priorityWeights?.elderly ?? DEFAULT_DCNT_PARAMETERS.priorityWeights.elderly
      ),
      childUnder2: Number(
        data.priorityWeights?.childUnder2 ?? DEFAULT_DCNT_PARAMETERS.priorityWeights.childUnder2 ?? 6
      ),
      obesity: Number(
        data.priorityWeights?.obesity ?? DEFAULT_DCNT_PARAMETERS.priorityWeights.obesity
      ),
      multipleConditions: Number(
        data.priorityWeights?.multipleConditions ??
          DEFAULT_DCNT_PARAMETERS.priorityWeights.multipleConditions
      ),
    },
    priorityCutoffs: {
      high: Number(
        data.priorityCutoffs?.high ?? DEFAULT_DCNT_PARAMETERS.priorityCutoffs!.high
      ),
      medium: Number(
        data.priorityCutoffs?.medium ?? DEFAULT_DCNT_PARAMETERS.priorityCutoffs!.medium
      ),
      attention: Number(
        data.priorityCutoffs?.attention ?? DEFAULT_DCNT_PARAMETERS.priorityCutoffs!.attention
      ),
    },
  };
}

export async function getDcntParametersFromStore(): Promise<DcntParameters> {
  try {
    const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return normalizeParameters(snap.data() as Partial<DcntParameters>);
    }
  } catch {
    // Tentar fallback compatível com schema anterior se a policy de 'parametros' ainda não tiver sido aplicada
  }

  try {
    const fallbackRef = doc(db, FALLBACK_COLLECTION, FALLBACK_DOCUMENT_ID);
    const fallbackSnap = await getDoc(fallbackRef);
    if (fallbackSnap.exists()) {
      return normalizeParameters(fallbackSnap.data() as Partial<DcntParameters>);
    }
  } catch {
    // Ignorar e retornar padrão
  }

  return DEFAULT_DCNT_PARAMETERS;
}

export async function saveDcntParametersInStore(params: DcntParameters): Promise<void> {
  const payload = {
    ...params,
    updatedAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, COLLECTION_NAME, DOCUMENT_ID);
    await setDoc(docRef, payload, { merge: true });
    return;
  } catch {
    // Fallback automático para 'diagnostico/parametros-dcnt' caso o SQL novo ainda não tenha sido aplicado no Supabase
    const fallbackRef = doc(db, FALLBACK_COLLECTION, FALLBACK_DOCUMENT_ID);
    await setDoc(fallbackRef, payload, { merge: true });
  }
}
