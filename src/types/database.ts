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
      category_labels: {
        Row: {
          category_key: string
          id: string
          label: string
          store_id: string
        }
        Insert: {
          category_key: string
          id?: string
          label: string
          store_id: string
        }
        Update: {
          category_key?: string
          id?: string
          label?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_labels_store_id_fkey"
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
          conquista_tiers: number[] | null
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
          conquista_tiers?: number[] | null
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
          conquista_tiers?: number[] | null
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
      client_error_reports: {
        Row: {
          created_at: string
          id: string
          message: string
          profile_id: string | null
          stack: string | null
          store_id: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          profile_id?: string | null
          stack?: string | null
          store_id: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          profile_id?: string | null
          stack?: string | null
          store_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_error_reports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_error_reports_store_id_fkey"
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
          categorias_visitante: string[]
          celular: string | null
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
          categorias_visitante?: string[]
          celular?: string | null
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
          categorias_visitante?: string[]
          celular?: string | null
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
          mostrar_logo: boolean
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
          mostrar_logo?: boolean
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
          mostrar_logo?: boolean
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
          categorias_produtos: Json
          created_at: string
          data_fim: string
          data_inicio: string
          descricao: string
          id: string
          medida_label: string
          meta_modo: string
          meta_valor: number
          metas_individuais: Json
          metrica: string
          multiplicador_ativo: boolean
          multiplicador_valor: number
          participantes: string[]
          produtos: string[]
          setor_alvo: string
          store_id: string
          titulo: string
        }
        Insert: {
          categorias_produtos?: Json
          created_at?: string
          data_fim: string
          data_inicio: string
          descricao?: string
          id?: string
          medida_label?: string
          meta_modo?: string
          meta_valor?: number
          metas_individuais?: Json
          metrica?: string
          multiplicador_ativo?: boolean
          multiplicador_valor?: number
          participantes?: string[]
          produtos?: string[]
          setor_alvo?: string
          store_id: string
          titulo: string
        }
        Update: {
          categorias_produtos?: Json
          created_at?: string
          data_fim?: string
          data_inicio?: string
          descricao?: string
          id?: string
          medida_label?: string
          meta_modo?: string
          meta_valor?: number
          metas_individuais?: Json
          metrica?: string
          multiplicador_ativo?: boolean
          multiplicador_valor?: number
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
      import_field_overrides: {
        Row: {
          field: string
          id: string
          store_id: string
          terms: string[]
        }
        Insert: {
          field: string
          id?: string
          store_id: string
          terms?: string[]
        }
        Update: {
          field?: string
          id?: string
          store_id?: string
          terms?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "import_field_overrides_store_id_fkey"
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
      notification_schedules: {
        Row: {
          ativo: boolean
          created_at: string
          dias: Json
          hora: string
          id: string
          last_sent_date: string | null
          store_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dias?: Json
          hora: string
          id?: string
          last_sent_date?: string | null
          store_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dias?: Json
          hora?: string
          id?: string
          last_sent_date?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_schedules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience: string
          body: string
          collaborator_id: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          sent_at: string | null
          store_id: string
          title: string
        }
        Insert: {
          audience?: string
          body: string
          collaborator_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          sent_at?: string | null
          store_id: string
          title: string
        }
        Update: {
          audience?: string
          body?: string
          collaborator_id?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          sent_at?: string | null
          store_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      password_requests: {
        Row: {
          collaborator_id: string
          created_at: string
          id: string
          resolved_at: string | null
          status: string
          store_id: string
        }
        Insert: {
          collaborator_id: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          store_id: string
        }
        Update: {
          collaborator_id?: string
          created_at?: string
          id?: string
          resolved_at?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_requests_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "password_requests_store_id_fkey"
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
      push_tokens: {
        Row: {
          collaborator_id: string
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
        }
        Insert: {
          collaborator_id: string
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
        }
        Update: {
          collaborator_id?: string
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          hit_at: string
          id: number
        }
        Insert: {
          bucket: string
          hit_at?: string
          id?: never
        }
        Update: {
          bucket?: string
          hit_at?: string
          id?: never
        }
        Relationships: []
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
          inserted_rows: number
          invalid_date_count: number
          processing_ms: number | null
          row_count: number
          store_id: string
          unclassified_count: number
          unmatched_seller_count: number
        }
        Insert: {
          created_at?: string
          duplicate_count?: number
          file_hash: string
          file_name: string
          id?: string
          inserted_rows?: number
          invalid_date_count?: number
          processing_ms?: number | null
          row_count?: number
          store_id: string
          unclassified_count?: number
          unmatched_seller_count?: number
        }
        Update: {
          created_at?: string
          duplicate_count?: number
          file_hash?: string
          file_name?: string
          id?: string
          inserted_rows?: number
          invalid_date_count?: number
          processing_ms?: number | null
          row_count?: number
          store_id?: string
          unclassified_count?: number
          unmatched_seller_count?: number
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
          notify_on_sales_import: boolean
          ranking_moderno: boolean
          ranking_podium_bg_url: string | null
          ranking_podium_spots: Json | null
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
          notify_on_sales_import?: boolean
          ranking_moderno?: boolean
          ranking_podium_bg_url?: string | null
          ranking_podium_spots?: Json | null
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
          notify_on_sales_import?: boolean
          ranking_moderno?: boolean
          ranking_podium_bg_url?: string | null
          ranking_podium_spots?: Json | null
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
      _rate_limit_client_ip: { Args: never; Returns: string }
      archive_old_sales: { Args: never; Returns: Json }
      archive_old_sales_for_store: {
        Args: { cutoff: string; store_id_param: string }
        Returns: Json
      }
      category_display_label: { Args: { categoria: string }; Returns: string }
      category_display_order: { Args: { categoria: string }; Returns: number }
      check_rate_limit: {
        Args: { p_bucket: string; p_max_hits: number; p_window_seconds: number }
        Returns: boolean
      }
      classify_bio: {
        Args: { produto: string; store_id_param: string }
        Returns: string
      }
      current_collaborator_id: { Args: never; Returns: string }
      current_collaborator_matricula: { Args: never; Returns: string }
      current_role: { Args: never; Returns: string }
      current_store_id: { Args: never; Returns: string }
      dispatch_import_notification_for_collaborator: {
        Args: {
          apelido_param: string
          chip_keywords: string[]
          collaborator_id_param: string
          dia: string
          levmel_keywords: string[]
          matricula_param: string
          nome_param: string
          setor_param: string
          store_id_param: string
        }
        Returns: undefined
      }
      dispatch_sales_notification_for_collaborator: {
        Args: {
          chip_keywords: string[]
          collaborator_id_param: string
          hoje: string
          levmel_keywords: string[]
          matricula_param: string
          store_id_param: string
        }
        Returns: undefined
      }
      dispatch_sales_notifications: { Args: never; Returns: Json }
      dispatch_sales_notifications_for_schedule: {
        Args: {
          schedule_row: Database["public"]["Tables"]["notification_schedules"]["Row"]
        }
        Returns: undefined
      }
      dispatch_todays_import_notifications: {
        Args: { p_import_id: string }
        Returns: undefined
      }
      format_money_brl: { Args: { v: number }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      list_store_collaborators: {
        Args: never
        Returns: {
          apelido: string
          categorias_visitante: string[]
          celular: string
          created_at: string
          data_nascimento: string
          foto_conquista_url: string
          foto_url: string
          id: string
          matricula: string
          meta_individual: number
          nome: string
          setor: string
          store_id: string
        }[]
      }
      matches_special_list: {
        Args: { keywords: string[]; produto: string }
        Returns: boolean
      }
      mobile_category_totals: {
        Args: { from_iso: string; to_iso: string }
        Returns: {
          categoria: string
          itens_total: number
          matricula: string
          valor_total: number
        }[]
      }
      normalize_text: { Args: { input: string }; Returns: string }
      notify_admin_birthdays: { Args: never; Returns: undefined }
      remove_inactive_collaborators: { Args: never; Returns: undefined }
      resolve_collaborator_email: {
        Args: { p_matricula: string }
        Returns: string
      }
      sales_month_totals: {
        Args: never
        Returns: {
          itens_total: number
          valor_total: number
          vendas_total: number
          year_month: string
        }[]
      }
      sector_base_categories: {
        Args: { setor_param: string }
        Returns: string[]
      }
      update_own_collaborator_photo: {
        Args: { new_foto_conquista_url: string | null; new_foto_url: string | null }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
