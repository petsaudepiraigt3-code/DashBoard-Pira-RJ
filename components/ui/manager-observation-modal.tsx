"use client";

import React, { useEffect, useState } from "react";
import { Modal } from "./modal";
import {
  Patient,
  ManagerObservationRecord,
  ManagerObservationRevision,
} from "@/types/dcnt";
import { getPatientManagerObservationsFromStore } from "@/lib/store/patients";
import { ManagerObservationsSection } from "@/components/patients/manager-observations-section";

interface ManagerObservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  onPatientUpdated?: (updatedPatient: Patient) => void;
}

export function ManagerObservationModal({
  isOpen,
  onClose,
  patient,
  onPatientUpdated,
}: ManagerObservationModalProps) {
  const [observations, setObservations] = useState<ManagerObservationRecord[]>([]);
  const [history, setHistory] = useState<ManagerObservationRevision[]>([]);

  useEffect(() => {
    if (!isOpen || !patient) return;

    const initialObs = patient.observacoesGerente || (patient.observacaoGerenteAtual ? [patient.observacaoGerenteAtual] : []);
    const initialHist = patient.historicoObservacoesGerente || [];
    setObservations(initialObs);
    setHistory(initialHist);

    let active = true;
    getPatientManagerObservationsFromStore(patient.id)
      .then((res) => {
        if (!active) return;
        const obsMap = new Map<string, ManagerObservationRecord>();
        initialObs.forEach((o) => { if (o?.id) obsMap.set(o.id, o); });
        res.observations.forEach((o) => { if (o?.id) obsMap.set(o.id, o); });

        const histMap = new Map<string, ManagerObservationRevision>();
        initialHist.forEach((h) => { if (h?.id) histMap.set(h.id, h); });
        res.history.forEach((h) => { if (h?.id) histMap.set(h.id, h); });

        setObservations(
          Array.from(obsMap.values()).sort((a, b) =>
            (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "")
          )
        );
        setHistory(
          Array.from(histMap.values()).sort((a, b) =>
            (b.dataRegistro || "").localeCompare(a.dataRegistro || "")
          )
        );
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isOpen, patient]);

  if (!patient) return null;

  const handleObservationSaved = (
    obs: ManagerObservationRecord,
    histEntry: ManagerObservationRevision,
    isEdit: boolean
  ) => {
    const nextObsList = isEdit
      ? observations.map((o) => (o.id === obs.id ? obs : o))
      : [obs, ...observations];
    const nextHistList = [histEntry, ...history];

    setObservations(nextObsList);
    setHistory(nextHistList);

    if (onPatientUpdated) {
      onPatientUpdated({
        ...patient,
        observacaoGerenteAtual: obs,
        observacoesGerente: nextObsList,
        historicoObservacoesGerente: nextHistList,
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Observações da Gerência — ${patient.name}`}
      subtitle={`Microárea: ${patient.microarea} | ACS: ${patient.acsName}`}
    >
      <div className="max-h-[75vh] overflow-y-auto pr-1">
        <ManagerObservationsSection
          patient={patient}
          observations={observations}
          history={history}
          onObservationSaved={handleObservationSaved}
        />
      </div>
    </Modal>
  );
}

