export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Enums: {
      org_role: "owner" | "editor" | "viewer";
    };
    Tables: {
      oauth_resume_contexts: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          project_id: string | null;
          chat_id: string | null;
          tool_id: string | null;
          original_prompt: string | null;
          pending_integrations: string[] | null;
          blocked_integration: string | null;
          orchestration_state: Json | null;
          return_path: string;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id: string;
          project_id?: string | null;
          chat_id?: string | null;
          tool_id?: string | null;
          original_prompt?: string | null;
          pending_integrations?: string[] | null;
          blocked_integration?: string | null;
          orchestration_state?: Json | null;
          return_path: string;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          org_id?: string;
          project_id?: string | null;
          chat_id?: string | null;
          tool_id?: string | null;
          original_prompt?: string | null;
          pending_integrations?: string[] | null;
          blocked_integration?: string | null;
          orchestration_state?: Json | null;
          return_path?: string;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_resume_contexts_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oauth_resume_contexts_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oauth_resume_contexts_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      broker_connections: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          integration_id: string;
          access_token: string;
          refresh_token: string | null;
          expires_at: string | null;
          token_type: string | null;
          status: string;
          scopes: Json;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          integration_id: string;
          access_token: string;
          refresh_token?: string | null;
          expires_at?: string | null;
          token_type?: string | null;
          status: string;
          scopes: Json;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          user_id?: string;
          integration_id?: string;
          access_token?: string;
          refresh_token?: string | null;
          expires_at?: string | null;
          token_type?: string | null;
          status?: string;
          scopes?: Json;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      broker_schemas: {
        Row: {
          id: string;
          org_id: string;
          integration_id: string;
          resource_type: string;
          schema_definition: Json;
          discovered_at: string;
          version: number;
        };
        Insert: {
          id?: string;
          org_id: string;
          integration_id: string;
          resource_type: string;
          schema_definition: Json;
          discovered_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          org_id?: string;
          integration_id?: string;
          resource_type?: string;
          schema_definition?: Json;
          discovered_at?: string;
          version?: number;
        };
        Relationships: [];
      };
      broker_capabilities: {
        Row: {
          id: string;
          integration_id: string;
          capability_id: string;
          display_name: string;
          description: string | null;
          required_scopes: string[];
          input_schema: Json;
          output_schema: Json;
        };
        Insert: {
          id?: string;
          integration_id: string;
          capability_id: string;
          display_name: string;
          description?: string | null;
          required_scopes: string[];
          input_schema: Json;
          output_schema: Json;
        };
        Update: {
          id?: string;
          integration_id?: string;
          capability_id?: string;
          display_name?: string;
          description?: string | null;
          required_scopes?: string[];
          input_schema?: Json;
          output_schema?: Json;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          tool_id: string;
          org_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tool_id: string;
          org_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tool_id?: string;
          org_id?: string;
          role?: "user" | "assistant" | "system";
          content?: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      data_sources: {
        Row: {
          id: string;
          org_id: string;
          type: string;
          name: string;
          config: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          type: string;
          name: string;
          config: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          type?: string;
          name?: string;
          config?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      integration_connections: {
        Row: {
          id: string;
          org_id: string;
          integration_id: string;
          encrypted_credentials: string | null;
          oauth_client_id: string | null;
          source: string;
          status: string;
          scopes: string[] | null;
          connected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          integration_id: string;
          encrypted_credentials?: string | null;
          oauth_client_id?: string | null;
          source?: string;
          status?: string;
          scopes?: string[] | null;
          connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          integration_id?: string;
          encrypted_credentials?: string | null;
          oauth_client_id?: string | null;
          source?: string;
          status?: string;
          scopes?: string[] | null;
          connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      integration_audit_logs: {
        Row: {
          id: string;
          org_id: string;
          integration_id: string;
          event_type: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          integration_id: string;
          event_type: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          integration_id?: string;
          event_type?: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      integration_health: {
        Row: {
          integration_id: string;
          org_id: string;
          status: "ok" | "error";
          error_message: string | null;
          error_code: string | null;
          latency_ms: number | null;
          last_checked_at: string | null;
        };
        Insert: {
          integration_id: string;
          org_id: string;
          status: "ok" | "error";
          error_message?: string | null;
          error_code?: string | null;
          latency_ms?: number | null;
          last_checked_at?: string | null;
        };
        Update: {
          integration_id?: string;
          org_id?: string;
          status?: "ok" | "error";
          error_message?: string | null;
          error_code?: string | null;
          latency_ms?: number | null;
          last_checked_at?: string | null;
        };
        Relationships: [];
      };
      org_integrations: {
        Row: {
          id: string;
          org_id: string;
          integration_id: string;
          status: string;
          scopes: string[] | null;
          connected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          integration_id: string;
          status: string;
          scopes?: string[] | null;
          connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          integration_id?: string;
          status?: string;
          scopes?: string[] | null;
          connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: Database["public"]["Enums"]["org_role"];
          token_hash: string;
          expires_at: string;
          created_at: string;
          accepted_at: string | null;
          accepted_by_user_id: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role: Database["public"]["Enums"]["org_role"];
          token_hash: string;
          expires_at: string;
          created_at?: string;
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["org_role"];
          token_hash?: string;
          expires_at?: string;
          created_at?: string;
          accepted_at?: string | null;
          accepted_by_user_id?: string | null;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id: string;
          role: Database["public"]["Enums"]["org_role"];
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          org_id?: string;
          role?: Database["public"]["Enums"]["org_role"];
          created_at?: string;
        };
        Relationships: [];
      };
      orgs: {
        Row: {
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          org_id: string;
          owner_id: string | null;
          name: string;
          active_version_id: string | null;
          data_source_id: string | null;
          spec: Json | null;
          status: string;
          error_message: string | null;
          environment: Json | null;
          view_spec: Json | null;
          view_ready: boolean;
          data_snapshot: Json | null;
          data_ready: boolean;
          data_fetched_at: string | null;
          finalized_at: string | null;
          compiled_at: string | null;
          lifecycle_done: boolean;
          finalizing: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          owner_id?: string | null;
          name: string;
          active_version_id?: string | null;
          data_source_id?: string | null;
          spec?: Json | null;
          status?: string;
          error_message?: string | null;
          environment?: Json | null;
          view_spec?: Json | null;
          view_ready?: boolean;
          data_snapshot?: Json | null;
          data_ready?: boolean;
          data_fetched_at?: string | null;
          finalized_at?: string | null;
          compiled_at?: string | null;
          lifecycle_done?: boolean;
          finalizing?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          owner_id?: string | null;
          name?: string;
          active_version_id?: string | null;
          data_source_id?: string | null;
          spec?: Json | null;
          status?: string;
          error_message?: string | null;
          environment?: Json | null;
          view_spec?: Json | null;
          view_ready?: boolean;
          data_snapshot?: Json | null;
          data_ready?: boolean;
          data_fetched_at?: string | null;
          finalized_at?: string | null;
          compiled_at?: string | null;
          lifecycle_done?: boolean;
          finalizing?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      prompt_executions: {
        Row: {
          id: string;
          chat_id: string;
          user_id: string;
          org_id: string;
          prompt: string;
          prompt_hash: string;
          tool_id: string | null;
          resume_id: string | null;
          status: string;
          error: string | null;
          normalized_prompt: string;
          prompt_id: string | null;
          tool_version_id: string | null;
          required_integrations: string[] | null;
          missing_integrations: string[] | null;
          lock_token: string | null;
          lock_acquired_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chat_id: string;
          user_id: string;
          org_id: string;
          prompt: string;
          prompt_hash: string;
          tool_id?: string | null;
          resume_id?: string | null;
          status: string;
          error?: string | null;
          normalized_prompt: string;
          prompt_id?: string | null;
          tool_version_id?: string | null;
          required_integrations?: string[] | null;
          missing_integrations?: string[] | null;
          lock_token?: string | null;
          lock_acquired_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          chat_id?: string;
          user_id?: string;
          org_id?: string;
          prompt?: string;
          prompt_hash?: string;
          tool_id?: string | null;
          resume_id?: string | null;
          status?: string;
          error?: string | null;
          normalized_prompt?: string;
          prompt_id?: string | null;
          tool_version_id?: string | null;
          required_integrations?: string[] | null;
          missing_integrations?: string[] | null;
          lock_token?: string | null;
          lock_acquired_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string | null;
          name: string | null;
          current_org_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          name?: string | null;
          current_org_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          name?: string | null;
          current_org_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          name: string | null;
          avatar_url: string | null;
          last_login_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          name?: string | null;
          avatar_url?: string | null;
          last_login_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string | null;
          avatar_url?: string | null;
          last_login_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_invite: {
        Args: { p_token_hash: string };
        Returns: undefined;
      };
      list_org_members: {
        Args: { p_org_id: string };
        Returns: Array<{
          user_id: string;
          role: Database["public"]["Enums"]["org_role"];
          created_at: string;
          email: string | null;
          name: string | null;
        }>;
      };
      org_has_member_email: {
        Args: { p_org_id: string; p_email: string };
        Returns: boolean;
      };
      delete_project_cascade: {
        Args: { p_project_id: string; p_org_id: string };
        Returns: undefined;
      };
    };
    CompositeTypes: Record<string, never>;
  };
};
