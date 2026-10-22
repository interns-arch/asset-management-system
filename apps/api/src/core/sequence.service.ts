import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';

/** Atomic, gap-tolerant counters for asset tags (LAP-000123) and document numbers (EXIT-00012). */
@Injectable()
export class SequenceService {
  constructor(private readonly dbs: DbService) {}

  async next(prefix: string, pad = 5): Promise<string> {
    const result = await this.dbs.db.execute<{ last_value: number }>(sql`
      insert into sequences (prefix, last_value) values (${prefix}, 1)
      on conflict (prefix) do update set last_value = sequences.last_value + 1
      returning last_value`);
    return `${prefix}-${String(result.rows[0].last_value).padStart(pad, '0')}`;
  }

  /**
   * Next asset tag for an asset type code: LAP → lap-013. Continues after the highest number already
   * used by that type in either style (lap-012 or LAP-000011), so tags renamed by hand never collide.
   */
  async nextAssetTag(typeCode: string): Promise<string> {
    const prefix = typeCode.toLowerCase();
    const pattern = `^${prefix}-0*([0-9]+)$`;
    const result = await this.dbs.db.execute<{ last_value: number }>(sql`
      with used as (
        select coalesce(max(substring(lower(asset_tag) from ${pattern})::int), 0) as n
        from assets where lower(asset_tag) ~ ${pattern})
      insert into sequences (prefix, last_value) values (${`asset:${prefix}`}, (select n from used) + 1)
      on conflict (prefix) do update set last_value = greatest(sequences.last_value, (select n from used)) + 1
      returning last_value`);
    return `${prefix}-${String(result.rows[0].last_value).padStart(3, '0')}`;
  }
}
