// Typed database schema for Supabase.
// Keep in sync with supabase_schema.sql.
// Structure matches what Supabase CLI would generate — required for type inference.

export type UserRole = "employee" | "owner";
export type ReimbursementCategory = "Petrol" | "Food" | "Misc";
export type ReimbursementStatus = "pending" | "approved" | "paid";

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
            foreignKeyName: "shift_entries_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      entry_expenses: {
        Row: {
          id: string;
          shift_entry_id: string;
          description: string;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          shift_entry_id: string;
          description: string;
          amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          shift_entry_id?: string;
          description?: string;
          amount?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entry_expenses_shift_entry_id_fkey";
            columns: ["shift_entry_id"];
            isOneToOne: false;
            referencedRelation: "shift_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      reimbursements: {
        Row: {
          id: string;
          user_id: string;
          category: ReimbursementCategory;
          amount: number;
          description: string | null;
          receipt_url: string | null;
          status: ReimbursementStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category: ReimbursementCategory;
          amount: number;
          description?: string | null;
          receipt_url?: string | null;
          status?: ReimbursementStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category?: ReimbursementCategory;
          amount?: number;
          description?: string | null;
          receipt_url?: string | null;
          status?: ReimbursementStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reimbursements_user_id_fkey";
            columns: ["user_id"];
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
