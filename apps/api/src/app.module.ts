import { Controller, Get, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from './common/http';
import { CoreModule } from './core/core.module';
import { DbService } from './db/db.service';
import { AdminModule } from './modules/admin/admin.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { ExitModule } from './modules/exit/exit.module';
import { InsightsModule } from './modules/insights/insights.module';
import { OrgModule } from './modules/org/org.module';
import { ServiceModule } from './modules/service/service.module';

@Controller('health')
export class HealthController {
  constructor(private readonly dbs: DbService) {}

  @Public()
  @Get()
  async health() {
    await this.dbs.db.execute(sql`select 1`);
    return { status: 'ok', time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    CoreModule,
    AuthModule,
    OrgModule,
    CatalogModule,
    AssetsModule,
    ExitModule,
    EmployeesModule,
    ServiceModule,
    InsightsModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
