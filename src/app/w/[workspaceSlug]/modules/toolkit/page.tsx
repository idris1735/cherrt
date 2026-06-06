"use client";

import Link from "next/link";
import { type CSSProperties, useMemo, useState } from "react";

import { useAppState } from "@/components/providers/app-state-provider";
import { formatCurrency } from "@/lib/format";
import { demoMetrics, type Period } from "@/lib/data/demo-metrics";
import styles from "./dashboard.module.css";

/* ─── Helpers ─── */

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtPct(value: number): string {
  const sign = value >= 0 ? "▲" : "▼";
  return `${sign} ${Math.abs(value).toFixed(1)}%`;
}

function deltaClass(
  value: number,
  opts?: { dark?: boolean; goodWhenNegative?: boolean },
): string {
  const base = opts?.dark
    ? `${styles["db-delta"]} ${styles["db-delta--dark"]}`
    : styles["db-delta"];
  const isGood = opts?.goodWhenNegative ? value < 0 : value >= 0;
  return `${base} ${isGood ? styles["db-delta--up"] : styles["db-delta--down"]}`;
}

/* ─── Trend chart (inline SVG, zero dependencies) ─── */

function TrendChart({
  series,
  ariaLabel,
}: {
  series: { label: string; value: number }[];
  ariaLabel: string;
}) {
  const W = 640;
  const H = 260;
  const PAD_L = 62;
  const PAD_R = 20;
  const PAD_T = 16;
  const PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const maxVal = Math.max(...series.map((d) => d.value));
  const gridLines = 4;

  function niceMax(max: number): number {
    if (max <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(max)));
    const n = max / pow;
    const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return nice * pow;
  }

  const yMax = niceMax(maxVal);

  const xScale = (i: number) => PAD_L + (i / Math.max(series.length - 1, 1)) * plotW;
  const yScale = (v: number) => PAD_T + plotH - (v / yMax) * plotH;

  const points = series
    .map((d, i) => `${xScale(i)},${yScale(d.value)}`)
    .join(" ");

  const areaD = [
    `M ${xScale(0)} ${PAD_T + plotH}`,
    ...series.map((d, i) => `L ${xScale(i)} ${yScale(d.value)}`),
    `L ${xScale(series.length - 1)} ${PAD_T + plotH}`,
    "Z",
  ].join(" ");

  const fmtY = (v: number) => {
    if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `₦${(v / 1_000).toFixed(0)}K`;
    return `₦${v}`;
  };

  return (
    <div className={styles["db-chart-wrap"]}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {/* Grid lines */}
        {Array.from({ length: gridLines }).map((_, i) => {
          const v = Math.round((yMax / gridLines) * (i + 1));
          const y = yScale(v);
          return (
            <g key={i}>
              <line
                x1={PAD_L}
                y1={y}
                x2={W - PAD_R}
                y2={y}
                stroke="#ebebeb"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--ds-text-faint, #a3a3a3)"
                fontSize="11"
                fontFamily="system-ui, sans-serif"
              >
                {fmtY(v)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="var(--ds-accent-weak, #fff4e8)" />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="var(--ds-accent, #fa8300)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots */}
        {series.map((d, i) => (
          <circle
            key={i}
            cx={xScale(i)}
            cy={yScale(d.value)}
            r="4"
            fill="var(--ds-surface, #fff)"
            stroke="var(--ds-accent, #fa8300)"
            strokeWidth="2"
          />
        ))}

        {/* X-axis labels */}
        {series.map((d, i) => (
          <text
            key={i}
            x={xScale(i)}
            y={H - 6}
            textAnchor="middle"
            fill="var(--ds-text-faint, #a3a3a3)"
            fontSize="10"
            fontFamily="system-ui, sans-serif"
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

/* ─── Page ─── */

export default function ToolkitDashboardPage() {
  const { snapshot } = useAppState();
  const [period, setPeriod] = useState<Period>("month");
  const metrics = demoMetrics[period];
  const base = `/w/${snapshot.workspace.slug}/modules/toolkit`;

  // ── Live data from snapshot ──
  const requests = useMemo(
    () => snapshot.requests.filter((r) => r.module === "toolkit"),
    [snapshot.requests],
  );
  const pendingApprovals = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests],
  );
  const approvedCount = useMemo(
    () => requests.filter((r) => r.status === "approved" || r.status === "completed").length,
    [requests],
  );
  const openIssues = useMemo(
    () => snapshot.issues.filter((i) => i.status !== "completed" && i.status !== "approved").length,
    [snapshot.issues],
  );
  const lowStock = useMemo(
    () => snapshot.inventory.filter((i) => i.inStock <= i.minLevel).length,
    [snapshot.inventory],
  );
  const awaitingSig = useMemo(
    () => snapshot.documents.filter((d) => d.awaitingSignatureFrom).length,
    [snapshot.documents],
  );
  const recentActivity = useMemo(
    () =>
      snapshot.activities
        .filter((a) => a.module === "toolkit")
        .slice(0, 5),
    [snapshot.activities],
  );

  const totalRequests = approvedCount + pendingApprovals;
  const firstName = snapshot.membership.userName.split(" ")[0] ?? snapshot.membership.userName;

  const periods: Period[] = ["today", "week", "month", "year"];

  const periodLabel: Record<Period, string> = {
    today: "yesterday",
    week: "last week",
    month: "last month",
    year: "last year",
  };

  const chartAriaLabel = `Sales trend for ${period}: ${metrics.series.map((d) => `${d.label} ₦${d.value.toLocaleString()}`).join(", ")}`;

  return (
    <div className={styles.db}>
      {/* ── Header ── */}
      <div className={styles["db-header"]}>
        <div className={styles["db-header-left"]}>
          <h1 className={styles["db-greeting"]}>
            {greeting()}, {firstName}
          </h1>
          <p className={styles["db-subtitle"]}>
            Here&apos;s how {snapshot.workspace.name} is doing.
          </p>
        </div>

        <div className={styles["db-period-group"]} aria-label="Period">
          {periods.map((p) => (
            <button
              key={p}
              aria-pressed={period === p}
              className={styles["db-period-btn"]}
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Hero card ── */}
      <div className={styles["db-hero"]}>
        <div className={styles["db-hero-body"]}>
          <span className={styles["db-hero-label"]}>Total sales</span>
          <span className={styles["db-hero-value"]}>
            {formatCurrency(metrics.totalSales, snapshot.workspace.currency)}
          </span>
          <span className={deltaClass(metrics.salesDeltaPct, { dark: true })}>
            {fmtPct(metrics.salesDeltaPct)} vs {periodLabel[period]}
          </span>
        </div>
        <Link
          className={styles["db-hero-btn"]}
          href={`${base}/records`}
          aria-label="View sales detail"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7" />
            <path d="M7 7h10v10" />
          </svg>
        </Link>
      </div>

      {/* ── Stat cards ── */}
      <div className={styles["db-stats"]}>
        <div className={styles["db-stat"]}>
          <span className={styles["db-stat-label"]}>Wallet balance</span>
          <span className={styles["db-stat-value"]}>
            {formatCurrency(metrics.walletBalance, snapshot.workspace.currency)}
          </span>
          <span className={styles["db-stat-sub"]}>
            Cashback {formatCurrency(metrics.cashback, snapshot.workspace.currency)}
          </span>
        </div>

        <div className={styles["db-stat"]}>
          <span className={styles["db-stat-label"]}>Customers</span>
          <span className={styles["db-stat-value"]}>{metrics.customers.toLocaleString()}</span>
          <span className={deltaClass(metrics.customersDeltaPct)}>
            {fmtPct(metrics.customersDeltaPct)} vs {periodLabel[period]}
          </span>
        </div>

        <div className={styles["db-stat"]}>
          <span className={styles["db-stat-label"]}>
            {period === "today" ? "Spend today" : `Spend this ${period}`}
          </span>
          <span className={styles["db-stat-value"]}>
            {formatCurrency(metrics.spend, snapshot.workspace.currency)}
          </span>
          <span className={deltaClass(metrics.spendDeltaPct, { goodWhenNegative: true })}>
            {fmtPct(metrics.spendDeltaPct)} vs {periodLabel[period]}
          </span>
        </div>
      </div>

      {/* ── Middle row: chart + needs you ── */}
      <div className={styles["db-middle"]}>
        <div className={styles["db-card"]}>
          <div className={styles["db-card-head"]}>
            <h2 className={styles["db-card-title"]}>Sales trend</h2>
          </div>
          <TrendChart series={metrics.series} ariaLabel={chartAriaLabel} />
        </div>

        <div className={styles["db-card"]}>
          <div className={styles["db-card-head"]}>
            <h2 className={styles["db-card-title"]}>Needs you now</h2>
          </div>

          {/* Approval progress bars */}
          {totalRequests > 0 && (
            <div className={styles["db-needs-progress"]}>
              <div className={styles["db-progress-row"]}>
                <span className={styles["db-progress-label"]}>
                  <strong>Approved</strong> {approvedCount}
                </span>
                <div className={styles["db-progress-bar"]}>
                  <div
                    className={`${styles["db-progress-fill"]} ${styles["db-progress-fill--approved"]}`}
                    style={{ width: `${totalRequests > 0 ? (approvedCount / totalRequests) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className={styles["db-progress-row"]}>
                <span className={styles["db-progress-label"]}>
                  <strong>Pending</strong> {pendingApprovals}
                </span>
                <div className={styles["db-progress-bar"]}>
                  <div
                    className={`${styles["db-progress-fill"]} ${styles["db-progress-fill--pending"]}`}
                    style={{ width: `${totalRequests > 0 ? (pendingApprovals / totalRequests) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Attention list */}
          <div className={styles["db-needs-list"]}>
            {[
              { count: pendingApprovals, label: "approvals waiting", href: `${base}/requests` },
              { count: awaitingSig, label: "awaiting signature", href: `${base}/documents` },
              { count: openIssues, label: "open issues", href: `${base}/issues` },
              { count: lowStock, label: "low on stock", href: `${base}/inventory` },
            ]
              .filter((item) => item.count > 0)
              .map((item) => (
                <Link key={item.label} href={item.href} className={styles["db-needs-item"]}>
                  <span>{item.label}</span>
                  <span className={styles["db-needs-count"]}>{item.count}</span>
                </Link>
              ))}

            {pendingApprovals === 0 &&
              awaitingSig === 0 &&
              openIssues === 0 &&
              lowStock === 0 && (
                <div className={styles["db-needs-empty"]}>You&apos;re all caught up.</div>
              )}
          </div>
        </div>
      </div>

      {/* ── Operational pulse ── */}
      <div className={styles["db-pulse"]}>
        {[
          { value: pendingApprovals, label: "Pending approvals", href: `${base}/requests` },
          { value: openIssues, label: "Open issues", href: `${base}/issues` },
          { value: lowStock, label: "Low stock items", href: `${base}/inventory` },
          { value: awaitingSig, label: "Awaiting signature", href: `${base}/documents` },
        ].map((tile) => (
          <Link key={tile.label} href={tile.href} className={styles["db-pulse-tile"]}>
            <span className={styles["db-pulse-value"]}>{tile.value}</span>
            <span className={styles["db-pulse-label"]}>{tile.label}</span>
          </Link>
        ))}
      </div>

      {/* ── Recent activity ── */}
      <div className={styles["db-card"]}>
        <div className={styles["db-card-head"]}>
          <h2 className={styles["db-card-title"]}>Recent activity</h2>
          <Link className={styles["db-card-link"]} href={`${base}/records`}>
            View records
          </Link>
        </div>
        <div className={styles["db-activity-list"]}>
          {recentActivity.length > 0 ? (
            recentActivity.map((item) => (
              <Link
                key={item.id}
                href={`${base}/requests`}
                className={styles["db-activity-row"]}
              >
                <span className={styles["db-activity-dot"]} aria-hidden="true" />
                <div className={styles["db-activity-body"]}>
                  <span className={styles["db-activity-title"]}>{item.title}</span>
                  <span className={styles["db-activity-meta"]}>
                    {item.detail} · {item.timeLabel}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className={styles["db-activity-empty"]}>No recent activity yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

