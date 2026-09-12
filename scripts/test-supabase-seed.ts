import { saveNormalizedPatientToSupabase, getAllPatientsFromSupabase } from "../lib/supabase/patients";
import { NormalizedPatientRecord } from "../lib/esus/types";

async function runSeedAndTest() {
  console.log("Iniciando inserção de paciente de teste no Supabase...");

  const mockNormPatient: NormalizedPatientRecord = {
    nome: "JOÃO DA SILVA TESTE SUPABASE",
    nomeNormalizado: "JOAO DA SILVA TESTE SUPABASE",
    dataNascimento: "1960-05-15",
    idade: 64,
    sexo: "Masculino",
    cpf: "12345678901",
    cns: "700000000000001",
    telefoneOriginal: "(24) 99999-1234",
    telefoneNormalizado: "(24) 99999-1234",
    microarea: "01",
    acsName: "ACS Maria",
    logradouro: "Rua Central de Testes",
    bairro: "Centro",
    peso: 85.5,
    altura: 1.70,
    imc: 29.58,
    dataMedicao: "2025-01-10",
    systolic: 140,
    diastolic: 90,
    dataPA: "2025-01-10",
    paStatus: "PA Alterada",
    lastMedicalCare: "2024-11-20",
    lastHomeVisit: "2024-12-15",
    isElderly: true,
    isObese: false,
    isOverweight: true,
    priority: "Alta",
    priorityScore: 75,
  };

  const res = await saveNormalizedPatientToSupabase(mockNormPatient, "USF Arrozal 3");
  console.log("Resultado do salvamento:", res);

  console.log("Recuperando pacientes com estrutura montada...");
  const patients = await getAllPatientsFromSupabase();
  console.log(`Pacientes encontrados: ${patients.length}`);
  if (patients.length > 0) {
    const p = patients[0];
    console.log("Detalhes do primeiro paciente:", {
      id: p.id,
      name: p.name,
      cpf: p.cpf,
      microarea: p.microarea,
      lastPA: p.lastPA,
      lastWeight: p.lastWeight,
      hasHypertension: p.hasHypertension,
      priority: p.priority,
    });
  }
}

runSeedAndTest();
