import { NextRequest, NextResponse } from "next/server";
import { AccessError, requireAccess } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    await requireAccess(req);
    const body = await req.json();
    const {
      to,
      type,
      templateName,
      templateParams,
      content,
      senderRole,
    } = body;

    if (!to) {
      return NextResponse.json(
        { error: "Número do destinatário ('to') é obrigatório." },
        { status: 400 }
      );
    }

    const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
    const accessToken = process.env.META_WA_ACCESS_TOKEN;
    const apiVersion = process.env.META_WA_API_VERSION || "v21.0";

    // 1. Se as credenciais reais da Meta estiverem configuradas no ambiente
    if (phoneNumberId && accessToken) {
      let metaPayload: any = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
      };

      if (type === "template" && templateName) {
        metaPayload = {
          ...metaPayload,
          type: "template",
          template: {
            name: templateName,
            language: { code: "pt_BR" },
            components: templateParams && templateParams.length > 0 ? [
              {
                type: "body",
                parameters: templateParams.map((p: string) => ({
                  type: "text",
                  text: p,
                })),
              }
            ] : undefined,
          },
        };
      } else {
        // Mensagem de texto livre (respeitando a janela de 24h da Meta)
        metaPayload = {
          ...metaPayload,
          type: "text",
          text: {
            preview_url: false,
            body: content,
          },
        };
      }

      const metaRes = await fetch(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(metaPayload),
        }
      );

      const metaData = await metaRes.json();

      if (!metaRes.ok) {
        console.error("Erro retornado pela API da Meta:", metaData);
        return NextResponse.json(
          {
            error: metaData.error?.message || "Erro na API da Meta WhatsApp.",
            metaDetails: metaData.error,
            fallbackToDemo: false,
          },
          { status: metaRes.status }
        );
      }

      const metaMessageId = metaData.messages?.[0]?.id || `wamid.${Date.now()}`;
      return NextResponse.json({
        success: true,
        metaMessageId,
        status: "sent",
        environment: "production",
        metaResponse: metaData,
      });
    }

    // 2. Ambiente de Demonstração / Sandbox (quando as chaves reais ainda não foram inseridas no .env)
    const simulatedMessageId = `wamid.HBgM${to}UCABEYE${Math.random().toString(36).substring(2, 10).toUpperCase()}A=`;

    return NextResponse.json({
      success: true,
      metaMessageId: simulatedMessageId,
      status: "sent",
      environment: "demo_sandbox",
      notice: "Mensagem processada em modo de demonstração. Configure META_WA_PHONE_NUMBER_ID e META_WA_ACCESS_TOKEN no .env.local para envio em produção real.",
      simulatedDispatch: {
        to,
        type,
        templateName,
        senderRole,
        dispatchedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erro interno no envio de mensagem WhatsApp:", error);
    return NextResponse.json(
      { error: "Erro interno ao processar envio de mensagem." },
      { status: 500 }
    );
  }
}
