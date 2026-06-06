import type { ReactNode } from "react";
import styles from "./ui.module.css";

type EmptyStateProps = {
  title: string;
  hint?: string;
  action?: ReactNode;
};

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className={styles["ui-empty"]}>
      <p className={styles["ui-empty-title"]}>{title}</p>
      {hint ? <p className={styles["ui-empty-hint"]}>{hint}</p> : null}
      {action ? <div className={styles["ui-empty-action"]}>{action}</div> : null}
    </div>
  );
}
