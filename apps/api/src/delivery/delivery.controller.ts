import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { DeliveryService } from './delivery.service';
import { ValidateCheckoutDto } from './dto/validate-checkout.dto';
import { CheckoutDto } from './dto/checkout.dto';

@Controller('delivery/public')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Public()
  @Get(':unitId/catalog')
  catalog(@Param('unitId') unitId: string): Promise<unknown> {
    return this.deliveryService.catalog(unitId);
  }

  @Public()
  @Get(':unitId/zones')
  zones(@Param('unitId') unitId: string): Promise<unknown> {
    return this.deliveryService.zones(unitId);
  }

  @Public()
  @Post(':unitId/checkout/validate')
  validateCheckout(
    @Param('unitId') unitId: string,
    @Body() dto: ValidateCheckoutDto,
  ): Promise<unknown> {
    return this.deliveryService.validateCheckout(unitId, dto);
  }

  @Public()
  @Post(':unitId/checkout')
  checkout(
    @Param('unitId') unitId: string,
    @Body() dto: CheckoutDto,
  ): Promise<unknown> {
    return this.deliveryService.checkout(unitId, dto);
  }
}