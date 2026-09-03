import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Patient } from "@/types/dcnt";

export interface PDFReportFilters {
  filterACS: string;
  filterMicroarea: string;
  filterSex: string;
  filterAgeGroup: string;
  filterCondition: string;
  periodFilter: string;
}

export interface PDFReportData {
  unitName: string;
  userName: string;
  userRole: string;
  generationDate: string; // ex: "26/08/2026 10:45"
  filters: PDFReportFilters;
  patients: Patient[];
  coverageStats: {
    totalACS: number;
    totalMicroareas: number;
    microareasSemACS: number;
    pacientesSemMicroarea: number;
    pacientesForaArea: number;
  } | null;
  pendingReturns: {
    atrasados: number;
    hoje: number;
    agendados: number;
  };
}

// Normaliza string para uso seguro em nomes de arquivos (sem acentos nem caracteres especiais)
function sanitizeFilename(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateManagerPDFReport(data: PDFReportData): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let currentY = 14;

  // Paleta de Cores Institucional
  const primaryColor = [22, 78, 159]; // Azul Institucional SUS/Governo (#164E9F)
  const secondaryColor = [71, 85, 105]; // Slate 600
  const textColor = [30, 41, 59]; // Slate 800
  const lightBgColor = [241, 245, 249]; // Slate 100
  const accentRed = [185, 28, 28]; // Red 700

  // 1. CABEÇALHO INSTITUCIONAL
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(margin, currentY, pageWidth - margin * 2, 22, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("RELATÓRIO GERENCIAL — SAÚDE DIGITAL BUSCA ATIVA", margin + 6, currentY + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Acompanhamento de Condições Crônicas e Busca Ativa", margin + 6, currentY + 16);

  // Selos Institucionais em Texto Formatado no Canto Direito do Cabeçalho
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("PREFEITURA DE PIRAÍ | SUS | PET-SAÚDE | UGB FERP", pageWidth - margin - 6, currentY + 12, { align: "right" });

  currentY += 26;

  // 2. METADADOS E EMBASAMENTO DO RELATÓRIO
  doc.setFillColor(lightBgColor[0], lightBgColor[1], lightBgColor[2]);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 24, 2, 2, "F");

  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFontSize(8);

  // Coluna 1
  doc.setFont("helvetica", "bold");
  doc.text("Unidade de Saúde:", margin + 4, currentY + 6);
  doc.setFont("helvetica", "normal");
  doc.text(data.unitName || "USF Arrozal 3", margin + 35, currentY + 6);

  doc.setFont("helvetica", "bold");
  doc.text("Perfil Responsável:", margin + 4, currentY + 12);
  doc.setFont("helvetica", "normal");
  doc.text(data.userRole || "Gerente de Unidade", margin + 35, currentY + 12);

  doc.setFont("helvetica", "bold");
  doc.text("Usuário Emissor:", margin + 4, currentY + 18);
  doc.setFont("helvetica", "normal");
  doc.text(data.userName || "Gerente Arrozal 3", margin + 35, currentY + 18);

  // Coluna 2
  const col2X = margin + 100;
  doc.setFont("helvetica", "bold");
  doc.text("Data/Hora Emissão:", col2X, currentY + 6);
  doc.setFont("helvetica", "normal");
  doc.text(data.generationDate, col2X + 32, currentY + 6);

  doc.setFont("helvetica", "bold");
  doc.text("Período de Análise:", col2X, currentY + 12);
  doc.setFont("helvetica", "normal");
  doc.text(data.filters.periodFilter || "Últimos 12 meses", col2X + 32, currentY + 12);

  doc.setFont("helvetica", "bold");
  doc.text("Escopo de Acesso:", col2X, currentY + 18);
  doc.setFont("helvetica", "normal");
  doc.text("Consolidado por Unidade Saúde", col2X + 32, currentY + 18);

  currentY += 28;

  // 3. FILTROS GLOBAIS APLICADOS NO MOMENTO DA EMISSÃO
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("Filtros Aplicados no Momento da Geração:", margin, currentY);

  currentY += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);

  const filterText = `ACS: ${data.filters.filterACS} | Microárea: ${data.filters.filterMicroarea} | Sexo: ${data.filters.filterSex} | Faixa Etária: ${data.filters.filterAgeGroup} | Condição: ${data.filters.filterCondition}`;
  doc.text(filterText, margin, currentY);

  currentY += 8;

  // CÁLCULO DAS MÉTRICAS CONSOLIDADAS (Mesma lógica estrita do Dashboard)
  const totalCadastrados = data.patients.length;
  const countIdosos = data.patients.filter((p) => p.isElderly || p.age >= 60).length;

  let adequadoCount = 0;
  let sobrepesoCount = 0;
  let obesidadeCount = 0;
  let semInfoIMC = 0;

  data.patients.forEach((p) => {
    const imc = p.lastWeight?.imc ?? (p as any).imcAtual;
    if (imc == null || typeof imc !== "number" || isNaN(imc) || imc <= 0) {
      semInfoIMC++;
    } else if (imc >= 30) {
      obesidadeCount++;
    } else if (imc >= 25) {
      sobrepesoCount++;
    } else {
      adequadoCount++;
    }
  });

  const countPAAlterada = data.patients.filter(
    (p) => p.lastPA && (p.lastPA.systolic >= 140 || p.lastPA.diastolic >= 90)
  ).length;

  const countSemPARecente = data.patients.filter(
    (p) => !p.lastPA || new Date(p.lastPA.date) < new Date("2026-01-01")
  ).length;

  const countSemAcompanhamento = data.patients.filter(
    (p) => !p.lastVisitDate || new Date(p.lastVisitDate) < new Date("2026-04-01")
  ).length;

  const countBuscaAtivaAlta = data.patients.filter((p) => p.priority === "Alta").length;

  // 4. SEÇÃO 1: RESUMO DA POPULAÇÃO ACOMPANHADA
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("1. Resumo da População Acompanhada", margin, currentY);

  currentY += 3;

  const popRows = [
    ["Pessoas Cadastradas", totalCadastrados.toString(), "100%"],
    ["Idosos (60+ anos)", countIdosos.toString(), `${Math.round((countIdosos / (totalCadastrados || 1)) * 100)}%`],
    ["Sobrepeso (25 <= IMC < 30)", sobrepesoCount.toString(), `${Math.round((sobrepesoCount / (totalCadastrados || 1)) * 100)}%`],
    ["Obesidade (IMC >= 30)", obesidadeCount.toString(), `${Math.round((obesidadeCount / (totalCadastrados || 1)) * 100)}%`],
    ["PA Alterada (>= 140/90 mmHg)", countPAAlterada.toString(), `${Math.round((countPAAlterada / (totalCadastrados || 1)) * 100)}%`],
    ["Sem PA Recente (> 6 meses)", countSemPARecente.toString(), `${Math.round((countSemPARecente / (totalCadastrados || 1)) * 100)}%`],
    ["Sem Visita ACS (Atrasada)", countSemAcompanhamento.toString(), `${Math.round((countSemAcompanhamento / (totalCadastrados || 1)) * 100)}%`],
    ["Busca Ativa Prioritária (Urgente)", countBuscaAtivaAlta.toString(), `${Math.round((countBuscaAtivaAlta / (totalCadastrados || 1)) * 100)}%`],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Indicador da População", "Quantidade Real", "Percentual Relativo"]],
    body: popRows,
    theme: "striped",
    headStyles: { fillColor: [22, 78, 159], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 40, halign: "center", fontStyle: "bold" },
      2: { cellWidth: 40, halign: "center" },
    },
    margin: { left: margin, right: margin },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // 5. SEÇÃO 2: COBERTURA TERRITORIAL E EQUIPE DE ACS
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("2. Cobertura Territorial e Equipe de ACS", margin, currentY);

  currentY += 3;

  const stats = data.coverageStats || {
    totalACS: 11,
    totalMicroareas: 14,
    microareasSemACS: 3,
    pacientesSemMicroarea: 0,
    pacientesForaArea: 2,
  };

  const covRows = [
    ["ACS Ativos na Unidade", stats.totalACS.toString()],
    ["Microáreas com ACS", (stats.totalMicroareas - stats.microareasSemACS).toString()],
    ["Microáreas sem ACS (Descobertas)", stats.microareasSemACS.toString()],
    ["Pacientes Sem Microárea Atribuída", stats.pacientesSemMicroarea.toString()],
    ["Pacientes Fora da Área de Cobertura", stats.pacientesForaArea.toString()],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Métrica de Cobertura Territorial", "Total de ACS / Microáreas"]],
    body: covRows,
    theme: "striped",
    headStyles: { fillColor: [51, 65, 85], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 60, halign: "center", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // 6. SEÇÃO 3: SITUAÇÃO DAS CONDIÇÕES MONITORADAS & PRESSÃO ARTERIAL
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("3. Situação das Condições Monitoradas e Aferição de PA", margin, currentY);

  currentY += 3;

  const countRecentPA = data.patients.filter((p) => p.lastPA && new Date(p.lastPA.date) >= new Date("2026-02-01")).length;
  const count6to12PA = data.patients.filter((p) => p.lastPA && new Date(p.lastPA.date) < new Date("2026-02-01") && new Date(p.lastPA.date) >= new Date("2025-08-01")).length;
  const countMore12PA = data.patients.filter((p) => p.lastPA && new Date(p.lastPA.date) < new Date("2025-08-01")).length;

  const condRows = [
    ["Estado Nutricional — Adequado (IMC < 25)", adequadoCount.toString()],
    ["Estado Nutricional — Sobrepeso (25 <= IMC < 30)", sobrepesoCount.toString()],
    ["Estado Nutricional — Obesidade (IMC >= 30)", obesidadeCount.toString()],
    ["Estado Nutricional — Sem Informação de Peso/Altura", semInfoIMC.toString()],
    ["Aferição de PA — Recente (< 6 meses)", countRecentPA.toString()],
    ["Aferição de PA — Intermediária (6 a 12 meses)", count6to12PA.toString()],
    ["Aferição de PA — Tardia (Mais de 12 meses)", countMore12PA.toString()],
    ["Aferição de PA — Sem Informação de Aferição", countSemPARecente.toString()],
    ["Condições Diagnosticadas — Hipertensão Arterial", data.patients.filter((p) => p.hasHypertension).length.toString()],
    ["Condições Diagnosticadas — Diabetes Mellitus", data.patients.filter((p) => p.hasDiabetes).length.toString()],
    ["Fatores de Risco — Tabagismo", data.patients.filter((p) => p.isSmoker).length.toString()],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Estado Clínico / Perfil do Acompanhamento", "Pacientes Acompanhados"]],
    body: condRows,
    theme: "striped",
    headStyles: { fillColor: [22, 78, 159], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: "center", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // 7. SEÇÃO 4: BUSCA ATIVA, AÇÕES E RETORNOS PROGRAMADOS
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("4. Situação da Busca Ativa e Retornos Programados", margin, currentY);

  currentY += 3;

  const countAlta = data.patients.filter((p) => p.priority === "Alta").length;
  const countMedia = data.patients.filter((p) => p.priority === "Média").length;
  const countAtencao = data.patients.filter((p) => p.priority === "Atenção").length;
  const countAcompanhado = data.patients.filter((p) => p.priority === "Acompanhado").length;

  const buscaRows = [
    ["Prioridade Alta (Acompanhamento Urgente)", countAlta.toString()],
    ["Prioridade Média (Acompanhamento Regular)", countMedia.toString()],
    ["Nível Atenção (Monitoramento Preventivo)", countAtencao.toString()],
    ["Status Acompanhado (Visitas / Ações em Dia)", countAcompanhado.toString()],
    ["Retornos Programados — Atrasados", data.pendingReturns.atrasados.toString()],
    ["Retornos Programados — Agendados para Hoje", data.pendingReturns.hoje.toString()],
    ["Retornos Programados — Próximos Agendamentos", data.pendingReturns.agendados.toString()],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Categoria de Operação da Busca Ativa", "Total Consolidado"]],
    body: buscaRows,
    theme: "striped",
    headStyles: { fillColor: [185, 28, 28], fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: "center", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
  });

  // 8. RODAPÉ INSTITUCIONAL COM NUMERAÇÃO DE PÁGINAS E NOTA LGPD
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    doc.setDrawColor(203, 213, 225); // Slate 300
    doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text(
      "Documento gerencial contendo informações consolidadas. Não substitui avaliação ou diagnóstico médico. Conforme regras de privacidade e LGPD.",
      margin,
      pageHeight - 8
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  // NOME DO ARQUIVO SANITIZADO
  const cleanUnitName = sanitizeFilename(data.unitName || "usf-arrozal-3");
  const cleanDate = data.generationDate.substring(0, 10).replace(/\//g, "-");
  const filename = `relatorio-gerencial-${cleanUnitName}-${cleanDate}.pdf`;

  doc.save(filename);
}
