import { Controller, Get, Query } from '@nestjs/common';
import { CoreService } from './core.service';

@Controller('api/v1/public')
export class PublicController {
  constructor(private readonly coreService: CoreService) {}

  @Get('menu')
  getPublicMenu(@Query('service_date') serviceDate?: string, @Query('session') session?: string) {
    return this.coreService.getPublicActiveMenu({ serviceDate, session });
  }

  @Get('site-settings')
  getPublicSiteSettings() {
    return this.coreService.getSiteSettings();
  }

  @Get('lookup-name')
  getPublicLookupName(@Query('phone') phone?: string) {
    return this.coreService.lookupNameByPhone(phone);
  }
}
