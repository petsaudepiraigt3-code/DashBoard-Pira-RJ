import { NextRequest, NextResponse } from "next/server";

/**
 * Endpoint de verificação do Webhook da Meta (GET)
 * A Meta envia: hub.mode, hub.verify_token, hub.challenge
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WA_VERIFY_TOKEN || "pirai_dcnt_meta_webhook_token";

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Token de verificação do webhook inválido." }, { status: 403 });
}

/**
 * Endpoint de recepção de eventos do Webhook da Meta (POST)
 * Recebe recibos de entrega (sent, delivered, read) e mensagens enviadas pelos pacientes
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Verificação de estrutura de evento do WhatsApp Cloud API
    if (body.object === "whatsapp_business_account") {
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (value) {
            // Recibos de status (sent, delivered, read, failed)
            const statuses = value.statuses || [];
            for (const status of statuses) {
              console.log(`[Meta Webhook] Status atualizado: ID ${status.id} -> ${status.status}`);
            }

            // Mensagens recebidas dos pacientes
            const messages = value.messages || [];
            for (const message of messages) {
              console.log(`[Meta Webhook] Mensagem recebida de ${message.from}: ${message.text?.body || message.type}`);
            }
          }
        }
      }

      return NextResponse.json({ status: "EVENT_RECEIVED" }, { status: 200 });
    }

    return NextResponse.json({ error: "Objeto desconhecido." }, { status: 404 });
  } catch (error) {
    console.error("Erro ao processar Webhook da Meta:", error);
    return NextResponse.json({ error: "Erro interno no Webhook." }, { status: 500 });
  }
}
