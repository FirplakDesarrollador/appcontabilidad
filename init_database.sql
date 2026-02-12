-- Consolidated Database Setup Script
-- Run this in your Supabase SQL Editor

-- 1. Create Ensure Invoice Status Enum exists
DO $$ BEGIN
    CREATE TYPE invoice_status AS ENUM ('approved', 'pending', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create Invoices Table
create table if not exists invoices (
  id uuid default gen_random_uuid() primary key,
  external_id text unique,
  invoice_number text,
  provider_name text,
  amount numeric,
  currency text default 'COP',
  invoice_date date,
  status invoice_status default 'pending',
  file_path_pdf text,
  file_path_xml text,
  metadata jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Support Documents Table
create table if not exists support_documents (
  id uuid default gen_random_uuid() primary key,
  document_number text not null,
  beneficiary_name text not null,
  amount numeric not null,
  currency text default 'COP',
  issue_date date not null,
  status text default 'pending' check (status in ('approved', 'pending', 'rejected')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Enable RLS
alter table invoices enable row level security;
alter table support_documents enable row level security;

-- 5. Create Policies (Drop first to avoid errors if re-running)
drop policy if exists "Enable all access for all users" on invoices;
create policy "Enable all access for all users" on invoices for all using (true) with check (true);

drop policy if exists "Enable all access for all users" on support_documents;
create policy "Enable all access for all users" on support_documents for all using (true) with check (true);

-- 6. Insert Mock Data
insert into invoices (invoice_number, provider_name, amount, invoice_date, status, external_id) values
  ('INV-001', 'Tech Solutions Inc', 1500.00, '2026-01-15', 'approved', 'EXT-001'),
  ('INV-002', 'Office Supplies Co', 350.50, '2026-01-20', 'pending', 'EXT-002'),
  ('INV-005', 'Consulting Group', 5000.00, '2026-01-28', 'approved', 'EXT-003')
on conflict (external_id) do nothing;

insert into support_documents (document_number, beneficiary_name, amount, issue_date, status) values
  ('DS-001', 'Juan Pérez Servicios', 250000.00, '2026-01-10', 'approved'),
  ('DS-002', 'Transportes Rápidos SAS', 120000.00, '2026-01-18', 'pending'),
  ('DS-003', 'Mantenimiento General', 85000.00, '2026-01-21', 'rejected'),
  ('DS-004', 'Suministros Varios', 500000.00, '2026-01-25', 'pending');
