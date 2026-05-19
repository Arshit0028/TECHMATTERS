import { useAuth } from '../context/AuthContext';

type Action = 'read' | 'write' | 'create' | 'delete' | 'import' | 'export';

// Define permissions for non-admin roles
const rolePermissions: Record<string, Record<string, Partial<Record<Action, boolean>>>> = {
  manager: {
    projects: { read: true, write: true, create: true, delete: true, import: true, export: true },
    tasks: { read: true, write: true, create: true, delete: true, import: true, export: true },
    invoices: { read: true, write: true, create: false, delete: false, import: false, export: false },
    users: { read: true, write: false, create: false, delete: false, import: false, export: false },
  },
  tech: {
    projects: { read: true, write: true, create: false, delete: false, import: false, export: false },
    tasks: { read: true, write: true, create: true, delete: false, import: false, export: false },
    invoices: { read: true, write: false, create: false, delete: false, import: false, export: false },
    users: { read: false, write: false, create: false, delete: false, import: false, export: false },
  },
  entry: {
    projects: { read: true, write: false, create: false, delete: false, import: false, export: false },
    tasks: { read: true, write: false, create: false, delete: false, import: false, export: false },
    invoices: { read: true, write: false, create: false, delete: false, import: false, export: false },
    users: { read: false, write: false, create: false, delete: false, import: false, export: false },
  },
};

export const usePermission = (module: string, action: Action): boolean => {
  const { user } = useAuth();
  if (!user) return false;

  // Admin and Super Admin have all permissions
  if (user.accessLevel === 'super-admin' || user.accessLevel === 'admin') {
    return true;
  }

  // Check custom permissions (if any)
  const customPerm = user.permissions?.find(p => p.module === module);
  if (customPerm && typeof customPerm.actions[action] === 'boolean') {
    return customPerm.actions[action];
  }

  // Fallback to role-based permissions
  return rolePermissions[user.accessLevel]?.[module]?.[action] ?? false;
};