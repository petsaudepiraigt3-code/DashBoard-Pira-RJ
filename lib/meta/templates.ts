import { MetaWhatsAppTemplate } from "@/types/messages";

export const META_WHATSAPP_TEMPLATES: MetaWhatsAppTemplate[] = [
  {
    id: "tpl-lembrete-pa",
    name: "lembrete_afericao_pressao_dcnt",
    category: "UTILITY",
    language: "pt_BR",
    title: "Lembrete de Aferição de Pressão Arterial",
    description: "Convocação para verificação de pressão na unidade para pacientes hipertensos ou em busca ativa.",
    bodyText:
      "Olá {{1}}, aqui é da sua Unidade de Saúde ({{2}}). Identificamos que já faz algum tempo desde a sua última verificação de pressão arterial. Convidamos você para comparecer à unidade na {{3}} para realizar sua aferição com nossa equipe de enfermagem. Sua saúde é muito importante para nós!",
    paramsCount: 3,
    paramPlaceholders: [
      { key: "1", label: "Nome do Paciente", defaultValue: "Nome" },
      { key: "2", label: "Unidade de Saúde", defaultValue: "USF Arrozal 3" },
      { key: "3", label: "Data/Período Sugerido", defaultValue: "nesta semana de 08h às 16h" },
    ],
  },
  {
    id: "tpl-visita-acs",
    name: "aviso_visita_domiciliar_acs",
    category: "UTILITY",
    language: "pt_BR",
    title: "Aviso de Visita Domiciliar do ACS",
    description: "Notifica o paciente com antecedência sobre a visita periódica do Agente Comunitário de Saúde.",
    bodyText:
      "Olá {{1}}, aqui é {{2}}, seu(sua) Agente Comunitário(a) de Saúde da Microárea {{3}}. Estou organizando as visitas domiciliares do nosso bairro e passarei na sua residência no dia {{4}} para atualizar seu acompanhamento de saúde. Caso precise remarcar, por favor responda a esta mensagem.",
    paramsCount: 4,
    paramPlaceholders: [
      { key: "1", label: "Nome do Paciente", defaultValue: "Nome" },
      { key: "2", label: "Nome do ACS", defaultValue: "Ana Maria Souza" },
      { key: "3", label: "Código da Microárea", defaultValue: "01" },
      { key: "4", label: "Data Prevista da Visita", defaultValue: "amanhã pela manhã" },
    ],
  },
  {
    id: "tpl-busca-ativa",
    name: "busca_ativa_acompanhamento_dcnt",
    category: "UTILITY",
    language: "pt_BR",
    title: "Busca Ativa - Acompanhamento DCNT Prioritário",
    description: "Contato direto para pacientes com comorbidades descompensadas ou sem retorno recente.",
    bodyText:
      "Prezado(a) {{1}}, a equipe da {{2}} está realizando o acompanhamento prioritário dos nossos pacientes com condições crônicas. Notamos que sua última avaliação médica ou aferição de rotina está pendente. Pedimos a gentileza de comparecer à unidade com seu Cartão do SUS e documento com foto no dia {{3}} para que possamos cuidar bem de você.",
    paramsCount: 3,
    paramPlaceholders: [
      { key: "1", label: "Nome do Paciente", defaultValue: "Nome" },
      { key: "2", label: "Unidade de Saúde", defaultValue: "USF Arrozal 3" },
      { key: "3", label: "Data / Turno para comparecimento", defaultValue: "quinta-feira às 09:00" },
    ],
  },
  {
    id: "tpl-renovacao-receita",
    name: "aviso_renovacao_receita_medicamentos",
    category: "UTILITY",
    language: "pt_BR",
    title: "Renovação de Receita de Medicamentos Contínuos",
    description: "Aviso preventivo para evitar interrupção de medicação anti-hipertensiva ou para diabetes.",
    bodyText:
      "Olá {{1}}! Informamos que o prazo para renovação da sua receita de medicamentos de uso contínuo na {{2}} está próximo do vencimento. Para garantir que seu tratamento não seja interrompido, agende ou retire sua nova receita até o dia {{3}}.",
    paramsCount: 3,
    paramPlaceholders: [
      { key: "1", label: "Nome do Paciente", defaultValue: "Nome" },
      { key: "2", label: "Unidade de Saúde", defaultValue: "USF Arrozal 3" },
      { key: "3", label: "Data limite recomendada", defaultValue: "dia 25 deste mês" },
    ],
  },
  {
    id: "tpl-campanha-saude",
    name: "convite_campanha_prevencao_saude",
    category: "MARKETING",
    language: "pt_BR",
    title: "Convite para Ação Coletiva de Saúde da Família",
    description: "Divulgação de mutirões, dia D de prevenção cardiovascular e grupos de convivência.",
    bodyText:
      "Olá {{1}}! A {{2}} convida você e sua família para a nossa Ação Especial de Saúde e Prevenção no dia {{3}}. Teremos aferição de pressão arterial, orientações nutricionais, avaliação física e roda de conversa com a equipe. Esperamos por você!",
    paramsCount: 3,
    paramPlaceholders: [
      { key: "1", label: "Nome do Paciente", defaultValue: "Nome" },
      { key: "2", label: "Unidade de Saúde", defaultValue: "USF Arrozal 3" },
      { key: "3", label: "Data do Evento", defaultValue: "sábado a partir das 08h" },
    ],
  },
];

export function renderTemplateText(template: MetaWhatsAppTemplate, params: string[]): string {
  let rendered = template.bodyText;
  params.forEach((param, index) => {
    const placeholder = new RegExp(`\\{\\{${index + 1}\\}\\}`, "g");
    rendered = rendered.replace(placeholder, param || `[Parâmetro ${index + 1}]`);
  });
  return rendered;
}
