import type { ChangeEvent, ReactNode } from "react";
import styles from "./ui.module.css";

type ToolbarProps = {
  search?: {
    value: string;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
  };
  filters?: ReactNode;
  right?: ReactNode;
};

export function Toolbar({ search, filters, right }: ToolbarProps) {
  return (
    <div className={styles["ui-toolbar"]}>
      {search ? (
        <input
          className={styles["ui-toolbar-search"]}
          type="text"
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder ?? "Search..."}
          aria-label="Search"
        />
      ) : null}
      {filters ? (
        <div className={styles["ui-toolbar-filters"]}>{filters}</div>
      ) : null}
      {right ? (
        <div className={styles["ui-toolbar-right"]}>{right}</div>
      ) : null}
    </div>
  );
}
