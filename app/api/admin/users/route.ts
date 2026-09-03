import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    // 1. Autorização: Validar ID Token do solicitante no cabeçalho Bearer
    const authHeader = req.headers.get("authorization");
    let requesterUid = "";
    let requesterRole = "";
    let requesterUnitId = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1];
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        requesterUid = decoded.uid;
      } catch (tokenErr) {
        return NextResponse.json(
          { error: "Token de autenticação inválido ou expirado." },
          { status: 401 }
        );
      }
    }

    if (requesterUid) {
      const requesterDoc = await adminDb.collection("usuarios").doc(requesterUid).get();
      if (requesterDoc.exists) {
        const reqData = requesterDoc.data();
        requesterRole = reqData?.perfil || "";
        requesterUnitId = reqData?.unidadeId || "";
        if (reqData?.ativo === false) {
          return NextResponse.json(
            { error: "Acesso negado. Usuário inativo." },
            { status: 403 }
          );
        }
      }
    }

    // Apenas ADMIN ou GERENTE podem cadastrar usuários via API
    if (requesterRole !== "ADMIN" && requesterRole !== "GERENTE") {
      return NextResponse.json(
        { error: "Acesso negado. Apenas Gerentes de Unidade e Administradores podem cadastrar usuários." },
        { status: 403 }
      );
    }

    // 2. Extração e Validação do Payload
    const body = await req.json();
    const { nome, email, senhaInicial, perfil, unidadeId, ativo } = body;

    if (!nome || typeof nome !== "string" || !nome.trim()) {
      return NextResponse.json({ error: "O nome completo do usuário é obrigatório." }, { status: 400 });
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Informe um endereço de e-mail válido." }, { status: 400 });
    }

    if (!senhaInicial || typeof senhaInicial !== "string" || senhaInicial.length < 6) {
      return NextResponse.json({ error: "A senha inicial deve possuir no mínimo 6 caracteres." }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // TRAVA SEVERA DE SEGURANÇA SERVER-SIDE PARA GERENTE:
    // Se o solicitante é GERENTE:
    // - O perfil criado é OBRIGATORIAMENTE "ACS"
    // - A unidadeId de destino é OBRIGATORIAMENTE requesterUnitId
    let finalPerfil = (perfil?.toUpperCase() || "ACS") as "ADMIN" | "GERENTE" | "ACS";
    let finalUnidadeId = unidadeId;

    if (requesterRole === "GERENTE") {
      finalPerfil = "ACS";
      finalUnidadeId = requesterUnitId;
    }

    if (finalPerfil !== "ADMIN" && !finalUnidadeId) {
      return NextResponse.json(
        { error: "A Unidade de Saúde é obrigatória para o cadastro de ACS." },
        { status: 400 }
      );
    }

    // Verificar se o e-mail já está cadastrado em `usuarios` no Firestore
    const existingDocSnap = await adminDb
      .collection("usuarios")
      .where("email", "==", cleanEmail)
      .get();

    let existingDocId: string | null = null;
    if (!existingDocSnap.empty) {
      existingDocId = existingDocSnap.docs[0].id;
    }

    // 3. Criar Usuário no Firebase Authentication
    let userRecord;
    try {
      userRecord = await adminAuth.createUser({
        email: cleanEmail,
        password: senhaInicial,
        displayName: nome.trim(),
        disabled: ativo === false,
      });
    } catch (authErr: any) {
      if (authErr.code === "auth/email-already-exists") {
        return NextResponse.json(
          { error: "Já existe uma conta no Firebase Authentication com este e-mail." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `Erro no Firebase Auth: ${authErr.message || authErr}` },
        { status: 500 }
      );
    }

    const uid = userRecord.uid;

    // 4. Salvar ou Reconciliar Documento no Firestore em usuarios/{uid}
    try {
      if (existingDocId && existingDocId !== uid) {
        // Se já existia um documento de usuário (sem Auth UID ou id pendente), deletar o doc antigo
        await adminDb.collection("usuarios").doc(existingDocId).delete();
      }

      await adminDb
        .collection("usuarios")
        .doc(uid)
        .set({
          uid,
          nome: nome.trim(),
          email: cleanEmail,
          perfil: finalPerfil,
          unidadeId: finalPerfil === "ADMIN" ? null : finalUnidadeId,
          ativo: ativo !== false,
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }, { merge: true });
    } catch (dbErr: any) {
      // ROLLBACK EM CASO DE ERRO DE ESCRITA NO FIRESTORE
      try {
        await adminAuth.deleteUser(uid);
      } catch (rollbackErr) {
        // Ignorar
      }
      return NextResponse.json(
        { error: `Erro ao gravar perfil no Firestore. A conta no Auth foi desfeita: ${dbErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "ACS cadastrado com sucesso no Firebase Authentication e Firestore.",
        uid,
        email: cleanEmail,
        perfil: finalPerfil,
        unidadeId: finalUnidadeId,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Erro interno no servidor: ${err.message}` }, { status: 500 });
  }
}
