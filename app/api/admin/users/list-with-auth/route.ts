import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    // 1. Autorização: Validar ID Token do Administrador
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
          { error: "Acesso negado. Apenas administradores ativos podem listar usuários." },
          { status: 403 }
        );
      }
    }

    // 2. Buscar todos os documentos de usuários no Firestore
    const usersSnap = await adminDb.collection("usuarios").get();
    const resultList: any[] = [];

    for (const userDoc of usersSnap.docs) {
      const dData = userDoc.data();
      const docId = userDoc.id;
      const email = dData.email ? dData.email.trim().toLowerCase() : "";

      let authStatus: "AUTH_OK" | "AUTH_UID_DIVERGENTE" | "AUTH_INEXISTENTE" = "AUTH_INEXISTENTE";
      let authUid: string | null = null;

      if (email) {
        try {
          const authUser = await adminAuth.getUserByEmail(email);
          authUid = authUser.uid;

          if (docId === authUser.uid) {
            authStatus = "AUTH_OK";
          } else {
            authStatus = "AUTH_UID_DIVERGENTE";

            // Reconciliação Automática: Garantir cópia para usuarios/{authUser.uid}
            const targetRef = adminDb.collection("usuarios").doc(authUser.uid);
            await targetRef.set(
              {
                ...dData,
                uid: authUser.uid,
                email,
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );

            // Marcar documento antigo como legado
            await userDoc.ref.update({
              migradoParaUid: authUser.uid,
              registroLegado: true,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (err: any) {
          if (err.code === "auth/user-not-found") {
            authStatus = "AUTH_INEXISTENTE";
          }
        }
      }

      // Evitar listar o documento antigo legado como item separado se já foi migrado
      if (!dData.registroLegado) {
        resultList.push({
          docId,
          uid: authUid || dData.uid || docId,
          nome: dData.nome || email.split("@")[0],
          email: dData.email || "",
          perfil: dData.perfil || "GERENTE",
          unidadeId: dData.unidadeId || null,
          ativo: dData.ativo !== false,
          authStatus,
          authUid,
        });
      }
    }

    return NextResponse.json({ users: resultList }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: `Erro na consulta de usuários: ${err.message}` }, { status: 500 });
  }
}
