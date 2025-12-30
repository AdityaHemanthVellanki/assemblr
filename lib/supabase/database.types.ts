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
          encrypted_credentials: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          integration_id: string;
          encrypted_credentials: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          integration_id?: string;
          encrypted_credentials?: string;
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
          name: string;
          data_source_id: string | null;
          spec: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          data_source_id?: string | null;
          spec?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          data_source_id?: string | null;
          spec?: Json | null;
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
    };
    CompositeTypes: Record<string, never>;
  };
};
