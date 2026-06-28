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
  public: {
    Tables: {
      clint_deals: {
        Row: {
          contact_ddi: string | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          currency: string | null
          id: string
          lost_at: string | null
          lost_status_id: string | null
          lost_status_name: string | null
          origin_id: string | null
          origin_name: string | null
          raw: Json | null
          stage: string | null
          stage_id: string | null
          status: string
          synced_at: string
          updated_at: string | null
          updated_stage_at: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
          value: number | null
          won_at: string | null
        }
        Insert: {
          contact_ddi?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency?: string | null
          id: string
          lost_at?: string | null
          lost_status_id?: string | null
          lost_status_name?: string | null
          origin_id?: string | null
          origin_name?: string | null
          raw?: Json | null
          stage?: string | null
          stage_id?: string | null
          status: string
          synced_at?: string
          updated_at?: string | null
          updated_stage_at?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          value?: number | null
          won_at?: string | null
        }
        Update: {
          contact_ddi?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          lost_at?: string | null
          lost_status_id?: string | null
          lost_status_name?: string | null
          origin_id?: string | null
          origin_name?: string | null
          raw?: Json | null
          stage?: string | null
          stage_id?: string | null
          status?: string
          synced_at?: string
          updated_at?: string | null
          updated_stage_at?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          value?: number | null
          won_at?: string | null
        }
        Relationships: []
      }
      clint_lost_statuses: {
        Row: {
          id: string
          label: string | null
          occurrences: number
          origin_id: string | null
          updated_at: string
        }
        Insert: {
          id: string
          label?: string | null
          occurrences?: number
          origin_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          label?: string | null
          occurrences?: number
          origin_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clint_origin_stages: {
        Row: {
          id: string
          label: string
          origin_id: string
          stage_order: number
          synced_at: string
          type: string
        }
        Insert: {
          id: string
          label: string
          origin_id: string
          stage_order: number
          synced_at?: string
          type: string
        }
        Update: {
          id?: string
          label?: string
          origin_id?: string
          stage_order?: number
          synced_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "clint_origin_stages_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "clint_origins"
            referencedColumns: ["id"]
          },
        ]
      }
      bi_pipeline_areas: {
        Row: {
          area: string
          ativo: boolean
          auto_classified: boolean
          pipeline_id: string
          updated_at: string
        }
        Insert: {
          area: string
          ativo?: boolean
          auto_classified?: boolean
          pipeline_id: string
          updated_at?: string
        }
        Update: {
          area?: string
          ativo?: boolean
          auto_classified?: boolean
          pipeline_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_pipeline_areas_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: true
            referencedRelation: "clint_origins"
            referencedColumns: ["id"]
          },
        ]
      }
      clint_origins: {
        Row: {
          archived: boolean
          group_name: string | null
          id: string
          name: string
          synced_at: string
        }
        Insert: {
          archived?: boolean
          group_name?: string | null
          id: string
          name: string
          synced_at?: string
        }
        Update: {
          archived?: boolean
          group_name?: string | null
          id?: string
          name?: string
          synced_at?: string
        }
        Relationships: []
      }
      clint_sync_log: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          rows_synced: number
          since: string | null
          started_at: string
          status: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          rows_synced?: number
          since?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          rows_synced?: number
          since?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      clint_users: {
        Row: {
          active: boolean
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          synced_at: string
        }
        Insert: {
          active?: boolean
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          synced_at?: string
        }
        Update: {
          active?: boolean
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          cidade: string | null
          cupom: string | null
          data_confirmacao: string | null
          data_venda: string | null
          email_cliente: string | null
          estado: string | null
          faturamento_liquido_brl: number | null
          id: string
          imported_at: string
          meio_pagamento: string | null
          moeda_original: string | null
          moeda_recebimento: string | null
          nome_cliente: string | null
          numero_parcela: number | null
          origem_checkout: string | null
          pais: string | null
          preco_oferta: number | null
          preco_total: number | null
          produto_grupo: string
          produto_original: string
          raw: Json | null
          status: string
          tem_coproducao: string | null
          transacao: string
          updated_at: string
          valor_recebido_convertido: number | null
        }
        Insert: {
          cidade?: string | null
          cupom?: string | null
          data_confirmacao?: string | null
          data_venda?: string | null
          email_cliente?: string | null
          estado?: string | null
          faturamento_liquido_brl?: number | null
          id?: string
          imported_at?: string
          meio_pagamento?: string | null
          moeda_original?: string | null
          moeda_recebimento?: string | null
          nome_cliente?: string | null
          numero_parcela?: number | null
          origem_checkout?: string | null
          pais?: string | null
          preco_oferta?: number | null
          preco_total?: number | null
          produto_grupo: string
          produto_original: string
          raw?: Json | null
          status: string
          tem_coproducao?: string | null
          transacao: string
          updated_at?: string
          valor_recebido_convertido?: number | null
        }
        Update: {
          cidade?: string | null
          cupom?: string | null
          data_confirmacao?: string | null
          data_venda?: string | null
          email_cliente?: string | null
          estado?: string | null
          faturamento_liquido_brl?: number | null
          id?: string
          imported_at?: string
          meio_pagamento?: string | null
          moeda_original?: string | null
          moeda_recebimento?: string | null
          nome_cliente?: string | null
          numero_parcela?: number | null
          origem_checkout?: string | null
          pais?: string | null
          preco_oferta?: number | null
          preco_total?: number | null
          produto_grupo?: string
          produto_original?: string
          raw?: Json | null
          status?: string
          tem_coproducao?: string | null
          transacao?: string
          updated_at?: string
          valor_recebido_convertido?: number | null
        }
        Relationships: []
      }
      weekly_imports: {
        Row: {
          created_at: string
          filename: string | null
          id: string
          new_rows: number
          period_end: string | null
          period_start: string | null
          total_rows: number
          updated_rows: number
        }
        Insert: {
          created_at?: string
          filename?: string | null
          id?: string
          new_rows?: number
          period_end?: string | null
          period_start?: string | null
          total_rows?: number
          updated_rows?: number
        }
        Update: {
          created_at?: string
          filename?: string | null
          id?: string
          new_rows?: number
          period_end?: string | null
          period_start?: string | null
          total_rows?: number
          updated_rows?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
