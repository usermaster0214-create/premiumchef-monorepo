import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@premiumchef/database';
import { concatMap, Observable } from 'rxjs';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PrismaService } from '../database/prisma.service';

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if ('toJSON' in value && typeof value.toJSON === 'function') {
    return redact(value.toJSON());
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      if (/password|token|authorization/i.test(key)) {
        return [];
      }
      return [[key, redact(entry)]];
    }),
  );
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  private async captureOldData(
    request: AuthenticatedRequest & {
      method: string;
      originalUrl: string;
      params?: Record<string, string>;
    },
  ): Promise<Prisma.InputJsonValue | Prisma.NullTypes.JsonNull> {
    const entityId = request.params?.id;
    if (!entityId || ['POST', 'GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return Prisma.JsonNull;
    }

    const routeParts = request.originalUrl
      .replace(/^\/api\/v1\/?/, '')
      .split('/')
      .filter(Boolean);
    const modelByRoute: Record<string, string> = {
      categories: 'category',
      products: 'product',
      orders: 'order',
      'cash-sessions': 'cashSession',
      'kitchen-tickets': 'kitchenTicket',
      cancellations: 'cancellation',
      purchases: 'purchase',
      tables: 'restaurantTable',
    };
    const model = modelByRoute[routeParts[0]];
    if (!model) {
      return Prisma.JsonNull;
    }

    const delegate = (
      this.prisma.tenantScoped as unknown as Record<
        string,
        { findFirst: (args: { where: { id: string } }) => Promise<unknown> }
      >
    )[model];
    const snapshot = await delegate.findFirst({ where: { id: entityId } });
    if (snapshot === null) {
      return Prisma.JsonNull;
    }

    return JSON.parse(JSON.stringify(redact(snapshot))) as Prisma.InputJsonValue;
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<
      AuthenticatedRequest & {
        method: string;
        originalUrl: string;
        ip?: string;
        headers: AuthenticatedRequest['headers'] & {
          'user-agent'?: string;
        };
        params?: Record<string, string>;
        body?: unknown;
      }
    >();

    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return next.handle();
    }

    const oldData = await this.captureOldData(request);

    return next.handle().pipe(
      concatMap(async (response: unknown) => {
        const result = response as {
          id?: string;
          user?: {
            id?: string;
            tenant_id?: string;
          };
        } | null;
        const tenantId = request.user?.tenant_id ?? result?.user?.tenant_id;
        if (!tenantId) {
          return response;
        }

        const unitId = request.user?.unit_id;
        const action = `${request.method} ${request.originalUrl.split('?')[0]}`;
        const routeParts = request.originalUrl
          .replace(/^\/api\/v1\/?/, '')
          .split('/')
          .filter(Boolean);
        const userId = request.user?.sub ?? result?.user?.id;
        const data = {
          tenantId,
          unitId: unitId ?? null,
          userId: userId ?? null,
          action,
          entity: routeParts[0] ?? 'unknown',
          entityId: request.params?.id ?? result?.id ?? result?.user?.id,
          oldData,
          newData: (redact(request.body ?? {}) ?? {}) as Prisma.InputJsonValue,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        };

        if (unitId) {
          await this.prisma.tenantScoped.auditLog.create({ data });
        } else {
          await this.prisma.auditLog.create({ data });
        }
        return response;
      }),
    );
  }
}