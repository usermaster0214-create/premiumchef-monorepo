import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserStatus } from '@premiumchef/database';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

// Revalida no banco: o token pode ter até 15 minutos de vida após uma revogação.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub;
    const admin = userId
      ? await this.prisma.user.findFirst({
          where: { id: userId, isPlatformAdmin: true, status: UserStatus.ACTIVE },
          select: { id: true },
        })
      : null;
    if (!admin) {
      throw new ForbiddenException('Acesso restrito ao administrador da plataforma');
    }
    return true;
  }
}
