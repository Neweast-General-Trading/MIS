import type { Repository } from 'typeorm';

import { AccessUserEntity } from 'src/access-control/entities/user.entity';

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

type FindAccessUserOptions = {
  relations?: {
    role?: boolean;
    permissions?: boolean;
  };
};

export async function findAccessUserByEmail(
  repo: Repository<AccessUserEntity>,
  email: string,
  options?: FindAccessUserOptions,
): Promise<AccessUserEntity | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const qb = repo
    .createQueryBuilder('user')
    .where('LOWER(user.email) = :email', { email: normalized });

  if (options?.relations?.role) {
    qb.leftJoinAndSelect('user.role', 'role');
    if (options?.relations?.permissions) {
      qb.leftJoinAndSelect('role.permissions', 'permissions');
    }
  }

  return qb.getOne();
}
