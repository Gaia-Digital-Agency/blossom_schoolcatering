/**
 * ARCHIVED CONTROLLER — NOT registered in CoreModule.
 *
 * These routes have no active frontend callers and have been soft-archived here
 * to keep the code accessible without exposing live endpoints.
 * To re-enable any route, move it back to core.controller.ts and add
 * ArchivedController to the controllers array in core.module.ts.
 *
 * Archived routes:
 *   GET  api/v1/admin/reports                         — frontend uses /admin/revenue instead
 *   GET  api/v1/admin/audit-logs                      — no UI surface
 *   POST api/v1/meal-plans/wizard                     — wizard UI never shipped
 *   POST api/v1/billing/:billingId/proof-upload       — superseded by /billing/proof-upload-batch
 *   POST api/v1/delivery/assignments/:id/confirm      — delivery app uses /toggle instead
 */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MealPlanWizardDto, NoteDto, UploadBillingProofDto } from './dto';
import { CoreService } from './core.service';
import { AccessUser } from './core.types';

type AuthRequest = Request & { user: AccessUser };

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArchivedController {
  constructor(private readonly coreService: CoreService) {}

  @Get('admin/reports')
  @Roles('ADMIN')
  getAdminReports(@Query('date') date?: string) {
    return this.coreService.getAdminPrintReport(date);
  }

  @Get('admin/audit-logs')
  @Roles('ADMIN')
  getAdminAuditLogs(
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('target_type') targetType?: string,
  ) {
    return this.coreService.getAdminAuditLogs(req.user, { limit, action, targetType });
  }

  @Post('meal-plans/wizard')
  @Roles('PARENT', 'YOUNGSTER')
  mealPlanWizard(
    @Req() req: AuthRequest,
    @Body() body: MealPlanWizardDto,
  ) {
    return this.coreService.mealPlanWizard(req.user, body);
  }

  @Post('billing/:billingId/proof-upload')
  @Roles('PARENT')
  uploadBillingProof(
    @Req() req: AuthRequest,
    @Param('billingId', ParseUUIDPipe) billingId: string,
    @Body() body: UploadBillingProofDto,
  ) {
    return this.coreService.uploadBillingProof(req.user, billingId, body.proofImageData);
  }

  @Post('delivery/assignments/:assignmentId/confirm')
  @Roles('DELIVERY')
  confirmDelivery(
    @Req() req: AuthRequest,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() body: NoteDto,
  ) {
    return this.coreService.confirmDelivery(req.user, assignmentId, body.note);
  }
}
