import { manageUsers } from '@/lib/user-management';
export const GET = (req: Request) => manageUsers(req, 'list');
