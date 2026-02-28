import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CoreController } from './core.controller';
import { CoreService } from './core.service';
import { PublicController } from './public.controller';

@Module({
  imports: [AuthModule],
  controllers: [CoreController, PublicController],
  providers: [CoreService],
})
export class CoreModule {}
