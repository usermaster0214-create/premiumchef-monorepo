import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { runWithTenantContext } from '@premiumchef/database';
import { DeliveryOperationsService } from './delivery-operations.service';
import { UpdateDriverLocationDto } from './dto/delivery-operation.dto';

type DeliverySocket = Socket & { tenantId?: string; unitId?: string; userId?: string };

@WebSocketGateway({ namespace: '/ws/delivery', cors: true })
export class DeliveryGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly service: DeliveryOperationsService,
  ) {}

  async handleConnection(socket: DeliverySocket): Promise<void> {
    const token = this.value(socket.handshake.auth?.token ?? socket.handshake.query?.token);
    const tenantId = this.value(socket.handshake.auth?.tenant_id ?? socket.handshake.query?.tenant_id);
    const unitId = this.value(socket.handshake.auth?.unit_id ?? socket.handshake.query?.unit_id);
    if (!token || !tenantId || !unitId) { socket.disconnect(true); return; }
    try {
      const claims = await this.jwtService.verifyAsync<{ sub: string; tenant_id: string; units: string[]; token_type: string }>(token, { secret: process.env.JWT_SECRET });
      if (claims.token_type !== 'access' || claims.tenant_id !== tenantId || !claims.units.includes(unitId)) { socket.disconnect(true); return; }
      socket.tenantId = tenantId; socket.unitId = unitId; socket.userId = claims.sub;
      await socket.join(`unit:${unitId}`);
    } catch { socket.disconnect(true); }
  }

  @SubscribeMessage('delivery:update_location')
  async updateLocation(
    @ConnectedSocket() socket: DeliverySocket,
    @MessageBody() payload: { delivery_id: string } & UpdateDriverLocationDto,
  ): Promise<unknown> {
    if (!socket.tenantId || !socket.unitId || !socket.userId) return;
    const delivery = await runWithTenantContext(
      { tenantId: socket.tenantId, unitId: socket.unitId },
      () => this.service.updateLocation(payload.delivery_id, payload.latitude, payload.longitude),
    ) as { id: string; latitude?: number | null; longitude?: number | null; driver?: { name: string } | null };
    this.server.to(`unit:${socket.unitId}`).emit('delivery:driver_location', {
      delivery_id: delivery.id,
      driver_name: delivery.driver?.name,
      latitude: delivery.latitude,
      longitude: delivery.longitude,
    });
    return delivery;
  }

  private value(value: unknown): string | undefined {
    if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
    return typeof value === 'string' ? value : undefined;
  }
}