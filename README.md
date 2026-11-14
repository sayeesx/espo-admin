# EPSO Admin Console 🏭

[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

> **Enterprise Production, Costing & Inventory Management System for Industrial Snack Manufacturing**

EPSO Admin Console is an enterprise-grade web application built to supervise, audit, and optimize end-to-end food manufacturing workflows—from raw material purchase and recipe configuration to batch cooking, universal packet inventory, labour wage allocation, and forensic costing analysis.

---

## 🌟 Key Highlights & Capabilities

### 1. 📊 Executive Operations & Analytical Dashboard
- **Real-Time KPIs:** Live metrics for total daily production (kg), raw material stock valuation, active batches, and packaged unit counts.
- **Dynamic Curves & Analytics:** Visual production output trends, oil utilization curves, and inventory movements powered by [Recharts](https://recharts.org/).
- **Shortage & Threshold Alerts:** Automated warnings for low ingredient reserves, near-depleted packet covers, and batch yield variances.

### 2. 🧂 Raw Materials & Ingredient Intelligence
- **Ingredient Inventory:** Real-time stock levels, weighted average purchase costs, minimum threshold indicators, and valuation across categories (Spices, Flours, Oils, Additives).
- **Stock Movement Ledger:** Complete audit trail for Inward purchases, Outward consumption, Wastage/Damaged goods, and Physical Audit reconciliations.
- **Quick Purchase & Bulk Inward:** Streamlined workflows to record vendor supplies, recalculate weighted costs atomically, and generate printable vendor order slips.

### 3. 📦 Universal Packet & Packaging Catalogue
- **Shared Packaging Hierarchy:** Decoupled packaging covers (`2KG HM Packet`, `10x12 HM`, `500g Pouch`) applicable across any finished product.
- **Delta Stock Inward:** Intuitive inventory addition workflow with locked current stock reference and live balance previews:
  $$\text{Current Stock} + \text{Inward Quantity} = \text{New Balance}$$
- **Weighted-Average Unit Valuation:** Preserves existing unit purchase costs when adding stock without invoice price changes, or automatically updates weighted unit rates upon new invoice entries.

### 4. 📜 Bill of Materials (BOM) & Recipe Engine
- **Multi-Product Recipes:** Formulate exact ingredient ratios per base batch output (kg) for Banana Chips, Dal Mixture, Murukku, etc.
- **Dynamic Ingredient Scaling:** Scalable ingredient requirements calculated proportionally to daily planned batch sizes.
- **Oil Absorption & Carry-Forward:** Tracks fresh oil poured, oil absorbed per kilogram of fried product, and leftover oil balances for next-day carry-forward.

### 5. 💰 Forensic Costing & Profit Engine
- **True Cost of Goods Sold (COGS):** Calculates actual batch cost down to the gram:
  $$\text{Total Cost} = \text{Raw Material Cost} + \text{Oil Consumed} + \text{Packaging Covers} + \text{Allocated Labour Wages}$$
- **Weight-Proportional Wage Allocation:** Automatically distributes daily cook and packer wages based on batch output weight.
- **Profit Margin Intelligence:** Compare production unit cost against Wholesale, Distributor, and Retail selling prices to monitor gross margins in real time.

### 6. 🔒 Enterprise Security & Atomic Transactions
- **Single-PIN Master Security Gate:** Cryptographically protected administration gate preventing unauthorized access to critical configuration and financial operations.
- **Atomic Database Operations:** PostgreSQL Stored Procedures (`RPC`) guarantee data integrity across concurrent batch closes and stock deductions.
- **Row-Level Security (RLS):** Strict multi-tier access control powered by Supabase.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 18 (TypeScript) |
| **Build Tool & Bundler** | Vite 6 |
| **Styling & UI** | Tailwind CSS, Apple Glassmorphism / Google Modal Design System |
| **Icons** | React Icons (`react-icons/fi`, `lucide-react`) |
| **Data Visualizations** | Recharts |
| **Backend & Database** | Supabase (PostgreSQL 15+, Row Level Security, Realtime, PL/pgSQL RPCs) |
| **State & Caching** | Custom In-Memory TTL Database Cache (`dbCache`) |

---

## 📂 Project Architecture

```plaintext
admin - epos production/
├── public/                     # Static assets, PWA icons, version metadata
├── src/
│   ├── components/             # Reusable & feature-specific views
│   │   ├── IngredientsAdminView.tsx   # Ingredient and packet cover management
│   │   ├── ManagePacketTypesModal.tsx # Universal packet catalogue & stock adjustment
│   │   ├── AIAdminAssistant.tsx       # Production analytics assistant
│   │   ├── LedgerView.tsx             # Daily closing, sales, and expense ledger
│   │   └── ...
│   ├── context/                # Theme and Feedback React contexts
│   ├── hooks/                  # Custom hooks (e.g. useLockBodyScroll)
│   ├── services/
│   │   ├── supabase.ts         # Supabase client, queries, mutations, RPC callers
│   │   ├── dbCache.ts          # Intelligent query cache with selective invalidation
│   │   └── costing.ts          # Mathematical costing calculations & COGS engine
│   ├── types/                  # Strict TypeScript domain interfaces
│   ├── App.tsx                 # Application root & tab navigation
│   └── main.tsx                # Entry point
├── tailwind.config.js          # Custom theme tokens & font family settings
├── vite.config.ts              # Vite plugins, chunking strategy & build config
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v18.x` or higher
- **Package Manager**: `npm` (v9+) or `yarn` / `pnpm`
- **Supabase Account**: An active Supabase project with the EPSO schema initialized

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sayeesx/espo-admin.git
   cd espo-admin
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Start Local Development Server:**
   ```bash
   npm run dev
   ```
   The application will be live at `http://localhost:5173`.

5. **Production Build:**
   ```bash
   npm run build
   ```
   Generates optimized static output in `dist/` ready for deployment on Vercel, Netlify, or any static web host.

---

## 📄 License
Proprietary software. All rights reserved by EPSO Production.
