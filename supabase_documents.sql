-- Create Document Status Enum (if not exists, reused from invoices if same type, but let's assume we might want specific one or reuse text check)
-- reused implicitly by check constraint or text type for simplicity as per previous component

-- Create Support Documents Table
create table support_documents (
  id uuid default gen_random_uuid() primary key,
  document_number text not null,
  beneficiary_name text not null,
  amount numeric not null,
  currency text default 'COP',
  issue_date date not null,
  status text default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table support_documents enable row level security;

-- Create Policy
create policy "Enable all access for all users" on support_documents
  for all using (true) with check (true);

-- Insert Mock Data
insert into support_documents (document_number, beneficiary_name, amount, issue_date, status) values
  ('DS-001', 'Juan Pérez Servicios', 250000.00, '2026-01-10', 'approved'),
  ('DS-002', 'Transportes Rápidos SAS', 120000.00, '2026-01-18', 'pending'),
  ('DS-003', 'Mantenimiento General', 85000.00, '2026-01-21', 'rejected'),
  ('DS-004', 'Suministros Varios', 500000.00, '2026-01-25', 'pending');
