"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "./modal";
import { Patient, PatientActionType, PriorityLevel } from "@/types/dcnt";
import { savePatientActionInFirestore } from "@/lib/firebase/patients";
import { useAuth } from "@/context/auth-context";

interface RegisterActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onActionSaved?: (updatedPatient: Patient) => void;
}

export function RegisterActionModal({
  isOpen,
  onClose,
  patient,
  onActionSaved,
}: RegisterActionModalProps) {
  const { role, userUnitId, userProfile } = useAuth();

  const [actionDate, setActionDate] = useState("");
  const [actionType, setActionType] = useState<PatientActionType>("Visita Domiciliar");
  const [actionResult, setActionResult] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [nextReturnDate, setNextReturnDate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      setActionDate(`${year}-${month}-${day}`);
      setActionType("Visita Domiciliar");
      setActionResult("");
      setActionNotes("");
      setNextReturnDate("");
    }
  }, [isOpen]);

  if (!patient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (role !== "ACS") {
      alert("Apenas Agentes Comunitários de Saúde (ACS) possuem permissão para registrar ações operacionais.");
      onClose();
      return;
    }

    setSaving(true);

    try {
      const isNoStatusChange = actionType === "Tentativa Sem Sucesso" || actionType === "Retorno Agendado";
      const isVisit = actionType === "Visita Domiciliar";
      const isSuccessfulContact = isVisit || actionType === "Contato Telefônico" || actionType === "Atendimento/Comparecimento na UBS";

      const newPriority: PriorityLevel | undefined = isNoStatusChange
        ? undefined
        : isSuccessfulContact
        ? "Acompanhado"
        : undefined;

      const newVisitDate = isVisit ? actionDate : undefined;

      const savedAction = await savePatientActionInFirestore(
        patient.id,
        {
          patientId: patient.id,
          unidadeId: patient.unidadeId || userUnitId || "USF-003",
          microarea: patient.microarea,
          microareaCodigo: (patient.microarea || "").replace(/\D/g, "").trim(),
          acsId: userProfile?.uid || "acs-uid",
          acsNome: userProfile?.name || patient.acsName || "ACS responsável",
          tipoAcao: actionType,
          dataAcao: actionDate,
          resultado: actionResult,
          observacoes: actionNotes,
          proximoRetorno: nextReturnDate,
        },
        newPriority,
        newVisitDate,
        role
      );

      const currentHistorico = patient.historicoAcoes || [];
      const updatedHistorico = [savedAction, ...currentHistorico];

      const updatedPriority = isNoStatusChange
        ? patient.priority
        : isSuccessfulContact
        ? ("Acompanhado" as PriorityLevel)
        : patient.priority;

      const updatedStatus = isNoStatusChange
        ? patient.activeSearchStatus
        : isSuccessfulContact
        ? ("Acompanhado" as const)
        : patient.activeSearchStatus;

      const updatedPatient: Patient = {
        ...patient,
        lastVisitDate: isVisit ? actionDate : patient.lastVisitDate,
        activeSearchStatus: updatedStatus,
        priority: updatedPriority,
        historicoAcoes: updatedHistorico,
        timeline: [
          {
            id: savedAction.id,
            date: actionDate,
            type: (isVisit ? "Visita ACS" : actionType === "Contato Telefônico" ? "Contato Telefônico" : "Busca Ativa") as any,
            title: `Registro de ${actionType}`,
            description: `${actionResult}${actionNotes ? `. OBS: ${actionNotes}` : ""}`,
            professional: userProfile?.name || "Operador de Saúde",
          },
          ...(patient.timeline || []),
        ],
      };

      if (onActionSaved) {
        onActionSaved(updatedPatient);
      }

      onClose();
    } catch (err) {
      console.error("Erro ao salvar ação:", err);
      alert("Ocorreu um erro ao salvar a ação. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Registrar Ação — ${patient.name}`}
      subtitle={`Microárea: ${patient.microarea} | ACS: ${patient.acsName}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Data da Ação</label>
            <input
              type="date"
              required
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Tipo de Ação</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as PatientActionType)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="Visita Domiciliar">Visita Domiciliar</option>
              <option value="Contato Telefônico">Contato Telefônico</option>
              <option value="Tentativa Sem Sucesso">Tentativa Sem Sucesso</option>
              <option value="Encaminhamento para Consulta">Encaminhamento para Consulta</option>
              <option value="Retorno Agendado">Retorno Agendado</option>
              <option value="Atendimento/Comparecimento na UBS">Atendimento/Comparecimento na UBS</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Resultado / Diagnóstico de Campo</label>
          <input
            type="text"
            required
            value={actionResult}
            onChange={(e) => setActionResult(e.target.value)}
            placeholder="Ex: Paciente orientado, PA aferida em 135/85 mmHg"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Observações e Orientações</label>
          <textarea
            rows={3}
            value={actionNotes}
            onChange={(e) => setActionNotes(e.target.value)}
            placeholder="Digite observações sobre medicação, recusa ou situação encontrada..."
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Previsão de Próximo Retorno (Opcional)</label>
          <input
            type="date"
            value={nextReturnDate}
            onChange={(e) => setNextReturnDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar Acompanhamento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
