"use client";

import type { ReactNode } from "react";
import styles from "./ui.module.css";

type FieldProps = {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
};

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div className={styles["ui-field"]}>
      <label className={styles["ui-field-label"]} htmlFor={htmlFor}>
        {label}{required ? " *" : ""}
      </label>
      {children}
      {hint && !error ? <span className={styles["ui-field-hint"]}>{hint}</span> : null}
      {error ? <span className={styles["ui-field-error"]}>{error}</span> : null}
    </div>
  );
}