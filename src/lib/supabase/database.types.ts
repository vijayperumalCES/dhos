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
          id: string
          job_title: string | null
          organization_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_title?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_title?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          key: string
          name: string
          organization_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          organization_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_pending_invitations: { Args: never; Returns: number }
      can_act_on_project: {
        Args: { p_permission: string; p_project: string }
        Returns: boolean
      }
      can_read_project: { Args: { p_project: string }; Returns: boolean }
      create_organization: {
        Args: { p_name: string; p_slug: string }
        Returns: string
      }
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
      transition_project_status: {
        Args: {
          p_project: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["project_status"]
        }
        Returns: undefined
      }
    }
    Enums: {
      client_confidentiality: "standard" | "confidential"
      invitation_status: "pending" | "accepted" | "revoked"
      membership_status: "active" | "suspended"
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
      invitation_status: ["pending", "accepted", "revoked"],
      membership_status: ["active", "suspended"],
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
    },
  },
} as const

