import { handleAdminMaintenance } from '@/lib/admin-maintenance-server';

export const POST = (req: Request) => handleAdminMaintenance(req);
