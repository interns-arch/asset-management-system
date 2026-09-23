import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUSES, type EmployeeInput, type EmployeeStatusInput } from '@eam/shared';
import { type Actor, assertCan, can } from '../../common/actor';
import { badRequest, likePattern, listFilter, listParams, notFound, today, uuidParam } from '../../common/http';
import { DbService } from '../../db/db.service';
import {
  allocations,
  assetCategories,
  assets,
  assetTypes,
  companies,
  departments,
  employees,
  exitCases,
  locations,
  roles,
  users,
} from '../../db/schema';
import { diffChanges, HistoryService } from '../../core/history.service';
import { ExitService } from '../exit/exit.service';

const manager = alias(employees, 'manager');

const LABELS: Record<string, string> = {
  employeeCode: 'Employee code',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  designation: 'Designation',
  companyId: 'Company',
  departmentId: 'Department',
  locationId: 'Location',
  managerId: 'Manager',
  joinDate: 'Join date',
  notes: 'Notes',
};

@Injectable()
export class EmployeesService {
  constructor(
    private readonly dbs: DbService,
    private readonly history: HistoryService,
    private readonly exits: ExitService,
  ) {}

  private canSee(actor: Actor, id: string) {
    return can(actor, 'employee:view') || actor.employeeId === id;
  }

  async list(actor: Actor, q: Record<string, string>) {
    assertCan(actor, 'employee:view');
    const p = listParams(q, { sort: 'name', dir: 'asc' });
    const conds: SQL[] = [];
    const statuses = listFilter(q.status, EMPLOYEE_STATUSES);
    if (statuses.length) conds.push(inArray(employees.status, statuses));
    else if (q.includeExited !== '1') conds.push(sql`${employees.status} <> 'EXITED'`);
    for (const [param, col] of [
      ['departmentId', employees.departmentId],
      ['locationId', employees.locationId],
      ['companyId', employees.companyId],
      ['managerId', employees.managerId],
    ] as const) {
      const id = uuidParam(q[param]);
      if (id) conds.push(eq(col, id));
    }
    if (q.hasAssets === '1') {
      conds.push(sql`exists (select 1 from allocations al where al.employee_id = employees.id and al.status = 'ACTIVE')`);
    }
    if (p.search) {
      const like = likePattern(p.search);
      conds.push(
        or(ilike(employees.fullName, like), ilike(employees.employeeCode, like), ilike(employees.email, like), ilike(employees.designation, like))!,
      );
    }
    const where = conds.length ? and(...conds) : undefined;
    const sortCol =
      { name: employees.fullName, code: employees.employeeCode, joinDate: employees.joinDate, createdAt: employees.createdAt, status: employees.status, lastWorkingDate: employees.lastWorkingDate }[p.sort] ??
      employees.fullName;
    const db = this.dbs.db;
    const [items, [{ total }]] = await Promise.all([
      db
        .select({
          id: employees.id,
          employeeCode: employees.employeeCode,
          fullName: employees.fullName,
          firstName: employees.firstName,
          lastName: employees.lastName,
          email: employees.email,
          phone: employees.phone,
          designation: employees.designation,
          status: employees.status,
          joinDate: employees.joinDate,
          lastWorkingDate: employees.lastWorkingDate,
          departmentId: employees.departmentId,
          departmentName: departments.name,
          locationId: employees.locationId,
          locationName: locations.name,
          companyName: companies.name,
          managerName: manager.fullName,
          assetCount: sql<number>`(select coalesce(sum(al.quantity), 0)::int from allocations al where al.employee_id = employees.id and al.status = 'ACTIVE')`,
          openExitCaseId: sql<string | null>`(select c.id from exit_cases c where c.employee_id = employees.id and c.status = 'OPEN' limit 1)`,
        })
        .from(employees)
        .leftJoin(departments, eq(departments.id, employees.departmentId))
        .leftJoin(locations, eq(locations.id, employees.locationId))
        .leftJoin(companies, eq(companies.id, employees.companyId))
        .leftJoin(manager, eq(manager.id, employees.managerId))
        .where(where)
        .orderBy(p.dir === 'asc' ? asc(sortCol) : desc(sortCol), asc(employees.id))
        .limit(p.pageSize)
        .offset(p.offset),
      db.select({ total: sql<number>`count(*)::int` }).from(employees).where(where),
    ]);
    return { items, total, page: p.page, pageSize: p.pageSize };
  }

  async get(actor: Actor, id: string) {
    if (!this.canSee(actor, id)) throw notFound('Employee');
    const db = this.dbs.db;
    const [row] = await db
      .select({
        employee: employees,
        departmentName: departments.name,
        locationName: locations.name,
        companyName: companies.name,
        managerName: manager.fullName,
      })
      .from(employees)
      .leftJoin(departments, eq(departments.id, employees.departmentId))
      .leftJoin(locations, eq(locations.id, employees.locationId))
      .leftJoin(companies, eq(companies.id, employees.companyId))
      .leftJoin(manager, eq(manager.id, employees.managerId))
      .where(eq(employees.id, id));
    if (!row) throw notFound('Employee');

    const [heldAssets, [login], exitCase, reports] = await Promise.all([
      this.assets(actor, id),
      db
        .select({ id: users.id, email: users.email, isActive: users.isActive, roleName: roles.name, lastLoginAt: users.lastLoginAt })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.roleId))
        .where(eq(users.employeeId, id)),
      this.exits.openCaseFor(id),
      db
        .select({ id: employees.id, fullName: employees.fullName, designation: employees.designation })
        .from(employees)
        .where(and(eq(employees.managerId, id), sql`${employees.status} <> 'EXITED'`))
        .orderBy(asc(employees.fullName)),
    ]);
    const pastExits = await db
      .select({ id: exitCases.id, caseNumber: exitCases.caseNumber, status: exitCases.status, lastWorkingDate: exitCases.lastWorkingDate })
      .from(exitCases)
      .where(eq(exitCases.employeeId, id))
      .orderBy(desc(exitCases.createdAt));
    return {
      ...row.employee,
      departmentName: row.departmentName,
      locationName: row.locationName,
      companyName: row.companyName,
      managerName: row.managerName,
      assets: heldAssets,
      login: login ?? null,
      openExitCase: exitCase,
      exitCases: pastExits,
      directReports: reports,
    };
  }

  /** Everything the employee currently holds (individual and pooled). */
  async assets(actor: Actor, id: string) {
    if (!this.canSee(actor, id)) throw notFound('Employee');
    return this.dbs.db
      .select({
        allocationId: allocations.id,
        quantity: allocations.quantity,
        assignedAt: allocations.assignedAt,
        expectedReturnDate: allocations.expectedReturnDate,
        assetId: assets.id,
        assetTag: assets.assetTag,
        name: assets.name,
        status: assets.status,
        condition: assets.condition,
        serialNumber: assets.serialNumber,
        trackingMode: assets.trackingMode,
        typeName: assetTypes.name,
        typeIcon: assetTypes.icon,
        categoryName: assetCategories.name,
        categoryIcon: assetCategories.icon,
        categoryColor: assetCategories.color,
      })
      .from(allocations)
      .innerJoin(assets, eq(assets.id, allocations.assetId))
      .innerJoin(assetTypes, eq(assetTypes.id, assets.assetTypeId))
      .innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
      .where(and(eq(allocations.employeeId, id), eq(allocations.status, 'ACTIVE')))
      .orderBy(asc(assetCategories.sortOrder), asc(assets.assetTag));
  }

  async timeline(actor: Actor, id: string, q: Record<string, string>) {
    if (!this.canSee(actor, id)) throw notFound('Employee');
    return this.history.list({ employeeId: id }, listParams(q, { sort: 'occurredAt', pageSize: 100 }));
  }

  private async assertManager(id: string | null, managerId: string | null | undefined) {
    if (!managerId) return;
    if (managerId === id) throw badRequest('An employee cannot manage themselves', { managerId: 'Cannot be the same employee' });
  }

  async create(actor: Actor, input: EmployeeInput) {
    await this.assertManager(null, input.managerId);
    return this.dbs.tx(async (db) => {
      const [row] = await db.insert(employees).values(input).returning();
      await this.history.record(actor, {
        entityType: 'EMPLOYEE',
        entityId: row.id,
        entityLabel: row.fullName,
        action: 'CREATED',
        summary: `Employee ${row.fullName} (${row.employeeCode}) added`,
      });
      return row;
    });
  }

  async update(actor: Actor, id: string, input: EmployeeInput) {
    await this.assertManager(id, input.managerId);
    return this.dbs.tx(async (db) => {
      const [before] = await db.select().from(employees).where(eq(employees.id, id)).for('update');
      if (!before) throw notFound('Employee');
      const changes = diffChanges(before, input, LABELS);
      if (!changes.length) return before;
      const [row] = await db.update(employees).set({ ...input, updatedAt: new Date() }).where(eq(employees.id, id)).returning();
      await this.history.record(actor, {
        entityType: 'EMPLOYEE',
        entityId: id,
        entityLabel: row.fullName,
        action: 'UPDATED',
        summary: `Profile updated: ${changes.map((c) => c.label ?? c.field).join(', ')}`,
        changes,
      });
      if (row.fullName !== before.fullName || row.employeeCode !== before.employeeCode) {
        const name = `${row.fullName} (${row.employeeCode})`;
        await db.update(assets).set({ holderName: name }).where(and(eq(assets.holderType, 'EMPLOYEE'), eq(assets.holderId, id)));
        await db.update(allocations).set({ holderName: name }).where(and(eq(allocations.employeeId, id), eq(allocations.status, 'ACTIVE')));
      }
      return row;
    });
  }

  /**
   * HR status changes. Notice Period opens the exit case (asset recovery checklist); Exited is
   * only reachable by completing that case, so no one can leave with assets unnoticed.
   */
  async changeStatus(actor: Actor, id: string, input: EmployeeStatusInput) {
    assertCan(actor, 'employee:status');
    return this.dbs.tx(async (db) => {
      const [emp] = await db.select().from(employees).where(eq(employees.id, id)).for('update');
      if (!emp) throw notFound('Employee');
      const openCase = await this.exits.openCaseFor(id);

      switch (input.status) {
        case 'EXITED':
          throw badRequest(
            openCase
              ? `Complete the exit clearance (${openCase.caseNumber}) to mark ${emp.fullName} as exited.`
              : `Put ${emp.fullName} on Notice Period first — the system will build the asset recovery checklist.`,
          );
        case 'NOTICE_PERIOD': {
          if (emp.status === 'EXITED') throw badRequest('This employee has already exited. Re-activate them first.');
          const lwd = input.lastWorkingDate!;
          await db
            .update(employees)
            .set({ status: 'NOTICE_PERIOD', noticeDate: input.noticeDate ?? emp.noticeDate ?? today(), lastWorkingDate: lwd, updatedAt: new Date() })
            .where(eq(employees.id, id));
          if (emp.status !== 'NOTICE_PERIOD') {
            await this.history.record(actor, {
              entityType: 'EMPLOYEE',
              entityId: id,
              entityLabel: emp.fullName,
              action: 'STATUS_CHANGED',
              summary: `Moved to Notice Period — last working day ${lwd}${input.reason ? ` (${input.reason})` : ''}`,
              changes: [
                { field: 'status', label: 'Status', from: emp.status, to: 'NOTICE_PERIOD' },
                { field: 'lastWorkingDate', label: 'Last working date', from: emp.lastWorkingDate, to: lwd },
              ],
            });
          }
          const c = await this.exits.open(actor, id, { lastWorkingDate: lwd, noticeDate: input.noticeDate, reason: input.reason });
          return { ok: true, status: 'NOTICE_PERIOD', exitCaseId: c.id };
        }
        case 'ACTIVE':
        case 'ON_LEAVE': {
          if (emp.status === input.status) return { ok: true, status: emp.status };
          if (openCase) {
            await this.exits.cancel(actor, openCase.id, input.reason ?? 'Notice withdrawn', { restoreEmployee: false });
          }
          await db
            .update(employees)
            .set({
              status: input.status,
              ...(emp.status === 'NOTICE_PERIOD' || emp.status === 'EXITED' ? { lastWorkingDate: null, noticeDate: null, exitDate: null } : {}),
              updatedAt: new Date(),
            })
            .where(eq(employees.id, id));
          await this.history.record(actor, {
            entityType: 'EMPLOYEE',
            entityId: id,
            entityLabel: emp.fullName,
            action: 'STATUS_CHANGED',
            summary: `Status changed from ${EMPLOYEE_STATUS_LABELS[emp.status]} to ${EMPLOYEE_STATUS_LABELS[input.status]}${
              emp.status === 'EXITED' ? ' (re-joined)' : openCase ? ' (notice withdrawn)' : ''
            }${input.reason ? ` — ${input.reason}` : ''}`,
            changes: [{ field: 'status', label: 'Status', from: emp.status, to: input.status }],
          });
          return { ok: true, status: input.status };
        }
      }
    });
  }
}
