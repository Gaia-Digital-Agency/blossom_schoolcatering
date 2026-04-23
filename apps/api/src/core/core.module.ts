import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { PublicController } from './public.controller';
import { AdminReportsService } from './services/admin-reports.service';
import { AuditService } from './services/audit.service';
import { BillingService } from './services/billing.service';
import { DeliveryService } from './services/delivery.service';
import { GaiaService } from './services/gaia.service';
import { HelpersService } from './services/helpers.service';
import { KitchenService } from './services/kitchen.service';
import { MediaService } from './services/media.service';
import { MenuService } from './services/menu.service';
import { MultiOrderService } from './services/multi-order.service';
import { OrderService } from './services/order.service';
import { SchemaService } from './services/schema.service';
import { SchoolsService } from './services/schools.service';
import { SiteSettingsService } from './services/site-settings.service';
import { UsersService } from './services/users.service';

@Module({
  imports: [AuthModule],
  controllers: [CoreController, PublicController],
  providers: [
    CoreService,
    AdminReportsService,
    AuditService,
    BillingService,
    DeliveryService,
    GaiaService,
    HelpersService,
    KitchenService,
    MediaService,
    MenuService,
    MultiOrderService,
    OrderService,
    SchemaService,
    SchoolsService,
    SiteSettingsService,
    UsersService,
  ],
})
export class CoreModule {}
