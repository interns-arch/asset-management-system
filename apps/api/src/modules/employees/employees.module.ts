import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { employeeSchema, type EmployeeInput, employeeStatusSchema, type EmployeeStatusInput } from '@eam/shared';
import type { Actor } from '../../common/actor';
import { CurrentActor, RequirePermissions, ZodPipe } from '../../common/http';
import { ExitModule } from '../exit/exit.module';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Query() q: Record<string, string>) {
    return this.employees.list(actor, q);
  }

  @Get(':id')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.get(actor, id);
  }

  @Get(':id/assets')
  assets(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.employees.assets(actor, id);
  }

  @Get(':id/history')
  history(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query() q: Record<string, string>) {
    return this.employees.timeline(actor, id, q);
  }

  @Post()
  @RequirePermissions('employee:manage')
  create(@CurrentActor() actor: Actor, @Body(new ZodPipe(employeeSchema)) body: EmployeeInput) {
    return this.employees.create(actor, body);
  }

  @Patch(':id')
  @RequirePermissions('employee:manage')
  update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(employeeSchema)) body: EmployeeInput) {
    return this.employees.update(actor, id, body);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions('employee:status')
  status(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(employeeStatusSchema)) body: EmployeeStatusInput) {
    return this.employees.changeStatus(actor, id, body);
  }
}

@Module({
  imports: [ExitModule],
  providers: [EmployeesService],
  controllers: [EmployeesController],
  exports: [EmployeesService],
})
export class EmployeesModule {}
