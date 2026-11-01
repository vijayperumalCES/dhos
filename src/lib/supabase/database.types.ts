export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      attendance_corrections: {
        Row: {
          check_in_at: string
          check_out_at: string
          created_at: string
          id: string
          membership_id: string
          organization_id: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          work_date: string
          work_mode: Database["public"]["Enums"]["work_mode"]
        }
        ComputedFields: never
        Insert: {
          check_in_at: string
          check_out_at: string
          created_at?: string
          id?: string
          membership_id: string
          organization_id: string
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          work_date: string
          work_mode?: Database["public"]["Enums"]["work_mode"]
        }
        Update: {
          check_in_at?: string
          check_out_at?: string
          created_at?: string
          id?: string
          membership_id?: string
          organization_id?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          work_date?: string
          work_mode?: Database["public"]["Enums"]["work_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          check_in_at: string
          check_out_at: string | null
          created_at: string
          id: string
          membership_id: string
          note: string | null
          organization_id: string
          source: Database["public"]["Enums"]["attendance_source"]
          updated_at: string
          work_date: string
          work_mode: Database["public"]["Enums"]["work_mode"]
        }
        ComputedFields: never
        Insert: {
          check_in_at: string
          check_out_at?: string | null
          created_at?: string
          id?: string
          membership_id: string
          note?: string | null
          organization_id: string
          source?: Database["public"]["Enums"]["attendance_source"]
          updated_at?: string
          work_date: string
          work_mode?: Database["public"]["Enums"]["work_mode"]
        }
        Update: {
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          id?: string
          membership_id?: string
          note?: string | null
          organization_id?: string
          source?: Database["public"]["Enums"]["attendance_source"]
          updated_at?: string
          work_date?: string
          work_mode?: Database["public"]["Enums"]["work_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: NonNullable<Json>
          entity_id: string | null
          entity_type: string
          id: string
          metadata: NonNullable<Json>
          occurred_at: string
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          action: string
          actor_id?: string | null
          changes?: NonNullable<Json>
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: NonNullable<Json>
          occurred_at?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: NonNullable<Json>
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: NonNullable<Json>
          occurred_at?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by_membership_id: string | null
          decision_note: string | null
          description: string | null
          id: string
          impact_effort_hours: number | null
          impact_risk: string | null
          impact_schedule_days: number | null
          impact_scope: string | null
          implemented_at: string | null
          justification: string | null
          organization_id: string
          project_id: string
          requested_by_membership_id: string | null
          status: Database["public"]["Enums"]["change_status"]
          submitted_at: string | null
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by_membership_id?: string | null
          decision_note?: string | null
          description?: string | null
          id?: string
          impact_effort_hours?: number | null
          impact_risk?: string | null
          impact_schedule_days?: number | null
          impact_scope?: string | null
          implemented_at?: string | null
          justification?: string | null
          organization_id: string
          project_id: string
          requested_by_membership_id?: string | null
          status?: Database["public"]["Enums"]["change_status"]
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by_membership_id?: string | null
          decision_note?: string | null
          description?: string | null
          id?: string
          impact_effort_hours?: number | null
          impact_risk?: string | null
          impact_schedule_days?: number | null
          impact_scope?: string | null
          implemented_at?: string | null
          justification?: string | null
          organization_id?: string
          project_id?: string
          requested_by_membership_id?: string | null
          status?: Database["public"]["Enums"]["change_status"]
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_decided_by_membership_id_organization_id_fkey"
            columns: ["decided_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "change_requests_requested_by_membership_id_organization_id_fkey"
            columns: ["requested_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          archived_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_primary: boolean
          job_title: string | null
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          job_title?: string | null
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          job_title?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          archived_at: string | null
          client_id: string
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          notes: string | null
          organization_id: string
          reference: string | null
          renewal_notice_days: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          client_id: string
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          reference?: string | null
          renewal_notice_days?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          reference?: string | null
          renewal_notice_days?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      clients: {
        Row: {
          account_owner_membership_id: string | null
          archived_at: string | null
          code: string | null
          confidentiality: Database["public"]["Enums"]["client_confidentiality"]
          created_at: string
          created_by: string | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          organization_id: string
          updated_at: string
          website: string | null
        }
        ComputedFields: never
        Insert: {
          account_owner_membership_id?: string | null
          archived_at?: string | null
          code?: string | null
          confidentiality?: Database["public"]["Enums"]["client_confidentiality"]
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          organization_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_owner_membership_id?: string | null
          archived_at?: string | null
          code?: string | null
          confidentiality?: Database["public"]["Enums"]["client_confidentiality"]
          created_at?: string
          created_by?: string | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_owner_membership_id_organization_id_fkey"
            columns: ["account_owner_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          consequences: string | null
          context: string | null
          created_at: string
          created_by: string | null
          decided_by_membership_id: string | null
          decided_on: string | null
          decision: string | null
          id: string
          organization_id: string
          project_id: string
          rationale: string | null
          status: Database["public"]["Enums"]["decision_status"]
          superseded_by_id: string | null
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          consequences?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          decided_by_membership_id?: string | null
          decided_on?: string | null
          decision?: string | null
          id?: string
          organization_id: string
          project_id: string
          rationale?: string | null
          status?: Database["public"]["Enums"]["decision_status"]
          superseded_by_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          consequences?: string | null
          context?: string | null
          created_at?: string
          created_by?: string | null
          decided_by_membership_id?: string | null
          decided_on?: string | null
          decision?: string | null
          id?: string
          organization_id?: string
          project_id?: string
          rationale?: string | null
          status?: Database["public"]["Enums"]["decision_status"]
          superseded_by_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_decided_by_membership_id_organization_id_fkey"
            columns: ["decided_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "decisions_superseded_by_id_project_id_organization_id_fkey"
            columns: ["superseded_by_id", "project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "project_id", "organization_id"]
          },
        ]
      }
      departments: {
        Row: {
          archived_at: string | null
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          head_membership_id: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          head_membership_id?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          head_membership_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_head_membership_id_organization_id_fkey"
            columns: ["head_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          change_note: string | null
          content: string | null
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          organization_id: string
          project_id: string
          url: string | null
          version: number
        }
        ComputedFields: never
        Insert: {
          change_note?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          organization_id: string
          project_id: string
          url?: string | null
          version: number
        }
        Update: {
          change_note?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          organization_id?: string
          project_id?: string
          url?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_project_id_organization_id_fkey"
            columns: ["document_id", "project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id", "project_id", "organization_id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          current_version: number
          description: string | null
          doc_type: Database["public"]["Enums"]["document_type"]
          id: string
          organization_id: string
          owner_membership_id: string | null
          project_id: string
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["document_visibility"]
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          organization_id: string
          owner_membership_id?: string | null
          project_id: string
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["document_visibility"]
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          organization_id?: string
          owner_membership_id?: string | null
          project_id?: string
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["document_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_owner_membership_id_organization_id_fkey"
            columns: ["owner_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "documents_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      escalation_evidence: {
        Row: {
          created_at: string
          created_by: string | null
          escalation_id: string
          id: string
          kind: string
          note: string | null
          organization_id: string
          project_id: string
          title: string
          url: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          escalation_id: string
          id?: string
          kind: string
          note?: string | null
          organization_id: string
          project_id: string
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          escalation_id?: string
          id?: string
          kind?: string
          note?: string | null
          organization_id?: string
          project_id?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_evidence_escalation_id_project_id_organization__fkey"
            columns: ["escalation_id", "project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "escalations"
            referencedColumns: ["id", "project_id", "organization_id"]
          },
        ]
      }
      escalations: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          created_by: string | null
          description: string
          escalated_to_membership_id: string
          id: string
          organization_id: string
          project_id: string
          raid_item_id: string | null
          raised_by_membership_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          respond_by: string
          severity: Database["public"]["Enums"]["escalation_severity"]
          status: Database["public"]["Enums"]["escalation_status"]
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          escalated_to_membership_id: string
          id?: string
          organization_id: string
          project_id: string
          raid_item_id?: string | null
          raised_by_membership_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          respond_by: string
          severity: Database["public"]["Enums"]["escalation_severity"]
          status?: Database["public"]["Enums"]["escalation_status"]
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          escalated_to_membership_id?: string
          id?: string
          organization_id?: string
          project_id?: string
          raid_item_id?: string | null
          raised_by_membership_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          respond_by?: string
          severity?: Database["public"]["Enums"]["escalation_severity"]
          status?: Database["public"]["Enums"]["escalation_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalations_escalated_to_membership_id_organization_id_fkey"
            columns: ["escalated_to_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "escalations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "escalations_raid_item_id_project_id_organization_id_fkey"
            columns: ["raid_item_id", "project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "raid_items"
            referencedColumns: ["id", "project_id", "organization_id"]
          },
          {
            foreignKeyName: "escalations_raised_by_membership_id_organization_id_fkey"
            columns: ["raised_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      holidays: {
        Row: {
          calendar_id: string
          created_at: string
          holiday_date: string
          id: string
          name: string
          organization_id: string
        }
        ComputedFields: never
        Insert: {
          calendar_id: string
          created_at?: string
          holiday_date: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          holiday_date?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_calendar_id_organization_id_fkey"
            columns: ["calendar_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_calendars"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          granted_days: number
          leave_type_id: string
          membership_id: string
          organization_id: string
          updated_at: string
          year: number
        }
        ComputedFields: never
        Insert: {
          granted_days: number
          leave_type_id: string
          membership_id: string
          organization_id: string
          updated_at?: string
          year: number
        }
        Update: {
          granted_days?: number
          leave_type_id?: string
          membership_id?: string
          organization_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_leave_type_id_organization_id_fkey"
            columns: ["leave_type_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "leave_balances_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          end_date: string
          half_day: boolean
          id: string
          leave_type_id: string
          membership_id: string
          organization_id: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          days?: number
          end_date: string
          half_day?: boolean
          id?: string
          leave_type_id: string
          membership_id: string
          organization_id: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number
          end_date?: string
          half_day?: boolean
          id?: string
          leave_type_id?: string
          membership_id?: string
          organization_id?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_leave_type_id_organization_id_fkey"
            columns: ["leave_type_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "leave_requests_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      leave_types: {
        Row: {
          annual_allowance_days: number | null
          archived_at: string | null
          code: string
          created_at: string
          id: string
          is_paid: boolean
          name: string
          organization_id: string
          position: number
          requires_approval: boolean
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          annual_allowance_days?: number | null
          archived_at?: string | null
          code: string
          created_at?: string
          id?: string
          is_paid?: boolean
          name: string
          organization_id: string
          position?: number
          requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          annual_allowance_days?: number | null
          archived_at?: string | null
          code?: string
          created_at?: string
          id?: string
          is_paid?: boolean
          name?: string
          organization_id?: string
          position?: number
          requires_approval?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          membership_id: string
          organization_id: string
          role_id: string
        }
        ComputedFields: never
        Insert: {
          granted_at?: string
          granted_by?: string | null
          membership_id: string
          organization_id: string
          role_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          membership_id?: string
          organization_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "membership_roles_role_id_organization_id_fkey"
            columns: ["role_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "role_definitions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          email_last_sent_at: string | null
          email_sent_count: number
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role_keys: string[]
          status: Database["public"]["Enums"]["invitation_status"]
        }
        ComputedFields: never
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          email_last_sent_at?: string | null
          email_sent_count?: number
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role_keys: string[]
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          email_last_sent_at?: string | null
          email_sent_count?: number
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role_keys?: string[]
          status?: Database["public"]["Enums"]["invitation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          job_title: string | null
          manager_membership_id: string | null
          organization_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
          work_calendar_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          job_title?: string | null
          manager_membership_id?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
          work_calendar_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          job_title?: string | null
          manager_membership_id?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
          work_calendar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_calendar_fkey"
            columns: ["work_calendar_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_calendars"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "organization_memberships_department_fkey"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "organization_memberships_manager_fkey"
            columns: ["manager_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          currency_code: string
          health_stale_after_days: number
          organization_id: string
          timezone: string
          updated_at: string
          week_start: number
        }
        ComputedFields: never
        Insert: {
          currency_code?: string
          health_stale_after_days?: number
          organization_id: string
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Update: {
          currency_code?: string
          health_stale_after_days?: number
          organization_id?: string
          timezone?: string
          updated_at?: string
          week_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          name: string
          slug: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          description: string
          key: string
        }
        ComputedFields: never
        Insert: {
          category: string
          description: string
          key: string
        }
        Update: {
          category?: string
          description?: string
          key?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          archived_at: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          owner_membership_id: string | null
          status: Database["public"]["Enums"]["program_status"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          owner_membership_id?: string | null
          status?: Database["public"]["Enums"]["program_status"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          owner_membership_id?: string | null
          status?: Database["public"]["Enums"]["program_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_owner_membership_id_organization_id_fkey"
            columns: ["owner_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      project_actions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          decision_id: string | null
          description: string | null
          due_date: string
          id: string
          organization_id: string
          owner_membership_id: string
          project_id: string
          raid_item_id: string | null
          status: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          decision_id?: string | null
          description?: string | null
          due_date: string
          id?: string
          organization_id: string
          owner_membership_id: string
          project_id: string
          raid_item_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          decision_id?: string | null
          description?: string | null
          due_date?: string
          id?: string
          organization_id?: string
          owner_membership_id?: string
          project_id?: string
          raid_item_id?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_actions_decision_id_project_id_organization_id_fkey"
            columns: ["decision_id", "project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id", "project_id", "organization_id"]
          },
          {
            foreignKeyName: "project_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_actions_owner_membership_id_organization_id_fkey"
            columns: ["owner_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_actions_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_actions_raid_item_id_project_id_organization_id_fkey"
            columns: ["raid_item_id", "project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "raid_items"
            referencedColumns: ["id", "project_id", "organization_id"]
          },
        ]
      }
      project_baselines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          project_id: string
          snapshot: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          project_id: string
          snapshot: NonNullable<Json>
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          project_id?: string
          snapshot?: NonNullable<Json>
        }
        Relationships: [
          {
            foreignKeyName: "project_baselines_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      project_memberships: {
        Row: {
          allocation_percent: number | null
          created_at: string
          end_date: string | null
          membership_id: string
          organization_id: string
          project_id: string
          project_role: string
          start_date: string | null
        }
        ComputedFields: never
        Insert: {
          allocation_percent?: number | null
          created_at?: string
          end_date?: string | null
          membership_id: string
          organization_id: string
          project_id: string
          project_role?: string
          start_date?: string | null
        }
        Update: {
          allocation_percent?: number | null
          created_at?: string
          end_date?: string | null
          membership_id?: string
          organization_id?: string
          project_id?: string
          project_role?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_memberships_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_memberships_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          baseline_due_date: string | null
          completed_on: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          id: string
          name: string
          organization_id: string
          owner_membership_id: string | null
          project_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          baseline_due_date?: string | null
          completed_on?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          id?: string
          name: string
          organization_id: string
          owner_membership_id?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          baseline_due_date?: string | null
          completed_on?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          id?: string
          name?: string
          organization_id?: string
          owner_membership_id?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_owner_membership_id_organization_id_fkey"
            columns: ["owner_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      project_status_history: {
        Row: {
          change_type: string
          changed_at: string
          changed_by: string | null
          from_health: Database["public"]["Enums"]["project_health"] | null
          from_status: Database["public"]["Enums"]["project_status"] | null
          id: string
          organization_id: string
          project_id: string
          reason: string | null
          to_health: Database["public"]["Enums"]["project_health"] | null
          to_status: Database["public"]["Enums"]["project_status"] | null
        }
        ComputedFields: never
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          from_health?: Database["public"]["Enums"]["project_health"] | null
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: string
          organization_id: string
          project_id: string
          reason?: string | null
          to_health?: Database["public"]["Enums"]["project_health"] | null
          to_status?: Database["public"]["Enums"]["project_status"] | null
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          from_health?: Database["public"]["Enums"]["project_health"] | null
          from_status?: Database["public"]["Enums"]["project_status"] | null
          id?: string
          organization_id?: string
          project_id?: string
          reason?: string | null
          to_health?: Database["public"]["Enums"]["project_health"] | null
          to_status?: Database["public"]["Enums"]["project_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "project_status_history_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      project_status_reports: {
        Row: {
          author_id: string | null
          created_at: string
          decisions_needed: string | null
          health: Database["public"]["Enums"]["project_health"]
          highlights: string | null
          id: string
          metrics: NonNullable<Json>
          next_steps: string | null
          organization_id: string
          period_end: string
          period_start: string
          project_id: string
          summary: string
        }
        ComputedFields: never
        Insert: {
          author_id?: string | null
          created_at?: string
          decisions_needed?: string | null
          health: Database["public"]["Enums"]["project_health"]
          highlights?: string | null
          id?: string
          metrics?: NonNullable<Json>
          next_steps?: string | null
          organization_id: string
          period_end: string
          period_start: string
          project_id: string
          summary: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          decisions_needed?: string | null
          health?: Database["public"]["Enums"]["project_health"]
          highlights?: string | null
          id?: string
          metrics?: NonNullable<Json>
          next_steps?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          project_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_status_reports_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_end_date: string | null
          archived_at: string | null
          assumptions: string | null
          client_id: string | null
          code: string
          created_at: string
          created_by: string | null
          delivery_owner_id: string | null
          description: string | null
          health: Database["public"]["Enums"]["project_health"]
          health_reason: string | null
          health_updated_at: string | null
          id: string
          methodology: Database["public"]["Enums"]["project_methodology"]
          name: string
          objectives: string | null
          organization_id: string
          planned_start_date: string | null
          primary_team_id: string | null
          program_id: string | null
          project_constraints: string | null
          project_manager_id: string | null
          scope_summary: string | null
          sponsor_name: string | null
          status: Database["public"]["Enums"]["project_status"]
          status_changed_at: string
          target_end_date: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          actual_end_date?: string | null
          archived_at?: string | null
          assumptions?: string | null
          client_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          delivery_owner_id?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["project_health"]
          health_reason?: string | null
          health_updated_at?: string | null
          id?: string
          methodology?: Database["public"]["Enums"]["project_methodology"]
          name: string
          objectives?: string | null
          organization_id: string
          planned_start_date?: string | null
          primary_team_id?: string | null
          program_id?: string | null
          project_constraints?: string | null
          project_manager_id?: string | null
          scope_summary?: string | null
          sponsor_name?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          status_changed_at?: string
          target_end_date?: string | null
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          archived_at?: string | null
          assumptions?: string | null
          client_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          delivery_owner_id?: string | null
          description?: string | null
          health?: Database["public"]["Enums"]["project_health"]
          health_reason?: string | null
          health_updated_at?: string | null
          id?: string
          methodology?: Database["public"]["Enums"]["project_methodology"]
          name?: string
          objectives?: string | null
          organization_id?: string
          planned_start_date?: string | null
          primary_team_id?: string | null
          program_id?: string | null
          project_constraints?: string | null
          project_manager_id?: string | null
          scope_summary?: string | null
          sponsor_name?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          status_changed_at?: string
          target_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_delivery_owner_id_organization_id_fkey"
            columns: ["delivery_owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_primary_team_id_organization_id_fkey"
            columns: ["primary_team_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_program_fkey"
            columns: ["program_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_project_manager_id_organization_id_fkey"
            columns: ["project_manager_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      raid_items: {
        Row: {
          archived_at: string | null
          contingency: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          impact: number | null
          mitigation: string | null
          organization_id: string
          owner_membership_id: string | null
          probability: number | null
          project_id: string
          raised_by_membership_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          score: number | null
          status: Database["public"]["Enums"]["raid_status"]
          title: string
          type: Database["public"]["Enums"]["raid_type"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          contingency?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          impact?: number | null
          mitigation?: string | null
          organization_id: string
          owner_membership_id?: string | null
          probability?: number | null
          project_id: string
          raised_by_membership_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          score?: never
          status?: Database["public"]["Enums"]["raid_status"]
          title: string
          type: Database["public"]["Enums"]["raid_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          contingency?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          impact?: number | null
          mitigation?: string | null
          organization_id?: string
          owner_membership_id?: string | null
          probability?: number | null
          project_id?: string
          raised_by_membership_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          score?: never
          status?: Database["public"]["Enums"]["raid_status"]
          title?: string
          type?: Database["public"]["Enums"]["raid_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "raid_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raid_items_owner_membership_id_organization_id_fkey"
            columns: ["owner_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "raid_items_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "raid_items_raised_by_membership_id_organization_id_fkey"
            columns: ["raised_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      release_gates: {
        Row: {
          category: string
          checked_at: string | null
          checked_by_membership_id: string | null
          created_at: string
          id: string
          is_required: boolean
          name: string
          note: string | null
          organization_id: string
          position: number
          project_id: string
          release_id: string
          status: Database["public"]["Enums"]["gate_status"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          category?: string
          checked_at?: string | null
          checked_by_membership_id?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          name: string
          note?: string | null
          organization_id: string
          position?: number
          project_id: string
          release_id: string
          status?: Database["public"]["Enums"]["gate_status"]
          updated_at?: string
        }
        Update: {
          category?: string
          checked_at?: string | null
          checked_by_membership_id?: string | null
          created_at?: string
          id?: string
          is_required?: boolean
          name?: string
          note?: string | null
          organization_id?: string
          position?: number
          project_id?: string
          release_id?: string
          status?: Database["public"]["Enums"]["gate_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_gates_checked_by_membership_id_organization_id_fkey"
            columns: ["checked_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "release_gates_release_id_project_id_organization_id_fkey"
            columns: ["release_id", "project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id", "project_id", "organization_id"]
          },
        ]
      }
      releases: {
        Row: {
          approved_at: string | null
          approved_by_membership_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          planned_date: string | null
          project_id: string
          release_manager_membership_id: string | null
          released_on: string | null
          status: Database["public"]["Enums"]["release_status"]
          updated_at: string
          version: string | null
        }
        ComputedFields: never
        Insert: {
          approved_at?: string | null
          approved_by_membership_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          planned_date?: string | null
          project_id: string
          release_manager_membership_id?: string | null
          released_on?: string | null
          status?: Database["public"]["Enums"]["release_status"]
          updated_at?: string
          version?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_membership_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          planned_date?: string | null
          project_id?: string
          release_manager_membership_id?: string | null
          released_on?: string | null
          status?: Database["public"]["Enums"]["release_status"]
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "releases_approved_by_membership_id_organization_id_fkey"
            columns: ["approved_by_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "releases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "releases_release_manager_membership_id_organization_id_fkey"
            columns: ["release_manager_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      resource_allocations: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          membership_id: string
          notes: string | null
          organization_id: string
          percent: number
          project_id: string
          role: string | null
          start_date: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          membership_id: string
          notes?: string | null
          organization_id: string
          percent: number
          project_id: string
          role?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          membership_id?: string
          notes?: string | null
          organization_id?: string
          percent?: number
          project_id?: string
          role?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_allocations_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "resource_allocations_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      role_definitions: {
        Row: {
          created_at: string
          description: string
          id: string
          is_system: boolean
          key: string
          name: string
          organization_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        ComputedFields: never
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      sprint_daily_stats: {
        Row: {
          day: string
          done_count: number
          done_points: number
          organization_id: string
          scope_count: number
          scope_points: number
          sprint_id: string
        }
        ComputedFields: never
        Insert: {
          day: string
          done_count: number
          done_points: number
          organization_id: string
          scope_count: number
          scope_points: number
          sprint_id: string
        }
        Update: {
          day?: string
          done_count?: number
          done_points?: number
          organization_id?: string
          scope_count?: number
          scope_points?: number
          sprint_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprint_daily_stats_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          committed_count: number | null
          committed_points: number | null
          completed_at: string | null
          completed_count: number | null
          completed_points: number | null
          created_at: string
          created_by: string | null
          end_date: string
          goal: string | null
          id: string
          name: string
          organization_id: string
          project_id: string
          start_date: string
          started_at: string | null
          state: Database["public"]["Enums"]["sprint_state"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          committed_count?: number | null
          committed_points?: number | null
          completed_at?: string | null
          completed_count?: number | null
          completed_points?: number | null
          created_at?: string
          created_by?: string | null
          end_date: string
          goal?: string | null
          id?: string
          name: string
          organization_id: string
          project_id: string
          start_date: string
          started_at?: string | null
          state?: Database["public"]["Enums"]["sprint_state"]
          updated_at?: string
        }
        Update: {
          committed_count?: number | null
          committed_points?: number | null
          completed_at?: string | null
          completed_count?: number | null
          completed_points?: number | null
          created_at?: string
          created_by?: string | null
          end_date?: string
          goal?: string | null
          id?: string
          name?: string
          organization_id?: string
          project_id?: string
          start_date?: string
          started_at?: string | null
          state?: Database["public"]["Enums"]["sprint_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string
          membership_id: string
          organization_id: string
          team_id: string
          team_role: string | null
        }
        ComputedFields: never
        Insert: {
          joined_at?: string
          membership_id: string
          organization_id: string
          team_id: string
          team_role?: string | null
        }
        Update: {
          joined_at?: string
          membership_id?: string
          organization_id?: string
          team_id?: string
          team_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "team_members_team_id_organization_id_fkey"
            columns: ["team_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      teams: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_membership_id: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_membership_id?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_membership_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_lead_membership_id_organization_id_fkey"
            columns: ["lead_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          category: Database["public"]["Enums"]["time_category"]
          created_at: string
          entry_date: string
          hours: number
          id: string
          note: string | null
          organization_id: string
          project_id: string | null
          timesheet_id: string
          updated_at: string
          work_item_id: string | null
        }
        ComputedFields: never
        Insert: {
          category?: Database["public"]["Enums"]["time_category"]
          created_at?: string
          entry_date: string
          hours: number
          id?: string
          note?: string | null
          organization_id: string
          project_id?: string | null
          timesheet_id: string
          updated_at?: string
          work_item_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["time_category"]
          created_at?: string
          entry_date?: string
          hours?: number
          id?: string
          note?: string | null
          organization_id?: string
          project_id?: string | null
          timesheet_id?: string
          updated_at?: string
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_entries_timesheet_id_organization_id_fkey"
            columns: ["timesheet_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "timesheets"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "time_entries_work_item_id_organization_id_fkey"
            columns: ["work_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      timesheets: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          organization_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["timesheet_status"]
          submitted_at: string | null
          updated_at: string
          week_start: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          organization_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["timesheet_status"]
          submitted_at?: string | null
          updated_at?: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          organization_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["timesheet_status"]
          submitted_at?: string | null
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_membership_id_organization_id_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      work_calendars: {
        Row: {
          archived_at: string | null
          created_at: string
          hours_per_day: number
          id: string
          is_default: boolean
          name: string
          organization_id: string
          updated_at: string
          working_days: number[]
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          created_at?: string
          hours_per_day?: number
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          updated_at?: string
          working_days?: number[]
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          hours_per_day?: number
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
          working_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "work_calendars_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_activity: {
        Row: {
          actor_id: string | null
          created_at: string
          field: string | null
          from_value: string | null
          id: string
          kind: string
          organization_id: string
          to_value: string | null
          work_item_id: string
        }
        ComputedFields: never
        Insert: {
          actor_id?: string | null
          created_at?: string
          field?: string | null
          from_value?: string | null
          id?: string
          kind: string
          organization_id: string
          to_value?: string | null
          work_item_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          field?: string | null
          from_value?: string | null
          id?: string
          kind?: string
          organization_id?: string
          to_value?: string | null
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_activity_work_item_id_organization_id_fkey"
            columns: ["work_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      work_item_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          organization_id: string
          work_item_id: string
        }
        ComputedFields: never
        Insert: {
          author_id?: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          organization_id: string
          work_item_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          organization_id?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_comments_work_item_id_organization_id_fkey"
            columns: ["work_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      work_item_counters: {
        Row: {
          last_seq: number
          project_id: string
        }
        ComputedFields: never
        Insert: {
          last_seq?: number
          project_id: string
        }
        Update: {
          last_seq?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_item_dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          kind: Database["public"]["Enums"]["dependency_kind"]
          organization_id: string
          predecessor_id: string
          successor_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          kind?: Database["public"]["Enums"]["dependency_kind"]
          organization_id: string
          predecessor_id: string
          successor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          kind?: Database["public"]["Enums"]["dependency_kind"]
          organization_id?: string
          predecessor_id?: string
          successor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_dependencies_predecessor_id_organization_id_fkey"
            columns: ["predecessor_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_item_dependencies_successor_id_organization_id_fkey"
            columns: ["successor_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      work_item_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["work_item_link_kind"]
          organization_id: string
          title: string | null
          url: string
          work_item_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["work_item_link_kind"]
          organization_id: string
          title?: string | null
          url: string
          work_item_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["work_item_link_kind"]
          organization_id?: string
          title?: string | null
          url?: string
          work_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_item_links_work_item_id_organization_id_fkey"
            columns: ["work_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      work_items: {
        Row: {
          acceptance_criteria: string | null
          actual_hours: number | null
          archived_at: string | null
          assignee_membership_id: string | null
          blocked: boolean
          blocked_reason: string | null
          business_value: number | null
          completed_at: string | null
          component: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          estimate_hours: number | null
          id: string
          key: string
          labels: string[]
          organization_id: string
          parent_id: string | null
          priority: Database["public"]["Enums"]["work_item_priority"]
          project_id: string
          rank: number
          reporter_membership_id: string | null
          reviewer_membership_id: string | null
          seq: number
          severity: Database["public"]["Enums"]["work_item_severity"] | null
          sprint_id: string | null
          start_date: string | null
          state_id: string
          story_points: number | null
          team_id: string | null
          title: string
          type: Database["public"]["Enums"]["work_item_type"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          acceptance_criteria?: string | null
          actual_hours?: number | null
          archived_at?: string | null
          assignee_membership_id?: string | null
          blocked?: boolean
          blocked_reason?: string | null
          business_value?: number | null
          completed_at?: string | null
          component?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimate_hours?: number | null
          id?: string
          key?: string
          labels?: string[]
          organization_id: string
          parent_id?: string | null
          priority?: Database["public"]["Enums"]["work_item_priority"]
          project_id: string
          rank?: number
          reporter_membership_id?: string | null
          reviewer_membership_id?: string | null
          seq?: number
          severity?: Database["public"]["Enums"]["work_item_severity"] | null
          sprint_id?: string | null
          start_date?: string | null
          state_id: string
          story_points?: number | null
          team_id?: string | null
          title: string
          type: Database["public"]["Enums"]["work_item_type"]
          updated_at?: string
        }
        Update: {
          acceptance_criteria?: string | null
          actual_hours?: number | null
          archived_at?: string | null
          assignee_membership_id?: string | null
          blocked?: boolean
          blocked_reason?: string | null
          business_value?: number | null
          completed_at?: string | null
          component?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          estimate_hours?: number | null
          id?: string
          key?: string
          labels?: string[]
          organization_id?: string
          parent_id?: string | null
          priority?: Database["public"]["Enums"]["work_item_priority"]
          project_id?: string
          rank?: number
          reporter_membership_id?: string | null
          reviewer_membership_id?: string | null
          seq?: number
          severity?: Database["public"]["Enums"]["work_item_severity"] | null
          sprint_id?: string | null
          start_date?: string | null
          state_id?: string
          story_points?: number | null
          team_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["work_item_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_items_assignee_membership_id_organization_id_fkey"
            columns: ["assignee_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_items_parent_id_organization_id_fkey"
            columns: ["parent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_items_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_items_reporter_membership_id_organization_id_fkey"
            columns: ["reporter_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_items_reviewer_membership_id_organization_id_fkey"
            columns: ["reviewer_membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_items_sprint_id_organization_id_fkey"
            columns: ["sprint_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_items_state_id_organization_id_fkey"
            columns: ["state_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_states"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "work_items_team_id_organization_id_fkey"
            columns: ["team_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      workflow_states: {
        Row: {
          archived_at: string | null
          category: Database["public"]["Enums"]["workflow_category"]
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          position: number
          updated_at: string
          wip_limit: number | null
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          category: Database["public"]["Enums"]["workflow_category"]
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          position?: number
          updated_at?: string
          wip_limit?: number | null
        }
        Update: {
          archived_at?: string | null
          category?: Database["public"]["Enums"]["workflow_category"]
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          position?: number
          updated_at?: string
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_transitions: {
        Row: {
          from_state_id: string
          organization_id: string
          to_state_id: string
        }
        ComputedFields: never
        Insert: {
          from_state_id: string
          organization_id: string
          to_state_id: string
        }
        Update: {
          from_state_id?: string
          organization_id?: string
          to_state_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_transitions_from_state_id_organization_id_fkey"
            columns: ["from_state_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_states"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_transitions_to_state_id_organization_id_fkey"
            columns: ["to_state_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_states"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_pending_invitations: { Args: Record<PropertyKey, never>; Returns: number }
      acknowledge_escalation: { Args: { p_escalation: string }; Returns: undefined }
      add_document_version: {
        Args: { p_content: string; p_document: string; p_note?: string; p_url: string }
        Returns: number
      }
      allowed_parent_types: {
        Args: { p_type: Database["public"]["Enums"]["work_item_type"] }
        Returns: Database["public"]["Enums"]["work_item_type"][]
      }
      attendance_exceptions: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: {
          kind: string
          membership_id: string
          work_date: string
        }[]
      }
      can_act_on_project: { Args: { p_permission: string; p_project: string }; Returns: boolean }
      can_read_project: { Args: { p_project: string }; Returns: boolean }
      can_read_work: { Args: { p_project: string }; Returns: boolean }
      cancel_attendance_correction: { Args: { p_correction: string }; Returns: undefined }
      cancel_leave_request: { Args: { p_note?: string; p_request: string }; Returns: undefined }
      capacity_overview: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: {
          allocated_hours: number
          calendar_days: number
          capacity_hours: number
          holiday_days: number
          hours_per_day: number
          leave_days: number
          logged_hours: number
          membership_id: string
          peak_allocation_percent: number
          working_days: number
        }[]
      }
      check_in: {
        Args: { p_mode?: Database["public"]["Enums"]["work_mode"]; p_note?: string; p_org: string }
        Returns: string
      }
      check_out: { Args: { p_org: string }; Returns: undefined }
      complete_sprint: { Args: { p_move_to?: string; p_sprint: string }; Returns: undefined }
      create_document: {
        Args: {
          p_content: string
          p_description: string
          p_note?: string
          p_project: string
          p_title: string
          p_type: Database["public"]["Enums"]["document_type"]
          p_url: string
          p_visibility: Database["public"]["Enums"]["document_visibility"]
        }
        Returns: string
      }
      create_organization: { Args: { p_name: string; p_slug: string }; Returns: string }
      create_role: {
        Args: { p_description: string; p_key: string; p_name: string; p_org: string; p_permissions: string[] }
        Returns: string
      }
      decide_change_request: { Args: { p_approve: boolean; p_change: string; p_note?: string }; Returns: undefined }
      delete_role: { Args: { p_role: string }; Returns: undefined }
      grant_annual_leave_allowances: { Args: { p_org: string; p_year: number }; Returns: number }
      has_permission: { Args: { p_org: string; p_permission: string }; Returns: boolean }
      implement_change_request: { Args: { p_change: string }; Returns: undefined }
      invite_member: { Args: { p_email: string; p_org: string; p_role_keys: string[] }; Returns: string }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_valid_project_transition: {
        Args: {
          p_from: Database["public"]["Enums"]["project_status"]
          p_to: Database["public"]["Enums"]["project_status"]
        }
        Returns: boolean
      }
      leave_milestone_conflicts: {
        Args: { p_request: string }
        Returns: {
          due_date: string
          milestone_name: string
          project_id: string
          project_name: string
        }[]
      }
      my_permissions: { Args: { p_org: string }; Returns: string[] }
      raise_escalation: {
        Args: {
          p_description: string
          p_evidence: Json
          p_project: string
          p_raid_item: string
          p_respond_by: string
          p_severity: Database["public"]["Enums"]["escalation_severity"]
          p_title: string
          p_to: string
        }
        Returns: string
      }
      recall_timesheet: { Args: { p_timesheet: string }; Returns: undefined }
      record_gate_result: {
        Args: { p_gate: string; p_note?: string; p_status: Database["public"]["Enums"]["gate_status"] }
        Returns: undefined
      }
      record_invitation_email_sent: { Args: { p_invitation: string }; Returns: undefined }
      release_readiness: {
        Args: { p_release: string }
        Returns: {
          failed: number
          open_critical_defects: number
          open_high_defects: number
          required_ready: number
          required_total: number
        }[]
      }
      request_attendance_correction: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_mode: Database["public"]["Enums"]["work_mode"]
          p_org: string
          p_reason: string
          p_work_date: string
        }
        Returns: string
      }
      request_leave: {
        Args: {
          p_end: string
          p_half_day?: boolean
          p_leave_type: string
          p_org: string
          p_reason?: string
          p_start: string
        }
        Returns: string
      }
      resolve_escalation: { Args: { p_escalation: string; p_note: string }; Returns: undefined }
      review_attendance_correction: {
        Args: { p_approve: boolean; p_correction: string; p_note?: string }
        Returns: undefined
      }
      review_leave_request: { Args: { p_approve: boolean; p_note?: string; p_request: string }; Returns: undefined }
      review_timesheet: { Args: { p_approve: boolean; p_note?: string; p_timesheet: string }; Returns: undefined }
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined }
      set_default_calendar: { Args: { p_calendar: string }; Returns: undefined }
      set_leave_balance: {
        Args: { p_days: number; p_leave_type: string; p_membership: string; p_year: number }
        Returns: undefined
      }
      set_member_calendar: { Args: { p_calendar: string; p_membership: string }; Returns: undefined }
      set_member_roles: { Args: { p_membership: string; p_role_keys: string[] }; Returns: undefined }
      set_membership_status: {
        Args: { p_membership: string; p_status: Database["public"]["Enums"]["membership_status"] }
        Returns: undefined
      }
      set_project_archived: { Args: { p_archived: boolean; p_project: string }; Returns: undefined }
      set_project_health: {
        Args: { p_health: Database["public"]["Enums"]["project_health"]; p_project: string; p_reason: string }
        Returns: undefined
      }
      set_work_item_archived: { Args: { p_archived: boolean; p_item: string }; Returns: undefined }
      start_sprint: { Args: { p_sprint: string }; Returns: undefined }
      submit_change_request: { Args: { p_change: string }; Returns: undefined }
      submit_timesheet: { Args: { p_timesheet: string }; Returns: undefined }
      take_project_baseline: { Args: { p_name: string; p_project: string }; Returns: string }
      team_availability: {
        Args: { p_from: string; p_org: string; p_to: string }
        Returns: {
          day: string
          half_day: boolean
          kind: string
          label: string
          membership_id: string
        }[]
      }
      timesheet_compliance: {
        Args: { p_org: string; p_week_start: string }
        Returns: {
          membership_id: string
          status: string
          submitted_at: string
          timesheet_id: string
          total_hours: number
        }[]
      }
      transition_project_status: {
        Args: { p_project: string; p_reason?: string; p_to: Database["public"]["Enums"]["project_status"] }
        Returns: undefined
      }
      transition_release: {
        Args: { p_note?: string; p_release: string; p_to: Database["public"]["Enums"]["release_status"] }
        Returns: undefined
      }
      update_role: {
        Args: { p_description: string; p_name: string; p_permissions: string[]; p_role: string }
        Returns: undefined
      }
      withdraw_change_request: { Args: { p_change: string }; Returns: undefined }
    }
    Enums: {
      action_status: "open" | "in_progress" | "done" | "cancelled"
      attendance_source: "self" | "correction"
      change_status: "draft" | "submitted" | "approved" | "rejected" | "implemented" | "withdrawn"
      client_confidentiality: "standard" | "confidential"
      contract_status: "draft" | "active" | "expired" | "terminated"
      contract_type: "msa" | "sow" | "nda" | "support" | "other"
      decision_status: "proposed" | "accepted" | "rejected" | "superseded"
      dependency_kind: "blocks" | "relates_to" | "duplicates"
      document_type: "charter" | "requirements" | "specification" | "design" | "plan" | "report" | "other"
      document_visibility: "internal" | "client"
      escalation_severity: "medium" | "high" | "critical"
      escalation_status: "open" | "acknowledged" | "resolved"
      gate_status: "pending" | "passed" | "failed" | "waived"
      invitation_status: "pending" | "accepted" | "revoked"
      membership_status: "active" | "suspended"
      program_status: "active" | "closed"
      project_health: "not_assessed" | "green" | "amber" | "red"
      project_methodology: "scrum" | "kanban" | "waterfall" | "hybrid"
      project_status: "proposed" | "approved" | "planning" | "active" | "on_hold" | "completed" | "cancelled"
      raid_status: "open" | "in_progress" | "resolved" | "accepted" | "closed"
      raid_type: "risk" | "assumption" | "issue" | "dependency"
      release_status: "planned" | "in_review" | "approved" | "released" | "cancelled"
      request_status: "pending" | "approved" | "rejected" | "cancelled"
      sprint_state: "planned" | "active" | "completed"
      time_category: "delivery" | "internal" | "training" | "presales"
      timesheet_status: "draft" | "submitted" | "approved" | "rejected"
      work_item_link_kind: "pull_request" | "build" | "test_run" | "release" | "document" | "other"
      work_item_priority: "critical" | "high" | "medium" | "low"
      work_item_severity: "s1" | "s2" | "s3" | "s4"
      work_item_type: "epic" | "feature" | "story" | "task" | "subtask" | "bug" | "incident" | "change_request"
      work_mode: "office" | "remote"
      workflow_category: "todo" | "in_progress" | "done"
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
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_status: ["open", "in_progress", "done", "cancelled"],
      attendance_source: ["self", "correction"],
      change_status: ["draft", "submitted", "approved", "rejected", "implemented", "withdrawn"],
      client_confidentiality: ["standard", "confidential"],
      contract_status: ["draft", "active", "expired", "terminated"],
      contract_type: ["msa", "sow", "nda", "support", "other"],
      decision_status: ["proposed", "accepted", "rejected", "superseded"],
      dependency_kind: ["blocks", "relates_to", "duplicates"],
      document_type: ["charter", "requirements", "specification", "design", "plan", "report", "other"],
      document_visibility: ["internal", "client"],
      escalation_severity: ["medium", "high", "critical"],
      escalation_status: ["open", "acknowledged", "resolved"],
      gate_status: ["pending", "passed", "failed", "waived"],
      invitation_status: ["pending", "accepted", "revoked"],
      membership_status: ["active", "suspended"],
      program_status: ["active", "closed"],
      project_health: ["not_assessed", "green", "amber", "red"],
      project_methodology: ["scrum", "kanban", "waterfall", "hybrid"],
      project_status: ["proposed", "approved", "planning", "active", "on_hold", "completed", "cancelled"],
      raid_status: ["open", "in_progress", "resolved", "accepted", "closed"],
      raid_type: ["risk", "assumption", "issue", "dependency"],
      release_status: ["planned", "in_review", "approved", "released", "cancelled"],
      request_status: ["pending", "approved", "rejected", "cancelled"],
      sprint_state: ["planned", "active", "completed"],
      time_category: ["delivery", "internal", "training", "presales"],
      timesheet_status: ["draft", "submitted", "approved", "rejected"],
      work_item_link_kind: ["pull_request", "build", "test_run", "release", "document", "other"],
      work_item_priority: ["critical", "high", "medium", "low"],
      work_item_severity: ["s1", "s2", "s3", "s4"],
      work_item_type: ["epic", "feature", "story", "task", "subtask", "bug", "incident", "change_request"],
      work_mode: ["office", "remote"],
      workflow_category: ["todo", "in_progress", "done"],
    },
  },
} as const
