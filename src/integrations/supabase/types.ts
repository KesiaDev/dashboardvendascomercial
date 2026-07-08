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
      bi_channels: {
        Row: {
          clint_group_names: string[]
          id: string
          label: string
          sck_prefixes: string[]
          tipo: string
          updated_at: string
        }
        Insert: {
          clint_group_names?: string[]
          id: string
          label: string
          sck_prefixes?: string[]
          tipo?: string
          updated_at?: string
        }
        Update: {
          clint_group_names?: string[]
          id?: string
          label?: string
          sck_prefixes?: string[]
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      bi_commission_bonuses: {
        Row: {
          created_at: string | null
          id: number
          moeda: string
          notas: string | null
          period_id: number
          seller_name: string
          tipo: string
          valor: number
        }
        Insert: {
          created_at?: string | null
          id?: never
          moeda?: string
          notas?: string | null
          period_id: number
          seller_name: string
          tipo?: string
          valor: number
        }
        Update: {
          created_at?: string | null
          id?: never
          moeda?: string
          notas?: string | null
          period_id?: number
          seller_name?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "bi_commission_bonuses_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "bi_commission_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bi_commission_bonuses_seller_name_fkey"
            columns: ["seller_name"]
            isOneToOne: false
            referencedRelation: "bi_seller_config"
            referencedColumns: ["seller_name"]
          },
        ]
      }
      bi_commission_periods: {
        Row: {
          cotacao_eur: number
          created_at: string | null
          data_fim: string
          data_inicio: string
          id: number
          nome: string
          roleta_pool_brl: number | null
          roleta_pool_eur: number | null
        }
        Insert: {
          cotacao_eur?: number
          created_at?: string | null
          data_fim: string
          data_inicio: string
          id?: never
          nome: string
          roleta_pool_brl?: number | null
          roleta_pool_eur?: number | null
        }
        Update: {
          cotacao_eur?: number
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          id?: never
          nome?: string
          roleta_pool_brl?: number | null
          roleta_pool_eur?: number | null
        }
        Relationships: []
      }
      bi_commission_rates: {
        Row: {
          effective_from: string
          id: number
          manager_rate_pct: number
          produto_grupo: string
          rate_pct: number
          seller_name: string
        }
        Insert: {
          effective_from?: string
          id?: never
          manager_rate_pct?: number
          produto_grupo: string
          rate_pct?: number
          seller_name: string
        }
        Update: {
          effective_from?: string
          id?: never
          manager_rate_pct?: number
          produto_grupo?: string
          rate_pct?: number
          seller_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_commission_rates_seller_name_fkey"
            columns: ["seller_name"]
            isOneToOne: false
            referencedRelation: "bi_seller_config"
            referencedColumns: ["seller_name"]
          },
        ]
      }
      bi_followup_activities: {
        Row: {
          id: number
          imported_at: string
          periodo_fim: string
          periodo_inicio: string
          quantidade: number
          titulo_atividade: string
        }
        Insert: {
          id?: never
          imported_at?: string
          periodo_fim: string
          periodo_inicio: string
          quantidade?: number
          titulo_atividade: string
        }
        Update: {
          id?: never
          imported_at?: string
          periodo_fim?: string
          periodo_inicio?: string
          quantidade?: number
          titulo_atividade?: string
        }
        Relationships: []
      }
      bi_monthly_overrides: {
        Row: {
          bloco: string
          id: number
          indicador: string
          periodo: string
          updated_at: string
          updated_by: string | null
          valor_brl: number
        }
        Insert: {
          bloco: string
          id?: never
          indicador: string
          periodo: string
          updated_at?: string
          updated_by?: string | null
          valor_brl?: number
        }
        Update: {
          bloco?: string
          id?: never
          indicador?: string
          periodo?: string
          updated_at?: string
          updated_by?: string | null
          valor_brl?: number
        }
        Relationships: []
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
      bi_product_config: {
        Row: {
          ativo: boolean
          categoria: string
          label: string
          product_id: string
          produto_pai_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          label: string
          product_id: string
          produto_pai_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          label?: string
          product_id?: string
          produto_pai_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_product_config_produto_pai_id_fkey"
            columns: ["produto_pai_id"]
            isOneToOne: false
            referencedRelation: "bi_product_config"
            referencedColumns: ["product_id"]
          },
        ]
      }
      bi_seller_config: {
        Row: {
          clint_user_name: string | null
          hotmart_affiliate_name: string | null
          is_active: boolean | null
          moeda_padrao: string
          seller_name: string
        }
        Insert: {
          clint_user_name?: string | null
          hotmart_affiliate_name?: string | null
          is_active?: boolean | null
          moeda_padrao?: string
          seller_name: string
        }
        Update: {
          clint_user_name?: string | null
          hotmart_affiliate_name?: string | null
          is_active?: boolean | null
          moeda_padrao?: string
          seller_name?: string
        }
        Relationships: []
      }
      bi_targets: {
        Row: {
          channel_id: string | null
          created_at: string
          fonte: string
          granularidade: string
          id: number
          indicador: string
          periodo: string
          product_id: string | null
          valor: number
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          fonte?: string
          granularidade?: string
          id?: never
          indicador: string
          periodo: string
          product_id?: string | null
          valor: number
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          fonte?: string
          granularidade?: string
          id?: never
          indicador?: string
          periodo?: string
          product_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "bi_targets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "bi_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bi_targets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "bi_product_config"
            referencedColumns: ["product_id"]
          },
        ]
      }
      bi_team_activity: {
        Row: {
          emails: number
          id: number
          imported_at: string
          ligacoes: number
          negocios_trabalhados: number
          periodo_fim: string
          periodo_inicio: string
          reunioes_agendadas: number
          tarefas: number
          user_name: string
          whatsapp: number
        }
        Insert: {
          emails?: number
          id?: never
          imported_at?: string
          ligacoes?: number
          negocios_trabalhados?: number
          periodo_fim: string
          periodo_inicio: string
          reunioes_agendadas?: number
          tarefas?: number
          user_name: string
          whatsapp?: number
        }
        Update: {
          emails?: number
          id?: never
          imported_at?: string
          ligacoes?: number
          negocios_trabalhados?: number
          periodo_fim?: string
          periodo_inicio?: string
          reunioes_agendadas?: number
          tarefas?: number
          user_name?: string
          whatsapp?: number
        }
        Relationships: []
      }
      bi_weekly_results: {
        Row: {
          id: number
          indicador: string
          product_id: string
          updated_at: string
          updated_by: string | null
          valor_brl: number
          week_start: string
        }
        Insert: {
          id?: never
          indicador: string
          product_id: string
          updated_at?: string
          updated_by?: string | null
          valor_brl?: number
          week_start: string
        }
        Update: {
          id?: never
          indicador?: string
          product_id?: string
          updated_at?: string
          updated_by?: string | null
          valor_brl?: number
          week_start?: string
        }
        Relationships: []
      }
      bi_wise_payments: {
        Row: {
          cliente: string
          cotacao_eur: number
          data_pagamento: string
          descricao: string | null
          id: number
          importado_em: string | null
          period_id: number | null
          produto_grupo: string | null
          seller_name: string | null
          valor_brl: number | null
          valor_eur: number
        }
        Insert: {
          cliente: string
          cotacao_eur?: number
          data_pagamento: string
          descricao?: string | null
          id?: never
          importado_em?: string | null
          period_id?: number | null
          produto_grupo?: string | null
          seller_name?: string | null
          valor_brl?: number | null
          valor_eur: number
        }
        Update: {
          cliente?: string
          cotacao_eur?: number
          data_pagamento?: string
          descricao?: string | null
          id?: never
          importado_em?: string | null
          period_id?: number | null
          produto_grupo?: string | null
          seller_name?: string | null
          valor_brl?: number | null
          valor_eur?: number
        }
        Relationships: [
          {
            foreignKeyName: "bi_wise_payments_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "bi_commission_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bi_wise_payments_seller_name_fkey"
            columns: ["seller_name"]
            isOneToOne: false
            referencedRelation: "bi_seller_config"
            referencedColumns: ["seller_name"]
          },
        ]
      }
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
          won_by_email: string | null
          won_by_name: string | null
          won_by_user_id: string | null
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
          won_by_email?: string | null
          won_by_name?: string | null
          won_by_user_id?: string | null
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
          won_by_email?: string | null
          won_by_name?: string | null
          won_by_user_id?: string | null
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
      manual_sales: {
        Row: {
          affiliate_mismatch: boolean
          bonus_semanal_eur: number | null
          client_email: string | null
          client_name: string | null
          confirmation_status: string
          confirmed_hotmart_sale_id: string | null
          confirmed_hotmart_valor_brl: number | null
          confirmed_wise_id: number | null
          created_at: string
          created_by: string
          created_by_email: string
          funnel: string
          hotmart_nome_afiliado: string | null
          id: string
          notes: string | null
          product: string
          roleta_type: string | null
          sale_date: string
          seller_name: string
          value_eur: number
        }
        Insert: {
          affiliate_mismatch?: boolean
          bonus_semanal_eur?: number | null
          client_email?: string | null
          client_name?: string | null
          confirmation_status?: string
          confirmed_hotmart_sale_id?: string | null
          confirmed_hotmart_valor_brl?: number | null
          confirmed_wise_id?: number | null
          created_at?: string
          created_by: string
          created_by_email: string
          funnel: string
          hotmart_nome_afiliado?: string | null
          id?: string
          notes?: string | null
          product: string
          roleta_type?: string | null
          sale_date: string
          seller_name: string
          value_eur: number
        }
        Update: {
          affiliate_mismatch?: boolean
          bonus_semanal_eur?: number | null
          client_email?: string | null
          client_name?: string | null
          confirmation_status?: string
          confirmed_hotmart_sale_id?: string | null
          confirmed_hotmart_valor_brl?: number | null
          confirmed_wise_id?: number | null
          created_at?: string
          created_by?: string
          created_by_email?: string
          funnel?: string
          hotmart_nome_afiliado?: string | null
          id?: string
          notes?: string | null
          product?: string
          roleta_type?: string | null
          sale_date?: string
          seller_name?: string
          value_eur?: number
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
          nome_afiliado: string | null
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
          nome_afiliado?: string | null
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
          nome_afiliado?: string | null
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
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
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
    Enums: {
      app_role: ["admin", "manager", "user"],
    },
  },
} as const
