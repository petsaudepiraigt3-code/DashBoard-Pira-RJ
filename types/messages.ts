export type WhatsAppMessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";
export type WhatsAppMessageType = "template" | "text";

export interface WhatsAppMessage {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientCpf?: string;
  unitId?: string;
  unitName?: string;
  microarea: string; // ex: "01" ou "Microárea 01"
  senderId: string;
  senderName: string;
  senderRole: "ACS" | "GERENTE" | "ADMIN";
  direction: "outgoing" | "incoming";
  type: WhatsAppMessageType;
  templateName?: string;
  templateTitle?: string;
  content: string;
  status: WhatsAppMessageStatus;
  metaMessageId?: string;
  createdAt: string; // ISO string
  timestamp: number;
  errorDetails?: string;
}

export interface MetaWhatsAppTemplate {
  id: string;
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string; // "pt_BR"
  title: string;
  description: string;
  bodyText: string; // Template com placeholders {{1}}, {{2}}
  paramsCount: number;
  paramPlaceholders: {
    key: string;
    label: string;
    defaultValue?: string;
  }[];
}

export interface MetaApiConfigStatus {
  configured: boolean;
  phoneNumberIdSet: boolean;
  businessAccountIdSet: boolean;
  tokenSet: boolean;
  maskedPhoneNumberId?: string;
  apiVersion: string;
  webhookUrl: string;
  environment: "production" | "demo_sandbox";
}

export interface ConversationSummary {
  patientId: string;
  patientName: string;
  patientPhone: string;
  microarea: string;
  acsName: string;
  lastMessage?: WhatsAppMessage;
  totalMessages: number;
  unreadCount: number;
}
