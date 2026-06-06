import type { ChangeEvent } from "react";
import styles from "./ui.module.css";

type SelectProps = {
  label?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
};

export function Select({ label, value, onChange, options }: SelectProps) {
  return (
    <div className={styles["ui-select-wrap"]}>
      {label ? <span className={styles["ui-select-label"]}>{label}</span> : null}
      <select className={styles["ui-select"]} value={value} onChange={onChange}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
