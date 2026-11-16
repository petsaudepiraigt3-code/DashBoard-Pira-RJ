export type AdminPurgeTarget = 'patients' | 'imports';

export interface AdminPurgeResult {
  success: boolean;
  target: AdminPurgeTarget;
  deletedCount: number;
}

const PURGE_CONFIG: Record<
  AdminPurgeTarget,
  {
    collection: string;
    pathPrefix: string;
    relationalTable: string;
    relationalPk: string;
    auditType: string;
    auditMessage: (count: number) => string;
  }
> = {
  patients: {
    collection: 'pacientes',
    pathPrefix: 'pacientes/%',
    relationalTable: 'paciente',
    relationalPk: 'id_paciente',
    auditType: 'PACIENTES_EXCLUIDOS_ADMIN',
    auditMessage: (count) =>
      `Administrador excluiu todos os pacientes do sistema (${count} paciente(s)).`,
  },
  imports: {
    collection: 'imports',
    pathPrefix: 'imports/%',
    relationalTable: 'controle_carga',
    relationalPk: 'id_carga',
    auditType: 'HISTORICO_CARGAS_EXCLUIDO_ADMIN',
    auditMessage: (count) =>
      `Administrador excluiu todo o histórico de cargas (${count} carga(s)).`,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeAdminPurge(client: any, target: AdminPurgeTarget, actorUserId: string): Promise<AdminPurgeResult> {
  const cfg = PURGE_CONFIG[target];

  const { count, error: countError } = await client
    .from('app_documents')
    .select('path', { count: 'exact', head: true })
    .eq('collection', cfg.collection);
  if (countError) throw countError;

  const { error: docDeleteError } = await client
    .from('app_documents')
    .delete()
    .like('path', cfg.pathPrefix);
  if (docDeleteError) throw docDeleteError;

  const { error: relDeleteError } = await client
    .from(cfg.relationalTable)
    .delete()
    .gt(cfg.relationalPk, 0);
  if (relDeleteError && relDeleteError.code !== 'PGRST205') throw relDeleteError;

  const deletedCount = count ?? 0;
  const auditId = `audit_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const { error: auditError } = await client.from('app_documents').insert({
    path: `auditLogs/${auditId}`,
    data: {
      tipo: cfg.auditType,
      usuarioId: actorUserId,
      unidadeId: 'GLOBAL',
      acao: cfg.auditMessage(deletedCount),
      createdAt: new Date().toISOString(),
    },
  });
  if (auditError) {
    console.warn('Aviso ao registrar auditoria da limpeza administrativa:', auditError.message || auditError);
  }

  return {
    success: true,
    target,
    deletedCount,
  };
}
