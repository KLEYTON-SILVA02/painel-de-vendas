// Auto-generated from the Supabase project schema via `generate_typescript_types`.
// Regenerate after any migration under supabase/migrations/.
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
      bio_group_goals: {
        Row: {
          category_type_id: string
          grupo: string
          id: string
          meta1: number
          meta2: number
          meta3: number
          peso: number
          store_id: string
        }
        Insert: {
          category_type_id: string
          grupo: string
          id?: string
          meta1?: number
          meta2?: number
          meta3?: number
          peso?: number
          store_id: string
        }
        Update: {
          category_type_id?: string
          grupo?: string
          id?: string
          meta1?: number
          meta2?: number
          meta3?: number
          peso?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bio_group_goals_category_type_id_fkey"
            columns: ["category_type_id"]
            isOneToOne: false
            referencedRelation: "category_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bio_group_goals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      bio_groups: {
        Row: {
          category_type_id: string
          created_at: string
          grupo: string
          id: string
          nome: string
          palavras: string[]
          store_id: string
        }
        Insert: {
          category_type_id: string
          created_at?: string
          grupo: string
          id?: string
          nome: string
          palavras?: string[]
          store_id: string
        }
        Update: {
          category_type_id?: string
          created_at?: string
          grupo?: string
          id?: string
          nome?: string
          palavras?: string[]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bio_groups_category_type_id_fkey"
            columns: ["category_type_id"]
            isOneToOne: false
            referencedRelation: "category_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bio_groups_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_keywords: {
        Row: {
          categoria: string
          created_at: string
          id: string
          palavra: string
          store_id: string
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          palavra: string
          store_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          palavra?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_keywords_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog: {
        Row: {
          categoria: string
          codigo: string | null
          created_at: string
          id: string
          nome: string
          store_id: string
        }
        Insert: {
          categoria: string
          codigo?: string | null
          created_at?: string
          id?: string
          nome: string
          store_id: string
        }
        Update: {
          categoria?: string
          codigo?: string | null
          created_at?: string
          id?: string
          nome?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      category_types: {
        Row: {
          ativo: boolean
          chave: string
          created_at: string
          icone_url: string | null
          id: string
          nome: string
          setores_elegiveis: string[]
          sistema: boolean
          store_id: string
        }
        Insert: {
          ativo?: boolean
          chave: string
          created_at?: string
          icone_url?: string | null
          id?: string
          nome: string
          setores_elegiveis?: string[]
          sistema?: boolean
          store_id: string
        }
        Update: {
          ativo?: boolean
          chave?: string
          created_at?: string
          icone_url?: string | null
          id?: string
          nome?: string
          setores_elegiveis?: string[]
          sistema?: boolean
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_types_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          apelido: string | null
          created_at: string
          data_nascimento: string | null
          foto_conquista_url: string | null
          foto_url: string | null
          id: string
          matricula: string
          meta_individual: number
          nome: string
          setor: string | null
          store_id: string
        }
        Insert: {
          apelido?: string | null
          created_at?: string
          data_nascimento?: string | null
          foto_conquista_url?: string | null
          foto_url?: string | null
          id?: string
          matricula: string
          meta_individual?: number
          nome: string
          setor?: string | null
          store_id: string
        }
        Update: {
          apelido?: string | null
          created_at?: string
          data_nascimento?: string | null
          foto_conquista_url?: string | null
          foto_url?: string | null
          id?: string
          matricula?: string
          meta_individual?: number
          nome?: string
          setor?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rates: {
        Row: {
          ativo: boolean
          categoria: string
          id: string
          percentual: number
          slot: number
          store_id: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          id?: string
          percentual?: number
          slot?: number
          store_id: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          id?: string
          percentual?: number
          slot?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      conquista_card_templates: {
        Row: {
          background_url: string
          created_at: string
          foto: Json
          id: string
          is_default: boolean
          logo: Json
          logo_scale: number | null
          logo_url: string | null
          name: string
          store_id: string
          text_font_family: string | null
          text_layers: Json | null
          texto: Json | null
        }
        Insert: {
          background_url: string
          created_at?: string
          foto: Json
          id?: string
          is_default?: boolean
          logo: Json
          logo_scale?: number | null
          logo_url?: string | null
          name: string
          store_id: string
          text_font_family?: string | null
          text_layers?: Json | null
          texto?: Json | null
        }
        Update: {
          background_url?: string
          created_at?: string
          foto?: Json
          id?: string
          is_default?: boolean
          logo?: Json
          logo_scale?: number | null
          logo_url?: string | null
          name?: string
          store_id?: string
          text_font_family?: string | null
          text_layers?: Json | null
          texto?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conquista_card_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      conquista_super_metas: {
        Row: {
          categoria: string
          collaborator_id: string
          id: string
          store_id: string
          valor: number
        }
        Insert: {
          categoria: string
          collaborator_id: string
          id?: string
          store_id: string
          valor?: number
        }
        Update: {
          categoria?: string
          collaborator_id?: string
          id?: string
          store_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "conquista_super_metas_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conquista_super_metas_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      dynamics: {
        Row: {
          created_at: string
          data_fim: string
          data_inicio: string
          descricao: string
          id: string
          meta_valor: number
          metrica: string
          participantes: string[]
          produtos: string[]
          setor_alvo: string
          store_id: string
          titulo: string
        }
        Insert: {
          created_at?: string
          data_fim: string
          data_inicio: string
          descricao?: string
          id?: string
          meta_valor?: number
          metrica?: string
          participantes?: string[]
          produtos?: string[]
          setor_alvo?: string
          store_id: string
          titulo: string
        }
        Update: {
          created_at?: string
          data_fim?: string
          data_inicio?: string
          descricao?: string
          id?: string
          meta_valor?: number
          metrica?: string
          participantes?: string[]
          produtos?: string[]
          setor_alvo?: string
          store_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "dynamics_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      exclusive_brands: {
        Row: {
          created_at: string
          id: string
          palavra: string
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          palavra: string
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          palavra?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exclusive_brands_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      function_icons: {
        Row: {
          function_key: string
          icon_url: string | null
          id: string
          store_id: string
        }
        Insert: {
          function_key: string
          icon_url?: string | null
          id?: string
          store_id: string
        }
        Update: {
          function_key?: string
          icon_url?: string | null
          id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "function_icons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          auto_redistribuir: boolean
          categoria: string
          diaria: number
          id: string
          mensal: number
          metrica: string
          store_id: string
          super_meta: number
          super_meta_auto: boolean
        }
        Insert: {
          auto_redistribuir?: boolean
          categoria: string
          diaria?: number
          id?: string
          mensal?: number
          metrica?: string
          store_id: string
          super_meta?: number
          super_meta_auto?: boolean
        }
        Update: {
          auto_redistribuir?: boolean
          categoria?: string
          diaria?: number
          id?: string
          mensal?: number
          metrica?: string
          store_id?: string
          super_meta?: number
          super_meta_auto?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "goals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      individual_goals: {
        Row: {
          categoria: string
          collaborator_id: string
          id: string
          participa: boolean
          store_id: string
          valor_meta: number
          valor_super: number
        }
        Insert: {
          categoria: string
          collaborator_id: string
          id?: string
          participa?: boolean
          store_id: string
          valor_meta?: number
          valor_super?: number
        }
        Update: {
          categoria?: string
          collaborator_id?: string
          id?: string
          participa?: boolean
          store_id?: string
          valor_meta?: number
          valor_super?: number
        }
        Relationships: [
          {
            foreignKeyName: "individual_goals_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_goals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          categoria: string
          created_at: string
          id: string
          nome: string
          padrao: string | null
          palavras: string[]
          store_id: string
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          nome: string
          padrao?: string | null
          palavras?: string[]
          store_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          nome?: string
          padrao?: string | null
          palavras?: string[]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          collaborator_id: string | null
          created_at: string
          id: string
          role: string
          store_id: string
        }
        Insert: {
          collaborator_id?: string | null
          created_at?: string
          id: string
          role: string
          store_id: string
        }
        Update: {
          collaborator_id?: string | null
          created_at?: string
          id?: string
          role?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          classification_tier: number | null
          codigo: string | null
          created_at: string
          data_iso: string | null
          data_raw: string | null
          grupo: string | null
          id: string
          import_id: string | null
          matricula: string
          produto: string
          qtd: number
          store_id: string
          valor: number
          vendedor: string
        }
        Insert: {
          classification_tier?: number | null
          codigo?: string | null
          created_at?: string
          data_iso?: string | null
          data_raw?: string | null
          grupo?: string | null
          id?: string
          import_id?: string | null
          matricula: string
          produto: string
          qtd?: number
          store_id: string
          valor?: number
          vendedor?: string
        }
        Update: {
          classification_tier?: number | null
          codigo?: string | null
          created_at?: string
          data_iso?: string | null
          data_raw?: string | null
          grupo?: string | null
          id?: string
          import_id?: string | null
          matricula?: string
          produto?: string
          qtd?: number
          store_id?: string
          valor?: number
          vendedor?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "sales_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_archive_categories: {
        Row: {
          categoria: string
          created_at: string
          id: string
          itens_total: number
          store_id: string
          valor_total: number
          vendas_total: number
          year_month: string
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          itens_total?: number
          store_id: string
          valor_total?: number
          vendas_total?: number
          year_month: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          itens_total?: number
          store_id?: string
          valor_total?: number
          vendas_total?: number
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_archive_categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_archive_collaborators: {
        Row: {
          created_at: string
          id: string
          itens_total: number
          matricula: string
          nome: string
          store_id: string
          valor_total: number
          year_month: string
        }
        Insert: {
          created_at?: string
          id?: string
          itens_total?: number
          matricula: string
          nome: string
          store_id: string
          valor_total?: number
          year_month: string
        }
        Update: {
          created_at?: string
          id?: string
          itens_total?: number
          matricula?: string
          nome?: string
          store_id?: string
          valor_total?: number
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_archive_collaborators_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_imports: {
        Row: {
          created_at: string
          duplicate_count: number
          file_hash: string
          file_name: string
          id: string
          row_count: number
          store_id: string
        }
        Insert: {
          created_at?: string
          duplicate_count?: number
          file_hash: string
          file_name: string
          id?: string
          row_count?: number
          store_id: string
        }
        Update: {
          created_at?: string
          duplicate_count?: number
          file_hash?: string
          file_name?: string
          id?: string
          row_count?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_imports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      special_lists: {
        Row: {
          created_at: string
          id: string
          nome: string
          palavras: string[]
          store_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          palavras?: string[]
          store_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          palavras?: string[]
          store_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_lists_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          bio_weights: Json
          brilho: number
          cor_destaque: string
          feriados_datas: string[]
          horario: Json
          meta_geral_fallback: number
          modelo_ranking: string
          ranking_moderno: boolean
          store_id: string
          tema: string
        }
        Insert: {
          bio_weights?: Json
          brilho?: number
          cor_destaque?: string
          feriados_datas?: string[]
          horario?: Json
          meta_geral_fallback?: number
          modelo_ranking?: string
          ranking_moderno?: boolean
          store_id: string
          tema?: string
        }
        Update: {
          bio_weights?: Json
          brilho?: number
          cor_destaque?: string
          feriados_datas?: string[]
          horario?: Json
          meta_geral_fallback?: number
          modelo_ranking?: string
          ranking_moderno?: boolean
          store_id?: string
          tema?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          admin_email: string
          created_at: string
          id: string
          logo_url: string | null
          mensagem: string
          nome_equipe: string
          nome_loja: string
          numero_loja: string
          whatsapp: string
          whatsapp_group_link: string
        }
        Insert: {
          admin_email: string
          created_at?: string
          id?: string
          logo_url?: string | null
          mensagem?: string
          nome_equipe?: string
          nome_loja?: string
          numero_loja?: string
          whatsapp?: string
          whatsapp_group_link?: string
        }
        Update: {
          admin_email?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          mensagem?: string
          nome_equipe?: string
          nome_loja?: string
          numero_loja?: string
          whatsapp?: string
          whatsapp_group_link?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_collaborator_id: { Args: never; Returns: string }
      current_collaborator_matricula: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      current_store_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      remove_inactive_collaborators: { Args: never; Returns: undefined }
      resolve_collaborator_email: {
        Args: { p_matricula: string }
        Returns: string
      }
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
