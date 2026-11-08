import { supabase } from "@/lib/supabase";
import { WhatsAppMessage, WhatsAppMessageStatus, MetaApiConfigStatus } from "@/types/messages";
import { db } from "@/lib/store/documents";
import { collection, doc, getDocs, setDoc, query, orderBy, where } from "@/lib/store/documents";
import { savePatientActionInStore } from "../store/patients";


/**
 * Normaliza número de telefone brasileiro para o padrão E.164 sem '+' exigido pela API da Meta
 * Ex: "(11) 98765-4321" -> "5511987654321"
 */
export function formatPhoneNumberForMeta(rawPhone: string): string {
  if (!rawPhone) return "";
  const cleaned = rawPhone.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return `55${cleaned}`;
  }
  if (cleaned.length === 10) {
    // Adiciona o nono dígito padrão se faltar
    return `55${cleaned.substring(0, 2)}9${cleaned.substring(2)}`;
  }
  if (cleaned.length === 12 || cleaned.length === 13) {
    return cleaned;
  }
  return cleaned ? `55${cleaned}` : "";
}

/**
 * Formata telefone para exibição amigável
 * Ex: "5511987654321" -> "(11) 98765-4321"
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return "(Não informado)";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.substring(2, 4);
    const part1 = digits.substring(4, 9);
    const part2 = digits.substring(9);
    return `(${ddd}) ${part1}-${part2}`;
  }
  if (digits.length === 11) {
    const ddd = digits.substring(0, 2);
    const part1 = digits.substring(2, 7);
    const part2 = digits.substring(7);
    return `(${ddd}) ${part1}-${part2}`;
  }
  return phone;
}

export async function getWhatsAppMessages(options?: {
  patientId?: string;
  unitId?: string;
  microarea?: string;
}): Promise<WhatsAppMessage[]> {
  try {
    const messagesRef = collection(db, "mensagens_whatsapp");
    let q = query(messagesRef, orderBy("timestamp", "asc"));

    if (options?.patientId) {
      q = query(messagesRef, where("patientId", "==", options.patientId), orderBy("timestamp", "asc"));
    }

    const snap = await getDocs(q);
    if (!snap.empty) {
      const result: WhatsAppMessage[] = [];
      snap.forEach((d) => result.push(d.data() as WhatsAppMessage));
      return result;
    }
  } catch (err) {
    // Falha graciosa para armazenamento local/demo
  }

  return [];
}

/**
 * Envia uma mensagem via Meta WhatsApp Cloud API (chamando o endpoint backend)
 */
export async function sendWhatsAppMessageViaMeta(payload: {
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientCpf?: string;
  unitId?: string;
  unitName?: string;
  microarea: string;
  senderId: string;
  senderName: string;
  senderRole: "ACS" | "GERENTE" | "ADMIN";
  type: "template" | "text";
  templateName?: string;
  templateTitle?: string;
  templateParams?: string[];
  content: string;
  registerInTimeline?: boolean;
}): Promise<WhatsAppMessage> {
  const metaPhone = formatPhoneNumberForMeta(payload.patientPhone);

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newMessage: WhatsAppMessage = {
    id: messageId,
    patientId: payload.patientId,
    patientName: payload.patientName,
    patientPhone: payload.patientPhone,
    patientCpf: payload.patientCpf,
    unitId: payload.unitId,
    unitName: payload.unitName,
    microarea: payload.microarea,
    senderId: payload.senderId,
    senderName: payload.senderName,
    senderRole: payload.senderRole,
    direction: "outgoing",
    type: payload.type,
    templateName: payload.templateName,
    templateTitle: payload.templateTitle,
    content: payload.content,
    status: "sent",
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
  };

  // 1. Tentar despachar via rota API da Meta
  try {
    const res = await fetch("/api/meta/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}` },
      body: JSON.stringify({
        ...payload,
        to: metaPhone,
      }),
    });

    if (!res.ok) throw new Error("Não foi possível enviar a mensagem.");
    if (res.ok) {
      const data = await res.json();
      if (data.metaMessageId) {
        newMessage.metaMessageId = data.metaMessageId;
      }
      if (data.status) {
        newMessage.status = data.status;
      }
    }
  } catch (apiErr) {
    throw apiErr;
  }

  // 2. Persistir no Store
  try {
    const docRef = doc(db, "mensagens_whatsapp", newMessage.id);
    await setDoc(docRef, newMessage);
  } catch (fsErr) {
    throw fsErr;
  }

  // 4. Se solicitado, registrar ação no prontuário/linha do tempo do paciente
  if (payload.registerInTimeline) {
    try {
      await savePatientActionInStore(
        payload.patientId,
        {
          patientId: payload.patientId,
          unidadeId: payload.unitId || "USF-003",
          microarea: payload.microarea,
          acsId: payload.senderId,
          acsNome: payload.senderName,
          tipoAcao: "Contato Telefônico",
          dataAcao: new Date().toISOString().substring(0, 10),
          resultado: `Mensagem WhatsApp enviada (${payload.templateTitle || "Mensagem Livre"}) via Meta API`,
          observacoes: `Conteúdo da mensagem: "${payload.content.substring(0, 120)}..."`,
        },
        undefined,
        undefined,
        payload.senderRole === "ACS" ? "ACS" : undefined
      );
    } catch (actErr) {
      console.warn("Aviso ao registrar ação no prontuário:", actErr);
    }
  }

  return newMessage;
}

/**
 * Gera URL para abrir conversa diretamente no WhatsApp Web como contingência
 */
export function getDirectWhatsAppUrl(phone: string, text?: string): string {
  const metaPhone = formatPhoneNumberForMeta(phone);
  const encodedText = text ? encodeURIComponent(text) : "";
  return `https://wa.me/${metaPhone}${encodedText ? `?text=${encodedText}` : ""}`;
}
