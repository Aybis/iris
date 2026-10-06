export interface ExportableLog {
  timestamp: string;
  level: string;
  service_id: string;
  kind: string;
  message: string;
  raw: string;
  remediation: string;
}

/** Quoted CSV with spreadsheet-formula guards for operator-supplied event text. */
export function logsToCsv(records: ExportableLog[]): string {
  const cell = (value: string) => {
    const guarded = /^[\s\u0000-\u001f]*[=+\-@]/.test(value)
      ? "'" + value
      : value;
    return '"' + guarded.replaceAll('"', '""') + '"';
  };
  return [
    [
      "Timestamp",
      "Level",
      "Service",
      "Kind",
      "Message",
      "Raw event",
      "Remediation",
    ],
    ...records.map((i) => [
      i.timestamp,
      i.level,
      i.service_id,
      i.kind,
      i.message,
      i.raw,
      i.remediation,
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
