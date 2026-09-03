import {
  ESUSParsedFile,
  ESUSRowValidation,
  ESUSParseResult,
  NormalizedPatientRecord,
  MappedESUSFields,
  ESUSRawRow,
  ESUSParseIntegrity,
  ESUSWarningBreakdown,
} from "./types";
import {
  normalizeCPF,
  normalizeCNS,
  normalizePhone,
  parseBRDate,
  parseWeight,
  parseHeight,
  calculateBMI,
  parseBloodPressure,
  normalizeName,
} from "./normalizer";
import { calculateAdminPriorityScore, monthsSinceDate } from "@/lib/utils/priority";

export function validateAndNormalizeESUSData(
  parsedFile: ESUSParsedFile,
  existingPatientsMap: Map<string, any>
): ESUSParseResult {
  const rowValidations: ESUSRowValidation[] = [];
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let newPatientsCount = 0;
  let existingPatientsCount = 0;

  // Métricas para a Auditoria das Regras de Negócio
  let cpfCount = 0;
  let cnsCount = 0;
  let noDocCount = 0;
  let withPACount = 0;
  let noPACount = 0;
  let withBMICount = 0;
  let noBMICount = 0;

  const microareaBreakdown: { [name: string]: number } = {};
  const warningBreakdown: ESUSWarningBreakdown = {
    semCpfCns: 0,
    semPA: 0,
    semPeso: 0,
    semAltura: 0,
    dataNascAtipica: 0,
    semMicroarea: 0,
    outrosAvisos: 0,
    totalPatientsWithWarnings: 0,
    totalWarningOccurrences: 0,
  };

  // Métricas de integridade
  let rowsWith34Fields = 0;
  let inconsistentRows = 0;
  let invalidMicroareas = 0;
  let interpretedPAs = 0;
  let calculatedBMIs = 0;

  const expectedColumnsCount = parsedFile.headersFound.length || 34;
  const processedIdentifiers = new Set<string>();

  parsedFile.rawRows.forEach((rawRow: ESUSRawRow, idx: number) => {
    const rowNumber = parsedFile.headerRowIndex + 1 + idx;
    const warnings: string[] = [];
    const errors: string[] = [];

    const rowFieldKeys = Object.keys(rawRow).filter((k) => k && rawRow[k] !== undefined);
    if (rowFieldKeys.length >= expectedColumnsCount) {
      rowsWith34Fields++;
    } else {
      inconsistentRows++;
      errors.push(`Linha com ${rowFieldKeys.length} colunas (esperado ${expectedColumnsCount}). Erro de parsing estrutural.`);
    }

    const fields: MappedESUSFields = {};
    for (const [colName, internalKey] of Object.entries(parsedFile.mappedColumns)) {
      if (rawRow[colName] !== undefined && rawRow[colName] !== "") {
        (fields as any)[internalKey as keyof MappedESUSFields] = rawRow[colName];
      }
    }

    const rawNome = fields.nome ? String(fields.nome).trim() : "";
    if (!rawNome) {
      errors.push("Nome do paciente ausente ou em branco.");
    }

    const cpfClean = normalizeCPF(fields.cpf);
    const cnsClean = normalizeCNS(fields.cns);

    if (cpfClean.length === 11) cpfCount++;
    if (cnsClean.length === 15) cnsCount++;

    if (fields.cpf && cpfClean.length !== 11) {
      warnings.push(`CPF informado (${fields.cpf}) possui formato atípico.`);
    }

    if (fields.cns && cnsClean.length !== 15) {
      warnings.push(`CNS informado (${fields.cns}) possui formato atípico.`);
    }

    if (!cpfClean && !cnsClean && rawNome) {
      noDocCount++;
      warningBreakdown.semCpfCns++;
      warnings.push("Paciente sem CPF/CNS — identificação secundária por nome + data de nascimento.");
    }

    // Validação estrita da Microárea (sem concatenar números nem regex nocivo)
    let cleanMicroarea = "Sem microárea";
    if (fields.microarea) {
      const maRaw = String(fields.microarea).trim();
      if (maRaw.length > 50) {
        invalidMicroareas++;
        errors.push(`Erro de parsing da microárea: valor estendido atípico (${maRaw.substring(0, 30)}...).`);
        cleanMicroarea = "Erro no Parsing";
      } else if (maRaw === "-" || !maRaw) {
        cleanMicroarea = "Sem microárea";
        warningBreakdown.semMicroarea++;
      } else {
        const numOnly = maRaw.replace(/\D/g, "");
        if (numOnly && numOnly.length <= 4) {
          cleanMicroarea = `Microárea ${numOnly.padStart(2, "0")}`;
        } else {
          cleanMicroarea = maRaw.startsWith("Microárea") ? maRaw : `Microárea ${maRaw}`;
        }
      }
    } else {
      warningBreakdown.semMicroarea++;
    }

    // Incrementar distribuição por Microárea (garantindo que a soma seja igual ao total de registros)
    microareaBreakdown[cleanMicroarea] = (microareaBreakdown[cleanMicroarea] || 0) + 1;

    const normNameStr = normalizeName(rawNome);
    const identifierKey = normNameStr
      ? (cpfClean || cnsClean || `${normNameStr}_${fields.dataNascimento || ""}`)
      : "";

    if (identifierKey) {
      if (processedIdentifiers.has(identifierKey) || existingPatientsMap.has(identifierKey)) {
        existingPatientsCount++;
      } else {
        processedIdentifiers.add(identifierKey);
        newPatientsCount++;
      }
    }

    const birthDateIso = parseBRDate(fields.dataNascimento);
    let ageVal = typeof fields.idade === "number" ? fields.idade : parseInt(String(fields.idade || ""), 10);

    if (isNaN(ageVal) || ageVal < 0) {
      if (birthDateIso) {
        const bDate = new Date(birthDateIso);
        const now = new Date();
        ageVal = now.getFullYear() - bDate.getFullYear();
      } else {
        ageVal = 0;
        if (rawNome) {
          warningBreakdown.dataNascAtipica++;
          warnings.push("Data de nascimento e idade não puderam ser calculadas exatamente.");
        }
      }
    }

    let sexoVal: "Masculino" | "Feminino" = "Feminino";
    if (fields.sexo) {
      const sLower = String(fields.sexo).toLowerCase();
      if (sLower.startsWith("m") || sLower.includes("masc")) {
        sexoVal = "Masculino";
      }
    }

    const phoneObj = normalizePhone(fields.telefone);

    const pesoVal = parseWeight(fields.peso);
    const alturaVal = parseHeight(fields.altura);
    const imcVal = calculateBMI(pesoVal, alturaVal);
    const dataMedicaoIso = parseBRDate(fields.dataUltimaMedicaoAntropometrica || fields.dataUltimaMedicao);

    if (pesoVal && alturaVal && imcVal) {
      withBMICount++;
      calculatedBMIs++;
    } else {
      noBMICount++;
      if (!pesoVal) warningBreakdown.semPeso++;
      if (!alturaVal) warningBreakdown.semAltura++;
    }

    if (fields.peso && !pesoVal) {
      warnings.push(`Valor de peso informado (${fields.peso}) é inválido.`);
    }

    if (fields.altura && !alturaVal) {
      warnings.push(`Valor de altura informado (${fields.altura}) é inválido.`);
    }

    const paObj = parseBloodPressure(fields.pressaoArterial);
    const dataPAIso = parseBRDate(fields.dataUltimaPA);

    if (paObj && paObj.systolic && paObj.diastolic) {
      withPACount++;
      interpretedPAs++;
    } else {
      noPACount++;
      warningBreakdown.semPA++;
    }

    if (fields.pressaoArterial && !paObj) {
      warnings.push(`Formato de Pressão Arterial (${fields.pressaoArterial}) não reconhecido.`);
    }

    const lastMedicalCare = parseBRDate(fields.dataUltimoAtendimentoMedico) || undefined;
    const lastNursingCare = parseBRDate(fields.dataUltimoAtendimentoEnfermagem) || undefined;
    const lastDentalCare = parseBRDate(fields.dataUltimoAtendimentoOdontologico) || undefined;

    const monthsMedical = fields.monthsSinceMedicalCare !== undefined ? parseInt(String(fields.monthsSinceMedicalCare), 10) : undefined;
    const monthsNursing = fields.monthsSinceNursingCare !== undefined ? parseInt(String(fields.monthsSinceNursingCare), 10) : undefined;
    const monthsDental = fields.monthsSinceDentalCare !== undefined ? parseInt(String(fields.monthsSinceDentalCare), 10) : undefined;
    const monthsHomeVisit = fields.monthsSinceHomeVisit !== undefined ? parseInt(String(fields.monthsSinceHomeVisit), 10) : undefined;
    const daysHomeVisit = fields.daysSinceHomeVisit !== undefined ? parseInt(String(fields.daysSinceHomeVisit), 10) : undefined;

    let lastHomeVisit = parseBRDate(fields.dataUltimaVisitaACS) || undefined;
    if (!lastHomeVisit && daysHomeVisit !== undefined && !isNaN(daysHomeVisit) && daysHomeVisit >= 0) {
      const refDate = new Date();
      refDate.setDate(refDate.getDate() - daysHomeVisit);
      lastHomeVisit = refDate.toISOString().substring(0, 10);
    } else if (!lastHomeVisit && monthsHomeVisit !== undefined && !isNaN(monthsHomeVisit) && monthsHomeVisit >= 0) {
      const refDate = new Date();
      refDate.setDate(refDate.getDate() - monthsHomeVisit * 30);
      lastHomeVisit = refDate.toISOString().substring(0, 10);
    }

    const isElderly = ageVal >= 60;
    const isObese = !!imcVal && imcVal >= 30.0;
    const isOverweight = !!imcVal && imcVal >= 25.0;

    // Prioridade Administrativa Estrita para Busca Ativa
    const priorityObj = calculateAdminPriorityScore({
      systolic: paObj?.systolic,
      diastolic: paObj?.diastolic,
      dataPA: dataPAIso || undefined,
      monthsSinceHomeVisit: !isNaN(monthsHomeVisit!) ? monthsHomeVisit : undefined,
      lastHomeVisit,
      isElderly,
      isObese,
    });

    let rowStatus: "Válido" | "Aviso" | "Erro" = "Válido";
    if (errors.length > 0) {
      rowStatus = "Erro";
      errorCount++;
    } else if (warnings.length > 0) {
      rowStatus = "Aviso";
      warningCount++;
      warningBreakdown.totalPatientsWithWarnings++;
      warningBreakdown.totalWarningOccurrences += warnings.length;
    } else {
      validCount++;
    }

    const normalizedRecord: NormalizedPatientRecord = {
      nome: rawNome || "Desconhecido",
      nomeNormalizado: normNameStr || "DESCONHECIDO",
      dataNascimento: birthDateIso || "1970-01-01",
      idade: ageVal,
      sexo: sexoVal,
      cpf: cpfClean,
      cns: cnsClean,
      telefoneOriginal: phoneObj.original,
      telefoneNormalizado: phoneObj.normalized,
      microarea: cleanMicroarea,
      acsName: fields.acsName || "Agente Comunitário",
      logradouro: fields.logradouro || "",
      bairro: fields.bairro || "",
      peso: pesoVal,
      altura: alturaVal,
      imc: imcVal,
      dataMedicao: dataMedicaoIso || undefined,
      systolic: paObj?.systolic,
      diastolic: paObj?.diastolic,
      dataPA: dataPAIso || undefined,
      lastMedicalCare,
      lastNursingCare,
      lastDentalCare,
      lastHomeVisit,
      monthsSinceMedicalCare: !isNaN(monthsMedical!) ? monthsMedical : undefined,
      monthsSinceNursingCare: !isNaN(monthsNursing!) ? monthsNursing : undefined,
      monthsSinceDentalCare: !isNaN(monthsDental!) ? monthsDental : undefined,
      monthsSinceHomeVisit: !isNaN(monthsHomeVisit!) ? monthsHomeVisit : undefined,
      daysSinceHomeVisit: !isNaN(daysHomeVisit!) ? daysHomeVisit : undefined,
      isElderly,
      isObese,
      isOverweight,
      priority: priorityObj.priority,
      priorityScore: priorityObj.score,
      activeSearchReason: priorityObj.reason,
    };

    rowValidations.push({
      rowNumber,
      patientName: rawNome || "Desconhecido",
      status: rowStatus,
      warnings,
      errors,
      normalizedData: normalizedRecord,
      rawRow,
    });
  });

  // Detecção dinâmica de possível coluna de ACS sem alterar o parser principal
  let detectedAcsColumnName: string | undefined = undefined;
  const acsKeywords = ["ACS", "AGENTE COMUNITARIO", "AGENTE COMUNITÁRIO", "PROFISSIONAL", "RESPONSAVEL", "RESPONSÁVEL", "EQUIPE"];
  for (const h of parsedFile.headersFound) {
    const hUpper = h.trim().toUpperCase();
    if (acsKeywords.some((kw) => hUpper.includes(kw))) {
      detectedAcsColumnName = h;
      break;
    }
  }

  const integrity: ESUSParseIntegrity = {
    expectedColumnsCount,
    rowsWith34Fields,
    inconsistentRows,
    invalidMicroareas,
    interpretedPAs,
    calculatedBMIs,
  };

  return {
    headerRowIndex: parsedFile.headerRowIndex,
    headersFound: parsedFile.headersFound,
    mappedColumns: parsedFile.mappedColumns,
    unrecognizedColumns: parsedFile.unrecognizedColumns,
    detectedAcsColumnName,
    totalRowsCount: parsedFile.rawRows.length,
    validRowsCount: validCount,
    warningRowsCount: warningCount,
    errorRowsCount: errorCount,
    newPatientsCount,
    existingPatientsCount,
    cpfCount,
    cnsCount,
    noDocCount,
    withPACount,
    noPACount,
    withBMICount,
    noBMICount,
    microareaBreakdown,
    warningBreakdown,
    integrity,
    rows: rowValidations,
  };
}
