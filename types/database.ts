export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accountant_access: {
        Row: {
          access_level: string | null
          accountant_email: string
          accountant_name: string
          created_at: string
          created_by_user_id: string | null
          expires_at: string
          granted_at: string | null
          id: string
          last_used_at: string | null
          revoked_at: string | null
          tenant_id: string
          token_hash: string
          use_count: number
        }
        Insert: {
          access_level?: string | null
          accountant_email: string
          accountant_name: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at: string
          granted_at?: string | null
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          tenant_id: string
          token_hash: string
          use_count?: number
        }
        Update: {
          access_level?: string | null
          accountant_email?: string
          accountant_name?: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string
          granted_at?: string | null
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          tenant_id?: string
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "accountant_access_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accountant_settings: {
        Row: {
          accountant_company: string | null
          accountant_email: string | null
          accountant_name: string | null
          cc_emails: string[] | null
          co_pilot_enabled: boolean
          created_at: string
          email_body_template: string | null
          email_subject_template: string | null
          id: string
          include_corrections: boolean
          include_issued_invoices: boolean
          include_received_invoices: boolean
          include_unpaid_only: boolean
          last_sent_at: string | null
          last_sent_period_end: string | null
          last_sent_period_start: string | null
          preferred_formats:
            | Database["public"]["Enums"]["export_format_enum"][]
            | null
          send_day_of_month: number
          tenant_id: string
          total_packages_sent: number
          updated_at: string
        }
        Insert: {
          accountant_company?: string | null
          accountant_email?: string | null
          accountant_name?: string | null
          cc_emails?: string[] | null
          co_pilot_enabled?: boolean
          created_at?: string
          email_body_template?: string | null
          email_subject_template?: string | null
          id?: string
          include_corrections?: boolean
          include_issued_invoices?: boolean
          include_received_invoices?: boolean
          include_unpaid_only?: boolean
          last_sent_at?: string | null
          last_sent_period_end?: string | null
          last_sent_period_start?: string | null
          preferred_formats?:
            | Database["public"]["Enums"]["export_format_enum"][]
            | null
          send_day_of_month?: number
          tenant_id: string
          total_packages_sent?: number
          updated_at?: string
        }
        Update: {
          accountant_company?: string | null
          accountant_email?: string | null
          accountant_name?: string | null
          cc_emails?: string[] | null
          co_pilot_enabled?: boolean
          created_at?: string
          email_body_template?: string | null
          email_subject_template?: string | null
          id?: string
          include_corrections?: boolean
          include_issued_invoices?: boolean
          include_received_invoices?: boolean
          include_unpaid_only?: boolean
          last_sent_at?: string | null
          last_sent_period_end?: string | null
          last_sent_period_start?: string | null
          preferred_formats?:
            | Database["public"]["Enums"]["export_format_enum"][]
            | null
          send_day_of_month?: number
          tenant_id?: string
          total_packages_sent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details_json: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details_json?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details_json?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          address: Json | null
          bank_accounts_validated: string[] | null
          created_at: string
          email: string | null
          id: string
          last_used_at: string | null
          last_validation_at: string | null
          last_validation_source:
            | Database["public"]["Enums"]["validation_source_enum"]
            | null
          late_payment_count: number
          name: string
          nip: string
          payment_terms_days_avg: number | null
          phone: string | null
          reminder_excluded: boolean
          reminder_exclusion_reason: string | null
          tenant_id: string
          validation_warning: string | null
          vat_status: Database["public"]["Enums"]["vat_status_enum"] | null
        }
        Insert: {
          address?: Json | null
          bank_accounts_validated?: string[] | null
          created_at?: string
          email?: string | null
          id?: string
          last_used_at?: string | null
          last_validation_at?: string | null
          last_validation_source?:
            | Database["public"]["Enums"]["validation_source_enum"]
            | null
          late_payment_count?: number
          name: string
          nip: string
          payment_terms_days_avg?: number | null
          phone?: string | null
          reminder_excluded?: boolean
          reminder_exclusion_reason?: string | null
          tenant_id: string
          validation_warning?: string | null
          vat_status?: Database["public"]["Enums"]["vat_status_enum"] | null
        }
        Update: {
          address?: Json | null
          bank_accounts_validated?: string[] | null
          created_at?: string
          email?: string | null
          id?: string
          last_used_at?: string | null
          last_validation_at?: string | null
          last_validation_source?:
            | Database["public"]["Enums"]["validation_source_enum"]
            | null
          late_payment_count?: number
          name?: string
          nip?: string
          payment_terms_days_avg?: number | null
          phone?: string | null
          reminder_excluded?: boolean
          reminder_exclusion_reason?: string | null
          tenant_id?: string
          validation_warning?: string | null
          vat_status?: Database["public"]["Enums"]["vat_status_enum"] | null
        }
        Relationships: [
          {
            foreignKeyName: "contractors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      error_translations: {
        Row: {
          created_at: string
          error_code: string
          error_xpath: string | null
          field_hint: string | null
          fix_suggestion: string | null
          id: string
          last_seen_at: string | null
          occurrence_count: number
          severity: string
          technical_description: string | null
          updated_at: string
          user_message_pl: string
        }
        Insert: {
          created_at?: string
          error_code: string
          error_xpath?: string | null
          field_hint?: string | null
          fix_suggestion?: string | null
          id?: string
          last_seen_at?: string | null
          occurrence_count?: number
          severity?: string
          technical_description?: string | null
          updated_at?: string
          user_message_pl: string
        }
        Update: {
          created_at?: string
          error_code?: string
          error_xpath?: string | null
          field_hint?: string | null
          fix_suggestion?: string | null
          id?: string
          last_seen_at?: string | null
          occurrence_count?: number
          severity?: string
          technical_description?: string | null
          updated_at?: string
          user_message_pl?: string
        }
        Relationships: []
      }
      export_files: {
        Row: {
          created_at: string
          download_count: number
          export_job_id: string
          file_hash: string | null
          filename: string
          format: Database["public"]["Enums"]["export_format_enum"]
          id: string
          last_downloaded_at: string | null
          last_downloaded_by: string | null
          mime_type: string
          r2_path: string
          size_bytes: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          download_count?: number
          export_job_id: string
          file_hash?: string | null
          filename: string
          format: Database["public"]["Enums"]["export_format_enum"]
          id?: string
          last_downloaded_at?: string | null
          last_downloaded_by?: string | null
          mime_type: string
          r2_path: string
          size_bytes?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          download_count?: number
          export_job_id?: string
          file_hash?: string | null
          filename?: string
          format?: Database["public"]["Enums"]["export_format_enum"]
          id?: string
          last_downloaded_at?: string | null
          last_downloaded_by?: string | null
          mime_type?: string
          r2_path?: string
          size_bytes?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_files_export_job_id_fkey"
            columns: ["export_job_id"]
            isOneToOne: false
            referencedRelation: "export_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_files_last_downloaded_by_fkey"
            columns: ["last_downloaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          email_message_id: string | null
          emailed_at: string | null
          emailed_to: string | null
          error_details: Json | null
          error_message: string | null
          expires_at: string | null
          format: Database["public"]["Enums"]["export_format_enum"]
          id: string
          include_corrections: boolean
          include_issued: boolean
          include_received: boolean
          invoices_count: number
          period_end: string
          period_start: string
          progress_message: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["export_status_enum"]
          tenant_id: string
          total_gross: number | null
          total_net: number | null
          total_vat: number | null
          trigger_source: Database["public"]["Enums"]["export_trigger_enum"]
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          email_message_id?: string | null
          emailed_at?: string | null
          emailed_to?: string | null
          error_details?: Json | null
          error_message?: string | null
          expires_at?: string | null
          format: Database["public"]["Enums"]["export_format_enum"]
          id?: string
          include_corrections?: boolean
          include_issued?: boolean
          include_received?: boolean
          invoices_count?: number
          period_end: string
          period_start: string
          progress_message?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_status_enum"]
          tenant_id: string
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
          trigger_source?: Database["public"]["Enums"]["export_trigger_enum"]
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          email_message_id?: string | null
          emailed_at?: string | null
          emailed_to?: string | null
          error_details?: Json | null
          error_message?: string | null
          expires_at?: string | null
          format?: Database["public"]["Enums"]["export_format_enum"]
          id?: string
          include_corrections?: boolean
          include_issued?: boolean
          include_received?: boolean
          invoices_count?: number
          period_end?: string
          period_start?: string
          progress_message?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["export_status_enum"]
          tenant_id?: string
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
          trigger_source?: Database["public"]["Enums"]["export_trigger_enum"]
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_jobs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          contractors_created: number | null
          contractors_updated: number | null
          created_at: string
          date_from: string | null
          date_to: string | null
          direction: string | null
          id: string
          invoices_found: number | null
          invoices_imported: number | null
          products_created: number | null
          progress_message: string | null
          progress_percent: number
          source: string | null
          source_file_path: string | null
          source_file_size: number | null
          source_filename: string | null
          started_at: string | null
          status: string
          tenant_id: string
          triggered_by: string | null
          updated_at: string
          warnings: Json
        }
        Insert: {
          completed_at?: string | null
          contractors_created?: number | null
          contractors_updated?: number | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          direction?: string | null
          id?: string
          invoices_found?: number | null
          invoices_imported?: number | null
          products_created?: number | null
          progress_message?: string | null
          progress_percent?: number
          source?: string | null
          source_file_path?: string | null
          source_file_size?: number | null
          source_filename?: string | null
          started_at?: string | null
          status?: string
          tenant_id: string
          triggered_by?: string | null
          updated_at?: string
          warnings?: Json
        }
        Update: {
          completed_at?: string | null
          contractors_created?: number | null
          contractors_updated?: number | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          direction?: string | null
          id?: string
          invoices_found?: number | null
          invoices_imported?: number | null
          products_created?: number | null
          progress_message?: string | null
          progress_percent?: number
          source?: string | null
          source_file_path?: string | null
          source_file_size?: number | null
          source_filename?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          triggered_by?: string | null
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inngest_run_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          event_name: string
          id: string
          invoice_id: string | null
          payload: Json | null
          run_id: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_name: string
          id?: string
          invoice_id?: string | null
          payload?: Json | null
          run_id: string
          status: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          event_name?: string
          id?: string
          invoice_id?: string | null
          payload?: Json | null
          run_id?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inngest_run_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inngest_run_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inngest_run_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          gross_amount: number | null
          id: string
          invoice_id: string
          kpir_category: string | null
          name: string | null
          net_amount: number | null
          ordinal: number
          quantity: number | null
          ryczalt_rate: number | null
          unit: string | null
          unit_price_net: number | null
          vat_amount: number | null
          vat_rate: string | null
        }
        Insert: {
          gross_amount?: number | null
          id?: string
          invoice_id: string
          kpir_category?: string | null
          name?: string | null
          net_amount?: number | null
          ordinal: number
          quantity?: number | null
          ryczalt_rate?: number | null
          unit?: string | null
          unit_price_net?: number | null
          vat_amount?: number | null
          vat_rate?: string | null
        }
        Update: {
          gross_amount?: number | null
          id?: string
          invoice_id?: string
          kpir_category?: string | null
          name?: string | null
          net_amount?: number | null
          ordinal?: number
          quantity?: number | null
          ryczalt_rate?: number | null
          unit?: string | null
          unit_price_net?: number | null
          vat_amount?: number | null
          vat_rate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          advance_amount: number | null
          advance_invoice_ids: string[]
          archive_storage_path: string | null
          archived_at: string | null
          bank_account_validated: boolean | null
          buyer_data: Json | null
          buyer_id_number: string | null
          buyer_id_type: Database["public"]["Enums"]["buyer_id_type_enum"]
          buyer_nip: string | null
          buyer_pesel: string | null
          buyer_vat_status_at_issue:
            | Database["public"]["Enums"]["vat_status_enum"]
            | null
          correction_reason: string | null
          correction_type:
            | Database["public"]["Enums"]["correction_type_enum"]
            | null
          created_at: string | null
          currency: string | null
          days_to_payment: number | null
          direction: string
          fa3_data: Json
          gross_total: number | null
          id: string
          internal_number: string | null
          invoice_kind: Database["public"]["Enums"]["invoice_type_enum"]
          invoice_type: string | null
          is_b2c: boolean
          issue_date: string
          ksef_accepted_at: string | null
          ksef_number: string | null
          ksef_status: string | null
          last_attempt_at: string | null
          last_error: string | null
          last_error_code: string | null
          last_error_field: string | null
          last_error_suggestion: string | null
          net_total: number | null
          notes: string | null
          offline_idempotency_key: string | null
          offline_qr_certyfikat: string | null
          offline_qr_offline: string | null
          paid_amount: number
          paid_at: string | null
          parent_invoice_id: string | null
          payment_data: Json | null
          payment_due_date: string | null
          payment_status: Database["public"]["Enums"]["payment_status_enum"]
          reminders_paused: boolean
          reminders_paused_reason: string | null
          sale_date: string | null
          scheduled_deletion_at: string | null
          seller_data: Json | null
          seller_nip: string | null
          submission_attempts: number
          submitted_to_ksef_at: string | null
          tenant_id: string
          updated_at: string | null
          validation_warnings: string[] | null
          vat_total: number | null
          xml_storage_path: string | null
        }
        Insert: {
          advance_amount?: number | null
          advance_invoice_ids?: string[]
          archive_storage_path?: string | null
          archived_at?: string | null
          bank_account_validated?: boolean | null
          buyer_data?: Json | null
          buyer_id_number?: string | null
          buyer_id_type?: Database["public"]["Enums"]["buyer_id_type_enum"]
          buyer_nip?: string | null
          buyer_pesel?: string | null
          buyer_vat_status_at_issue?:
            | Database["public"]["Enums"]["vat_status_enum"]
            | null
          correction_reason?: string | null
          correction_type?:
            | Database["public"]["Enums"]["correction_type_enum"]
            | null
          created_at?: string | null
          currency?: string | null
          days_to_payment?: number | null
          direction: string
          fa3_data: Json
          gross_total?: number | null
          id?: string
          internal_number?: string | null
          invoice_kind?: Database["public"]["Enums"]["invoice_type_enum"]
          invoice_type?: string | null
          is_b2c?: boolean
          issue_date: string
          ksef_accepted_at?: string | null
          ksef_number?: string | null
          ksef_status?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_error_field?: string | null
          last_error_suggestion?: string | null
          net_total?: number | null
          notes?: string | null
          offline_idempotency_key?: string | null
          offline_qr_certyfikat?: string | null
          offline_qr_offline?: string | null
          paid_amount?: number
          paid_at?: string | null
          parent_invoice_id?: string | null
          payment_data?: Json | null
          payment_due_date?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status_enum"]
          reminders_paused?: boolean
          reminders_paused_reason?: string | null
          sale_date?: string | null
          scheduled_deletion_at?: string | null
          seller_data?: Json | null
          seller_nip?: string | null
          submission_attempts?: number
          submitted_to_ksef_at?: string | null
          tenant_id: string
          updated_at?: string | null
          validation_warnings?: string[] | null
          vat_total?: number | null
          xml_storage_path?: string | null
        }
        Update: {
          advance_amount?: number | null
          advance_invoice_ids?: string[]
          archive_storage_path?: string | null
          archived_at?: string | null
          bank_account_validated?: boolean | null
          buyer_data?: Json | null
          buyer_id_number?: string | null
          buyer_id_type?: Database["public"]["Enums"]["buyer_id_type_enum"]
          buyer_nip?: string | null
          buyer_pesel?: string | null
          buyer_vat_status_at_issue?:
            | Database["public"]["Enums"]["vat_status_enum"]
            | null
          correction_reason?: string | null
          correction_type?:
            | Database["public"]["Enums"]["correction_type_enum"]
            | null
          created_at?: string | null
          currency?: string | null
          days_to_payment?: number | null
          direction?: string
          fa3_data?: Json
          gross_total?: number | null
          id?: string
          internal_number?: string | null
          invoice_kind?: Database["public"]["Enums"]["invoice_type_enum"]
          invoice_type?: string | null
          is_b2c?: boolean
          issue_date?: string
          ksef_accepted_at?: string | null
          ksef_number?: string | null
          ksef_status?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_code?: string | null
          last_error_field?: string | null
          last_error_suggestion?: string | null
          net_total?: number | null
          notes?: string | null
          offline_idempotency_key?: string | null
          offline_qr_certyfikat?: string | null
          offline_qr_offline?: string | null
          paid_amount?: number
          paid_at?: string | null
          parent_invoice_id?: string | null
          payment_data?: Json | null
          payment_due_date?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status_enum"]
          reminders_paused?: boolean
          reminders_paused_reason?: string | null
          sale_date?: string | null
          scheduled_deletion_at?: string | null
          seller_data?: Json | null
          seller_nip?: string | null
          submission_attempts?: number
          submitted_to_ksef_at?: string | null
          tenant_id?: string
          updated_at?: string | null
          validation_warnings?: string[] | null
          vat_total?: number | null
          xml_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kpir_entries: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          entry_date: string
          id: string
          invoice_id: string | null
          net_amount: number | null
          tenant_id: string
          vat_amount: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          entry_date: string
          id?: string
          invoice_id?: string | null
          net_amount?: number | null
          tenant_id: string
          vat_amount?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          invoice_id?: string | null
          net_amount?: number | null
          tenant_id?: string
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpir_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpir_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpir_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ksef_offline_queue: {
        Row: {
          attempts: number
          created_at: string
          deadline: string
          id: string
          idempotency_key: string
          invoice_id: string
          is_mf_outage: boolean
          last_attempt_at: string | null
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          qr_certyfikat_payload: string | null
          qr_offline_payload: string | null
          status: Database["public"]["Enums"]["offline_queue_status_enum"]
          tenant_id: string
          updated_at: string
          user_notified: boolean
        }
        Insert: {
          attempts?: number
          created_at?: string
          deadline: string
          id?: string
          idempotency_key: string
          invoice_id: string
          is_mf_outage?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          qr_certyfikat_payload?: string | null
          qr_offline_payload?: string | null
          status?: Database["public"]["Enums"]["offline_queue_status_enum"]
          tenant_id: string
          updated_at?: string
          user_notified?: boolean
        }
        Update: {
          attempts?: number
          created_at?: string
          deadline?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string
          is_mf_outage?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          qr_certyfikat_payload?: string | null
          qr_offline_payload?: string | null
          status?: Database["public"]["Enums"]["offline_queue_status_enum"]
          tenant_id?: string
          updated_at?: string
          user_notified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ksef_offline_queue_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ksef_offline_queue_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ksef_offline_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ksef_sessions: {
        Row: {
          auth_method: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          session_token_encrypted: string | null
          tenant_id: string
        }
        Insert: {
          auth_method?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          session_token_encrypted?: string | null
          tenant_id: string
        }
        Update: {
          auth_method?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          session_token_encrypted?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ksef_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ksef_submissions: {
        Row: {
          attempted_at: string | null
          completed_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          invoice_id: string
          request_payload_hash: string | null
          response_ksef_number: string | null
          retry_count: number | null
          status: string | null
          submission_type: string | null
          tenant_id: string
        }
        Insert: {
          attempted_at?: string | null
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          invoice_id: string
          request_payload_hash?: string | null
          response_ksef_number?: string | null
          retry_count?: number | null
          status?: string | null
          submission_type?: string | null
          tenant_id: string
        }
        Update: {
          attempted_at?: string | null
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string
          request_payload_hash?: string | null
          response_ksef_number?: string | null
          retry_count?: number | null
          status?: string | null
          submission_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ksef_submissions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ksef_submissions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ksef_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_imports: {
        Row: {
          account_currency: string
          account_iban: string
          amount: number
          bank_name: string | null
          booking_date: string | null
          counterparty_account: string | null
          counterparty_name: string | null
          counterparty_nip: string | null
          currency: string
          id: string
          ignored: boolean
          imported_at: string
          is_matched: boolean
          matched_payment_id: string | null
          provider: string
          reference: string | null
          tenant_id: string
          title: string | null
          transaction_date: string
          transaction_id: string
        }
        Insert: {
          account_currency?: string
          account_iban: string
          amount: number
          bank_name?: string | null
          booking_date?: string | null
          counterparty_account?: string | null
          counterparty_name?: string | null
          counterparty_nip?: string | null
          currency?: string
          id?: string
          ignored?: boolean
          imported_at?: string
          is_matched?: boolean
          matched_payment_id?: string | null
          provider?: string
          reference?: string | null
          tenant_id: string
          title?: string | null
          transaction_date: string
          transaction_id: string
        }
        Update: {
          account_currency?: string
          account_iban?: string
          amount?: number
          bank_name?: string | null
          booking_date?: string | null
          counterparty_account?: string | null
          counterparty_name?: string | null
          counterparty_nip?: string | null
          currency?: string
          id?: string
          ignored?: boolean
          imported_at?: string
          is_matched?: boolean
          matched_payment_id?: string | null
          provider?: string
          reference?: string | null
          tenant_id?: string
          title?: string | null
          transaction_date?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_imports_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          channel: Database["public"]["Enums"]["reminder_channel_enum"]
          clicked_at: string | null
          created_at: string
          days_overdue_at_send: number | null
          delivery_status: string | null
          email_body: string | null
          email_message_id: string | null
          email_subject: string | null
          failure_reason: string | null
          id: string
          invoice_id: string
          opened_at: string | null
          opened_count: number
          pdf_attachment_path: string | null
          replied_at: string | null
          scheduled_for: string
          sent_at: string | null
          sms_body: string | null
          sms_message_id: string | null
          stage: Database["public"]["Enums"]["reminder_stage_enum"]
          status: Database["public"]["Enums"]["reminder_status_enum"]
          tenant_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["reminder_channel_enum"]
          clicked_at?: string | null
          created_at?: string
          days_overdue_at_send?: number | null
          delivery_status?: string | null
          email_body?: string | null
          email_message_id?: string | null
          email_subject?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id: string
          opened_at?: string | null
          opened_count?: number
          pdf_attachment_path?: string | null
          replied_at?: string | null
          scheduled_for: string
          sent_at?: string | null
          sms_body?: string | null
          sms_message_id?: string | null
          stage: Database["public"]["Enums"]["reminder_stage_enum"]
          status?: Database["public"]["Enums"]["reminder_status_enum"]
          tenant_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["reminder_channel_enum"]
          clicked_at?: string | null
          created_at?: string
          days_overdue_at_send?: number | null
          delivery_status?: string | null
          email_body?: string | null
          email_message_id?: string | null
          email_subject?: string | null
          failure_reason?: string | null
          id?: string
          invoice_id?: string
          opened_at?: string | null
          opened_count?: number
          pdf_attachment_path?: string | null
          replied_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          sms_body?: string | null
          sms_message_id?: string | null
          stage?: Database["public"]["Enums"]["reminder_stage_enum"]
          status?: Database["public"]["Enums"]["reminder_status_enum"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_import_id: string | null
          bank_payer_account: string | null
          bank_payer_name: string | null
          bank_transaction_ref: string | null
          created_at: string
          id: string
          invoice_id: string
          is_auto_matched: boolean
          is_confirmed: boolean
          match_confidence: number | null
          match_method: string | null
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method_enum"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_import_id?: string | null
          bank_payer_account?: string | null
          bank_payer_name?: string | null
          bank_transaction_ref?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          is_auto_matched?: boolean
          is_confirmed?: boolean
          match_confidence?: number | null
          match_method?: string | null
          notes?: string | null
          payment_date: string
          payment_method?: Database["public"]["Enums"]["payment_method_enum"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_import_id?: string | null
          bank_payer_account?: string | null
          bank_payer_name?: string | null
          bank_transaction_ref?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          is_auto_matched?: boolean
          is_confirmed?: boolean
          match_confidence?: number | null
          match_method?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method_enum"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          default_price_net: number | null
          default_vat_rate: string
          description: string | null
          gtu_code: string | null
          id: string
          is_archived: boolean
          last_used_at: string | null
          name: string
          pkwiu_code: string | null
          tenant_id: string
          unit: string
          updated_at: string
          use_count: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_price_net?: number | null
          default_vat_rate?: string
          description?: string | null
          gtu_code?: string | null
          id?: string
          is_archived?: boolean
          last_used_at?: string | null
          name: string
          pkwiu_code?: string | null
          tenant_id: string
          unit?: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          default_price_net?: number | null
          default_vat_rate?: string
          description?: string | null
          gtu_code?: string | null
          id?: string
          is_archived?: boolean
          last_used_at?: string | null
          name?: string
          pkwiu_code?: string | null
          tenant_id?: string
          unit?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_name: string | null
          device_type: string | null
          endpoint: string
          failed_count: number
          id: string
          is_active: boolean
          last_used_at: string | null
          notify_cert_expiry: boolean
          notify_inbox_new: boolean
          notify_invoice_accepted: boolean
          notify_invoice_rejected: boolean
          notify_payment_received: boolean
          p256dh: string
          tenant_id: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_name?: string | null
          device_type?: string | null
          endpoint: string
          failed_count?: number
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          notify_cert_expiry?: boolean
          notify_inbox_new?: boolean
          notify_invoice_accepted?: boolean
          notify_invoice_rejected?: boolean
          notify_payment_received?: boolean
          p256dh: string
          tenant_id: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_name?: string | null
          device_type?: string | null
          endpoint?: string
          failed_count?: number
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          notify_cert_expiry?: boolean
          notify_inbox_new?: boolean
          notify_invoice_accepted?: boolean
          notify_invoice_rejected?: boolean
          notify_payment_received?: boolean
          p256dh?: string
          tenant_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'push_subscriptions_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      reminder_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          max_reminders_per_invoice: number
          pause_on_partial_payment: boolean
          pause_on_reply: boolean
          reply_to_email: string | null
          send_hour: number
          send_on_weekdays_only: boolean
          sender_email: string | null
          sender_name: string | null
          stage_1_days_after_due: number
          stage_1_enabled: boolean
          stage_2_days_after_due: number
          stage_2_enabled: boolean
          stage_3_days_after_due: number
          stage_3_enabled: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          max_reminders_per_invoice?: number
          pause_on_partial_payment?: boolean
          pause_on_reply?: boolean
          reply_to_email?: string | null
          send_hour?: number
          send_on_weekdays_only?: boolean
          sender_email?: string | null
          sender_name?: string | null
          stage_1_days_after_due?: number
          stage_1_enabled?: boolean
          stage_2_days_after_due?: number
          stage_2_enabled?: boolean
          stage_3_days_after_due?: number
          stage_3_enabled?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          max_reminders_per_invoice?: number
          pause_on_partial_payment?: boolean
          pause_on_reply?: boolean
          reply_to_email?: string | null
          send_hour?: number
          send_on_weekdays_only?: boolean
          sender_email?: string | null
          sender_name?: string | null
          stage_1_days_after_due?: number
          stage_1_enabled?: boolean
          stage_2_days_after_due?: number
          stage_2_enabled?: boolean
          stage_3_days_after_due?: number
          stage_3_enabled?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_templates: {
        Row: {
          created_at: string
          email_body: string
          email_subject: string
          id: string
          is_default: boolean
          stage: Database["public"]["Enums"]["reminder_stage_enum"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_body: string
          email_subject: string
          id?: string
          is_default?: boolean
          stage: Database["public"]["Enums"]["reminder_stage_enum"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_body?: string
          email_subject?: string
          id?: string
          is_default?: boolean
          stage?: Database["public"]["Enums"]["reminder_stage_enum"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address_json: Json | null
          created_at: string | null
          deleted_at: string | null
          hard_delete_at: string | null
          id: string
          is_active: boolean
          ksef_certificate_expiry: string | null
          ksef_credentials_encrypted: string | null
          name: string
          nip: string
          regon: string | null
          retention_years: number
          subscription_tier: string | null
          updated_at: string | null
        }
        Insert: {
          address_json?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          hard_delete_at?: string | null
          id?: string
          is_active?: boolean
          ksef_certificate_expiry?: string | null
          ksef_credentials_encrypted?: string | null
          name: string
          nip: string
          regon?: string | null
          retention_years?: number
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Update: {
          address_json?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          hard_delete_at?: string | null
          id?: string
          is_active?: boolean
          ksef_certificate_expiry?: string | null
          ksef_credentials_encrypted?: string | null
          name?: string
          nip?: string
          regon?: string | null
          retention_years?: number
          subscription_tier?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      upo_receipts: {
        Row: {
          archive_glacier_key: string | null
          archived_at: string | null
          created_at: string
          download_attempts: number
          downloaded_at: string | null
          id: string
          invoice_id: string
          ksef_acceptance_timestamp: string
          ksef_number: string
          last_error: string | null
          status: Database["public"]["Enums"]["upo_status_enum"]
          tenant_id: string
          upo_id: string | null
          upo_pdf_path: string | null
          upo_xml_hash: string | null
          upo_xml_path: string | null
        }
        Insert: {
          archive_glacier_key?: string | null
          archived_at?: string | null
          created_at?: string
          download_attempts?: number
          downloaded_at?: string | null
          id?: string
          invoice_id: string
          ksef_acceptance_timestamp: string
          ksef_number: string
          last_error?: string | null
          status?: Database["public"]["Enums"]["upo_status_enum"]
          tenant_id: string
          upo_id?: string | null
          upo_pdf_path?: string | null
          upo_xml_hash?: string | null
          upo_xml_path?: string | null
        }
        Update: {
          archive_glacier_key?: string | null
          archived_at?: string | null
          created_at?: string
          download_attempts?: number
          downloaded_at?: string | null
          id?: string
          invoice_id?: string
          ksef_acceptance_timestamp?: string
          ksef_number?: string
          last_error?: string | null
          status?: Database["public"]["Enums"]["upo_status_enum"]
          tenant_id?: string
          upo_id?: string | null
          upo_pdf_path?: string | null
          upo_xml_hash?: string | null
          upo_xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upo_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upo_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upo_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          id: string
          last_login: string | null
          name: string | null
          role: string | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          last_login?: string | null
          name?: string | null
          role?: string | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_login?: string | null
          name?: string | null
          role?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_cache: {
        Row: {
          bank_accounts: string[] | null
          cached_at: string
          country_code: string
          expires_at: string
          hit_count: number
          id: string
          is_valid: boolean | null
          legal_name: string | null
          nip: string
          raw_response: Json | null
          registered_address: string | null
          registration_date: string | null
          source: Database["public"]["Enums"]["validation_source_enum"]
          termination_date: string | null
          vat_status: Database["public"]["Enums"]["vat_status_enum"] | null
        }
        Insert: {
          bank_accounts?: string[] | null
          cached_at?: string
          country_code?: string
          expires_at?: string
          hit_count?: number
          id?: string
          is_valid?: boolean | null
          legal_name?: string | null
          nip: string
          raw_response?: Json | null
          registered_address?: string | null
          registration_date?: string | null
          source: Database["public"]["Enums"]["validation_source_enum"]
          termination_date?: string | null
          vat_status?: Database["public"]["Enums"]["vat_status_enum"] | null
        }
        Update: {
          bank_accounts?: string[] | null
          cached_at?: string
          country_code?: string
          expires_at?: string
          hit_count?: number
          id?: string
          is_valid?: boolean | null
          legal_name?: string | null
          nip?: string
          raw_response?: Json | null
          registered_address?: string | null
          registration_date?: string | null
          source?: Database["public"]["Enums"]["validation_source_enum"]
          termination_date?: string | null
          vat_status?: Database["public"]["Enums"]["vat_status_enum"] | null
        }
        Relationships: []
      }
      xml_documents: {
        Row: {
          created_at: string | null
          file_size_bytes: number | null
          id: string
          invoice_id: string
          sha256_hash: string
          storage_path: string
          storage_provider: string | null
          tenant_id: string
          version: number | null
        }
        Insert: {
          created_at?: string | null
          file_size_bytes?: number | null
          id?: string
          invoice_id: string
          sha256_hash: string
          storage_path: string
          storage_provider?: string | null
          tenant_id: string
          version?: number | null
        }
        Update: {
          created_at?: string | null
          file_size_bytes?: number | null
          id?: string
          invoice_id?: string
          sha256_hash?: string
          storage_path?: string
          storage_provider?: string | null
          tenant_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "xml_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xml_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices_overdue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "xml_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      invoices_overdue: {
        Row: {
          amount_due: number | null
          buyer_email: string | null
          buyer_name: string | null
          buyer_nip: string | null
          days_overdue: number | null
          gross_total: number | null
          id: string | null
          internal_number: string | null
          issue_date: string | null
          paid_amount: number | null
          payment_due_date: string | null
          payment_status:
            | Database["public"]["Enums"]["payment_status_enum"]
            | null
          reminders_paused: boolean | null
          reminders_sent_count: number | null
          tenant_id: string | null
        }
        Insert: {
          amount_due?: never
          buyer_email?: never
          buyer_name?: never
          buyer_nip?: never
          days_overdue?: never
          gross_total?: number | null
          id?: string | null
          internal_number?: string | null
          issue_date?: string | null
          paid_amount?: number | null
          payment_due_date?: string | null
          payment_status?:
            | Database["public"]["Enums"]["payment_status_enum"]
            | null
          reminders_paused?: boolean | null
          reminders_sent_count?: never
          tenant_id?: string | null
        }
        Update: {
          amount_due?: never
          buyer_email?: never
          buyer_name?: never
          buyer_nip?: never
          days_overdue?: never
          gross_total?: number | null
          id?: string | null
          internal_number?: string | null
          issue_date?: string | null
          paid_amount?: number | null
          payment_due_date?: string | null
          payment_status?:
            | Database["public"]["Enums"]["payment_status_enum"]
            | null
          reminders_paused?: boolean | null
          reminders_sent_count?: never
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cleanup_expired_validation_cache: { Args: never; Returns: number }
      days_overdue: { Args: { invoice_due_date: string }; Returns: number }
      get_current_tenant_id: { Args: never; Returns: string }
      increment_push_failed_count: {
        Args: { sub_id: string }
        Returns: undefined
      }
    }
    Enums: {
      buyer_id_type_enum: "nip" | "pesel" | "id_card" | "passport" | "no_id"
      correction_type_enum: "before_after" | "amount_change" | "cancellation"
      export_format_enum:
        | "jpk_fa"
        | "kpir_excel"
        | "comarch_optima"
        | "insert_subiekt"
        | "symfonia"
        | "wapro"
        | "csv_universal"
      export_status_enum:
        | "pending"
        | "generating"
        | "completed"
        | "failed"
        | "expired"
      export_trigger_enum:
        | "manual"
        | "co_pilot_monthly"
        | "accountant_portal"
        | "api"
      invoice_type_enum: "regular" | "correction" | "advance" | "final"
      offline_queue_status_enum:
        | "queued"
        | "sending"
        | "sent"
        | "failed"
        | "expired"
      payment_method_enum:
        | "bank_transfer"
        | "card"
        | "cash"
        | "compensation"
        | "other"
      payment_status_enum: "unpaid" | "partial" | "paid" | "overdue"
      reminder_channel_enum: "email" | "sms" | "both"
      reminder_stage_enum: "stage_1" | "stage_2" | "stage_3" | "stage_4"
      reminder_status_enum: "pending" | "sent" | "failed" | "cancelled"
      upo_status_enum: "pending" | "downloaded" | "failed" | "archived"
      validation_source_enum: "whitelist" | "vies" | "manual"
      vat_status_enum: "active" | "exempt" | "inactive" | "unknown" | "pending"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      buyer_id_type_enum: ["nip", "pesel", "id_card", "passport", "no_id"],
      correction_type_enum: ["before_after", "amount_change", "cancellation"],
      export_format_enum: [
        "jpk_fa",
        "kpir_excel",
        "comarch_optima",
        "insert_subiekt",
        "symfonia",
        "wapro",
        "csv_universal",
      ],
      export_status_enum: [
        "pending",
        "generating",
        "completed",
        "failed",
        "expired",
      ],
      export_trigger_enum: [
        "manual",
        "co_pilot_monthly",
        "accountant_portal",
        "api",
      ],
      invoice_type_enum: ["regular", "correction", "advance", "final"],
      offline_queue_status_enum: [
        "queued",
        "sending",
        "sent",
        "failed",
        "expired",
      ],
      payment_method_enum: [
        "bank_transfer",
        "card",
        "cash",
        "compensation",
        "other",
      ],
      payment_status_enum: ["unpaid", "partial", "paid", "overdue"],
      reminder_channel_enum: ["email", "sms", "both"],
      reminder_stage_enum: ["stage_1", "stage_2", "stage_3", "stage_4"],
      reminder_status_enum: ["pending", "sent", "failed", "cancelled"],
      upo_status_enum: ["pending", "downloaded", "failed", "archived"],
      validation_source_enum: ["whitelist", "vies", "manual"],
      vat_status_enum: ["active", "exempt", "inactive", "unknown", "pending"],
    },
  },
} as const
