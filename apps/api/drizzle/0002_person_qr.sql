-- Employees without an email sign in with their employee code.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "personal_email" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "personal_phone" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "assets_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "assets_verified_by_name" text;--> statement-breakpoint
-- One QR per person: backfill existing employees before making it required.
ALTER TABLE "employees" ADD COLUMN "qr_code" text;--> statement-breakpoint
UPDATE "employees" SET "qr_code" = (
  SELECT string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (floor(random() * 31) + 1)::int, 1), '')
  FROM generate_series(1, 12 + 0 * length("employees"."id"::text))
);--> statement-breakpoint
ALTER TABLE "employees" ALTER COLUMN "qr_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_qr_code_unique" UNIQUE("qr_code");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_code_lower_idx" ON "employees" (lower("employee_code"));--> statement-breakpoint
-- Full access is for the IT team.
UPDATE "roles" SET "permissions" = ARRAY['dashboard:view','asset:view','asset:create','asset:edit','asset:assign','asset:lifecycle','catalog:manage','org:manage','employee:view','employee:manage','employee:status','exit:view','exit:manage','exit:override','request:create','request:approve','request:fulfil','ticket:create','ticket:manage','maintenance:manage','history:view','user:manage'], "description" = 'Full access: assets, people, logins and settings'
WHERE "name" = 'IT / Asset Manager' AND "is_system";
