# Facet Builder Pro - Setup Guide

## Demo User Setup

To use the demo credentials, you need to create the following users in your Supabase project:

### Admin User
- **Email**: admin@demo.com
- **Password**: Admin@123
- **Role**: admin

### Client User
- **Email**: client@demo.com
- **Password**: Client@123
- **Role**: client

## Creating Demo Users

### Option 1: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** > **Users**
3. Click **Add User** > **Create new user**
4. Enter the email and password for each user
5. After creating, go to **SQL Editor** and run:

```sql
-- Create admin user profile
INSERT INTO user_profiles (id, email, role, full_name, is_active)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'admin@demo.com'),
  'admin@demo.com',
  'admin',
  'Admin User',
  true
);

-- Create client and client user profile
INSERT INTO clients (name, contact_email, is_active)
VALUES ('Demo Client Company', 'client@demo.com', true);

INSERT INTO user_profiles (id, email, role, client_id, full_name, is_active)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'client@demo.com'),
  'client@demo.com',
  'client',
  (SELECT id FROM clients WHERE contact_email = 'client@demo.com'),
  'Client User',
  true
);
```

### Option 2: Using SQL Script

Run this complete SQL script in your Supabase SQL Editor:

```sql
-- Note: You must first create the auth users manually in Supabase Dashboard
-- Then run this script to create their profiles

-- Create admin profile (assuming auth user exists)
INSERT INTO user_profiles (id, email, role, full_name, is_active)
SELECT
  id,
  'admin@demo.com',
  'admin',
  'Admin User',
  true
FROM auth.users
WHERE email = 'admin@demo.com'
ON CONFLICT (id) DO NOTHING;

-- Create demo client company
INSERT INTO clients (name, contact_email, is_active)
VALUES ('Demo Client Company', 'client@demo.com', true)
ON CONFLICT DO NOTHING;

-- Create client user profile (assuming auth user exists)
INSERT INTO user_profiles (id, email, role, client_id, full_name, is_active)
SELECT
  u.id,
  'client@demo.com',
  'client',
  c.id,
  'Client User',
  true
FROM auth.users u
CROSS JOIN clients c
WHERE u.email = 'client@demo.com'
  AND c.contact_email = 'client@demo.com'
ON CONFLICT (id) DO NOTHING;
```

## Features Overview

### Admin Features
- **Client Management**: Create and manage multiple client accounts
- **System-wide Dashboard**: View all projects, jobs, and analytics
- **Global Prompt Templates**: Manage prompt templates for all clients
- **User Management**: Create client users and assign permissions

### Client Features
- **Project Management**: Create and organize multiple projects
- **Bulk Category Upload**: Upload category taxonomies via CSV
- **Prompt Versioning**: Edit prompts with automatic version control
- **Master Templates**: Designate Level 2-10 prompts as master templates
- **Multi-Category Generation**: Select multiple categories for batch processing
- **Facet Editing**: Review and edit AI-generated facets
- **Multi-Platform Export**: Export to Shopify, BigCommerce, WooCommerce, Magento, or custom formats

## Workflow

1. **Login** with admin or client credentials
2. **Create a Project** to organize your work
3. **Upload Categories** using CSV format (template available in-app)
4. **Configure Prompts** - Edit existing templates or create new ones (all edits are versioned)
5. **Mark Master Templates** - Flag Level 2-10 prompts for comprehensive facet building
6. **Select Categories & Prompts** - Choose which categories and prompts to use
7. **Generate Facets** - AI-powered generation using selected prompts
8. **Review & Edit** - Review recommendations and make adjustments
9. **Export** - Download in platform-specific format

## Pre-loaded Data

The system includes:
- **10 Prompt Templates** across multiple levels (industry, geography, business rules, technical, customer intent, competitive, use cases, seasonal)
- **5 Sample Categories** in Marine Safety Equipment
- **5 Export Templates** for major e-commerce platforms

## Key Features

### Prompt Versioning
- Every prompt edit creates a new version
- System automatically uses the latest version
- Full change history with notes
- Rollback capability

### Master Templates
- Mark prompts as "master templates" for facet building
- Apply to Level 2-10 for comprehensive coverage
- Client-specific or global templates

### Dashboard Analytics
- Facets recommended (completed)
- Jobs in progress
- Jobs pending
- Total categories uploaded
- Export history
- Project count

### Multi-Format Export
- CSV for Excel/Sheets
- JSON for API integration
- Platform-specific templates with field mapping
- Export history tracking

## Support

For issues or questions, refer to the application documentation or contact your system administrator.
