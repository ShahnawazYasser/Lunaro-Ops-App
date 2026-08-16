// Typed database schema for Supabase.
// Keep in sync with supabase_schema.sql.
// Structure matches what Supabase CLI would generate — required for type inference.

export type UserRole = "employee" | "owner";

// Money-out model (Phase D): one `expenses` table.
//   paid_by = 'company'  → a normal business expense, no reimbursement status
//   paid_by = 'employee' → the employee fronted the money and is owed it back
//                          until reimbursement_status = 'paid'
// Either way the row always counts as an expense in P&L.
export type PaidBy = "company" | "employee";
export type ReimbursementStatus = "pending" | "paid";

// The legacy `reimbursements_legacy` and `entry_expenses_legacy` tables still
// exist in the database as read-only historical copies pending a cleanup
// phase. They are deliberately NOT typed here — nothing in the app may query
// them.

// Bookings (Phase F) — paid client events. Cash-basis revenue: see
// migration_bookings.sql / supabase_schema.sql / CLAUDE.md for the full rule.
export type BookingStatus = "upcoming" | "completed" | "cancelled";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          name: string;
          role: UserRole;
          pin_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          role: UserRole;
          pin_hash: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          role?: UserRole;
          pin_hash?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          id: string;
          name: string;
          location: string | null;
        };
        Insert: {
          id: string;
          name: string;
          location?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          location?: string | null;
        };
        Relationships: [];
      };
      shift_entries: {
        Row: {
          id: string;
          user_id: string;
          entry_date: string;
          venue_id: string;
          total_prints: number;
          extra_prints: number;
          system_prints_500: number;
          system_prints_250: number;
          free_prints: number;
          waste_prints: number;
          cash_received: number;
          bank_received: number;
          clock_in: string | null;
          clock_out: string | null;
          event_name: string | null;
          notes: string | null;
          cash_collected: boolean;
          cash_collected_at: string | null;
          last_edited_by: string | null;
          last_edited_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entry_date: string;
          venue_id: string;
          total_prints?: number;
          extra_prints?: number;
          system_prints_500?: number;
          system_prints_250?: number;
          free_prints?: number;
          waste_prints?: number;
          cash_received?: number;
          bank_received?: number;
          clock_in?: string | null;
          clock_out?: string | null;
          event_name?: string | null;
          notes?: string | null;
          cash_collected?: boolean;
          cash_collected_at?: string | null;
          last_edited_by?: string | null;
          last_edited_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entry_date?: string;
          venue_id?: string;
          total_prints?: number;
          extra_prints?: number;
          system_prints_500?: number;
          system_prints_250?: number;
          free_prints?: number;
          waste_prints?: number;
          cash_received?: number;
          bank_received?: number;
          clock_in?: string | null;
          clock_out?: string | null;
          event_name?: string | null;
          notes?: string | null;
          cash_collected?: boolean;
          cash_collected_at?: string | null;
          last_edited_by?: string | null;
          last_edited_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shift_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_entries_last_edited_by_fkey";
            columns: ["last_edited_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_entries_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          expense_date: string;
          category: string;
          amount: number;
          description: string | null;
          receipt_url: string | null;
          paid_by: PaidBy;
          payer_user_id: string | null;
          reimbursement_status: ReimbursementStatus | null;
          related_user_id: string | null;
          shift_entry_id: string | null;
          venue_id: string | null;
          logged_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          expense_date: string;
          category: string;
          amount: number;
          description?: string | null;
          receipt_url?: string | null;
          paid_by: PaidBy;
          payer_user_id?: string | null;
          reimbursement_status?: ReimbursementStatus | null;
          related_user_id?: string | null;
          shift_entry_id?: string | null;
          venue_id?: string | null;
          logged_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          expense_date?: string;
          category?: string;
          amount?: number;
          description?: string | null;
          receipt_url?: string | null;
          paid_by?: PaidBy;
          payer_user_id?: string | null;
          reimbursement_status?: ReimbursementStatus | null;
          related_user_id?: string | null;
          shift_entry_id?: string | null;
          venue_id?: string | null;
          logged_by?: string;
          updated_at?: string;
        };
        // NOTE: three separate FKs to `users`. Any PostgREST embed of users
        // from this table MUST pin the constraint name (e.g.
        // `users!expenses_payer_user_id_fkey(name)`) or it fails with
        // PGRST201 "more than one relationship was found".
        Relationships: [
          {
            foreignKeyName: "expenses_payer_user_id_fkey";
            columns: ["payer_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_related_user_id_fkey";
            columns: ["related_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_logged_by_fkey";
            columns: ["logged_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_shift_entry_id_fkey";
            columns: ["shift_entry_id"];
            isOneToOne: false;
            referencedRelation: "shift_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          client_name: string;
          event_name: string | null;
          package: string | null;
          amount_charged: number;
          event_date: string;
          notes: string | null;
          advance_amount: number | null;
          advance_date: string | null;
          final_amount: number | null;
          final_date: string | null;
          status: BookingStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_name: string;
          event_name?: string | null;
          package?: string | null;
          amount_charged: number;
          event_date: string;
          notes?: string | null;
          advance_amount?: number | null;
          advance_date?: string | null;
          final_amount?: number | null;
          final_date?: string | null;
          status?: BookingStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_name?: string;
          event_name?: string | null;
          package?: string | null;
          amount_charged?: number;
          event_date?: string;
          notes?: string | null;
          advance_amount?: number | null;
          advance_date?: string | null;
          final_amount?: number | null;
          final_date?: string | null;
          status?: BookingStatus;
          created_by?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_overrides: {
        Row: {
          id: string;
          user_id: string;
          override_date: string;
          is_present: boolean;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          override_date: string;
          is_present: boolean;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          override_date?: string;
          is_present?: boolean;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_overrides_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_overrides_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      login_attempts: {
        Row: {
          name: string;
          attempted_at: string;
        };
        Insert: {
          name: string;
          attempted_at?: string;
        };
        Update: {
          name?: string;
          attempted_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      replace_entry_expenses: {
        Args: {
          p_shift_entry_id: string;
          p_expenses: { description: string; amount: number }[];
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
