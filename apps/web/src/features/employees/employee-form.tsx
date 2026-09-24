import { employeeSchema } from '@eam/shared';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { applyServerErrors, errorOf, Field, FormSection, useZodForm } from '@/components/common/form';
import { FormSheet } from '@/components/common/form-sheet';
import { EntityPicker } from '@/components/common/pickers';
import { Input, Textarea } from '@/components/ui/input';
import { Separator } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { queryClient, useCompanies } from '@/lib/queries';
import type { EmployeeDetail } from '@/lib/types';
import type { FormProps } from '../quick-add/quick-add';

const v = (x: unknown) => (x === null || x === undefined ? '' : x);

export default function EmployeeForm({ open, onOpenChange, record, defaults }: FormProps) {
  const emp = record as EmployeeDetail | undefined;
  const editing = !!emp;
  const navigate = useNavigate();
  const companies = useCompanies();
  const form = useZodForm(employeeSchema, {
    employeeCode: emp?.employeeCode ?? '',
    firstName: emp?.firstName ?? '',
    lastName: v(emp?.lastName),
    email: v(emp?.email),
    phone: v(emp?.phone),
    personalEmail: v(emp?.personalEmail),
    personalPhone: v(emp?.personalPhone),
    designation: v(emp?.designation),
    companyId: v(emp?.companyId ?? defaults?.companyId ?? companies.data?.[0]?.id),
    departmentId: v(emp?.departmentId ?? defaults?.departmentId),
    locationId: v(emp?.locationId ?? defaults?.locationId),
    managerId: v(emp?.managerId),
    joinDate: v(emp?.joinDate),
    notes: v(emp?.notes),
  });
  const save = useMutation({
    mutationFn: (body: unknown) => (editing ? api.patch<EmployeeDetail>(`/employees/${emp.id}`, body) : api.post<EmployeeDetail>('/employees', body)),
  });
  const e = (n: string) => errorOf(form, n);
  const pick = (name: 'companyId' | 'departmentId' | 'locationId' | 'managerId') => ({
    value: (form.watch(name) as string) || null,
    onChange: (val: string | null) => form.setValue(name, val ?? '', { shouldDirty: true }),
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync(values);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['employees'] }), queryClient.invalidateQueries({ queryKey: ['employee'] })]);
      toast.success(editing ? 'Employee updated' : `${saved.fullName} added`, {
        action: editing ? undefined : { label: 'Open', onClick: () => navigate(`/employees/${saved.id}`) },
      });
      onOpenChange(false);
    } catch (err) {
      applyServerErrors(form, err);
      toast.error(errorMessage(err));
    }
  });

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title={editing ? `Edit ${emp.fullName}` : 'Add employee'} onSubmit={submit} submitting={save.isPending} submitLabel={editing ? 'Save changes' : 'Add employee'}>
      <FormSection title="Person">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required error={e('firstName')}>
            <Input autoComplete="off" {...form.register('firstName')} />
          </Field>
          <Field label="Last name" error={e('lastName')}>
            <Input autoComplete="off" {...form.register('lastName')} />
          </Field>
          <Field label="Employee ID" required error={e('employeeCode')} hint="e.g. CT000099 — also their login ID">
            <Input className="font-mono uppercase" placeholder="CT000099" {...form.register('employeeCode')} />
          </Field>
          <Field label="Designation" error={e('designation')}>
            <Input placeholder="Sales Executive" {...form.register('designation')} />
          </Field>
          <Field label="Official phone" error={e('phone')} hint="Company SIM, if any">
            <Input type="tel" inputMode="tel" {...form.register('phone')} />
          </Field>
          <Field label="Personal phone" error={e('personalPhone')}>
            <Input type="tel" inputMode="tel" {...form.register('personalPhone')} />
          </Field>
          <Field label="Official email" error={e('email')}>
            <Input type="email" inputMode="email" autoCapitalize="none" {...form.register('email')} />
          </Field>
          <Field label="Personal email" error={e('personalEmail')}>
            <Input type="email" inputMode="email" autoCapitalize="none" {...form.register('personalEmail')} />
          </Field>
        </div>
      </FormSection>
      <Separator />
      <FormSection title="Organisation">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company" error={e('companyId')}>
            <EntityPicker kind="COMPANY" {...pick('companyId')} />
          </Field>
          <Field label="Department" error={e('departmentId')}>
            <EntityPicker kind="DEPARTMENT" {...pick('departmentId')} />
          </Field>
          <Field label="Location" error={e('locationId')}>
            <EntityPicker kind="LOCATION" {...pick('locationId')} />
          </Field>
          <Field label="Reports to" error={e('managerId')}>
            <EntityPicker kind="EMPLOYEE" selectedLabel={emp?.managerName} {...pick('managerId')} />
          </Field>
          <Field label="Joining date" error={e('joinDate')}>
            <Input type="date" {...form.register('joinDate')} />
          </Field>
        </div>
        <Field label="Notes" error={e('notes')}>
          <Textarea rows={2} {...form.register('notes')} />
        </Field>
      </FormSection>
    </FormSheet>
  );
}
