import Badge from "./Badge";
import Button from "./Button";
import Card from "./Card";
import EmptyState from "./EmptyState";
import { pkr } from "@/lib/format";

// Matches the SELECT in GET /api/expenses (same shape for both roles).
export interface ExpenseRow {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  paid_by: "company" | "employee";
  payer_user_id: string | null;
  reimbursement_status: "pending" | "paid" | null;
  related_user_id: string | null;
  shift_entry_id: string | null;
  venue_id: string | null;
  logged_by: string;
  payer: { name: string } | null;
  related: { name: string } | null;
  logger: { name: string } | null;
  venues: { name: string } | null;
}

interface ExpenseListProps {
  /** owner = every row, mark-paid pills, shift-linked note; employee = own rows, plain Waiting/Paid back */
  variant: "owner" | "employee";
  rows: ExpenseRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onDelete: (id: string) => void;
  /** owner only */
  onToggleStatus?: (row: ExpenseRow) => void;
  /** owner only — ids with a status change in flight */
  togglingIds?: ReadonlySet<string>;
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PK", { day: "numeric", month: "short" });
}

export default function ExpenseList({
  variant,
  rows,
  loading,
  error,
  onRetry,
  onDelete,
  onToggleStatus,
  togglingIds,
}: ExpenseListProps) {
  const owner = variant === "owner";

  return (
    <section className="space-y-2">
      {loading ? (
        <EmptyState message="Loading…" />
      ) : error ? (
        <EmptyState error message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState message="No expenses for this period" />
      ) : (
        rows.map((row) => {
          const isStaffPaid = row.paid_by === "employee";
          const isPaid = row.reimbursement_status === "paid";
          const isShiftLinked = !!row.shift_entry_id;
          const isToggling = togglingIds?.has(row.id) ?? false;
          // Owner: anything not shift-linked. Employee: only their own still-waiting rows.
          const canDelete = owner ? !isShiftLinked : !isPaid;

          return (
            <Card key={row.id} size="sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge>{row.category}</Badge>
                    {owner && row.related && <span className="text-xs text-text-muted">for {row.related.name}</span>}
                    {row.venues && (
                      <span className="text-xs text-text-muted">{owner ? "· " : ""}{row.venues.name}</span>
                    )}
                    {owner ? (
                      isStaffPaid && (
                        <Badge
                          tone={isPaid ? "gold" : "danger"}
                          disabled={isToggling}
                          onClick={() => { if (!isToggling) onToggleStatus?.(row); }}
                        >
                          {isPaid ? "Paid back" : `Owes ${row.payer?.name ?? "employee"}`}
                        </Badge>
                      )
                    ) : (
                      <Badge tone={isPaid ? "gold" : "muted"}>{isPaid ? "Paid back" : "Waiting"}</Badge>
                    )}
                  </div>
                  {row.description && <p className="text-sm mt-1 truncate text-text">{row.description}</p>}
                  <p className="text-xs mt-1 text-text-muted">
                    {shortDate(row.expense_date)}
                    {row.receipt_url && (
                      <>
                        {" · "}
                        <a href={`/api/expenses/${row.id}/receipt`} target="_blank" rel="noopener noreferrer" className="text-gold">
                          Receipt ↗
                        </a>
                      </>
                    )}
                  </p>
                  {owner && isShiftLinked && (
                    <p className="text-xs mt-1 text-text-muted">
                      From {row.logger?.name ?? "an employee"}&apos;s shift entry — edit the entry instead
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-sm font-semibold text-text">{pkr(row.amount)}</span>
                  {canDelete && (
                    <Button variant="danger" size="xs" onClick={() => onDelete(row.id)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })
      )}
    </section>
  );
}
