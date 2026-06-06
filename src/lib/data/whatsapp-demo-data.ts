/** Realistic Nigerian SME demo dataset for WhatsApp guest-mode reports. */

export const whatsappDemoData = {
  businessName: "Oakfield Logistics",
  walletBalance: 2_847_500,
  cashback: 18_600,

  sales: {
    total: 14_250_000,
    deltaPct: 12.4,
    thisMonth: 1_240_000,
    today: 45_200,
    topProducts: [
      { name: "Diesel supply — 500L", sold: 82, revenue: 4_100_000 },
      { name: "Tyre replacement (10-ply)", sold: 34, revenue: 2_720_000 },
      { name: "Engine oil (Total 15W40)", sold: 156, revenue: 1_872_000 },
      { name: "Brake pads (premium)", sold: 48, revenue: 1_440_000 },
      { name: "A/C servicing kit", sold: 27, revenue: 1_215_000 },
    ],
  },

  customers: {
    total: 225,
    newThisMonth: 12,
    returnRatePct: 34,
    top: { name: "David Ibileke", spent: 420_000 },
    recent: [
      { name: "Oluwatimilehin Alabi", orders: 3, spent: 85_000 },
      { name: "Amina Okafor", orders: 5, spent: 210_000 },
      { name: "Chidi Eze", orders: 2, spent: 62_000 },
      { name: "Fatima Bello", orders: 4, spent: 148_000 },
      { name: "Tunde Ogundipe", orders: 1, spent: 32_500 },
    ],
  },

  expenses: [
    { title: "Diesel top-up — generator", dept: "Facilities", amount: 85_000, status: "approved" },
    { title: "Office stationery", dept: "Admin", amount: 8_500, status: "completed" },
    { title: "Transport — vendor visit", dept: "Operations", amount: 15_000, status: "pending" },
    { title: "Brake pads — Hilux", dept: "Fleet", amount: 120_000, status: "approved" },
    { title: "Staff lunch meeting", dept: "Admin", amount: 28_000, status: "completed" },
    { title: "Generator servicing", dept: "Facilities", amount: 45_000, status: "pending" },
  ],

  requests: [
    { id: "req-1", title: "Emergency diesel — 500L", amount: 250_000, requester: "Idris", status: "pending" },
    { id: "req-2", title: "Office chairs (×4)", amount: 180_000, requester: "Amina", status: "pending" },
    { id: "req-3", title: "Tyre replacement — truck B", amount: 320_000, requester: "Chidi", status: "approved" },
    { id: "req-4", title: "AC repair — reception", amount: 65_000, requester: "Fatima", status: "completed" },
    { id: "req-5", title: "New printer cartridge", amount: 22_000, requester: "Tunde", status: "pending" },
  ],

  inventory: [
    { name: "Printer paper (A4 ream)", inStock: 2, minLevel: 10 },
    { name: "Engine oil (Total 15W40)", inStock: 48, minLevel: 20 },
    { name: "Brake pads (premium set)", inStock: 6, minLevel: 8 },
    { name: "Diesel filter", inStock: 15, minLevel: 5 },
    { name: "Tyre (10-ply)", inStock: 4, minLevel: 10 },
    { name: "A/C gas canister", inStock: 3, minLevel: 4 },
  ],

  issues: [
    { title: "Generator room water leak", area: "Facilities", severity: "high", status: "pending" },
    { title: "Reception door hinge broken", area: "Front desk", severity: "medium", status: "in-progress" },
    { title: "Parking light fuse blown", area: "Parking lot", severity: "low", status: "completed" },
  ],
};
