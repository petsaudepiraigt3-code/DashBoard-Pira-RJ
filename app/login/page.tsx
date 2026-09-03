"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { HeartPulse, Lock, Mail, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const currentUser = userCred.user;

      // Consultar documento usuarios/{uid} no Firestore para validação de perfil e status ativo
      const userRef = doc(db, "usuarios", currentUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setError("Usuário autenticado, mas sem perfil cadastrado no sistema.");
        return;
      }

      const userData = userSnap.data();
      if (userData?.ativo === false) {
        await signOut(auth);
        setError("Usuário inativo. Entre em contato com o administrador.");
        return;
      }

      router.push("/dashboard");
    } catch (err: any) {
      console.error("Erro no login Firebase:", err?.code, err?.message);

      const errorCode = err?.code || "";
      if (errorCode === "auth/invalid-credential" || errorCode === "auth/wrong-password") {
        setError("Senha incorreta ou credenciais inválidas.");
      } else if (errorCode === "auth/user-not-found") {
        setError("Usuário não encontrado com este e-mail.");
      } else if (errorCode === "auth/network-request-failed") {
        setError("Erro de conexão de rede. Verifique sua internet.");
      } else if (errorCode === "auth/too-many-requests") {
        setError("Muitas tentativas malsucedidas. Tente novamente mais tarde.");
      } else {
        setError("Falha ao realizar login. Verifique seus dados e tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-zinc-50 to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-4 font-sans">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white/90 p-8 shadow-xl backdrop-blur-md border border-zinc-200/80 dark:bg-zinc-900/90 dark:border-zinc-800">
        
        {/* Cabeçalho de Identidade e Parceria */}
        <div className="text-center space-y-4">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Desenvolvido em Parceria Institucional
            </span>
            <div className="grid grid-cols-4 items-center gap-1.5 rounded-2xl bg-white p-2.5 border border-zinc-200 shadow-sm dark:bg-zinc-800 dark:border-zinc-700">
              <div className="flex h-12 items-center justify-center p-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-prefeitura-pirai.png"
                  alt="Prefeitura de Piraí"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex h-12 items-center justify-center p-0.5 border-l border-zinc-200 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-sus.jpg"
                  alt="SUS - Sistema Único de Saúde"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex h-12 items-center justify-center p-0.5 border-l border-zinc-200 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-pet-saude.jpg"
                  alt="PET-Saúde Informação e Saúde Digital"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex h-12 items-center justify-center p-0.5 border-l border-zinc-200 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-ugb-ferp.jpg"
                  alt="UGB FERP - Centro Universitário Geraldo Di Biase"
                  className="max-h-full max-w-full object-contain rounded-md"
                />
              </div>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              Saúde Digital Busca Ativa
            </h1>
            <p className="mt-1 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              Piraí • SUS • PET-Saúde • UGB FERP
            </p>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Plataforma de Gestão, Acompanhamento de DCNT e Busca Ativa (e-SUS APS)
          </p>
        </div>

        {/* Alerta de Erro */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl bg-red-50 p-4 text-xs font-medium text-red-800 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/60 animate-in fade-in duration-200">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Formulário de Login */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              E-mail
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border border-zinc-300 bg-white pl-10 pr-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-500"
                placeholder="operador@saude.gov.br"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Senha
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-zinc-300 bg-white pl-10 pr-3 py-2.5 text-sm text-zinc-900 shadow-xs focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 dark:bg-blue-600 dark:hover:bg-blue-500 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Autenticando...</span>
              </div>
            ) : (
              "Entrar no Sistema"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
