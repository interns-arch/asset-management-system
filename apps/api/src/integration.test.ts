// API integration tests. Run with `npm test` (uses a throwaway `eam_test` database).
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { type Permission, SYSTEM_ROLES } from '@eam/shared';
import { DbService } from './db/db.service';
import { roles, users } from './db/schema';
import { createApp } from './main';
import { hashPassword } from './modules/auth/auth.service';

const PASSWORD = 'Test@12345';
let app: INestApplication;
let base = '';
let dbs: DbService;
const cookies: Record<string, string> = {};

async function call(method: string, path: string, body?: unknown, who: string | null = 'admin') {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      ...(who && cookies[who] ? { cookie: cookies[who] } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(who: string, email: string) {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    body: JSON.stringify({ login: email, password: PASSWORD }),
  });
  assert.equal(res.status, 200, `login ${email}`);
  cookies[who] = res.headers.get('set-cookie')!.split(';')[0];
}

let ids: Record<string, string> = {};

before(async () => {
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api`;
  dbs = app.get(DbService);

  const roleIds: Record<string, string> = {};
  for (const r of SYSTEM_ROLES) {
    const [row] = await dbs.root.insert(roles).values({ name: r.name, description: r.description, permissions: r.permissions as Permission[], isSystem: true }).returning();
    roleIds[r.name] = row.id;
  }
  const passwordHash = await hashPassword(PASSWORD);
  await dbs.root.insert(users).values({ email: 'admin@t.test', name: 'Test Admin', passwordHash, roleId: roleIds.Admin });
  await dbs.root.insert(users).values({ email: 'it@t.test', name: 'Test IT', passwordHash, roleId: roleIds['IT / Asset Manager'] });
  await login('admin', 'admin@t.test');
  await login('it', 'it@t.test');

  // Master data used by the tests.
  const loc = await call('POST', '/locations', { name: 'Test Store', type: 'WAREHOUSE', isStore: true });
  const cat = await call('POST', '/categories', { name: 'Drones', code: 'DRN' });
  assert.equal(cat.status, 201);
  const type = await call('POST', '/asset-types', { categoryId: cat.body.id, name: 'Quadcopter', code: 'QDC', trackingMode: 'INDIVIDUAL' });
  assert.equal(type.status, 201);
  await call('POST', '/fields', { assetTypeId: type.body.id, label: 'Flight Time (min)', type: 'number', required: true, min: 1, max: 120 });
  await call('POST', '/fields', { assetTypeId: type.body.id, label: 'Aviation ID', type: 'text', isUnique: true });
  await call('POST', '/fields', { assetTypeId: type.body.id, label: 'Camera', type: 'select', options: ['4K', '6K'] });
  const alice = await call('POST', '/employees', { employeeCode: 'T001', firstName: 'Alice', lastName: 'Rao', email: 'alice@t.test' });
  const bob = await call('POST', '/employees', { employeeCode: 'T002', firstName: 'Bob', lastName: 'Iyer' });
  assert.equal(alice.status, 201);

  // An employee-role login linked to Bob.
  await dbs.root.insert(users).values({ email: 'bob@t.test', name: 'Bob Iyer', passwordHash, roleId: roleIds.Employee, employeeId: bob.body.id });
  await login('bob', 'bob@t.test');
  ids = { store: loc.body.id, category: cat.body.id, type: type.body.id, alice: alice.body.id, bob: bob.body.id };
});

after(async () => {
  await app?.close();
});

const newDrone = (extra: Record<string, unknown> = {}) =>
  call('POST', '/assets', { assetTypeId: ids.type, name: 'DJI Mavic 3', status: 'AVAILABLE', attributes: { flight_time_min: 40 }, ...extra });

describe('security', () => {
  test('requests without a session are rejected', async () => {
    const r = await call('GET', '/assets', undefined, null);
    assert.equal(r.status, 401);
  });

  test('mutations without the CSRF header are rejected', async () => {
    const res = await fetch(`${base}/assets`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookies.admin }, body: '{}' });
    assert.equal(res.status, 403);
  });

  test('employees only see their own assets and cannot list people', async () => {
    const mine = await newDrone({ attributes: { flight_time_min: 30, aviation_id: 'BOB-1' } });
    const other = await newDrone({ attributes: { flight_time_min: 30, aviation_id: 'OTHER-1' } });
    assert.equal((await call('POST', `/assets/${mine.body.id}/assign`, { holderType: 'EMPLOYEE', holderId: ids.bob })).status, 200);

    const list = await call('GET', '/assets', undefined, 'bob');
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.body.items.map((a: { id: string }) => a.id),
      [mine.body.id],
    );
    assert.equal((await call('GET', `/assets/${mine.body.id}`, undefined, 'bob')).status, 200);
    assert.equal((await call('GET', `/assets/${mine.body.id}/history`, undefined, 'bob')).status, 200);
    assert.equal((await call('GET', `/assets/${other.body.id}`, undefined, 'bob')).status, 404);
    assert.equal((await call('GET', '/employees', undefined, 'bob')).status, 403);
    assert.equal((await call('POST', '/categories', { name: 'Nope', code: 'NOPE' }, 'bob')).status, 403);
  });
});

describe('one QR per person and view-only logins', () => {
  test('a person QR holds their employee ID and resolves to the person', async () => {
    for (const code of ['T001', 't001', 'https://assets.example.com/id/T001']) {
      const r = await call('GET', `/employees/lookup?code=${encodeURIComponent(code)}`);
      assert.equal(r.status, 200, code);
      assert.equal(r.body.id, ids.alice);
    }
    // Employee IDs are unique regardless of case, so a QR can never match two people.
    assert.equal((await call('POST', '/employees', { employeeCode: 't001', firstName: 'Dup' })).status, 409);
    // An employee can resolve their own QR but not someone else's.
    assert.equal((await call('GET', '/employees/lookup?code=T002', undefined, 'bob')).status, 200);
    assert.equal((await call('GET', '/employees/lookup?code=T001', undefined, 'bob')).status, 404);
  });

  test('IT gives an employee a login; they sign in with their employee ID and can only view', async () => {
    const emp = await call('POST', '/employees', { employeeCode: 'ct000099', firstName: 'Anurag', lastName: 'Gupta', email: 'NA', phone: 'NA', personalPhone: '9971194578' });
    assert.equal(emp.status, 201);
    assert.equal(emp.body.employeeCode, 'CT000099');
    assert.equal(emp.body.email, null, '"NA" is stored as empty');
    const laptop = await newDrone({ name: 'Assigned to Anurag' });
    await call('POST', `/assets/${laptop.body.id}/assign`, { holderType: 'EMPLOYEE', holderId: emp.body.id }, 'it');

    // IT has full access, including giving logins.
    const grant = await call('POST', `/employees/${emp.body.id}/access`, {}, 'it');
    assert.equal(grant.status, 200);
    assert.equal(grant.body.loginId, 'CT000099');
    assert.equal(grant.body.email, null);
    assert.ok(grant.body.password.length >= 8);

    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
      body: JSON.stringify({ login: 'ct000099', password: grant.body.password }),
    });
    assert.equal(res.status, 200);
    cookies.anurag = res.headers.get('set-cookie')!.split(';')[0];
    const me = await call('GET', '/auth/me', undefined, 'anurag');
    assert.equal(me.body.role.name, 'Employee');

    const mine = await call('GET', '/assets', undefined, 'anurag');
    assert.deepEqual(mine.body.items.map((x: { id: string }) => x.id), [laptop.body.id]);
    // View only: no changes to assets, people or logins.
    assert.equal((await call('PATCH', `/assets/${laptop.body.id}`, { name: 'Mine now', version: laptop.body.version }, 'anurag')).status, 403);
    assert.equal((await call('POST', `/assets/${laptop.body.id}/return`, { condition: 'GOOD' }, 'anurag')).status, 403);
    assert.equal((await call('POST', `/employees/${emp.body.id}/verify-assets`, {}, 'anurag')).status, 403);
    assert.equal((await call('POST', `/employees/${emp.body.id}/access`, {}, 'anurag')).status, 403);

    // Resetting issues a new password and signs the old sessions out.
    const reset = await call('POST', `/employees/${emp.body.id}/access`, {}, 'it');
    assert.equal(reset.body.created, false);
    assert.equal((await call('GET', '/auth/me', undefined, 'anurag')).status, 401);
  });

  test('an employee can request something that is not in the catalog', async () => {
    const r = await call('POST', '/requests', { itemName: 'Ergonomic footrest', reason: 'Back pain' }, 'bob');
    assert.equal(r.status, 201);
    assert.equal(r.body.assetTypeId, null);
    assert.equal((await call('POST', '/requests', { reason: 'Nothing chosen' }, 'bob')).status, 400);
    const mine = await call('GET', '/requests', undefined, 'bob');
    const row = mine.body.items.find((x: { id: string }) => x.id === r.body.id);
    assert.equal(row.typeName, 'Ergonomic footrest');
    assert.equal(row.custom, true);
    // IT approves and fulfils it with any asset.
    assert.equal((await call('POST', `/requests/${r.body.id}/decision`, { decision: 'APPROVE' }, 'it')).status, 200);
    const drone = await newDrone({ name: 'Footrest stand-in' });
    assert.equal((await call('POST', `/requests/${r.body.id}/fulfil`, { assetId: drone.body.id }, 'it')).status, 200);
  });

  test('IT records that a person still has their assets', async () => {
    const r = await call('POST', `/employees/${ids.bob}/verify-assets`, { note: 'Checked at desk' }, 'it');
    assert.equal(r.status, 200);
    assert.ok(r.body.assetsVerifiedAt);
    const history = await call('GET', `/employees/${ids.bob}/history`);
    assert.equal(history.body.items[0].action, 'ASSETS_VERIFIED');
  });
});

describe('dynamic asset types and custom fields', () => {
  test('required, range and option rules are enforced by the API', async () => {
    const missing = await call('POST', '/assets', { assetTypeId: ids.type, name: 'No specs', attributes: {} });
    assert.equal(missing.status, 400);
    assert.match(missing.body.errors['attributes.flight_time_min'], /required/);

    const outOfRange = await newDrone({ attributes: { flight_time_min: 500 } });
    assert.equal(outOfRange.status, 400);
    assert.match(outOfRange.body.errors['attributes.flight_time_min'], /at most 120/);

    const badOption = await newDrone({ attributes: { flight_time_min: 20, camera: '8K' } });
    assert.equal(badOption.status, 400);
  });

  test('assets get a tag from the type prefix and clean attribute values', async () => {
    const r = await newDrone({ attributes: { flight_time_min: '45', camera: '4K', aviation_id: 'AV-100' } });
    assert.equal(r.status, 201);
    assert.match(r.body.assetTag, /^QDC-\d{6}$/);
    assert.deepEqual(r.body.attributes, { flight_time_min: 45, camera: '4K', aviation_id: 'AV-100' });
  });

  test('unique custom fields reject duplicates', async () => {
    const dup = await newDrone({ attributes: { flight_time_min: 30, aviation_id: 'AV-100' } });
    assert.equal(dup.status, 400);
    assert.match(dup.body.message, /already used by QDC-/);
  });

  test('catalog and role listings report correct counts', async () => {
    const cats = await call('GET', '/categories');
    const drones = cats.body.find((c: { id: string }) => c.id === ids.category);
    assert.equal(drones.typeCount, 1);
    assert.ok(drones.assetCount >= 1);
    const types = await call('GET', `/asset-types?categoryId=${ids.category}`);
    assert.equal(types.body[0].fieldCount, 3);
    const roleList = await call('GET', '/roles');
    assert.equal(roleList.body.find((r: { name: string }) => r.name === 'Admin').userCount, 1);
    const stores = await call('GET', '/locations');
    assert.equal(typeof stores.body.items[0].assetCount, 'number');
  });

  test('custom fields can be filtered on', async () => {
    const r = await call('GET', `/assets?assetTypeId=${ids.type}&f.camera=4K`);
    assert.equal(r.status, 200);
    assert.ok(r.body.items.length >= 1);
    assert.ok(r.body.items.every((a: { attributes: { camera?: string } }) => a.attributes.camera === '4K'));
    const range = await call('GET', `/assets?assetTypeId=${ids.type}&f.flight_time_min.min=44`);
    assert.ok(range.body.items.every((a: { attributes: { flight_time_min: number } }) => a.attributes.flight_time_min >= 44));
  });
});

describe('custody and lifecycle', () => {
  test('an asset cannot be assigned twice, even by concurrent requests', async () => {
    const drone = await newDrone();
    const [a, b] = await Promise.all([
      call('POST', `/assets/${drone.body.id}/assign`, { holderType: 'EMPLOYEE', holderId: ids.alice }),
      call('POST', `/assets/${drone.body.id}/assign`, { holderType: 'EMPLOYEE', holderId: ids.bob }, 'it'),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    const active = await dbs.root.execute<{ n: number }>(sql`select count(*)::int as n from allocations where asset_id = ${drone.body.id} and status = 'ACTIVE'`);
    assert.equal(active.rows[0].n, 1);
  });

  test('assign → transfer → return follows the lifecycle and keeps history', async () => {
    const drone = await newDrone();
    const id = drone.body.id;
    assert.equal((await call('POST', `/assets/${id}/assign`, { holderType: 'EMPLOYEE', holderId: ids.alice })).status, 200);
    assert.equal((await call('POST', `/assets/${id}/transfer`, { holderType: 'EMPLOYEE', holderId: ids.bob })).status, 200);
    assert.equal((await call('POST', `/assets/${id}/return`, { condition: 'GOOD', makeAvailable: true })).status, 200);
    const detail = await call('GET', `/assets/${id}`);
    assert.equal(detail.body.status, 'AVAILABLE');
    const allocations = await call('GET', `/assets/${id}/allocations`);
    assert.deepEqual(
      allocations.body.map((a: { status: string }) => a.status),
      ['RETURNED', 'TRANSFERRED'],
    );
    const history = await call('GET', `/assets/${id}/history`);
    const actions = history.body.items.map((e: { action: string }) => e.action);
    for (const a of ['CREATED', 'ASSIGNED', 'TRANSFERRED', 'RETURNED']) assert.ok(actions.includes(a), `history has ${a}`);
  });

  test('invalid lifecycle transitions are refused', async () => {
    const drone = await newDrone();
    const dispose = await call('POST', `/assets/${drone.body.id}/lifecycle`, { action: 'dispose' });
    assert.equal(dispose.status, 409);
    assert.equal((await call('POST', `/assets/${drone.body.id}/lifecycle`, { action: 'retire' })).status, 200);
    assert.equal((await call('POST', `/assets/${drone.body.id}/assign`, { holderType: 'EMPLOYEE', holderId: ids.alice })).status, 409);
  });

  test('stale edits are rejected (optimistic locking)', async () => {
    const drone = await newDrone();
    const v = drone.body.version;
    assert.equal((await call('PATCH', `/assets/${drone.body.id}`, { name: 'First edit', version: v })).status, 200);
    assert.equal((await call('PATCH', `/assets/${drone.body.id}`, { name: 'Stale edit', version: v })).status, 409);
  });
});

describe('employee exit', () => {
  test('notice period builds the checklist and completion is blocked until cleared', async () => {
    const emp = await call('POST', '/employees', { employeeCode: 'T100', firstName: 'Leaving', lastName: 'Person' });
    const e = emp.body.id;
    const laptop = await newDrone({ name: 'Drone A' });
    const helmet = await newDrone({ name: 'Drone B' });
    await call('POST', `/assets/${laptop.body.id}/assign`, { holderType: 'EMPLOYEE', holderId: e });
    await call('POST', `/assets/${helmet.body.id}/assign`, { holderType: 'EMPLOYEE', holderId: e });

    // Exited is only reachable through the exit case.
    assert.equal((await call('POST', `/employees/${e}/status`, { status: 'EXITED' })).status, 400);

    const notice = await call('POST', `/employees/${e}/status`, { status: 'NOTICE_PERIOD', lastWorkingDate: '2030-01-31' });
    assert.equal(notice.status, 200);
    const caseId = notice.body.exitCaseId;
    const exit = await call('GET', `/exit-cases/${caseId}`);
    assert.equal(exit.body.items.length, 2);
    assert.equal(exit.body.canComplete, false);

    assert.equal((await call('POST', `/exit-cases/${caseId}/complete`)).status, 409);

    // Return one via the checklist, one via the normal asset return — both clear their item.
    const first = exit.body.items.find((i: { assetId: string }) => i.assetId === laptop.body.id);
    assert.equal((await call('PATCH', `/exit-cases/${caseId}/items/${first.id}`, { status: 'RETURNED' })).status, 200);
    assert.equal((await call('POST', `/exit-cases/${caseId}/complete`)).status, 409);
    assert.equal((await call('POST', `/assets/${helmet.body.id}/return`, { condition: 'DAMAGED', makeAvailable: false })).status, 200);

    const after = await call('GET', `/exit-cases/${caseId}`);
    assert.deepEqual(after.body.items.map((i: { status: string }) => i.status).sort(), ['DAMAGED', 'RETURNED']);
    assert.equal((await call('POST', `/exit-cases/${caseId}/complete`)).status, 200);
    assert.equal((await call('GET', `/employees/${e}`)).body.status, 'EXITED');
  });

  test('override needs the permission and a reason, and writes off missing assets', async () => {
    const emp = await call('POST', '/employees', { employeeCode: 'T200', firstName: 'Override', lastName: 'Case' });
    const drone = await newDrone({ name: 'Never returned' });
    await call('POST', `/assets/${drone.body.id}/assign`, { holderType: 'EMPLOYEE', holderId: emp.body.id });
    const notice = await call('POST', `/employees/${emp.body.id}/status`, { status: 'NOTICE_PERIOD', lastWorkingDate: '2030-02-28' });
    const caseId = notice.body.exitCaseId;

    // Only full-access users (IT / Admin) may override; a reason is required.
    assert.equal((await call('POST', `/exit-cases/${caseId}/override`, { reason: 'Because I said so, really' }, 'bob')).status, 403);
    assert.equal((await call('POST', `/exit-cases/${caseId}/override`, { reason: 'short' }, 'it')).status, 400);
    const ok = await call('POST', `/exit-cases/${caseId}/override`, { reason: 'Cost recovered from final settlement' }, 'it');
    assert.equal(ok.status, 200);
    assert.equal((await call('GET', `/assets/${drone.body.id}`)).body.status, 'LOST');
    const exit = await call('GET', `/exit-cases/${caseId}`);
    assert.equal(exit.body.overridden, true);
    assert.equal(exit.body.items[0].status, 'MISSING');
  });
});

describe('history', () => {
  test('history is append-only at the database level', async () => {
    // Drizzle wraps the PostgreSQL error; the trigger's message is on the cause.
    const appendOnly = (err: { message?: string; cause?: { message?: string } }) => /append-only/.test(`${err.message} ${err.cause?.message}`);
    await assert.rejects(dbs.root.execute(sql`update history_events set summary = 'tampered'`), appendOnly);
    await assert.rejects(dbs.root.execute(sql`delete from history_events`), appendOnly);
    await assert.rejects(dbs.root.execute(sql`truncate history_events`), appendOnly);
    const r = await dbs.root.execute<{ n: number }>(sql`select count(*)::int as n from history_events where summary = 'tampered'`);
    assert.equal(r.rows[0].n, 0);
  });
});
