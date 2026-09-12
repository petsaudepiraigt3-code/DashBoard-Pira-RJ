import { supabase, PacienteRow, AtendimentoRow, AfericaoPressaoRow, AfericaoMedidasRow, TipoAtendimento } from "../supabase";
import { Patient, PriorityLevel, PAMeasurement, WeightMeasurement } from "@/types/dcnt";
import { NormalizedPatientRecord } from "../esus/types";
import { calculateAdminPriorityScore } from "../utils/priority";

/**
 * Busca todos os pacientes do Supabase montando a estrutura relacional completa:
 * - Paciente
 * - Comorbidades associadas
 * - Aferições de PA
 * - Aferições de Peso/Altura
 * - Atendimentos
 */
export async function getAllPatientsFromSupabase(options?: {
  microareaFilter?: number;
}): Promise<Patient[]> {
  try {
    let query = supabase
      .from("paciente")
      .select(`
        *,
        paciente_comorbidade (
          comorbidade (
            tipo_comorbidade
          )
        ),
        atendimento (*),
        afericao_pressao (*),
        afericao_medidas (*)
      `);

    if (options?.microareaFilter !== undefined) {
      query = query.eq("microarea", options.microareaFilter);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error("Erro ao buscar pacientes do Supabase:", error);
      return [];
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((p: any): Patient => {
      // 1. Extrair comorbidades da relação N:N
      const comorbidadesList: string[] = (p.paciente_comorbidade || [])
        .map((pc: any) => pc.comorbidade?.tipo_comorbidade)
        .filter(Boolean);

      const hasHypertension = comorbidadesList.some((c) =>
        /hipertens[aã]o|has|pa alterada/i.test(c)
      );
      const hasDiabetes = comorbidadesList.some((c) =>
        /diabetes|dm/i.test(c)
      );
      const isSmoker = comorbidadesList.some((c) =>
        /tabag|fumo|fumante/i.test(c)
      );
      const hasCardiovascularDisease = comorbidadesList.some((c) =>
        /cardio|coron|infart|avc/i.test(c)
      );

      // 2. Extrair e ordenar aferições de PA
      const rawPA: any[] = p.afericao_pressao || [];
      rawPA.sort((a, b) => (b.data_afericao || "").localeCompare(a.data_afericao || ""));
      const paHistory: PAMeasurement[] = rawPA.map((item) => ({
        id: `pa-${item.id_afericao}`,
        date: item.data_afericao || "",
        systolic: item.pressao_sistolica,
        diastolic: item.pressao_diastolica,
        location: "Unidade de Saúde / Visita",
      }));
      const lastPA = paHistory[0] || undefined;

      // 3. Extrair e ordenar aferições de Medidas (peso/altura)
      const rawMedidas: any[] = p.afericao_medidas || [];
      rawMedidas.sort((a, b) => (b.data_afericao || "").localeCompare(a.data_afericao || ""));
      const weightHistory: WeightMeasurement[] = rawMedidas.map((item) => {
        const w = Number(item.peso) || 0;
        const h = Number(item.altura) || 0;
        const imc = h > 0 ? Number((w / (h * h)).toFixed(2)) : 0;
        return {
          id: `w-${item.id_afericao}`,
          date: item.data_afericao || "",
          weight: w,
          height: h,
          imc,
        };
      });
      const lastWeight = weightHistory[0] || undefined;

      // 4. Extrair atendimentos
      const atendimentos: any[] = p.atendimento || [];
      let lastVisitDate = "";
      let lastMedicalApptDate = "";

      atendimentos.forEach((at) => {
        const d = at.data_ultimo_atendimento || "";
        if (at.tipo_atendimento === "Visita Domiciliar" && (!lastVisitDate || d > lastVisitDate)) {
          lastVisitDate = d;
        }
        if (at.tipo_atendimento === "Médico" && (!lastMedicalApptDate || d > lastMedicalApptDate)) {
          lastMedicalApptDate = d;
        }
      });

      // 5. Cálculos derivados
      const age = p.data_nascimento
        ? Math.floor((Date.now() - new Date(p.data_nascimento).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : (p.idade || 0);

      const isElderly = age >= 60;
      const imc = lastWeight?.imc || 0;
      const isObese = imc >= 30;
      const isOverweight = imc >= 25 && imc < 30;

      // Cálculo de pontuação e prioridade de saúde
      const priorityCalc = calculateAdminPriorityScore({
        isElderly,
        systolic: lastPA?.systolic,
        diastolic: lastPA?.diastolic,
        lastHomeVisit: lastVisitDate,
        isObese,
      });

      const priority: PriorityLevel = priorityCalc.priority;

      return {
        id: String(p.id_paciente),
        name: p.nome,
        cpf: p.cpf || "",
        cns: p.cns || "",
        age,
        sex: p.sexo === "Feminino" ? "Feminino" : "Masculino",
        phone: p.telefone_celular || p.telefone_contato || p.telefone_residencial || "",
        unit: p.area || "USF Arrozal 3",
        unidadeId: p.area || "USF-003",
        unidadeNome: p.area || "USF Arrozal 3",
        microarea: p.microarea != null ? `Microárea ${String(p.microarea).padStart(2, "0")}` : "Não informada",
        acsName: "ACS da Microárea",

        isElderly,
        hasHypertension,
        hasDiabetes,
        isObese,
        isOverweight,
        isSmoker,
        hasCardiovascularDisease,

        lastPA,
        lastWeight,
        lastVisitDate,
        lastMedicalApptDate,

        priority,
        activeSearchReason: priorityCalc.reason || undefined,
        activeSearchStatus: priority === "Alta" ? "Pendente" : "Acompanhado",

        paHistory,
        weightHistory,
        timeline: [],
      };
    });
  } catch (err) {
    console.error("Erro inesperado em getAllPatientsFromSupabase:", err);
    return [];
  }
}

/**
 * Garante que uma comorbidade exista na tabela 'comorbidade' e retorna seu id_comorbidade.
 */
const comorbidadeCache = new Map<string, number>();

export async function ensureComorbidade(tipo: string): Promise<number | null> {
  const cleanTipo = tipo.trim();
  if (!cleanTipo) return null;

  if (comorbidadeCache.has(cleanTipo)) {
    return comorbidadeCache.get(cleanTipo)!;
  }

  // Tenta buscar
  const { data: existing } = await supabase
    .from("comorbidade")
    .select("id_comorbidade")
    .eq("tipo_comorbidade", cleanTipo)
    .maybeSingle();

  if (existing) {
    comorbidadeCache.set(cleanTipo, existing.id_comorbidade);
    return existing.id_comorbidade;
  }

  // Tenta inserir
  const { data: inserted, error } = await supabase
    .from("comorbidade")
    .insert({ tipo_comorbidade: cleanTipo })
    .select("id_comorbidade")
    .single();

  if (error || !inserted) {
    // Pode ter ocorrido race condition, busca de novo
    const { data: retry } = await supabase
      .from("comorbidade")
      .select("id_comorbidade")
      .eq("tipo_comorbidade", cleanTipo)
      .maybeSingle();
    if (retry) {
      comorbidadeCache.set(cleanTipo, retry.id_comorbidade);
      return retry.id_comorbidade;
    }
    return null;
  }

  comorbidadeCache.set(cleanTipo, inserted.id_comorbidade);
  return inserted.id_comorbidade;
}

/**
 * Salva um paciente normalizado do e-SUS APS nas 6 tabelas relacionais do Supabase.
 */
export async function saveNormalizedPatientToSupabase(
  norm: NormalizedPatientRecord,
  unidadeNome: string = "USF Arrozal 3"
): Promise<{ success: boolean; patientId?: number; error?: string }> {
  try {
    // 1. Extrair número da microárea
    let microareaNum: number | null = null;
    if (norm.microarea) {
      const match = norm.microarea.match(/\d+/);
      if (match) {
        microareaNum = parseInt(match[0], 10);
      }
    }

    const cpfVal = norm.cpf && norm.cpf.trim().length > 0 ? norm.cpf.trim() : null;
    const cnsVal = norm.cns && norm.cns.trim().length > 0 ? norm.cns.trim() : null;

    // 2. Verificar se o paciente já existe no banco por CPF ou CNS
    let existingPatientId: number | null = null;

    if (cpfVal) {
      const { data } = await supabase
        .from("paciente")
        .select("id_paciente")
        .eq("cpf", cpfVal)
        .maybeSingle();
      if (data) existingPatientId = data.id_paciente;
    }

    if (!existingPatientId && cnsVal) {
      const { data } = await supabase
        .from("paciente")
        .select("id_paciente")
        .eq("cns", cnsVal)
        .maybeSingle();
      if (data) existingPatientId = data.id_paciente;
    }

    const patientPayload = {
      nome: norm.nome,
      cpf: cpfVal,
      cns: cnsVal,
      data_nascimento: norm.dataNascimento || null,
      sexo: norm.sexo || null,
      identidade_genero: norm.identidadeGenero || null,
      telefone_celular: norm.telefoneNormalizado || null,
      area: unidadeNome,
      microarea: microareaNum,
      rua: norm.logradouro || null,
      bairro: norm.bairro || null,
      updated_at: new Date().toISOString(),
    };

    let patientId: number;

    if (existingPatientId) {
      const { error: updErr } = await supabase
        .from("paciente")
        .update(patientPayload)
        .eq("id_paciente", existingPatientId);

      if (updErr) throw updErr;
      patientId = existingPatientId;
    } else {
      const { data: newPat, error: insErr } = await supabase
        .from("paciente")
        .insert(patientPayload)
        .select("id_paciente")
        .single();

      if (insErr || !newPat) throw insErr || new Error("Falha ao inserir paciente");
      patientId = newPat.id_paciente;
    }

    // 3. Gravar Aferição de Pressão se presente
    if (norm.systolic && norm.diastolic) {
      const paDate = norm.dataPA || new Date().toISOString().substring(0, 10);
      // Evitar duplicar mesma medição no mesmo dia
      const { data: existingPA } = await supabase
        .from("afericao_pressao")
        .select("id_afericao")
        .eq("id_paciente", patientId)
        .eq("data_afericao", paDate)
        .maybeSingle();

      if (!existingPA) {
        const { error: paErr } = await supabase.from("afericao_pressao").insert({
          id_paciente: patientId,
          pressao_sistolica: norm.systolic,
          pressao_diastolica: norm.diastolic,
          data_afericao: paDate,
        });
        if (paErr) console.error("Erro ao inserir afericao_pressao:", paErr);
      }
    }

    // 4. Gravar Aferição de Medidas (peso/altura) se presente
    if (norm.peso || norm.altura) {
      const medDate = norm.dataMedicao || new Date().toISOString().substring(0, 10);
      const { data: existingMed } = await supabase
        .from("afericao_medidas")
        .select("id_afericao")
        .eq("id_paciente", patientId)
        .eq("data_afericao", medDate)
        .maybeSingle();

      if (!existingMed) {
        await supabase.from("afericao_medidas").insert({
          id_paciente: patientId,
          peso: norm.peso || null,
          altura: norm.altura || null,
          data_afericao: medDate,
        });
      }
    }

    // 5. Gravar Atendimentos (Médico, Enfermagem, Odontológico, Visita Domiciliar)
    const attendances: { tipo: TipoAtendimento; date?: string }[] = [
      { tipo: "Médico", date: norm.lastMedicalCare },
      { tipo: "Enfermagem", date: norm.lastNursingCare },
      { tipo: "Odontológico", date: norm.lastDentalCare },
      { tipo: "Visita Domiciliar", date: norm.lastHomeVisit },
    ];

    for (const att of attendances) {
      if (att.date) {
        const { data: existingAtt } = await supabase
          .from("atendimento")
          .select("id_atendimento")
          .eq("id_paciente", patientId)
          .eq("tipo_atendimento", att.tipo)
          .eq("data_ultimo_atendimento", att.date)
          .maybeSingle();

        if (!existingAtt) {
          await supabase.from("atendimento").insert({
            id_paciente: patientId,
            tipo_atendimento: att.tipo,
            data_ultimo_atendimento: att.date,
          });
        }
      }
    }

    // 6. Gravar Comorbidades detectadas (Hipertensão se PA alta / Obesidade se IMC alto)
    const detectedComorbidities: string[] = [];
    if (norm.paStatus === "PA Alterada" || norm.paStatus === "PA Muito Elevada") {
      detectedComorbidities.push("Hipertensão Arterial Sistêmica");
    }
    if (norm.isObese) {
      detectedComorbidities.push("Obesidade");
    }

    for (const cName of detectedComorbidities) {
      const comorbId = await ensureComorbidade(cName);
      if (comorbId) {
        // Tenta associar sem erro de chave duplicada
        await supabase
          .from("paciente_comorbidade")
          .upsert({ id_paciente: patientId, id_comorbidade: comorbId }, { onConflict: "id_paciente,id_comorbidade" });
      }
    }

    return { success: true, patientId };
  } catch (err: any) {
    console.error("Erro ao salvar paciente no Supabase:", err);
    return { success: false, error: err.message };
  }
}
