import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    // 1. Extração do Payload
    const body = await req.json();
    const { docId, email, senhaTemporaria, nome, perfil, unidadeId } = body;

    // 2. Autorização do Solicitante (ADMIN ou GERENTE da mesma unidade)
    const authHeader = req.headers.get("authorization");
    let requesterUid = "";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1];
      try {
        const decoded = await adminAuth.verifyIdToken(idToken);
        requesterUid = decoded.uid;
      } catch (tokenErr) {
        return NextResponse.json({ error: "Token de autenticação inválido." }, { status: 401 });
      }
    }

    if (requesterUid) {
      const requesterDoc = await adminDb.collection("usuarios").doc(requesterUid).get();
      if (!requesterDoc.exists || requesterDoc.data()?.ativo === false) {
        return NextResponse.json(
          { error: "Acesso negado. Usuário solicitante inativo ou inexistente." },
          { status: 403 }
        );
      }

      const reqRole = requesterDoc.data()?.perfil;
      const reqUnit = requesterDoc.data()?.unidadeId;

      if (reqRole !== "ADMIN" && (reqRole !== "GERENTE" || (unidadeId && reqUnit !== unidadeId))) {
        return NextResponse.json(
          { error: "Acesso negado. Você não possui permissão para criar acesso nesta unidade." },
          { status: 403 }
        );
      }
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Informe um e-mail válido para a criação de acesso." }, { status: 400 });
    }

    if (!senhaTemporaria || typeof senhaTemporaria !== "string" || senhaTemporaria.length < 6) {
      return NextResponse.json(
        { error: "A senha temporária deve possuir no mínimo 6 caracteres conforme os requisitos do Firebase Auth." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 3. Buscar prioritariamente se o e-mail já existe no Firebase Authentication
    let targetUid = "";
    let isNewAuthAccount = false;

    try {
      const existingAuthUser = await adminAuth.getUserByEmail(cleanEmail);
      targetUid = existingAuthUser.uid;
      await adminAuth.updateUser(targetUid, { password: senhaTemporaria });
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        const newAuthUser = await adminAuth.createUser({
          email: cleanEmail,
          password: senhaTemporaria,
          displayName: nome || cleanEmail.split("@")[0],
          disabled: false,
        });
        targetUid = newAuthUser.uid;
        isNewAuthAccount = true;
      } else {
        return NextResponse.json({ error: `Erro no Firebase Auth: ${err.message}` }, { status: 500 });
      }
    }

    // 4. Copiar/Alinhar os Dados no Cloud Firestore em usuarios/{targetUid}
    const legacyDocId = docId || targetUid;
    let legacyData: any = {};

    if (legacyDocId) {
      const legacyRef = adminDb.collection("usuarios").doc(legacyDocId);
      const legacySnap = await legacyRef.get();
      if (legacySnap.exists) {
        legacyData = legacySnap.data();
      }
    }

    const finalNome = legacyData?.nome || nome || cleanEmail.split("@")[0];
    const finalPerfil = legacyData?.perfil || perfil || "ACS";
    const finalUnidadeId = legacyData?.unidadeId || unidadeId || null;

    // 5. Atualizar o documento consolidado em usuarios/{targetUid}
    const targetRef = adminDb.collection("usuarios").doc(targetUid);
    await targetRef.set(
      {
        uid: targetUid,
        authUid: targetUid,
        authAtiva: true,
        nome: finalNome,
        email: cleanEmail,
        perfil: finalPerfil,
        unidadeId: finalUnidadeId,
        telefone: legacyData?.telefone || body?.telefone || "",
        ativo: legacyData?.ativo !== false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // 6. Se havia um documento legado diferente do Auth UID, migrar microáreas e remover o legado duplicado
    if (legacyDocId && legacyDocId !== targetUid) {
      // Migrar referências de microáreas
      const maSnap = await adminDb
        .collection("microareas")
        .where("acsId", "==", legacyDocId)
        .get();

      for (const maDoc of maSnap.docs) {
        await maDoc.ref.update({
          acsId: targetUid,
          acsNome: finalNome,
          updatedAt: new Date().toISOString(),
        });
      }

      // Remover documento legado duplicado para não poluir a coleção usuarios
      const legacyRef = adminDb.collection("usuarios").doc(legacyDocId);
      await legacyRef.delete();
    }

    // 7. Remover quaisquer outros documentos duplicados com o mesmo e-mail
    const duplicateQuery = await adminDb
      .collection("usuarios")
      .where("email", "==", cleanEmail)
      .get();

    for (const dupDoc of duplicateQuery.docs) {
      if (dupDoc.id !== targetUid) {
        await dupDoc.ref.delete();
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `Acesso criado e alinhado com sucesso no Firebase Auth (${
          isNewAuthAccount ? "Nova conta criada" : "Senha atualizada em conta existente"
        }). Documento único: usuarios/${targetUid}`,
        uid: targetUid,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Erro na criação de acesso: ${err.message}` }, { status: 500 });
  }
}
