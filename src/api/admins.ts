import api from './client';
import type { AdminRole } from './auth';

export interface AdminAccount {
  id: string;
  email: string;
  role: AdminRole;
}

export interface AuditEntry {
  id: number;
  admin_id: string;
  admin_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  created_at: string;
}

export const adminsApi = {
  list: (): Promise<AdminAccount[]> => api.get('/admin/admins').then((r) => r.data.data),
  setRole: (id: string, role: AdminRole): Promise<AdminAccount> =>
    api.patch(`/admin/admins/${id}/role`, { role }).then((r) => r.data.data),
  auditLog: (
    entityType: string,
    entityId: string,
    page = 1,
  ): Promise<{ data: AuditEntry[]; total: number }> =>
    api
      .get('/admin/audit-log', { params: { entity_type: entityType, entity_id: entityId, page } })
      .then((r) => r.data),
};
