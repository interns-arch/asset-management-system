import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { reconUploadSchema, type ReconUploadInput } from '@eam/shared';
import type { Actor } from '../../common/actor';
import { CurrentActor, RequirePermissions, ZodPipe } from '../../common/http';
import { ReconciliationService } from './reconciliation.service';

@Controller('reconciliations')
@RequirePermissions('asset:assign', 'employee:manage')
export class ReconciliationController {
  constructor(private readonly recon: ReconciliationService) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.recon.list(actor);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.recon.get(actor, id);
  }

  @Post()
  run(@CurrentActor() actor: Actor, @Body(new ZodPipe(reconUploadSchema)) body: ReconUploadInput) {
    return this.recon.run(actor, body);
  }
}

@Module({
  providers: [ReconciliationService],
  controllers: [ReconciliationController],
})
export class ReconciliationModule {}
