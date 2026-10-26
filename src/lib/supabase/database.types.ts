export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          occurred_at: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
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
      membership_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          membership_id: string
          organization_id: string
          role_id: string
        }
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
        }
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
        }
        Relationships: [
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
      project_baselines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          project_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          project_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          project_id?: string
          snapshot?: Json
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
          metrics: Json
          next_steps: string | null
          organization_id: string
          period_end: string
          period_start: string
          project_id: string
          summary: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          decisions_needed?: string | null
          health: Database["public"]["Enums"]["project_health"]
          highlights?: string | null
          id?: string
          metrics?: Json
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
          metrics?: Json
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
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          updated_at: string
        }
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
      accept_pending_invitations: { Args: never; Returns: number }
      allowed_parent_types: {
        Args: { p_type: Database["public"]["Enums"]["work_item_type"] }
        Returns: Database["public"]["Enums"]["work_item_type"][]
      }
      can_act_on_project: {
        Args: { p_permission: string; p_project: string }
        Returns: boolean
      }
      can_read_project: { Args: { p_project: string }; Returns: boolean }
      can_read_work: { Args: { p_project: string }; Returns: boolean }
      complete_sprint: {
        Args: { p_move_to?: string; p_sprint: string }
        Returns: undefined
      }
      create_organization: {
        Args: { p_name: string; p_slug: string }
        Returns: string
      }
      create_role: {
        Args: {
          p_description: string
          p_key: string
          p_name: string
          p_org: string
          p_permissions: string[]
        }
        Returns: string
      }
      delete_role: { Args: { p_role: string }; Returns: undefined }
      has_permission: {
        Args: { p_org: string; p_permission: string }
        Returns: boolean
      }
      invite_member: {
        Args: { p_email: string; p_org: string; p_role_keys: string[] }
        Returns: string
      }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_valid_project_transition: {
        Args: {
          p_from: Database["public"]["Enums"]["project_status"]
          p_to: Database["public"]["Enums"]["project_status"]
        }
        Returns: boolean
      }
      my_permissions: { Args: { p_org: string }; Returns: string[] }
      record_invitation_email_sent: {
        Args: { p_invitation: string }
        Returns: undefined
      }
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined }
      set_member_roles: {
        Args: { p_membership: string; p_role_keys: string[] }
        Returns: undefined
      }
      set_membership_status: {
        Args: {
          p_membership: string
          p_status: Database["public"]["Enums"]["membership_status"]
        }
        Returns: undefined
      }
      set_project_archived: {
        Args: { p_archived: boolean; p_project: string }
        Returns: undefined
      }
      set_project_health: {
        Args: {
          p_health: Database["public"]["Enums"]["project_health"]
          p_project: string
          p_reason: string
        }
        Returns: undefined
      }
      set_work_item_archived: {
        Args: { p_archived: boolean; p_item: string }
        Returns: undefined
      }
      start_sprint: { Args: { p_sprint: string }; Returns: undefined }
      take_project_baseline: {
        Args: { p_name: string; p_project: string }
        Returns: string
      }
      transition_project_status: {
        Args: {
          p_project: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["project_status"]
        }
        Returns: undefined
      }
      update_role: {
        Args: {
          p_description: string
          p_name: string
          p_permissions: string[]
          p_role: string
        }
        Returns: undefined
      }
    }
    Enums: {
      client_confidentiality: "standard" | "confidential"
      dependency_kind: "blocks" | "relates_to" | "duplicates"
      invitation_status: "pending" | "accepted" | "revoked"
      membership_status: "active" | "suspended"
      program_status: "active" | "closed"
      project_health: "not_assessed" | "green" | "amber" | "red"
      project_methodology: "scrum" | "kanban" | "waterfall" | "hybrid"
      project_status:
        | "proposed"
        | "approved"
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      sprint_state: "planned" | "active" | "completed"
      work_item_link_kind:
        | "pull_request"
        | "build"
        | "test_run"
        | "release"
        | "document"
        | "other"
      work_item_priority: "critical" | "high" | "medium" | "low"
      work_item_severity: "s1" | "s2" | "s3" | "s4"
      work_item_type:
        | "epic"
        | "feature"
        | "story"
        | "task"
        | "subtask"
        | "bug"
        | "incident"
        | "change_request"
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
      client_confidentiality: ["standard", "confidential"],
      dependency_kind: ["blocks", "relates_to", "duplicates"],
      invitation_status: ["pending", "accepted", "revoked"],
      membership_status: ["active", "suspended"],
      program_status: ["active", "closed"],
      project_health: ["not_assessed", "green", "amber", "red"],
      project_methodology: ["scrum", "kanban", "waterfall", "hybrid"],
      project_status: [
        "proposed",
        "approved",
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      sprint_state: ["planned", "active", "completed"],
      work_item_link_kind: [
        "pull_request",
        "build",
        "test_run",
        "release",
        "document",
        "other",
      ],
      work_item_priority: ["critical", "high", "medium", "low"],
      work_item_severity: ["s1", "s2", "s3", "s4"],
      work_item_type: [
        "epic",
        "feature",
        "story",
        "task",
        "subtask",
        "bug",
        "incident",
        "change_request",
      ],
      workflow_category: ["todo", "in_progress", "done"],
    },
  },
} as const

