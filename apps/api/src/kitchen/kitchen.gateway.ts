import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { KitchenTicketStatus, runWithTenantContext } from '@premiumchef/database';
import { KitchenService } from './kitchen.service';

type KitchenSocket = Socket & {
  tenantId?: string;
  unitId?: string;
  userId?: string;
};

@WebSocketGateway({ namespace: '/ws/kds', cors: true })
export class KitchenGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly kitchenService: KitchenService,
  ) {}

  async handleConnection(socket: KitchenSocket): Promise<void> {
    const token = this.readValue(socket.handshake.auth?.token ?? socket.handshake.query?.token);
    const tenantId = this.readValue(socket.handshake.auth?.tenant_id ?? socket.handshake.query?.tenant_id);
    const unitId = this.readValue(socket.handshake.auth?.unit_id ?? socket.handshake.query?.unit_id);
    if (!token || !tenantId || !unitId) {
      socket.disconnect(true);
      return;
    }

    try {
      const claims = await this.jwtService.verifyAsync<{ sub: string; tenant_id: string; units: string[]; token_type: string }>(token, { secret: process.env.JWT_SECRET });
      if (claims.token_type !== 'access' || claims.tenant_id !== tenantId || !claims.units.includes(unitId)) {
        socket.disconnect(true);
        return;
      }
      socket.tenantId = tenantId;
      socket.unitId = unitId;
      socket.userId = claims.sub;
      await socket.join(`unit:${unitId}`);
    } catch {
      socket.disconnect(true);
    }
  }

  @SubscribeMessage('kitchen:update_status')
  async updateStatus(
    @ConnectedSocket() socket: KitchenSocket,
    @MessageBody() payload: { ticket_id: string; status: KitchenTicketStatus },
  ): Promise<unknown> {
    if (!socket.tenantId || !socket.unitId || !socket.userId) return;
    const result = await runWithTenantContext(
      { tenantId: socket.tenantId, unitId: socket.unitId },
      () => this.kitchenService.updateStatus(payload.ticket_id, payload.status),
    ) as {
      previousStatus: KitchenTicketStatus;
      ticket: { status: KitchenTicketStatus };
      orderStatus?: string;
    };
    this.server.to(`unit:${socket.unitId}`).emit('kitchen:ticket_updated', {
      ticket_id: payload.ticket_id,
      previous_status: result.previousStatus,
      status: result.ticket.status,
      order_status: result.orderStatus,
    });
    return result.ticket;
  }

  private readValue(value: unknown): string | undefined {
    if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
    return typeof value === 'string' ? value : undefined;
  }
}