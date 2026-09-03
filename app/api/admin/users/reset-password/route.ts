import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    // 1. Autorização: Validar ID Token do Administrador no cabeçalho Bearer
    const authHeader = req.headers.get("authorization");
    let requesterUid = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1];
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        requesterUid = decoded.uid;
      } catch (tokenErr) {
        return NextResponse.json({ error: "Token de autenticação inválido ou expirado." }, { status: 401 });
      }
    }

    if (requesterUid) {
      const requesterDoc = await adminDb.collection("usuarios").doc(requesterUid).get();
      if (!requesterDoc.exists || requesterDoc.data()?.perfil !== "ADMIN" || requesterDoc.data()?.ativo === false) {
        return NextResponse.json(
          { error: "Acesso negado. Apenas administradores ativos podem redefinir senhas." },
          { status: 403 }
        );
      }
    }

    // 2. Extração e Validação do Payload
    const body = await req.json();
    const { email, novaSenha, uid } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Informe um e-mail válido para localizar a conta de usuário." }, { status: 400 });
    }

    if (!novaSenha || typeof novaSenha !== "string" || novaSenha.length < 6) {
      return NextResponse.json(
        { error: "A nova senha temporária deve possuir no mínimo 6 caracteres conforme os requisitos do Firebase Auth." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 3. Localizar PRIORITARIAMENTE o usuário no Firebase Authentication por E-mail
    let authUser;
    try {
      authUser = await adminAuth.getUserByEmail(cleanEmail);
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        return NextResponse.json(
          { error: "Não existe conta de login no Firebase Authentication para este e-mail. Utilize o botão 'Criar Acesso' na interface para criar a conta." },
          { status: 404 }
        );
      }
      return NextResponse.json({ error: `Erro na busca Firebase Auth: ${err.message}` }, { status: 500 });
    }

    const authUid = authUser.uid;

    // 4. Atualizar a senha temporária no Firebase Authentication
    try {
      await adminAuth.updateUser(authUid, {
        password: novaSenha,
      });
    } catch (authErr: any) {
      return NextResponse.json(
        { error: `Falha ao atualizar a senha no Firebase Auth: ${authErr.message || authErr}` },
        { status: 500 }
      );
    }

    // 5. Garantir o cadastro definitivo no Cloud Firestore em usuarios/{authUid} sem perder associações
    let existingProfile: any = {};
    if (uid && uid !== authUid) {
      const legacyRef = adminDb.collection("usuarios").doc(uid);
      const legacySnap = await legacyRef.get();
      if (legacySnap.exists) {
        existingProfile = legacySnap.data();
        await legacyRef.update({
          migradoParaUid: authUid,
          registroLegado: true,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const targetRef = adminDb.collection("usuarios").doc(authUid);
    const targetSnap = await targetRef.get();
    const currentData = targetSnap.exists ? targetSnap.data() : {};

    await targetRef.set(
      {
        uid: authUid,
        nome: currentData?.nome || existingProfile?.nome || cleanEmail.split("@")[0],
        email: cleanEmail,
        perfil: currentData?.perfil || existingProfile?.perfil || "GERENTE",
        unidadeId: currentData?.unidadeId || existingProfile?.unidadeId || null,
        ativo: currentData?.ativo !== false && existingProfile?.ativo !== false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json(
      {
        success: true,
        message: "Senha redefinida com sucesso.",
        uid: authUid,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Erro interno ao redefinir senha: ${err.message}` }, { status: 500 });
  }
}
