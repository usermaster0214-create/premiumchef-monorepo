import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@premiumchef/database';
import { createHash, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service';
import { LoginDto } from './login.dto';
import { AuthPrincipal, RefreshTokenClaims } from './auth.types';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, tenantId: true, passwordHash: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    } catch {
      passwordMatches = false;
    }
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const principal = await this.loadPrincipal(
      this.prisma,
      user.id,
      user.tenantId,
    );
    if (!principal) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const pair = await this.createTokenPair(principal);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: principal.sub, tenantId: principal.tenant_id },
        data: { lastLoginAt: new Date() },
      });
      await transaction.refreshToken.create({
        data: {
          tenantId: principal.tenant_id,
          userId: principal.sub,
          tokenHash: pair.tokenHash,
          expiresAt: pair.expiresAt,
        },
      });
    });

    return {
      access_token: pair.accessToken,
      refresh_token: pair.refreshToken,
      user: {
        id: principal.sub,
        name: principal.name,
        email: principal.email,
        tenant_id: principal.tenant_id,
        units: principal.units,
        roles: principal.roles,
        permissions: principal.permissions,
      },
    };
  }

  async refresh(refreshToken: string) {
    let claims: RefreshTokenClaims;
    try {
      claims = await this.jwtService.verifyAsync<RefreshTokenClaims>(
        refreshToken,
        { secret: this.getSecret('JWT_REFRESH_SECRET') },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (claims.token_type !== 'refresh' || !claims.sub || !claims.tenant_id) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    return this.prisma.$transaction(async (transaction) => {
      const storedToken = await transaction.refreshToken.findUnique({
        where: {
          tokenHash,
          tenantId: claims.tenant_id,
          userId: claims.sub,
        },
        select: {
          id: true,
          tenantId: true,
          userId: true,
          expiresAt: true,
          revokedAt: true,
        },
      });
      const now = new Date();

      if (
        !storedToken ||
        storedToken.revokedAt ||
        storedToken.expiresAt <= now ||
        storedToken.userId !== claims.sub ||
        storedToken.tenantId !== claims.tenant_id
      ) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const principal = await this.loadPrincipal(
        transaction,
        storedToken.userId,
        storedToken.tenantId,
      );
      if (!principal) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const pair = await this.createTokenPair(principal);
      const revokeResult = await transaction.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          tenantId: storedToken.tenantId,
          userId: claims.sub,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      if (revokeResult.count !== 1) {
        throw new UnauthorizedException('Refresh token was already used');
      }

      await transaction.refreshToken.create({
        data: {
          tenantId: principal.tenant_id,
          userId: principal.sub,
          tokenHash: pair.tokenHash,
          expiresAt: pair.expiresAt,
        },
      });

      return {
        access_token: pair.accessToken,
        refresh_token: pair.refreshToken,
      };
    });
  }

  getProfile(principal: AuthPrincipal) {
    return {
      id: principal.sub,
      name: principal.name,
      email: principal.email,
      tenant_id: principal.tenant_id,
      unit_id: principal.unit_id,
      units: principal.units,
      roles: principal.roles,
      permissions: principal.permissions,
    };
  }

  private async loadPrincipal(
    client: Pick<PrismaClient, 'user'>,
    userId: string,
    tenantId: string,
  ): Promise<AuthPrincipal | undefined> {
    const user = await client.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        status: true,
        tenant: { select: { status: true } },
        userUnits: {
          where: { unit: { tenantId, status: 'ACTIVE' } },
          select: { unitId: true },
        },
        userRoles: {
          where: { role: { tenantId } },
          select: {
            role: {
              select: {
                name: true,
                rolePermissions: {
                  select: { permission: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.tenant.status !== 'ACTIVE' ||
      user.userUnits.length === 0
    ) {
      return undefined;
    }

    const roles = user.userRoles.map(({ role }) => role.name);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap(({ role }) =>
          role.rolePermissions.map(({ permission }) => permission.name),
        ),
      ),
    ];

    return {
      sub: user.id,
      name: user.name,
      email: user.email,
      tenant_id: user.tenantId,
      units: user.userUnits.map(({ unitId }) => unitId),
      roles,
      permissions,
      token_type: 'access',
    };
  }

  private async createTokenPair(principal: AuthPrincipal): Promise<TokenPair> {
    const accessLifetime = this.getLifetime('JWT_EXPIRES_IN', 900);
    const refreshLifetime = this.getLifetime('JWT_REFRESH_EXPIRES_IN', 604800);
    const accessToken = await this.jwtService.signAsync(
      { ...principal, token_type: 'access' },
      {
        secret: this.getSecret('JWT_SECRET'),
        expiresIn: accessLifetime,
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: principal.sub,
        tenant_id: principal.tenant_id,
        token_type: 'refresh',
        jti: randomUUID(),
      },
      {
        secret: this.getSecret('JWT_REFRESH_SECRET'),
        expiresIn: refreshLifetime,
      },
    );

    return {
      accessToken,
      refreshToken,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshLifetime * 1000),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getSecret(name: string): string {
    const secret = process.env[name];
    if (!secret || secret.length < 32) {
      throw new Error(`${name} must be configured with at least 32 characters`);
    }
    return secret;
  }

  private getLifetime(name: string, fallbackSeconds: number): number {
    const value = process.env[name];
    if (!value) {
      return fallbackSeconds;
    }

    const match = value.match(/^(\d+)(s|m|h|d)$/i);
    if (!match) {
      throw new Error(`${name} must use seconds, minutes, hours, or days`);
    }

    const multiplier: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    return Number(match[1]) * multiplier[match[2].toLowerCase()];
  }
}