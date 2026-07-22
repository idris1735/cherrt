# Chertt — WhatsApp ↔ Dashboard Sync Setup

## Prerequisites
- Supabase project with all migrations applied (run in order from `supabase/migrations/`)
- Vercel deployment with all env vars set

## Environment Variables
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
WHATSAPP_ACCESS_TOKEN=your-whatsapp-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_VERIFY_TOKEN=your-verify-token
NEXT_PUBLIC_APP_URL=https://yourapp.vercel.app
GEMINI_API_KEY=your-gemini-key
```

## Setup Steps

### 1. Run Migrations
```bash
# In Supabase SQL Editor, run all files in order:
supabase/migrations/20260401_init.sql
supabase/migrations/20260402_auth_rls_bootstrap.sql
...
supabase/migrations/20260516_bootstrap_slug_safety.sql
```

### 2. Seed Demo Data (Optional)
For the demo workspace to show rich data on BOTH surfaces:
```sql
-- Insert demo customers
INSERT INTO toolkit_customers (workspace_id, name, total_spent, order_count) VALUES ...

-- Insert demo orders  
INSERT INTO toolkit_orders (workspace_id, total, customer_id, created_at) VALUES ...

-- Insert demo wallet transactions
INSERT INTO toolkit_wallet_transactions (workspace_id, amount, type, label, created_at) VALUES ...
```
See `src/lib/data/demo-workspace.ts` for the complete demo dataset.

### 3. Link Your WhatsApp Number
1. Open the Chertt web dashboard at `/w/<your-workspace-slug>/settings`
2. In the WhatsApp section, enter your phone number (e.g., +2348000000000)
3. Click "Link phone"
4. This creates a row in `whatsapp_phone_links` connecting your phone to your workspace

### 4. Verify Sync
1. Create an expense on WhatsApp: "log ₦15,000 transport expense"
2. Wait ~8 seconds
3. The dashboard Spend card and Expenses table should show the new entry
4. Create a request on the web dashboard
5. On WhatsApp, type "what's pending" — the request should appear

## Architecture

```
Web Dashboard                    WhatsApp
     │                               │
     ▼                               ▼
┌─────────────┐              ┌──────────────┐
│ react-query │              │ whatsapp-     │
│ useQuery()  │              │ processor.ts  │
│ (8s poll)   │              │              │
└──────┬──────┘              └──────┬───────┘
       │                            │
       ▼                            ▼
┌──────────────────────────────────────────┐
│            workspace-data.ts             │
│  loadWorkspaceData(workspaceId)          │
│  → Supabase (live) or demo-workspace     │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│          business-metrics.ts             │
│  computeMetrics(data, period)            │
│  ← IDENTICAL numbers for both surfaces   │
└──────────────────────────────────────────┘
```

## Fallback
If Supabase is unavailable:
- The web dashboard falls back to `demo-workspace.ts` data
- WhatsApp guest mode uses the same `demo-workspace.ts` data
- Both surfaces show identical numbers (no desync)
- The app never crashes — always renders with data
