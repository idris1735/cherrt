"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "./admin.module.css";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/churches", label: "Churches", exact: false },
  { href: "/admin/kyc", label: "KYC", exact: false },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className={s.nav}>
      <span className={s.brand}>Chertt Admin</span>
      {LINKS.map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return <Link key={l.href} href={l.href} className={`${s.navlink} ${active ? s.navlinkActive : ""}`}>{l.label}</Link>;
      })}
    </nav>
  );
}
