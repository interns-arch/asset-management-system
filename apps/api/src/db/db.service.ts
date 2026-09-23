import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

// Return DATE columns as 'YYYY-MM-DD' strings and COUNT(*) as numbers.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Tx;

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/eam';
}

/**
 * Owns the connection pool. `db` returns the transaction bound to the current async context
 * (if any), so services can call each other inside one transaction without passing it around.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool = new pg.Pool({ connectionString: databaseUrl(), max: Number(process.env.DB_POOL_SIZE ?? 20) });
  readonly root: Database = drizzle(this.pool, { schema });
  private readonly als = new AsyncLocalStorage<Tx>();

  get db(): Executor {
    return this.als.getStore() ?? this.root;
  }

  get inTransaction(): boolean {
    return this.als.getStore() !== undefined;
  }

  /** Runs `fn` in a transaction, joining the current one if already inside a transaction. */
  async tx<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
    const current = this.als.getStore();
    if (current) return fn(current);
    return this.root.transaction((tx) => this.als.run(tx, () => fn(tx)));
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
