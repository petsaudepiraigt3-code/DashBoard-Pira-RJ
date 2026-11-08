"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { BadgePriority } from "@/components/ui/badge-priority";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/auth-context";
import { Patient, PriorityLevel } from "@/types/dcnt";
import { WhatsAppMessage, MetaWhatsAppTemplate, MetaApiConfigStatus } from "@/types/messages";
import { getAllPatientsFromStore } from "@/lib/store/patients";
import { META_WHATSAPP_TEMPLATES, renderTemplateText } from "@/lib/meta/templates";
import {
  getWhatsAppMessages,
  sendWhatsAppMessageViaMeta,
  getDirectWhatsAppUrl,
  formatPhoneDisplay,
  formatPhoneNumberForMeta,
} from "@/lib/meta/whatsapp";
import { formatDateBR } from "@/lib/utils/formatters";
import {
  MessageSquareText,
  Send,
  Check,
  CheckCheck,
  Clock,
  Search,
  Filter,
  User,
  ShieldCheck,
  Sparkles,
  Phone,
  Calendar,
  ExternalLink,
  Info,
  RefreshCw,
  HeartPulse,
  Scale,
  MapPin,
  AlertTriangle,
  Building2,
  FileText,
  Smartphone,
  HelpCircle,
  Activity,
  CheckCircle2,
  Copy,
} from "lucide-react";

export default function MensagensPage() {
  const { userProfile, role, userUnitId, userUnitNome } = useAuth();

  // 1. Estados dos Dados
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  // 2. Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMicroarea, setFilterMicroarea] = useState<string>("Todas");
  const [filterPriority, setFilterPriority] = useState<string>("Todas");
  const [filterStatus, setFilterStatus] = useState<"todos" | "com_mensagens" | "sem_mensagens">("todos");

  // 3. Composer de Mensagens
  const [composerMode, setComposerMode] = useState<"template" | "text">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(META_WHATSAPP_TEMPLATES[0].id);
  const [templateCustomParams, setTemplateCustomParams] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");
  const [registerInTimeline, setRegisterInTimeline] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccessBanner, setSendSuccessBanner] = useState<string | null>(null);

  // 4. Modais
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isPatientDetailsModalOpen, setIsPatientDetailsModalOpen] = useState(false);
  const [metaConfigStatus, setMetaConfigStatus] = useState<MetaApiConfigStatus | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Referência para rolagem automática de mensagens
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 5. Carregar Configuração da Meta API
  useEffect(() => {
    fetch("/api/meta/whatsapp/config")
      .then((res) => res.json())
      .then((data) => setMetaConfigStatus(data))
      .catch((err) => console.warn("Aviso ao buscar status Meta API:", err));
  }, []);

  // 6. Carregar Pacientes
  const loadPatients = async () => {
    setLoadingPatients(true);
    try {
      const realData = await getAllPatientsFromStore({
        role,
        userUnitId,
        assignedMicroareaCodes: userProfile?.assignedMicroareaCodes,
        acsName: role === "ACS" ? userProfile?.name : undefined,
        acsId: role === "ACS" ? userProfile?.uid : undefined,
      });
      setPatients(realData || []);
    } catch (e) {
      setPatients([]);
    } finally {
      setLoadingPatients(false);
    }
  };

  // 7. Carregar Mensagens
  const loadMessages = async () => {
    setLoadingMessages(true);
    try {
      const msgs = await getWhatsAppMessages({
        unitId: userUnitId || "USF-003",
      });
      setMessages(msgs);
    } catch (e) {
      console.warn("Aviso ao carregar mensagens:", e);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadPatients();
    loadMessages();
  }, [role, userUnitId, userProfile]);

  // Se o usuário for ACS, travar o filtro de microárea para a sua microárea
  useEffect(() => {
    if (role === "ACS") {
      const codes = userProfile?.assignedMicroareaCodes || ["01"];
      if (codes.length > 0) {
        const maCode = codes[0].replace(/\D/g, "").trim();
        setFilterMicroarea(maCode ? `Microárea ${maCode}` : "Microárea 01");
      }
    } else {
      setFilterMicroarea("Todas");
    }
  }, [role, userProfile]);

  // Pacientes filtrados de acordo com o escopo do perfil e termos de busca
  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      // 1. Filtro estrito de perfil ACS
      if (role === "ACS") {
        const userCodes = (userProfile?.assignedMicroareaCodes || ["01"]).map((c) =>
          c.replace(/\D/g, "").trim()
        );
        const patCode = (patient.microarea || "").replace(/\D/g, "").trim();
        if (userCodes.length > 0 && !userCodes.includes(patCode)) {
          return false;
        }
      }

      // 2. Filtro de Microárea (ativo para Gerente/Admin)
      if (role !== "ACS" && filterMicroarea !== "Todas") {
        const filterCode = filterMicroarea.replace(/\D/g, "").trim();
        const patCode = (patient.microarea || "").replace(/\D/g, "").trim();
        if (filterCode && patCode !== filterCode) {
          return false;
        }
      }

      // 3. Filtro de Prioridade
      if (filterPriority !== "Todas" && patient.priority !== filterPriority) {
        return false;
      }

      // 4. Filtro de Termo de Pesquisa
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = patient.name.toLowerCase().includes(q);
        const matchCpf = (patient.cpf || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""));
        const matchPhone = (patient.phone || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""));
        if (!matchName && !matchCpf && !matchPhone) {
          return false;
        }
      }

      // 5. Filtro de Presença de Histórico de Mensagens
      if (filterStatus === "com_mensagens") {
        const hasMsg = messages.some((m) => m.patientId === patient.id);
        if (!hasMsg) return false;
      } else if (filterStatus === "sem_mensagens") {
        const hasMsg = messages.some((m) => m.patientId === patient.id);
        if (hasMsg) return false;
      }

      return true;
    });
  }, [patients, role, userProfile, filterMicroarea, filterPriority, searchQuery, filterStatus, messages]);

  // Seleciona o primeiro paciente por padrão se nenhum estiver selecionado
  useEffect(() => {
    if (!selectedPatientId && filteredPatients.length > 0) {
      setSelectedPatientId(filteredPatients[0].id);
    }
  }, [filteredPatients, selectedPatientId]);

  // Paciente atualmente ativo no chat
  const activePatient = useMemo(() => {
    return patients.find((p) => p.id === selectedPatientId) || filteredPatients[0] || null;
  }, [patients, selectedPatientId, filteredPatients]);

  // Mensagens do paciente ativo
  const activePatientMessages = useMemo(() => {
    if (!activePatient) return [];
    return messages.filter((m) => m.patientId === activePatient.id).sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, activePatient]);

  // Rolagem suave para o fim ao receber nova mensagem
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activePatientMessages]);

  // Template selecionado atualmente
  const currentTemplate = useMemo(() => {
    return (
      META_WHATSAPP_TEMPLATES.find((t) => t.id === selectedTemplateId) ||
      META_WHATSAPP_TEMPLATES[0]
    );
  }, [selectedTemplateId]);

  // Inicializa ou atualiza parâmetros padrões do template com dados do paciente ativo
  useEffect(() => {
    if (activePatient && currentTemplate) {
      const defaultMap: Record<string, string> = {};
      currentTemplate.paramPlaceholders.forEach((param, idx) => {
        if (idx === 0) {
          defaultMap[param.key] = activePatient.name;
        } else if (idx === 1 && param.label.includes("Unidade")) {
          defaultMap[param.key] = activePatient.unit || userUnitNome || "USF Arrozal 3";
        } else if (idx === 1 && param.label.includes("ACS")) {
          defaultMap[param.key] = activePatient.acsName || userProfile?.name || "Agente Comunitário";
        } else if (param.defaultValue) {
          defaultMap[param.key] = param.defaultValue;
        } else {
          defaultMap[param.key] = "";
        }
      });
      setTemplateCustomParams(defaultMap);
    }
  }, [activePatient, currentTemplate, userUnitNome, userProfile]);

  // Texto renderizado em tempo real do template
  const renderedTemplatePreview = useMemo(() => {
    if (!currentTemplate) return "";
    const paramsList = currentTemplate.paramPlaceholders.map(
      (p) => templateCustomParams[p.key] || p.defaultValue || `[${p.label}]`
    );
    return renderTemplateText(currentTemplate, paramsList);
  }, [currentTemplate, templateCustomParams]);

  // Envio de Mensagem
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePatient) return;

    let contentToSend = "";
    let templateName: string | undefined = undefined;
    let templateTitle: string | undefined = undefined;
    let templateParams: string[] = [];

    if (composerMode === "template") {
      contentToSend = renderedTemplatePreview;
      templateName = currentTemplate.name;
      templateTitle = currentTemplate.title;
      templateParams = currentTemplate.paramPlaceholders.map(
        (p) => templateCustomParams[p.key] || p.defaultValue || ""
      );
    } else {
      if (!freeText.trim()) return;
      contentToSend = freeText.trim();
    }

    setIsSending(true);

    try {
      const cleanMicroarea = (activePatient.microarea || "01").replace(/\D/g, "").trim() || "01";

      const created = await sendWhatsAppMessageViaMeta({
        patientId: activePatient.id,
        patientName: activePatient.name,
        patientPhone: activePatient.phone,
        patientCpf: activePatient.cpf,
        unitId: userUnitId || "USF-003",
        unitName: userUnitNome || "USF Arrozal 3",
        microarea: cleanMicroarea,
        senderId: userProfile?.uid || "dev-operator",
        senderName: userProfile?.name || "Operador de Saúde",
        senderRole: role || "ACS",
        type: composerMode,
        templateName,
        templateTitle,
        templateParams,
        content: contentToSend,
        registerInTimeline,
      });

      // Atualiza estado local imediatamente
      setMessages((prev) => [...prev, created]);
      if (composerMode === "text") {
        setFreeText("");
      }

      setSendSuccessBanner(
        `Mensagem despachada com sucesso via Meta WhatsApp API para ${activePatient.name}!`
      );
      setTimeout(() => setSendSuccessBanner(null), 4500);
    } catch (err: any) {
      alert("Erro ao enviar mensagem: " + (err.message || "Falha de comunicação."));
    } finally {
      setIsSending(false);
    }
  };

  // Cálculo de estatísticas rápidas da USF / Microárea
  const stats = useMemo(() => {
    const totalMsgs = messages.length;
    const deliveredCount = messages.filter((m) => m.status === "delivered" || m.status === "read").length;
    const readCount = messages.filter((m) => m.status === "read").length;
    const uniquePatientsContacted = new Set(messages.map((m) => m.patientId)).size;
    return {
      totalMsgs,
      deliveredCount,
      readCount,
      uniquePatientsContacted,
    };
  }, [messages]);

  return (
    <AppLayout pageTitle="Central de Mensagens WhatsApp (Meta Cloud API)">
      <div className="space-y-4">
        {/* Banner Superior com Contexto de Acesso e Indicador Meta */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800">
              <MessageSquareText className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Módulo de Comunicação com Pacientes
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-semibold border border-emerald-300 dark:border-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Meta WhatsApp API Oficial
                </span>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  v21.0
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {role === "ACS" ? (
                  <>
                    <strong className="text-blue-600 dark:text-blue-400 font-semibold">
                      Modo ACS ({userProfile?.name}):
                    </strong>{" "}
                    Envio de mensagens oficiais de saúde aos pacientes da sua{" "}
                    <strong>Microárea {userProfile?.assignedMicroareaCodes?.[0] || "01"}</strong>.
                  </>
                ) : role === "GERENTE" ? (
                  <>
                    <strong className="text-purple-600 dark:text-purple-400 font-semibold">
                      Modo Gerente de Unidade ({userUnitNome || "USF Arrozal 3"}):
                    </strong>{" "}
                    Supervisão de todas as conversas da equipe e envio direto aos pacientes da unidade.
                  </>
                ) : (
                  <>
                    <strong className="text-amber-600 dark:text-amber-400 font-semibold">
                      Modo Administrador:
                    </strong>{" "}
                    Acesso completo a todas as unidades, microáreas e configurações da API Meta.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadPatients();
                loadMessages();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer"
              title="Atualizar dados e mensagens"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Atualizar</span>
            </button>

            <button
              onClick={() => setIsConfigModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-lg transition-colors cursor-pointer"
            >
              <Smartphone className="h-3.5 w-3.5 text-emerald-600" />
              <span>Configuração Meta API</span>
            </button>
          </div>
        </div>

        {/* Notificação Temporária de Sucesso */}
        {sendSuccessBanner && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs rounded-xl flex items-center justify-between transition-all animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{sendSuccessBanner}</span>
            </div>
            <button
              onClick={() => setSendSuccessBanner(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Layout Principal: 3 Colunas Integradas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* =========================================================================
              COLUNA ESQUERDA: Diretório de Pacientes e Filtros de Microárea (4 colunas)
              ========================================================================= */}
          <div className="lg:col-span-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xs flex flex-col h-[750px] overflow-hidden">
            {/* Cabeçalho e Barra de Pesquisa */}
            <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-blue-600" />
                  Pacientes para Contato ({filteredPatients.length})
                </span>
                <span className="text-[11px] text-zinc-400 font-medium">
                  {role === "ACS" ? "Sua Microárea" : "USF Arrozal 3"}
                </span>
              </div>

              {/* Input de Busca */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, telefone ou CPF..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Filtros em linha */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Microárea: Interativa para Gerente/Admin, Fixa para ACS */}
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-0.5">
                    Microárea:
                  </label>
                  {role === "ACS" ? (
                    <div className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 rounded border border-zinc-200 dark:border-zinc-700 truncate">
                      MA {userProfile?.assignedMicroareaCodes?.[0] || "01"} (Atribuída)
                    </div>
                  ) : (
                    <select
                      value={filterMicroarea}
                      onChange={(e) => setFilterMicroarea(e.target.value)}
                      className="w-full px-2 py-1 text-[11px] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
                    >
                      <option value="Todas">Todas as Microáreas</option>
                      {Array.from(new Set(patients.map(p => p.microarea))).map((microarea) => (
                        <option key={microarea} value={microarea}>
                          {microarea}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Prioridade Clínica */}
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 mb-0.5">
                    Prioridade Clínica:
                  </label>
                  <select
                    value={filterPriority}
                    onChange={(e) => setFilterPriority(e.target.value)}
                    className="w-full px-2 py-1 text-[11px] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
                  >
                    <option value="Todas">Todas Prioridades</option>
                    <option value="Alta">Alta Prioridade</option>
                    <option value="Média">Média Prioridade</option>
                    <option value="Atenção">Atenção</option>
                    <option value="Acompanhado">Acompanhado</option>
                  </select>
                </div>
              </div>

              {/* Abas Rápidas de Status de Contato */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-700 text-[11px]">
                <button
                  onClick={() => setFilterStatus("todos")}
                  className={`flex-1 py-1 text-center font-medium transition-colors ${
                    filterStatus === "todos"
                      ? "border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400 font-semibold"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Todos ({patients.length})
                </button>
                <button
                  onClick={() => setFilterStatus("com_mensagens")}
                  className={`flex-1 py-1 text-center font-medium transition-colors ${
                    filterStatus === "com_mensagens"
                      ? "border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400 font-semibold"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Com Conversa
                </button>
                <button
                  onClick={() => setFilterStatus("sem_mensagens")}
                  className={`flex-1 py-1 text-center font-medium transition-colors ${
                    filterStatus === "sem_mensagens"
                      ? "border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400 font-semibold"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  Sem Contato
                </button>
              </div>
            </div>

            {/* Lista Rolável de Pacientes */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
              {loadingPatients ? (
                <div className="p-8 text-center text-xs text-zinc-400">
                  Carregando lista de pacientes...
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-500 space-y-1">
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Nenhum paciente encontrado.
                  </p>
                  <p>Ajuste os filtros de busca ou microárea.</p>
                </div>
              ) : (
                filteredPatients.map((patient) => {
                  const isSelected = activePatient?.id === patient.id;
                  const patientMsgs = messages.filter((m) => m.patientId === patient.id);
                  const lastMsg = patientMsgs[patientMsgs.length - 1];

                  return (
                    <div
                      key={patient.id}
                      onClick={() => setSelectedPatientId(patient.id)}
                      className={`p-3 transition-colors cursor-pointer flex items-start gap-3 text-left ${
                        isSelected
                          ? "bg-emerald-50/70 dark:bg-emerald-950/40 border-l-4 border-emerald-600"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      {/* Avatar Inicial */}
                      <div
                        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          patient.priority === "Alta"
                            ? "bg-red-100 text-red-700 ring-2 ring-red-400/50 dark:bg-red-950 dark:text-red-300"
                            : patient.priority === "Média"
                            ? "bg-amber-100 text-amber-700 ring-2 ring-amber-400/50 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        }`}
                      >
                        {patient.name.substring(0, 2).toUpperCase()}
                        {patient.priority === "Alta" && (
                          <span
                            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-1 ring-white"
                            title="Alta Prioridade"
                          />
                        )}
                      </div>

                      {/* Informações Resumidas */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                            {patient.name}
                          </h2>
                          {lastMsg && (
                            <span className="text-[10px] text-zinc-400 shrink-0">
                              {new Date(lastMsg.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          <span>{patient.phone || "Sem telefone"}</span>
                          <span>•</span>
                          <span className="font-medium text-zinc-600 dark:text-zinc-300">
                            {patient.microarea || "MA 01"}
                          </span>
                        </div>

                        {/* Prévia da Última Mensagem ou Tag de Busca Ativa */}
                        <div className="mt-1 flex items-center justify-between text-[11px]">
                          {lastMsg ? (
                            <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 truncate max-w-[85%]">
                              {lastMsg.direction === "outgoing" && (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {lastMsg.status === "read" ? (
                                    <CheckCheck className="h-3 w-3 text-blue-500 inline" />
                                  ) : (
                                    <Check className="h-3 w-3 inline" />
                                  )}
                                </span>
                              )}
                              <span className="truncate">{lastMsg.content}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] italic text-zinc-400">
                              Sem mensagens anteriores
                            </span>
                          )}

                          <BadgePriority priority={patient.priority} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* =========================================================================
              COLUNA CENTRAL: Painel de Conversa e Envio de Mensagem Oficial Meta (5 colunas)
              ========================================================================= */}
          <div className="lg:col-span-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xs flex flex-col h-[750px] overflow-hidden">
            {activePatient ? (
              <>
                {/* Cabeçalho do Chat */}
                <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold uppercase">
                      {activePatient.name.substring(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          {activePatient.name}
                        </h2>
                        <BadgePriority priority={activePatient.priority} />
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-emerald-600" />
                          {activePatient.phone}
                        </span>
                        <span>•</span>
                        <span>{activePatient.microarea || "Microárea 01"}</span>
                        <span>•</span>
                        <span>ACS: {activePatient.acsName?.split(" ")[0] || "Ana"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ações Rápidas no Topo */}
                  <div className="flex items-center gap-1.5">
                    <a
                      href={getDirectWhatsAppUrl(activePatient.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg transition-colors cursor-pointer"
                      title="Abrir no WhatsApp Web (Contingência)"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => setIsPatientDetailsModalOpen(true)}
                      className="p-1.5 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg transition-colors cursor-pointer"
                      title="Ver prontuário rápido"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Aviso de Conformidade Meta WhatsApp Business */}
                <div className="bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-emerald-100 dark:border-emerald-900/40 px-3.5 py-1.5 flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-1.5 truncate">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">
                      <strong>Conformidade Meta:</strong> Mensagens ativas utilizam Modelos Pré-Aprovados.
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold underline cursor-pointer shrink-0" onClick={() => setIsConfigModalOpen(true)}>
                    Regra 24h
                  </span>
                </div>

                {/* Feed de Mensagens */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-50/50 dark:bg-zinc-950/40">
                  {activePatientMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400 space-y-2">
                      <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600">
                        <MessageSquareText className="h-6 w-6" />
                      </div>
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Nenhuma mensagem enviada para este paciente ainda.
                      </p>
                      <p className="text-[11px] max-w-xs">
                        Utilize os modelos pré-aprovados da Meta abaixo para enviar lembretes de exames, convocações de busca ativa ou avisos de visita do ACS.
                      </p>
                    </div>
                  ) : (
                    activePatientMessages.map((msg) => {
                      const isOutgoing = msg.direction === "outgoing";

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isOutgoing ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-2xs text-xs space-y-1 ${
                              isOutgoing
                                ? "bg-emerald-600 text-white rounded-tr-xs"
                                : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-tl-xs"
                            }`}
                          >
                            {/* Cabeçalho do Remetente */}
                            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold opacity-90 pb-1 border-b border-white/20 dark:border-zinc-700">
                              <span>
                                {isOutgoing
                                  ? `${msg.senderName} (${msg.senderRole})`
                                  : msg.patientName}
                              </span>
                              {msg.type === "template" && (
                                <span className="bg-emerald-700/60 text-[9px] px-1.5 py-0.2 rounded uppercase tracking-wider">
                                  Modelo Meta
                                </span>
                              )}
                            </div>

                            {/* Conteúdo */}
                            <p className="whitespace-pre-line leading-relaxed text-[11.5px]">
                              {msg.content}
                            </p>

                            {/* Rodapé com Horário e Status Meta */}
                            <div className="flex items-center justify-end gap-1 text-[10px] opacity-80 pt-0.5">
                              <span>
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {isOutgoing && (
                                <span>
                                  {msg.status === "sending" && <Clock className="h-3 w-3" />}
                                  {msg.status === "sent" && <Check className="h-3 w-3" />}
                                  {msg.status === "delivered" && <CheckCheck className="h-3 w-3 text-zinc-200" />}
                                  {msg.status === "read" && (
                                    <CheckCheck className="h-3 w-3 text-sky-200 font-bold" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Área de Composição e Envio */}
                <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2.5">
                  {/* Seletor de Modo: Modelo Meta vs Mensagem Livre */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
                      <button
                        type="button"
                        onClick={() => setComposerMode("template")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                          composerMode === "template"
                            ? "bg-white dark:bg-zinc-700 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                            : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        Modelos Oficiais Meta ({META_WHATSAPP_TEMPLATES.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setComposerMode("text")}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                          composerMode === "text"
                            ? "bg-white dark:bg-zinc-700 text-emerald-700 dark:text-emerald-300 shadow-2xs"
                            : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        Mensagem Livre (Janela 24h)
                      </button>
                    </div>

                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={registerInTimeline}
                        onChange={(e) => setRegisterInTimeline(e.target.checked)}
                        className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 h-3 w-3"
                      />
                      <span>Registrar no Prontuário</span>
                    </label>
                  </div>

                  <form onSubmit={handleSendMessage} className="space-y-2">
                    {composerMode === "template" ? (
                      <div className="space-y-2">
                        {/* Seletor de Template */}
                        <div>
                          <label className="block text-[10px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                            Selecione o Modelo de Saúde:
                          </label>
                          <select
                            value={selectedTemplateId}
                            onChange={(e) => setSelectedTemplateId(e.target.value)}
                            className="w-full text-xs font-semibold px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            {META_WHATSAPP_TEMPLATES.map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Parâmetros do Template */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {currentTemplate.paramPlaceholders.map((param) => (
                            <div key={param.key}>
                              <label className="block text-[10px] font-medium text-zinc-500 truncate mb-0.5">
                                {param.label}:
                              </label>
                              <input
                                type="text"
                                value={templateCustomParams[param.key] || ""}
                                onChange={(e) =>
                                  setTemplateCustomParams({
                                    ...templateCustomParams,
                                    [param.key]: e.target.value,
                                  })
                                }
                                placeholder={param.defaultValue}
                                className="w-full px-2 py-1 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-800 dark:text-zinc-200 focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>

                        {/* Prévia do WhatsApp Oficial */}
                        <div className="bg-emerald-50/40 dark:bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-200/80 dark:border-emerald-800/60">
                          <span className="block text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            Prévia da Mensagem (WhatsApp Paciente):
                          </span>
                          <p className="text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed italic">
                            &ldquo;{renderedTemplatePreview}&rdquo;
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* Modo Texto Livre */
                      <div>
                        <textarea
                          rows={3}
                          placeholder={`Digite sua mensagem para ${activePatient.name}...`}
                          value={freeText}
                          onChange={(e) => setFreeText(e.target.value)}
                          className="w-full p-2.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                        />
                      </div>
                    )}

                    {/* Botão de Envio */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                        <Smartphone className="h-3 w-3 text-emerald-600" />
                        <span>Destinatário: {formatPhoneNumberForMeta(activePatient.phone)}</span>
                      </div>

                      <button
                        type="submit"
                        disabled={isSending || (composerMode === "text" && !freeText.trim())}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                      >
                        {isSending ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Despachando...</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            <span>Enviar via Meta WhatsApp</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center p-8 text-center text-zinc-400">
                Selecione um paciente para iniciar a conversa.
              </div>
            )}
          </div>

          {/* =========================================================================
              COLUNA DIREITA: Contexto Clínico do Paciente & Supervisão da USF (3 colunas)
              ========================================================================= */}
          <div className="lg:col-span-3 space-y-4">
            {/* Card 1: Prontuário Rápido do Paciente Selecionado */}
            {activePatient && (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <HeartPulse className="h-3.5 w-3.5 text-rose-500" />
                    Condição Clínica Atual
                  </span>
                  <BadgePriority priority={activePatient.priority} />
                </div>

                <div className="space-y-2 text-xs">
                  {/* Pressão Arterial */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <span className="text-zinc-500 dark:text-zinc-400">Última Pressão (PA):</span>
                    <span
                      className={`font-bold ${
                        activePatient.lastPA && activePatient.lastPA.systolic >= 140
                          ? "text-red-600 dark:text-red-400"
                          : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {activePatient.lastPA
                        ? `${activePatient.lastPA.systolic}/${activePatient.lastPA.diastolic} mmHg`
                        : "Sem registro"}
                    </span>
                  </div>

                  {/* IMC e Peso */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <span className="text-zinc-500 dark:text-zinc-400">Peso / IMC:</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {activePatient.lastWeight
                        ? `${activePatient.lastWeight.weight} kg (IMC ${activePatient.lastWeight.imc})`
                        : "Sem medição"}
                    </span>
                  </div>

                  {/* Visita ACS */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <span className="text-zinc-500 dark:text-zinc-400">Última Visita ACS:</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {formatDateBR(activePatient.lastVisitDate)}
                    </span>
                  </div>

                  {/* Consulta Médica */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50">
                    <span className="text-zinc-500 dark:text-zinc-400">Última Consulta:</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                      {formatDateBR(activePatient.lastMedicalApptDate)}
                    </span>
                  </div>
                </div>

                {/* Motivo de Busca Ativa */}
                {activePatient.activeSearchReason && (
                  <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200/80 dark:border-red-900/40 text-[11px] text-red-800 dark:text-red-300 space-y-1">
                    <span className="font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Motivo da Busca Ativa:
                    </span>
                    <p className="leading-snug">{activePatient.activeSearchReason}</p>
                  </div>
                )}
              </div>
            )}

            {/* Card 2: Painel de Supervisão e Métricas de Comunicação */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-2xs space-y-3">
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-emerald-600" />
                Supervisão de Mensagens
              </span>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60">
                  <span className="block text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                    {stats.totalMsgs}
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Total Enviadas</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60">
                  <span className="block text-lg font-extrabold text-blue-600 dark:text-blue-400">
                    {stats.uniquePatientsContacted}
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Pacientes Atingidos</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60">
                  <span className="block text-lg font-extrabold text-zinc-800 dark:text-zinc-200">
                    {stats.deliveredCount}
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Entregues</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60">
                  <span className="block text-lg font-extrabold text-sky-600 dark:text-sky-400">
                    {stats.readCount}
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">Lidas pelo Paciente</span>
                </div>
              </div>

              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/40 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-700">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Gerente de Unidade:
                </span>
                Todas as mensagens enviadas por ACS ficam registradas neste histórico unificado para monitoramento de metas do Previne Brasil / APS.
              </div>
            </div>

            {/* Card 3: Status da API da Meta e Documentação */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-950/40 dark:to-teal-950/30 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/80 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Meta Cloud API Status
                </span>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-2 py-0.5 rounded-full font-bold">
                  {metaConfigStatus?.configured ? "Em Produção" : "Sandbox / Demo"}
                </span>
              </div>

              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                Integração oficial via WhatsApp Business Cloud API. Permite disparos em lote e comunicação direta criptografada ponta a ponta.
              </p>

              <button
                onClick={() => setIsConfigModalOpen(true)}
                className="w-full text-center text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-zinc-800 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Ver Instruções & Webhook
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MODAL: Configuração da API da Meta WhatsApp & Variáveis de Ambiente
          ========================================================================= */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title="Configuração da API Oficial Meta WhatsApp"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-900 dark:text-emerald-200 space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              API Oficial da Meta (WhatsApp Business Platform)
            </span>
            <p className="text-[11.5px] leading-relaxed">
              O módulo está totalmente pronto para produção. Para habilitar o envio direto aos números reais de WhatsApp, basta cadastrar as credenciais do seu aplicativo Meta Developers no arquivo <code className="bg-emerald-100 dark:bg-emerald-900 px-1 rounded">.env.local</code>.
            </p>
          </div>

          {/* Variáveis de Ambiente Necessárias */}
          <div className="space-y-2">
            <span className="font-bold text-zinc-900 dark:text-zinc-100 block">
              Variáveis de Ambiente no <code className="text-blue-600">.env.local</code>:
            </span>

            <div className="bg-zinc-900 text-zinc-200 p-3 rounded-xl font-mono text-[11px] space-y-1 overflow-x-auto">
              <p># Meta WhatsApp Cloud API Credentials</p>
              <p>META_WA_PHONE_NUMBER_ID=123456789012345</p>
              <p>META_WA_ACCESS_TOKEN=EAAG...SEU_TOKEN_PERMANENTE...</p>
              <p>META_WA_BUSINESS_ACCOUNT_ID=987654321098765</p>
              <p>META_WA_VERIFY_TOKEN=pirai_dcnt_meta_webhook_token</p>
              <p>META_WA_API_VERSION=v21.0</p>
            </div>
          </div>

          {/* Endpoint de Webhook */}
          <div className="space-y-1.5">
            <span className="font-bold text-zinc-900 dark:text-zinc-100 block">
              Endpoint para Webhook da Meta (Callbacks e Recibos):
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/meta/whatsapp/webhook`}
                className="flex-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 rounded-lg text-zinc-800 dark:text-zinc-200 text-xs font-mono select-all"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/api/meta/whatsapp/webhook`
                  );
                  setCopiedWebhook(true);
                  setTimeout(() => setCopiedWebhook(false), 2000);
                }}
                className="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded-lg font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 cursor-pointer"
              >
                {copiedWebhook ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedWebhook ? "Copiado!" : "Copiar"}</span>
              </button>
            </div>
            <p className="text-[10.5px] text-zinc-500">
              Token de verificação configurado no webhook: <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">pirai_dcnt_meta_webhook_token</code>
            </p>
          </div>

          {/* Regras e Boas Práticas da Meta */}
          <div className="space-y-1.5 border-t border-zinc-200 dark:border-zinc-800 pt-3">
            <span className="font-bold text-zinc-900 dark:text-zinc-100 block">
              Regras do WhatsApp Business Platform:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
              <li>
                <strong>Janela de Atendimento (24 Horas):</strong> Mensagens iniciadas pelo serviço de saúde devem usar Modelos Pré-Aprovados (Templates). Respostas do paciente abrem janela de 24h para mensagens livres.
              </li>
              <li>
                <strong>Privacidade e LGPD:</strong> Números de telefone e mensagens de saúde pública são restritos aos ACSs da respectiva Microárea e à coordenação da Unidade.
              </li>
              <li>
                <strong>Ambiente de Demonstração:</strong> Enquanto as chaves reais não forem informadas no ambiente, o sistema simula o envio completo com identificador único <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">wamid</code> para fins de teste e validação de fluxo.
              </li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* =========================================================================
          MODAL: Detalhes Rápidos do Paciente
          ========================================================================= */}
      <Modal
        isOpen={isPatientDetailsModalOpen}
        onClose={() => setIsPatientDetailsModalOpen(false)}
        title={activePatient ? `Ficha Rápida: ${activePatient.name}` : "Prontuário"}
      >
        {activePatient && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-700">
              <div>
                <span className="text-[10px] text-zinc-400 block">CPF:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{activePatient.cpf}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">Cartão SUS (CNS):</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{activePatient.cns}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">Idade / Sexo:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{activePatient.age} anos • {activePatient.sex}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">Telefone:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{activePatient.phone}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">Unidade de Saúde:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{activePatient.unit}</span>
              </div>
              <div>
                <span className="text-[10px] text-zinc-400 block">Microárea / ACS:</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{activePatient.microarea} ({activePatient.acsName})</span>
              </div>
            </div>

            {/* Linha do Tempo de Ações do Paciente */}
            <div className="space-y-2">
              <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                Histórico Recente de Acompanhamento:
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {activePatient.timeline && activePatient.timeline.length > 0 ? (
                  activePatient.timeline.map((event) => (
                    <div
                      key={event.id}
                      className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 text-[11px] space-y-0.5"
                    >
                      <div className="flex items-center justify-between font-semibold text-zinc-800 dark:text-zinc-200">
                        <span>{event.title}</span>
                        <span className="text-zinc-400 text-[10px]">{formatDateBR(event.date)}</span>
                      </div>
                      <p className="text-zinc-500 dark:text-zinc-400">{event.description}</p>
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 block font-medium">
                        Profissional: {event.professional}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-zinc-400 italic">Nenhum evento registrado ainda.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
