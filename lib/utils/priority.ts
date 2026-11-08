import { Patient, PriorityLevel, PatientActionRecord, DcntParameters } from "@/types/dcnt";
import { DEFAULT_DCNT_PARAMETERS } from "@/lib/store/parameters";

/**
 * Interface para os fatores de entrada da pontuação administrativa de Busca Ativa.
 * Regra idêntica à do validador e-SUS APS.
 */
export interface AdminPriorityInput {
  systolic?: number | null;
  diastolic?: number | null;
  dataPA?: string | null;
  monthsSinceHomeVisit?: number | null;
  lastHomeVisit?: string | null;
  isElderly: boolean;
  isObese: boolean;
}

/**
 * Item estruturado de fator contribuinte para a classificação de prioridade.
 */
export interface PriorityContributingFactor {
  id: string;
  title: string;
  description: string;
  source: "e-SUS APS" | "DCNT Saúde";
  scoreContribution?: number;
}

/**
 * Resultado completo da avaliação de prioridade administrativa.
 */
export interface AdminPriorityResult {
  priority: "Alta" | "Média" | "Atenção" | "Acompanhado";
  score: number;
  reason: string;
  contributingFactors: PriorityContributingFactor[];
}

/**
 * Objeto estruturado para exibição da explicação da classificação no prontuário.
 */
export interface PriorityExplanation {
  priority: PriorityLevel;
  title: string;
  intro: string;
  badgeVariant: "red" | "amber" | "blue" | "emerald";
  score: number;
  contributingFactors: PriorityContributingFactor[];
  disclaimer: string;
}

/**
 * Calcula a diferença em meses entre uma data ISO e a data atual de referência.
 * Função utilitária mantida idêntica à lógica do validador e-SUS.
 */
export function monthsSinceDate(dateIsoStr?: string | null): number {
  if (!dateIsoStr) return 999;
  const past = new Date(dateIsoStr);
  const now = new Date();
  if (isNaN(past.getTime())) return 999;
  const diffTime = Math.abs(now.getTime() - past.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 30);
}

/**
 * REGRA CENTRAL DE PRIORIDADE ADMINISTRATIVA DA BUSCA ATIVA
 * Esta é a ÚNICA fonte de verdade para a classificação dos pacientes no sistema.
 * 
 * Critérios:
 * 1. PA Alterada (Sistólica >= 140 mmHg OU Diastólica >= 90 mmHg):
 *    - Acrescenta +4 pontos e define isoladamente isPaElevated = true.
 * 2. Aferição de PA desatualizada (> 6 meses):
 *    - Acrescenta +2 pontos.
 * 3. Visita domiciliar ACS desatualizada (> 3 meses):
 *    - Acrescenta +2 pontos.
 * 4. Idoso (idade >= 60 anos):
 *    - Acrescenta +1 ponto.
 * 5. Obesidade (IMC >= 30 kg/m²):
 *    - Acrescenta +1 ponto.
 * 
 * Definição dos níveis de prioridade:
 * - Alta Prioridade: isPaElevated === true OU score >= 6 pontos
 * - Média Prioridade: score >= 3 pontos (e não classificado como Alta)
 * - Atenção: score >= 1 ponto (e não classificado como Média ou Alta)
 * - Acompanhado: score === 0 pontos (todos os indicadores dentro do esperado)
 */
export function calculateAdminPriorityScore(
  record: AdminPriorityInput,
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS
): AdminPriorityResult {
  let score = 0;
  const reasons: string[] = [];
  const contributingFactors: PriorityContributingFactor[] = [];
  let isPaElevated = false;

  const sysCutoff = params.systolicAlteradaCutoff ?? 140;
  const diaCutoff = params.diastolicAlteradaCutoff ?? 90;
  const monthsPACutoff = params.monthsWithoutPA ?? 6;
  const monthsVisitCutoff = params.monthsWithoutVisit ?? 3;
  const elderlyCutoff = params.elderlyAgeCutoff ?? 60;
  const obesityCutoff = params.obesityImcCutoff ?? 30;

  const wAlteredPA = params.priorityWeights?.alteredPA ?? 4;
  const wOutdatedPA = params.priorityWeights?.outdatedPA ?? 2;
  const wOutdatedVisit = params.priorityWeights?.outdatedVisit ?? 2;
  const wElderly = params.priorityWeights?.elderly ?? 1;
  const wObesity = params.priorityWeights?.obesity ?? 1;

  const highCutoff = params.priorityCutoffs?.high ?? 6;
  const mediumCutoff = params.priorityCutoffs?.medium ?? 3;
  const attentionCutoff = params.priorityCutoffs?.attention ?? 1;

  // 1. Pressão Arterial Aferida
  if (record.systolic && record.diastolic) {
    if (record.systolic >= sysCutoff || record.diastolic >= diaCutoff) {
      isPaElevated = true;
      score += wAlteredPA;
      const desc = `PA >= ${sysCutoff}/${diaCutoff} mmHg (${record.systolic}/${record.diastolic} mmHg - Parâmetro de Busca Ativa)`;
      reasons.push(desc);
      contributingFactors.push({
        id: "PA_ELEVADA",
        title: `PA Alterada: ${record.systolic}/${record.diastolic} mmHg`,
        description: `Pressão arterial registrada em ${record.systolic}/${record.diastolic} mmHg, atendendo ao critério de PA alterada (sistólica ≥ ${sysCutoff} mmHg ou diastólica ≥ ${diaCutoff} mmHg) utilizado pela Busca Ativa.`,
        source: "e-SUS APS",
        scoreContribution: wAlteredPA,
      });
    }
  }

  // 2. Tempo desde a última aferição de PA
  const monthsPA = record.dataPA ? monthsSinceDate(record.dataPA) : 999;
  if (monthsPA > monthsPACutoff && monthsPA !== 999) {
    score += wOutdatedPA;
    reasons.push(`Aferição de PA desatualizada (há ${monthsPA} meses)`);
    contributingFactors.push({
      id: "PA_DESATUALIZADA",
      title: `Aferição de PA desatualizada`,
      description: `Última aferição de pressão arterial registrada há ${monthsPA} meses no sistema (critério de monitoramento: mais de ${monthsPACutoff} meses sem aferição).`,
      source: "e-SUS APS",
      scoreContribution: wOutdatedPA,
    });
  }

  // 3. Tempo desde a última visita domiciliar do ACS
  const monthsVisit =
    record.monthsSinceHomeVisit !== undefined && record.monthsSinceHomeVisit !== null
      ? record.monthsSinceHomeVisit
      : monthsSinceDate(record.lastHomeVisit);

  if (monthsVisit > monthsVisitCutoff && monthsVisit !== 999) {
    score += wOutdatedVisit;
    reasons.push(`Visita domiciliar desatualizada (há ${monthsVisit} meses)`);
    contributingFactors.push({
      id: "VISITA_DESATUALIZADA",
      title: `Visita ACS desatualizada`,
      description: `Última visita domiciliar registrada há ${monthsVisit} meses (critério de monitoramento: mais de ${monthsVisitCutoff} meses sem visita domiciliar do ACS).`,
      source: "e-SUS APS",
      scoreContribution: wOutdatedVisit,
    });
  }

  // 4. Idoso (60+ anos)
  if (record.isElderly) {
    score += wElderly;
    reasons.push(`Idoso (${elderlyCutoff}+ anos)`);
    contributingFactors.push({
      id: "IDOSO",
      title: `Pessoa Idosa (${elderlyCutoff}+ anos)`,
      description: `Faixa etária de ${elderlyCutoff} anos ou mais, contemplada na pontuação de monitoramento continuado da atenção primária.`,
      source: "e-SUS APS",
      scoreContribution: wElderly,
    });
  }

  // 5. Obesidade (IMC >= 30)
  if (record.isObese) {
    score += wObesity;
    reasons.push(`Obesidade (IMC >= ${obesityCutoff})`);
    contributingFactors.push({
      id: "OBESIDADE",
      title: `Obesidade (IMC ≥ ${obesityCutoff} kg/m²)`,
      description: `Registro antropométrico com Índice de Massa Corporal superior ou igual a ${obesityCutoff.toFixed(1).replace(".", ",")} kg/m².`,
      source: "e-SUS APS",
      scoreContribution: wObesity,
    });
  }

  // Determinação Estrita do Nível
  let priority: "Alta" | "Média" | "Atenção" | "Acompanhado" = "Acompanhado";
  if (isPaElevated || score >= highCutoff) {
    priority = "Alta";
  } else if (score >= mediumCutoff) {
    priority = "Média";
  } else if (score >= attentionCutoff) {
    priority = "Atenção";
  }

  return {
    priority,
    score,
    reason: reasons.join(". ") || "Indicadores de acompanhamento atualizados.",
    contributingFactors,
  };
}

/**
 * Gera a explicação completa da classificação de prioridade do paciente,
 * reutilizando EXATAMENTE a mesma regra clínica `calculateAdminPriorityScore`.
 * 
 * Garante a total consistência entre a lista de pacientes, o card Situação e a explicação exibida.
 */
export function getPriorityExplanation(
  patient: Patient,
  actions?: PatientActionRecord[],
  params: DcntParameters = DEFAULT_DCNT_PARAMETERS
): PriorityExplanation {
  const allActions = actions || patient.historicoAcoes || [];
  const lastAction = allActions.length > 0 ? allActions[0] : null;

  // Extração dos dados clínicos do paciente para alimentar a regra
  const systolic = patient.lastPA?.systolic ?? null;
  const diastolic = patient.lastPA?.diastolic ?? null;
  const dataPA = patient.lastPA?.date ?? null;

  // Visita domiciliar mais recente registrada (seja e-SUS ou DCNT Saúde)
  const lastVisit = patient.lastVisitDate || null;
  const lastHomeVisitAction = allActions.find((a) => a.tipoAcao === "Visita Domiciliar");
  
  let monthsVisit: number | null = null;
  if (lastHomeVisitAction?.dataAcao) {
    monthsVisit = monthsSinceDate(lastHomeVisitAction.dataAcao);
  } else if (lastVisit) {
    monthsVisit = monthsSinceDate(lastVisit);
  }

  const elderlyCutoff = params.elderlyAgeCutoff ?? 60;
  const obesityCutoff = params.obesityImcCutoff ?? 30;
  const isElderly = patient.isElderly || patient.age >= elderlyCutoff;
  const isObese = patient.isObese || (patient.lastWeight?.imc ? patient.lastWeight.imc >= obesityCutoff : false);

  // Executa o cálculo da regra oficial
  const ruleResult = calculateAdminPriorityScore(
    {
      systolic,
      diastolic,
      dataPA,
      monthsSinceHomeVisit: monthsVisit,
      lastHomeVisit: lastVisit,
      isElderly,
      isObese,
    },
    params
  );

  // Prioridade efetiva do paciente (garantindo consistência absoluta com a exibição do prontuário)
  const effectivePriority = patient.priority || ruleResult.priority;

  // Fatores contribuintes da regra
  let factors: PriorityContributingFactor[] = [...ruleResult.contributingFactors];

  // Se o paciente está como "Acompanhado" devido a uma ação recentemente realizada no sistema DCNT Saúde
  if (effectivePriority === "Acompanhado") {
    factors = [];

    if (lastAction && (lastAction.tipoAcao === "Visita Domiciliar" || lastAction.tipoAcao === "Atendimento/Comparecimento na UBS" || lastAction.tipoAcao === "Contato Telefônico")) {
      factors.push({
        id: "ACAO_DCNT_RECENTE",
        title: `${lastAction.tipoAcao} Realizada`,
        description: `Acompanhamento registrado diretamente no sistema DCNT Saúde em ${formatDateSimple(lastAction.dataAcao)} por ${lastAction.acsNome || "profissional de saúde"}${lastAction.resultado ? ` (Resultado: ${lastAction.resultado})` : ""}.`,
        source: "DCNT Saúde",
      });
    } else if (patient.lastVisitDate && monthsSinceDate(patient.lastVisitDate) <= 3) {
      factors.push({
        id: "VISITA_EM_DIA",
        title: "Visita Domiciliar ACS Recente",
        description: `Visita domiciliar do ACS realizada dentro do período preconizado de monitoramento (último registro em ${formatDateSimple(patient.lastVisitDate)}).`,
        source: "e-SUS APS",
      });
    }

    factors.push({
      id: "SEM_FATORES_RISCO_ATIVOS",
      title: "Parâmetros de Monitoramento em Conformidade",
      description: "Ausência de pressão arterial alterada (≥ 140/90 mmHg) e indicadores de acompanhamento atualizados, sem pontuação de busca ativa pendente.",
      source: "e-SUS APS",
    });
  } else if (factors.length === 0) {
    // Se a regra não detectou fatores mas a prioridade armazenada é maior que Acompanhado
    // (ex: registro mockado ou motivo armazenado explicitamente no paciente)
    if (patient.activeSearchReason) {
      factors.push({
        id: "MOTIVO_REGISTRADO",
        title: "Critério Registrado no Sistema",
        description: patient.activeSearchReason,
        source: "e-SUS APS",
      });
    }
  }

  // Ajustar fontes específicas: se a última PA foi realizada em DCNT Saúde
  if (patient.lastPA?.location && patient.lastPA.location.toLowerCase().includes("dcnt")) {
    factors.forEach((f) => {
      if (f.id === "PA_ELEVADA" || f.id === "PA_DESATUALIZADA") {
        f.source = "DCNT Saúde";
      }
    });
  }

  // Configuração textual e visual de acordo com a classificação
  switch (effectivePriority) {
    case "Alta":
      return {
        priority: "Alta",
        title: "Alta Prioridade",
        intro: "Este paciente apresenta um ou mais critérios que geraram sinalização de Alta Prioridade para acompanhamento.",
        badgeVariant: "red",
        score: ruleResult.score,
        contributingFactors: factors,
        disclaimer: "Esta sinalização é utilizada como apoio ao acompanhamento e à busca ativa. Não representa diagnóstico médico automático.",
      };

    case "Média":
      return {
        priority: "Média",
        title: "Média Prioridade",
        intro: "Este paciente apresenta critérios que indicam necessidade de acompanhamento programado.",
        badgeVariant: "amber",
        score: ruleResult.score,
        contributingFactors: factors,
        disclaimer: "Esta sinalização é utilizada como apoio ao acompanhamento e à busca ativa. Não representa diagnóstico médico automático.",
      };

    case "Atenção":
      return {
        priority: "Atenção",
        title: "Atenção",
        intro: "Este paciente apresenta situação que deve permanecer em monitoramento preventivo pela equipe.",
        badgeVariant: "blue",
        score: ruleResult.score,
        contributingFactors: factors,
        disclaimer: "Esta sinalização é utilizada como apoio ao acompanhamento e à busca ativa. Não representa diagnóstico médico automático.",
      };

    case "Acompanhado":
    default:
      return {
        priority: "Acompanhado",
        title: "Acompanhado",
        intro: "Os registros atuais indicam acompanhamento dentro dos parâmetros de monitoramento utilizados pelo sistema.",
        badgeVariant: "emerald",
        score: ruleResult.score,
        contributingFactors: factors,
        disclaimer: "Esta sinalização é utilizada como apoio ao acompanhamento e à busca ativa. Não representa diagnóstico médico automático.",
      };
  }
}

function formatDateSimple(isoStr?: string | null): string {
  if (!isoStr) return "";
  const parts = isoStr.split("T")[0].split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
}
