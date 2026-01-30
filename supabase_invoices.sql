-- Create Invoice Status Enum (if it does not exist)
-- create type invoice_status as enum ('approved', 'pending', 'rejected');

-- Drop table if exists to ensure clean state (Optional, use ALTER if preserving data)
-- drop table if exists invoices;

-- Create Invoices Table (Updated Schema)
create table if not exists invoices (
  id uuid default gen_random_uuid() primary key,
  external_id text unique, -- Identificador único del sistema externo (ej: ldf)
  invoice_number text,
  provider_name text,
  amount numeric,
  currency text default 'COP',
  invoice_date date,
  status invoice_status default 'pending',
  
  -- Campos para almacenamiento de archivos
  file_path_pdf text,
  file_path_xml text,
  
  -- Metadatos para sincronización y debug
  metadata jsonb,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table invoices enable row level security;

-- Create Policy
create policy "Enable all access for all users" on invoices
  for all using (true) with check (true);

-- Insert Mock Data (Updated)
insert into invoices (invoice_number, provider_name, amount, invoice_date, status, external_id) values
  ('INV-001', 'Tech Solutions Inc', 1500.00, '2026-01-15', 'approved', 'EXT-001'),
  ('INV-002', 'Office Supplies Co', 350.50, '2026-01-20', 'pending', 'EXT-002'),
  ('INV-005', 'Consulting Group', 5000.00, '2026-01-28', 'approved', 'EXT-003')
on conflict (external_id) do nothing;
