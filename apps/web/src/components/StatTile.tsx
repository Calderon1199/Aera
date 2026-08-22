/**
 * A single number, which is the right form for a headline value. A one-bar bar
 * chart would be the wrong one.
 */
export function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | undefined;
}) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note === undefined ? null : <div className="note">{note}</div>}
    </div>
  );
}
