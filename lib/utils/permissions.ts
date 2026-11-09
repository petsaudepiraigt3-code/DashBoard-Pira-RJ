/**
 * Utilitários de controle de acesso e permissões baseadas em papel (RBAC).
 */

/**
 * Verifica se o papel informado possui permissão para visualizar e acessar o painel de Indicadores.
 * Regra: O papel ACS não utiliza a aba de indicadores; demais papéis (Gerente, Administrador) sim.
 */
export function canAccessIndicadores(role?: string | null): boolean {
  if (!role) return false;
  return role.toUpperCase() !== "ACS";
}

/**
 * Verifica se um link de navegação da barra lateral deve ser exibido para o papel informado.
 */
export function isNavItemVisibleForRole(itemHref: string, role?: string | null): boolean {
  const normalizedRole = role?.toUpperCase();
  if (normalizedRole === "ACS") {
    if (itemHref === "/configuracoes" || itemHref === "/indicadores") {
      return false;
    }
  }
  return true;
}

