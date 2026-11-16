import { handleReconcileManager } from '@/lib/reconcile-manager-server';

export const POST = (req: Request) => handleReconcileManager(req);
