export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

function escapeCsvValue(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv<T>(rows: T[], columns: Array<CsvColumn<T>>) {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(column.value(row))).join(","));
  return [header, ...body].join("\r\n");
}

export function downloadCsv<T>(filename: string, rows: T[], columns: Array<CsvColumn<T>>) {
  if (typeof window === "undefined") return;
  const blob = new Blob([toCsv(rows, columns)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
