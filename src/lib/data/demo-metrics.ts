export type Period = "today" | "week" | "month" | "year";

export type PeriodMetrics = {
  totalSales: number;
  salesDeltaPct: number;
  walletBalance: number;
  cashback: number;
  customers: number;
  customersDeltaPct: number;
  spend: number;
  spendDeltaPct: number;
  series: { label: string; value: number }[];
};

/** Realistic Nigerian SME demo analytics — ₦ amounts. */
export const demoMetrics: Record<Period, PeriodMetrics> = {
  year: {
    totalSales: 14_250_000,
    salesDeltaPct: 12.4,
    walletBalance: 2_847_500,
    cashback: 98_400,
    customers: 225,
    customersDeltaPct: 8.7,
    spend: 9_340_000,
    spendDeltaPct: -5.2,
    series: [
      { label: "Jan", value: 980_000 },
      { label: "Feb", value: 1_050_000 },
      { label: "Mar", value: 1_180_000 },
      { label: "Apr", value: 1_120_000 },
      { label: "May", value: 1_250_000 },
      { label: "Jun", value: 1_420_000 },
      { label: "Jul", value: 1_100_000 },
      { label: "Aug", value: 1_080_000 },
      { label: "Sep", value: 1_350_000 },
      { label: "Oct", value: 1_210_000 },
      { label: "Nov", value: 1_460_000 },
      { label: "Dec", value: 1_050_000 },
    ],
  },
  month: {
    totalSales: 1_240_000,
    salesDeltaPct: 8.2,
    walletBalance: 2_847_500,
    cashback: 18_600,
    customers: 68,
    customersDeltaPct: 3.1,
    spend: 892_000,
    spendDeltaPct: 2.4,
    series: [
      { label: "Wk 1", value: 280_000 },
      { label: "Wk 2", value: 340_000 },
      { label: "Wk 3", value: 290_000 },
      { label: "Wk 4", value: 330_000 },
    ],
  },
  week: {
    totalSales: 318_500,
    salesDeltaPct: -2.1,
    walletBalance: 2_847_500,
    cashback: 4_200,
    customers: 24,
    customersDeltaPct: -1.8,
    spend: 215_000,
    spendDeltaPct: -4.5,
    series: [
      { label: "Mon", value: 42_000 },
      { label: "Tue", value: 55_000 },
      { label: "Wed", value: 38_000 },
      { label: "Thu", value: 61_000 },
      { label: "Fri", value: 72_500 },
      { label: "Sat", value: 28_000 },
      { label: "Sun", value: 22_000 },
    ],
  },
  today: {
    totalSales: 45_200,
    salesDeltaPct: 5.8,
    walletBalance: 2_847_500,
    cashback: 850,
    customers: 7,
    customersDeltaPct: 2.4,
    spend: 18_400,
    spendDeltaPct: -3.2,
    series: [
      { label: "8am", value: 3_500 },
      { label: "10am", value: 8_200 },
      { label: "12pm", value: 12_000 },
      { label: "2pm", value: 9_800 },
      { label: "4pm", value: 7_500 },
      { label: "6pm", value: 4_200 },
    ],
  },
};
