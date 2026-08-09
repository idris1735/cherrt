import type { ReactNode } from "react";
import { AdminNav } from "./admin-nav";
import s from "./admin.module.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className={s.shell}>
      <AdminNav />
      <main className={s.main}>{children}</main>
    </div>
  );
}
