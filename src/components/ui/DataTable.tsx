import type { KeyboardEvent, ReactNode } from "react";
import styles from "./ui.module.css";

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  empty,
}: DataTableProps<T>) {
  const clickable = Boolean(onRowClick);

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if ((e.key === "Enter" || e.key === " ") && onRowClick) {
      e.preventDefault();
      onRowClick(row);
    }
  }

  return (
    <div className={styles["ui-table-wrap"]}>
      <table className={styles["ui-table"]}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={
                  col.align === "right"
                    ? styles["ui-table-cell--right"]
                    : col.align === "center"
                      ? styles["ui-table-cell--center"]
                      : undefined
                }
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className={styles["ui-table-empty"]}
              >
                {empty ?? null}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className={clickable ? styles["ui-table-row--clickable"] : undefined}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={
                  clickable ? () => onRowClick?.(row) : undefined
                }
                onKeyDown={
                  clickable
                    ? (e: KeyboardEvent<HTMLTableRowElement>) => handleRowKeyDown(e, row)
                    : undefined
                }
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={
                      col.align === "right"
                        ? styles["ui-table-cell--right"]
                        : col.align === "center"
                          ? styles["ui-table-cell--center"]
                          : undefined
                    }
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
