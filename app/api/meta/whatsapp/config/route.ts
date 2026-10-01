import { NextResponse } from "next/server";

export async function GET() {
  const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WA_ACCESS_TOKEN;
  const businessAccountId = process.env.META_WA_BUSINESS_ACCOUNT_ID;
  const apiVersion = process.env.META_WA_API_VERSION || "v21.0";

  const configured = Boolean(phoneNumberId && accessToken);

  return NextResponse.json({
    configured,
    environment: configured ? "production" : "demo_sandbox",
    phoneNumberIdSet: Boolean(phoneNumberId),
    maskedPhoneNumberId: phoneNumberId ? `***${phoneNumberId.slice(-4)}` : "Não configurado",
    businessAccountIdSet: Boolean(businessAccountId),
    tokenSet: Boolean(accessToken),
    apiVersion,
    webhookUrl: "/api/meta/whatsapp/webhook",
  });
}
