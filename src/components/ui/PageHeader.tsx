import type { ReactNode } from "react";
import styles from "./ui.module.css";

type PageHeaderProps = {
  title: string;
  meta?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, meta, actions }: PageHeaderProps) {
  return (
    <div className={styles["ui-page-header"]}>
      <div className={styles["ui-page-header-copy"]}>
        <h1>{title}</h1>
        {meta ? <p className={styles["ui-page-header-meta"]}>{meta}</p> : null}
      </div>
      {actions ? (
        <div className={styles["ui-page-header-actions"]}>{actions}</div>
      ) : null}
    </div>
  );
}
