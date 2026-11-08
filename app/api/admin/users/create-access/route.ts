import { manageUsers } from '@/lib/user-management';
export const POST = (req: Request) => manageUsers(req, 'access');
