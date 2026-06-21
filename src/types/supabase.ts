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
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      approval_flow_steps: {
        Row: {
          assigned_user_id: string | null
          created_at: string
          flow_id: string
          id: string
          label: string
          order: number
          required_role: string
          threshold_cents: number
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          flow_id: string
          id?: string
          label?: string
          order: number
          required_role: string
          threshold_cents?: number
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string
          flow_id?: string
          id?: string
          label?: string
          order?: number
          required_role?: string
          threshold_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_flow_steps_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_flow_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "approval_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_flows: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          entity_type: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type: string
          id?: string
          name: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          entity_type?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_flows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          approver_id: string | null
          approver_name: string
          approver_role: string
          comment: string | null
          created_at: string
          decided_at: string | null
          entity_id: string
          entity_type: string
          flow_step_id: string | null
          id: string
          order: number
          org_id: string
          status: string
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          approver_name?: string
          approver_role?: string
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          entity_id: string
          entity_type: string
          flow_step_id?: string | null
          id?: string
          order?: number
          org_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          approver_name?: string
          approver_role?: string
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          entity_id?: string
          entity_type?: string
          flow_step_id?: string | null
          id?: string
          order?: number
          org_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_flow_step_id_fkey"
            columns: ["flow_step_id"]
            isOneToOne: false
            referencedRelation: "approval_flow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_parts: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          org_id: string
          part_id: string
          part_name: string
          part_number: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          part_id: string
          part_name?: string
          part_number?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          part_id?: string
          part_name?: string
          part_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_parts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_parts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          air_filter_part_number: string | null
          asset_tag: string
          asset_type: string
          assigned_crew: string | null
          barcode: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division: string | null
          engine_model: string | null
          engine_serial_number: string | null
          equipment_number: string | null
          finance_institution: string | null
          id: string
          location: string | null
          make: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          oil_filter_part_number: string | null
          org_id: string
          parent_asset_id: string | null
          payment_method: string | null
          photo_url: string | null
          purchase_date: string | null
          purchase_price: number | null
          purchase_vendor_id: string | null
          purchase_vendor_name: string | null
          serial_number: string | null
          spark_plug_part_number: string | null
          status: string
          updated_at: string
          year: number | null
        }
        Insert: {
          air_filter_part_number?: string | null
          asset_tag?: string
          asset_type?: string
          assigned_crew?: string | null
          barcode?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division?: string | null
          engine_model?: string | null
          engine_serial_number?: string | null
          equipment_number?: string | null
          finance_institution?: string | null
          id?: string
          location?: string | null
          make?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          oil_filter_part_number?: string | null
          org_id?: string
          parent_asset_id?: string | null
          payment_method?: string | null
          photo_url?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          purchase_vendor_id?: string | null
          purchase_vendor_name?: string | null
          serial_number?: string | null
          spark_plug_part_number?: string | null
          status?: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          air_filter_part_number?: string | null
          asset_tag?: string
          asset_type?: string
          assigned_crew?: string | null
          barcode?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division?: string | null
          engine_model?: string | null
          engine_serial_number?: string | null
          equipment_number?: string | null
          finance_institution?: string | null
          id?: string
          location?: string | null
          make?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          oil_filter_part_number?: string | null
          org_id?: string
          parent_asset_id?: string | null
          payment_method?: string | null
          photo_url?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          purchase_vendor_id?: string | null
          purchase_vendor_name?: string | null
          serial_number?: string | null
          spark_plug_part_number?: string | null
          status?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_purchase_vendor_id_fkey"
            columns: ["purchase_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          file_name: string
          file_size: number
          file_type: string
          id: string
          org_id: string
          record_id: string
          record_type: string
          storage_path: string
          updated_at: string
          uploaded_by_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_name: string
          file_size?: number
          file_type?: string
          id?: string
          org_id?: string
          record_id: string
          record_type: string
          storage_path: string
          updated_at?: string
          uploaded_by_name?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          org_id?: string
          record_id?: string
          record_type?: string
          storage_path?: string
          updated_at?: string
          uploaded_by_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_by_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          field_changed: string | null
          id: string
          new_value: string | null
          old_value: string | null
          org_id: string
          record_id: string
          record_type: string
          updated_at: string
        }
        Insert: {
          action: string
          changed_by_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          org_id?: string
          record_id: string
          record_type: string
          updated_at?: string
        }
        Update: {
          action?: string
          changed_by_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          field_changed?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          org_id?: string
          record_id?: string
          record_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          enabled: boolean
          id: string
          last_fired_at: string | null
          last_fired_value: number | null
          name: string
          org_id: string
          pending_reset: boolean
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          enabled?: boolean
          id?: string
          last_fired_at?: string | null
          last_fired_value?: number | null
          name: string
          org_id: string
          pending_reset?: boolean
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          enabled?: boolean
          id?: string
          last_fired_at?: string | null
          last_fired_value?: number | null
          name?: string
          org_id?: string
          pending_reset?: boolean
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avb_weeks: {
        Row: {
          created_at: string
          data: Json
          id: string
          org_id: string
          updated_at: string
          week_end: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          org_id: string
          updated_at?: string
          week_end: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          org_id?: string
          updated_at?: string
          week_end?: string
        }
        Relationships: [
          {
            foreignKeyName: "avb_weeks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_activity: {
        Row: {
          activity_type: string
          amount_cents: number | null
          body: string | null
          client_id: string
          created_at: string
          created_by: string | null
          delivered_at: string | null
          id: string
          occurred_at: string
          org_id: string
          ref_id: string | null
          ref_table: string | null
          sent_to: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          activity_type: string
          amount_cents?: number | null
          body?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          id?: string
          occurred_at?: string
          org_id?: string
          ref_id?: string | null
          ref_table?: string | null
          sent_to?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          activity_type?: string
          amount_cents?: number | null
          body?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          id?: string
          occurred_at?: string
          org_id?: string
          ref_id?: string | null
          ref_table?: string | null
          sent_to?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_activity_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_activity_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          contact_type: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          is_primary: boolean
          last_name: string | null
          notes: string | null
          ok_to_email: boolean
          org_id: string
          phone: string | null
          phone_type: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          contact_type?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_primary?: boolean
          last_name?: string | null
          notes?: string | null
          ok_to_email?: boolean
          org_id?: string
          phone?: string | null
          phone_type?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          contact_type?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_primary?: boolean
          last_name?: string | null
          notes?: string | null
          ok_to_email?: boolean
          org_id?: string
          phone?: string | null
          phone_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_properties: {
        Row: {
          address: string | null
          city: string | null
          client_id: string
          country: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          gate_lock_code: string | null
          gross_sqft: number | null
          id: string
          is_master: boolean
          linear_ft_edging: number | null
          linear_ft_perimeter: number | null
          map_code: string | null
          mulch_bed_sqft: number | null
          name: string | null
          notes_to_crew: string | null
          org_id: string
          parking_lot_sqft: number | null
          state: string | null
          turf_sqft: number | null
          updated_at: string
          yards_of_mulch: number | null
          zip: string | null
          zones: Json
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_id: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gate_lock_code?: string | null
          gross_sqft?: number | null
          id?: string
          is_master?: boolean
          linear_ft_edging?: number | null
          linear_ft_perimeter?: number | null
          map_code?: string | null
          mulch_bed_sqft?: number | null
          name?: string | null
          notes_to_crew?: string | null
          org_id?: string
          parking_lot_sqft?: number | null
          state?: string | null
          turf_sqft?: number | null
          updated_at?: string
          yards_of_mulch?: number | null
          zip?: string | null
          zones?: Json
        }
        Update: {
          address?: string | null
          city?: string | null
          client_id?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          gate_lock_code?: string | null
          gross_sqft?: number | null
          id?: string
          is_master?: boolean
          linear_ft_edging?: number | null
          linear_ft_perimeter?: number | null
          map_code?: string | null
          mulch_bed_sqft?: number | null
          name?: string | null
          notes_to_crew?: string | null
          org_id?: string
          parking_lot_sqft?: number | null
          state?: string | null
          turf_sqft?: number | null
          updated_at?: string
          yards_of_mulch?: number | null
          zip?: string | null
          zones?: Json
        }
        Relationships: [
          {
            foreignKeyName: "client_properties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_properties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tags: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          tag: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          tag: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_type: string
          balance_credits_cents: number
          balance_outstanding_cents: number
          balance_prepay_cents: number
          balance_uninvoiced_cents: number
          billing_address: string | null
          billing_city: string | null
          billing_country: string | null
          billing_email: string | null
          billing_state: string | null
          billing_terms: string | null
          billing_zip: string | null
          client_since: string | null
          created_at: string
          created_by: string | null
          default_tax_rate_bps: number
          default_terms: string
          deleted_at: string | null
          display_name: string
          gate_lock_code: string | null
          gross_sqft: number | null
          id: string
          invoice_delivery: string | null
          invoice_frequency: string | null
          is_taxable: boolean
          linear_ft_edging: number | null
          linear_ft_perimeter: number | null
          map_code: string | null
          mulch_bed_sqft: number | null
          notes_to_crew: string | null
          ok_to_email: boolean
          org_id: string
          parent_client_id: string | null
          payment_method: string | null
          primary_email: string | null
          primary_phone: string | null
          priority: string | null
          referred_by: string | null
          sales_rep_id: string | null
          sales_tax_code: string | null
          source: string | null
          status: string
          turf_sqft: number | null
          updated_at: string
          yards_of_mulch: number | null
        }
        Insert: {
          account_type?: string
          balance_credits_cents?: number
          balance_outstanding_cents?: number
          balance_prepay_cents?: number
          balance_uninvoiced_cents?: number
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_email?: string | null
          billing_state?: string | null
          billing_terms?: string | null
          billing_zip?: string | null
          client_since?: string | null
          created_at?: string
          created_by?: string | null
          default_tax_rate_bps?: number
          default_terms?: string
          deleted_at?: string | null
          display_name: string
          gate_lock_code?: string | null
          gross_sqft?: number | null
          id?: string
          invoice_delivery?: string | null
          invoice_frequency?: string | null
          is_taxable?: boolean
          linear_ft_edging?: number | null
          linear_ft_perimeter?: number | null
          map_code?: string | null
          mulch_bed_sqft?: number | null
          notes_to_crew?: string | null
          ok_to_email?: boolean
          org_id?: string
          parent_client_id?: string | null
          payment_method?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          priority?: string | null
          referred_by?: string | null
          sales_rep_id?: string | null
          sales_tax_code?: string | null
          source?: string | null
          status?: string
          turf_sqft?: number | null
          updated_at?: string
          yards_of_mulch?: number | null
        }
        Update: {
          account_type?: string
          balance_credits_cents?: number
          balance_outstanding_cents?: number
          balance_prepay_cents?: number
          balance_uninvoiced_cents?: number
          billing_address?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_email?: string | null
          billing_state?: string | null
          billing_terms?: string | null
          billing_zip?: string | null
          client_since?: string | null
          created_at?: string
          created_by?: string | null
          default_tax_rate_bps?: number
          default_terms?: string
          deleted_at?: string | null
          display_name?: string
          gate_lock_code?: string | null
          gross_sqft?: number | null
          id?: string
          invoice_delivery?: string | null
          invoice_frequency?: string | null
          is_taxable?: boolean
          linear_ft_edging?: number | null
          linear_ft_perimeter?: number | null
          map_code?: string | null
          mulch_bed_sqft?: number | null
          notes_to_crew?: string | null
          ok_to_email?: boolean
          org_id?: string
          parent_client_id?: string | null
          payment_method?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          priority?: string | null
          referred_by?: string | null
          sales_rep_id?: string | null
          sales_tax_code?: string | null
          source?: string | null
          status?: string
          turf_sqft?: number | null
          updated_at?: string
          yards_of_mulch?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          org_id: string
          record_id: string
          record_type: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string
          body: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          record_id: string
          record_type: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          record_id?: string
          record_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contract_notes: {
        Row: {
          body: string
          contract_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          org_id: string
          updated_at: string
        }
        Insert: {
          body: string
          contract_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          body?: string
          contract_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contract_notes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "crm_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contract_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contracts: {
        Row: {
          auto_generate: boolean
          auto_renew: boolean
          bill_month_in_advance: boolean
          billing_day_of_month: number
          billing_frequency: string
          client_id: string
          created_at: string
          created_by: string | null
          default_service: string | null
          deleted_at: string | null
          end_date: string | null
          estimate_id: string | null
          id: string
          include_sub_properties: boolean
          invoice_line_items: Json
          is_active: boolean
          last_billed_date: string | null
          monthly_amount_cents: number
          monthly_amounts: Json
          notes: string | null
          org_id: string
          payment_type: string | null
          po_number: string | null
          sales_rep: string | null
          signed_at: string | null
          signed_by: string | null
          source: string | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          auto_generate?: boolean
          auto_renew?: boolean
          bill_month_in_advance?: boolean
          billing_day_of_month?: number
          billing_frequency?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          default_service?: string | null
          deleted_at?: string | null
          end_date?: string | null
          estimate_id?: string | null
          id?: string
          include_sub_properties?: boolean
          invoice_line_items?: Json
          is_active?: boolean
          last_billed_date?: string | null
          monthly_amount_cents?: number
          monthly_amounts?: Json
          notes?: string | null
          org_id?: string
          payment_type?: string | null
          po_number?: string | null
          sales_rep?: string | null
          signed_at?: string | null
          signed_by?: string | null
          source?: string | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          auto_generate?: boolean
          auto_renew?: boolean
          bill_month_in_advance?: boolean
          billing_day_of_month?: number
          billing_frequency?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          default_service?: string | null
          deleted_at?: string | null
          end_date?: string | null
          estimate_id?: string | null
          id?: string
          include_sub_properties?: boolean
          invoice_line_items?: Json
          is_active?: boolean
          last_billed_date?: string | null
          monthly_amount_cents?: number
          monthly_amounts?: Json
          notes?: string | null
          org_id?: string
          payment_type?: string | null
          po_number?: string | null
          sales_rep?: string | null
          signed_at?: string | null
          signed_by?: string | null
          source?: string | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contracts_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_crew_members: {
        Row: {
          created_at: string
          crew_id: string
          days_of_week: number[]
          employee_id: string | null
          id: string
          is_foreman: boolean
          name: string
          org_id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          crew_id: string
          days_of_week?: number[]
          employee_id?: string | null
          id?: string
          is_foreman?: boolean
          name: string
          org_id?: string
          role?: string | null
        }
        Update: {
          created_at?: string
          crew_id?: string
          days_of_week?: number[]
          employee_id?: string | null
          id?: string
          is_foreman?: boolean
          name?: string
          org_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_crew_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crm_crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_crew_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "crm_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_crew_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_crews: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          foreman_id: string | null
          id: string
          is_active: boolean
          map_codes: string | null
          map_icon_color: string | null
          name: string
          org_id: string
          route_sheet_format: string | null
          show_in_calendar: boolean
          starting_address: string | null
          starting_city: string | null
          starting_lat: number | null
          starting_lng: number | null
          starting_state: string | null
          starting_zip: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          foreman_id?: string | null
          id?: string
          is_active?: boolean
          map_codes?: string | null
          map_icon_color?: string | null
          name: string
          org_id?: string
          route_sheet_format?: string | null
          show_in_calendar?: boolean
          starting_address?: string | null
          starting_city?: string | null
          starting_lat?: number | null
          starting_lng?: number | null
          starting_state?: string | null
          starting_zip?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          foreman_id?: string | null
          id?: string
          is_active?: boolean
          map_codes?: string | null
          map_icon_color?: string | null
          name?: string
          org_id?: string
          route_sheet_format?: string | null
          show_in_calendar?: boolean
          starting_address?: string | null
          starting_city?: string | null
          starting_lat?: number | null
          starting_lng?: number | null
          starting_state?: string | null
          starting_zip?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_crews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_crews_foreman_id_fkey"
            columns: ["foreman_id"]
            isOneToOne: false
            referencedRelation: "crm_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_crews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_employees: {
        Row: {
          address: string | null
          applicator_license: string | null
          birth_date: string | null
          cell_phone: string | null
          citizenship: string | null
          city: string | null
          commission_pct: number
          compensation_type: string | null
          covered_by_insurance: boolean
          created_at: string
          created_by: string | null
          crm_role_id: string | null
          date_hired: string | null
          date_released: string | null
          deleted_at: string | null
          driver_license: string | null
          eligible_overtime: boolean
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          employment_status: string
          field_time_clock: boolean
          first_name: string
          hourly_rate_cents: number
          i9_expiration_date: string | null
          i9_number: string | null
          id: string
          insurance_eligibility: string | null
          is_active: boolean
          is_certified_driver: boolean
          is_sales_rep: boolean
          last_name: string
          last_pay_raise_cents: number
          last_pay_raise_date: string | null
          license_expiration: string | null
          manager_id: string | null
          map_codes: string | null
          map_icon_color: string | null
          marital_status: string | null
          middle_initial: string | null
          notes: string | null
          num_dependants: number
          office_time_clock: boolean
          org_id: string
          overtime_rate_cents: number
          pager: string | null
          payment_frequency: string | null
          phone: string | null
          print_on_check_as: string | null
          reason_for_release: string | null
          rehire_date: string | null
          resource_code: string | null
          resource_pin: string | null
          resource_tags: string[] | null
          route_sheet_format: string | null
          send_text_alerts: boolean
          show_in_calendar: boolean
          show_in_selection: boolean
          sick_days: number
          spouse_name: string | null
          spouse_phone: string | null
          starting_address: string | null
          starting_city: string | null
          starting_lat: number | null
          starting_lng: number | null
          starting_state: string | null
          starting_zip: string | null
          state: string | null
          updated_at: string
          user_id: string | null
          user_role: string | null
          user_type: string
          vacation_days: number
          zip: string | null
        }
        Insert: {
          address?: string | null
          applicator_license?: string | null
          birth_date?: string | null
          cell_phone?: string | null
          citizenship?: string | null
          city?: string | null
          commission_pct?: number
          compensation_type?: string | null
          covered_by_insurance?: boolean
          created_at?: string
          created_by?: string | null
          crm_role_id?: string | null
          date_hired?: string | null
          date_released?: string | null
          deleted_at?: string | null
          driver_license?: string | null
          eligible_overtime?: boolean
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employment_status?: string
          field_time_clock?: boolean
          first_name: string
          hourly_rate_cents?: number
          i9_expiration_date?: string | null
          i9_number?: string | null
          id?: string
          insurance_eligibility?: string | null
          is_active?: boolean
          is_certified_driver?: boolean
          is_sales_rep?: boolean
          last_name: string
          last_pay_raise_cents?: number
          last_pay_raise_date?: string | null
          license_expiration?: string | null
          manager_id?: string | null
          map_codes?: string | null
          map_icon_color?: string | null
          marital_status?: string | null
          middle_initial?: string | null
          notes?: string | null
          num_dependants?: number
          office_time_clock?: boolean
          org_id: string
          overtime_rate_cents?: number
          pager?: string | null
          payment_frequency?: string | null
          phone?: string | null
          print_on_check_as?: string | null
          reason_for_release?: string | null
          rehire_date?: string | null
          resource_code?: string | null
          resource_pin?: string | null
          resource_tags?: string[] | null
          route_sheet_format?: string | null
          send_text_alerts?: boolean
          show_in_calendar?: boolean
          show_in_selection?: boolean
          sick_days?: number
          spouse_name?: string | null
          spouse_phone?: string | null
          starting_address?: string | null
          starting_city?: string | null
          starting_lat?: number | null
          starting_lng?: number | null
          starting_state?: string | null
          starting_zip?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
          user_role?: string | null
          user_type?: string
          vacation_days?: number
          zip?: string | null
        }
        Update: {
          address?: string | null
          applicator_license?: string | null
          birth_date?: string | null
          cell_phone?: string | null
          citizenship?: string | null
          city?: string | null
          commission_pct?: number
          compensation_type?: string | null
          covered_by_insurance?: boolean
          created_at?: string
          created_by?: string | null
          crm_role_id?: string | null
          date_hired?: string | null
          date_released?: string | null
          deleted_at?: string | null
          driver_license?: string | null
          eligible_overtime?: boolean
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employment_status?: string
          field_time_clock?: boolean
          first_name?: string
          hourly_rate_cents?: number
          i9_expiration_date?: string | null
          i9_number?: string | null
          id?: string
          insurance_eligibility?: string | null
          is_active?: boolean
          is_certified_driver?: boolean
          is_sales_rep?: boolean
          last_name?: string
          last_pay_raise_cents?: number
          last_pay_raise_date?: string | null
          license_expiration?: string | null
          manager_id?: string | null
          map_codes?: string | null
          map_icon_color?: string | null
          marital_status?: string | null
          middle_initial?: string | null
          notes?: string | null
          num_dependants?: number
          office_time_clock?: boolean
          org_id?: string
          overtime_rate_cents?: number
          pager?: string | null
          payment_frequency?: string | null
          phone?: string | null
          print_on_check_as?: string | null
          reason_for_release?: string | null
          rehire_date?: string | null
          resource_code?: string | null
          resource_pin?: string | null
          resource_tags?: string[] | null
          route_sheet_format?: string | null
          send_text_alerts?: boolean
          show_in_calendar?: boolean
          show_in_selection?: boolean
          sick_days?: number
          spouse_name?: string | null
          spouse_phone?: string | null
          starting_address?: string | null
          starting_city?: string | null
          starting_lat?: number | null
          starting_lng?: number | null
          starting_state?: string | null
          starting_zip?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
          user_role?: string | null
          user_type?: string
          vacation_days?: number
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_employees_crm_role_id_fkey"
            columns: ["crm_role_id"]
            isOneToOne: false
            referencedRelation: "crm_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "crm_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_invoice_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          is_taxable: boolean
          name: string | null
          org_id: string
          qty: number
          rate_cents: number
          sort_order: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          is_taxable?: boolean
          name?: string | null
          org_id?: string
          qty?: number
          rate_cents?: number
          sort_order?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          is_taxable?: boolean
          name?: string | null
          org_id?: string
          qty?: number
          rate_cents?: number
          sort_order?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "crm_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoice_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_invoices: {
        Row: {
          amount_paid_cents: number
          balance_cents: number
          client_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          crm_job_id: string | null
          deleted_at: string | null
          description: string
          discount_cents: number
          due_date: string | null
          estimate_id: string | null
          id: string
          invoice_date: string
          invoice_number: number
          notes: string | null
          org_id: string
          po_number: string | null
          service_address: string | null
          status: string
          subtotal_cents: number
          tax_cents: number
          tax_rate_bps: number
          terms: string | null
          total_cents: number
          updated_at: string
        }
        Insert: {
          amount_paid_cents?: number
          balance_cents?: number
          client_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          crm_job_id?: string | null
          deleted_at?: string | null
          description?: string
          discount_cents?: number
          due_date?: string | null
          estimate_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: number
          notes?: string | null
          org_id?: string
          po_number?: string | null
          service_address?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          terms?: string | null
          total_cents?: number
          updated_at?: string
        }
        Update: {
          amount_paid_cents?: number
          balance_cents?: number
          client_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          crm_job_id?: string | null
          deleted_at?: string | null
          description?: string
          discount_cents?: number
          due_date?: string | null
          estimate_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: number
          notes?: string | null
          org_id?: string
          po_number?: string | null
          service_address?: string | null
          status?: string
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          terms?: string | null
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "crm_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoices_crm_job_id_fkey"
            columns: ["crm_job_id"]
            isOneToOne: false
            referencedRelation: "crm_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoices_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_job_services: {
        Row: {
          assigned_to: string | null
          budgeted_hours: number
          complete_by_date: string | null
          created_at: string
          days_count: number
          id: string
          included: boolean
          job_id: string
          org_id: string
          qty: number | null
          rate_cents: number | null
          service_id: string | null
          service_name: string
          sort_order: number
          start_date: string | null
          start_recurring: string | null
          team_size: number
          time_end: string | null
          time_start: string | null
        }
        Insert: {
          assigned_to?: string | null
          budgeted_hours?: number
          complete_by_date?: string | null
          created_at?: string
          days_count?: number
          id?: string
          included?: boolean
          job_id: string
          org_id?: string
          qty?: number | null
          rate_cents?: number | null
          service_id?: string | null
          service_name: string
          sort_order?: number
          start_date?: string | null
          start_recurring?: string | null
          team_size?: number
          time_end?: string | null
          time_start?: string | null
        }
        Update: {
          assigned_to?: string | null
          budgeted_hours?: number
          complete_by_date?: string | null
          created_at?: string
          days_count?: number
          id?: string
          included?: boolean
          job_id?: string
          org_id?: string
          qty?: number | null
          rate_cents?: number | null
          service_id?: string | null
          service_name?: string
          sort_order?: number
          start_date?: string | null
          start_recurring?: string | null
          team_size?: number
          time_end?: string | null
          time_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_job_services_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "crm_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_services_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "crm_services"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_job_visits: {
        Row: {
          actual_hours: number | null
          assigned_employee_id: string | null
          client_id: string
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          crew_id: string | null
          deleted_at: string | null
          dispatched_at: string | null
          end_time: string | null
          id: string
          invoice_description: string | null
          job_comments: Json
          job_id: string
          men_count: number
          notes_to_client: string | null
          notes_to_crew: string | null
          order_num: number | null
          org_id: string
          priority: number
          qty: number | null
          rate_cents: number | null
          scheduled_date: string
          start_time: string | null
          status: string
          sub_status: string | null
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          assigned_employee_id?: string | null
          client_id: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          dispatched_at?: string | null
          end_time?: string | null
          id?: string
          invoice_description?: string | null
          job_comments?: Json
          job_id: string
          men_count?: number
          notes_to_client?: string | null
          notes_to_crew?: string | null
          order_num?: number | null
          org_id?: string
          priority?: number
          qty?: number | null
          rate_cents?: number | null
          scheduled_date: string
          start_time?: string | null
          status?: string
          sub_status?: string | null
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          assigned_employee_id?: string | null
          client_id?: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          deleted_at?: string | null
          dispatched_at?: string | null
          end_time?: string | null
          id?: string
          invoice_description?: string | null
          job_comments?: Json
          job_id?: string
          men_count?: number
          notes_to_client?: string | null
          notes_to_crew?: string | null
          order_num?: number | null
          org_id?: string
          priority?: number
          qty?: number | null
          rate_cents?: number | null
          scheduled_date?: string
          start_time?: string | null
          status?: string
          sub_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_job_visits_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "crm_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_visits_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crm_crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_visits_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "crm_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_jobs: {
        Row: {
          actual_hours: number | null
          arrival_window_hours: number | null
          budgeted_hours: number | null
          call_ahead: boolean | null
          client_id: string
          completion_notes: string | null
          conflict_days: string[] | null
          contract_id: string | null
          create_work_order: boolean | null
          created_at: string
          created_by: string | null
          crew_id: string | null
          date_sold: string | null
          deleted_at: string | null
          end_date_window: string | null
          end_time: string | null
          id: string
          inch_trigger: number | null
          invoice_separately: boolean | null
          invoice_type: string | null
          is_complete: boolean | null
          job_type: string
          last_service_date: string | null
          man_count: number | null
          map_code: string | null
          notes: string | null
          notes_to_crew: string | null
          org_id: string
          package_discount: string | null
          package_id: string | null
          package_name: string | null
          package_renewal: string | null
          package_step: number | null
          package_total_steps: number | null
          payment_type: string | null
          po_number: string | null
          priority: number | null
          product_total_cents: number
          project_id: string | null
          property_id: string | null
          rate_cents: number | null
          recurrence_end: string | null
          recurrence_rule: string | null
          recurrence_start: string | null
          sales_rep: string | null
          schedule: string | null
          schedule_days: string[] | null
          scheduled_date: string | null
          service_address: string | null
          service_city: string | null
          service_state: string | null
          service_total_cents: number
          service_zip: string | null
          source: string | null
          start_date_window: string | null
          start_time: string | null
          status: string
          sub_status: string | null
          tax_cents: number
          total_cents: number
          updated_at: string
          waiting_list_end: string | null
          waiting_list_start: string | null
          when_to_invoice: string | null
        }
        Insert: {
          actual_hours?: number | null
          arrival_window_hours?: number | null
          budgeted_hours?: number | null
          call_ahead?: boolean | null
          client_id: string
          completion_notes?: string | null
          conflict_days?: string[] | null
          contract_id?: string | null
          create_work_order?: boolean | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          date_sold?: string | null
          deleted_at?: string | null
          end_date_window?: string | null
          end_time?: string | null
          id?: string
          inch_trigger?: number | null
          invoice_separately?: boolean | null
          invoice_type?: string | null
          is_complete?: boolean | null
          job_type?: string
          last_service_date?: string | null
          man_count?: number | null
          map_code?: string | null
          notes?: string | null
          notes_to_crew?: string | null
          org_id?: string
          package_discount?: string | null
          package_id?: string | null
          package_name?: string | null
          package_renewal?: string | null
          package_step?: number | null
          package_total_steps?: number | null
          payment_type?: string | null
          po_number?: string | null
          priority?: number | null
          product_total_cents?: number
          project_id?: string | null
          property_id?: string | null
          rate_cents?: number | null
          recurrence_end?: string | null
          recurrence_rule?: string | null
          recurrence_start?: string | null
          sales_rep?: string | null
          schedule?: string | null
          schedule_days?: string[] | null
          scheduled_date?: string | null
          service_address?: string | null
          service_city?: string | null
          service_state?: string | null
          service_total_cents?: number
          service_zip?: string | null
          source?: string | null
          start_date_window?: string | null
          start_time?: string | null
          status?: string
          sub_status?: string | null
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          waiting_list_end?: string | null
          waiting_list_start?: string | null
          when_to_invoice?: string | null
        }
        Update: {
          actual_hours?: number | null
          arrival_window_hours?: number | null
          budgeted_hours?: number | null
          call_ahead?: boolean | null
          client_id?: string
          completion_notes?: string | null
          conflict_days?: string[] | null
          contract_id?: string | null
          create_work_order?: boolean | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          date_sold?: string | null
          deleted_at?: string | null
          end_date_window?: string | null
          end_time?: string | null
          id?: string
          inch_trigger?: number | null
          invoice_separately?: boolean | null
          invoice_type?: string | null
          is_complete?: boolean | null
          job_type?: string
          last_service_date?: string | null
          man_count?: number | null
          map_code?: string | null
          notes?: string | null
          notes_to_crew?: string | null
          org_id?: string
          package_discount?: string | null
          package_id?: string | null
          package_name?: string | null
          package_renewal?: string | null
          package_step?: number | null
          package_total_steps?: number | null
          payment_type?: string | null
          po_number?: string | null
          priority?: number | null
          product_total_cents?: number
          project_id?: string | null
          property_id?: string | null
          rate_cents?: number | null
          recurrence_end?: string | null
          recurrence_rule?: string | null
          recurrence_start?: string | null
          sales_rep?: string | null
          schedule?: string | null
          schedule_days?: string[] | null
          scheduled_date?: string | null
          service_address?: string | null
          service_city?: string | null
          service_state?: string | null
          service_total_cents?: number
          service_zip?: string | null
          source?: string | null
          start_date_window?: string | null
          start_time?: string | null
          status?: string
          sub_status?: string | null
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          waiting_list_end?: string | null
          waiting_list_start?: string | null
          when_to_invoice?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_jobs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "crm_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_jobs_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crm_crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "client_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_package_services: {
        Row: {
          created_at: string
          id: string
          org_id: string
          package_id: string
          service_id: string | null
          service_name: string
          sort_order: number
          visits_included: number
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          package_id: string
          service_id?: string | null
          service_name: string
          sort_order?: number
          visits_included?: number
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          package_id?: string
          service_id?: string | null
          service_name?: string
          sort_order?: number
          visits_included?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_package_services_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_package_services_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "crm_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_package_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "crm_services"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_packages: {
        Row: {
          code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          monthly_amount_cents: number
          name: string
          org_id: string
          schedule_days: string[]
          schedule_frequency: string
          season_months: number
          updated_at: string
          visits_per_season: number
        }
        Insert: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_amount_cents?: number
          name: string
          org_id: string
          schedule_days?: string[]
          schedule_frequency?: string
          season_months?: number
          updated_at?: string
          visits_per_season?: number
        }
        Update: {
          code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_amount_cents?: number
          name?: string
          org_id?: string
          schedule_days?: string[]
          schedule_frequency?: string
          season_months?: number
          updated_at?: string
          visits_per_season?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_packages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_packages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_payments: {
        Row: {
          amount_cents: number
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          invoice_id: string | null
          is_prepayment: boolean
          memo: string | null
          method: string
          notes: string | null
          org_id: string
          payment_date: string
          reference: string | null
          refunded_amount_cents: number
          unused_amount_cents: number
          updated_at: string
        }
        Insert: {
          amount_cents: number
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          is_prepayment?: boolean
          memo?: string | null
          method?: string
          notes?: string | null
          org_id?: string
          payment_date?: string
          reference?: string | null
          refunded_amount_cents?: number
          unused_amount_cents?: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          is_prepayment?: boolean
          memo?: string | null
          method?: string
          notes?: string | null
          org_id?: string
          payment_date?: string
          reference?: string | null
          refunded_amount_cents?: number
          unused_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "crm_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_reports: {
        Row: {
          created_at: string
          html_content: string | null
          id: string
          metrics: Json | null
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          html_content?: string | null
          id: string
          metrics?: Json | null
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          html_content?: string | null
          id?: string
          metrics?: Json | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_roles: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_service_rate_matrix: {
        Row: {
          budgeted_cost_cents: number
          budgeted_hours: number
          created_at: string
          from_qty: number
          id: string
          org_id: string
          rate_cents: number
          service_id: string
          sort_order: number
          to_qty: number
          updated_at: string
        }
        Insert: {
          budgeted_cost_cents?: number
          budgeted_hours?: number
          created_at?: string
          from_qty: number
          id?: string
          org_id: string
          rate_cents?: number
          service_id: string
          sort_order?: number
          to_qty: number
          updated_at?: string
        }
        Update: {
          budgeted_cost_cents?: number
          budgeted_hours?: number
          created_at?: string
          from_qty?: number
          id?: string
          org_id?: string
          rate_cents?: number
          service_id?: string
          sort_order?: number
          to_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_service_rate_matrix_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_service_rate_matrix_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "crm_services"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_services: {
        Row: {
          category: string
          code: string | null
          created_at: string
          created_by: string | null
          default_b_cost_cents: number
          default_b_hrs: number
          default_rate_cents: number | null
          deleted_at: string | null
          description_on_estimate: string | null
          id: string
          invoice_description: string | null
          is_active: boolean
          is_taxable: boolean
          matrix_tail_cost_cents: number | null
          matrix_tail_every_qty: number | null
          matrix_tail_hours: number | null
          matrix_tail_over_qty: number | null
          matrix_tail_rate_cents: number | null
          name: string
          only_for_estimates: boolean
          org_id: string
          parent_service_id: string | null
          production_rate_sqft_per_hr: number | null
          rate_matrix_calc: string | null
          rate_matrix_field: string | null
          service_mode: string
          show_in_snow_dispatch: boolean
          target_rate_cents: number
          target_rate_with_drive_cents: number
          task_color: string | null
          track_chemicals: boolean
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_b_cost_cents?: number
          default_b_hrs?: number
          default_rate_cents?: number | null
          deleted_at?: string | null
          description_on_estimate?: string | null
          id?: string
          invoice_description?: string | null
          is_active?: boolean
          is_taxable?: boolean
          matrix_tail_cost_cents?: number | null
          matrix_tail_every_qty?: number | null
          matrix_tail_hours?: number | null
          matrix_tail_over_qty?: number | null
          matrix_tail_rate_cents?: number | null
          name: string
          only_for_estimates?: boolean
          org_id?: string
          parent_service_id?: string | null
          production_rate_sqft_per_hr?: number | null
          rate_matrix_calc?: string | null
          rate_matrix_field?: string | null
          service_mode?: string
          show_in_snow_dispatch?: boolean
          target_rate_cents?: number
          target_rate_with_drive_cents?: number
          task_color?: string | null
          track_chemicals?: boolean
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_b_cost_cents?: number
          default_b_hrs?: number
          default_rate_cents?: number | null
          deleted_at?: string | null
          description_on_estimate?: string | null
          id?: string
          invoice_description?: string | null
          is_active?: boolean
          is_taxable?: boolean
          matrix_tail_cost_cents?: number | null
          matrix_tail_every_qty?: number | null
          matrix_tail_hours?: number | null
          matrix_tail_over_qty?: number | null
          matrix_tail_rate_cents?: number | null
          name?: string
          only_for_estimates?: boolean
          org_id?: string
          parent_service_id?: string | null
          production_rate_sqft_per_hr?: number | null
          rate_matrix_calc?: string | null
          rate_matrix_field?: string | null
          service_mode?: string
          show_in_snow_dispatch?: boolean
          target_rate_cents?: number
          target_rate_with_drive_cents?: number
          task_color?: string | null
          track_chemicals?: boolean
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_services_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_services_parent_service_id_fkey"
            columns: ["parent_service_id"]
            isOneToOne: false
            referencedRelation: "crm_services"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ticket_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          link_type: string
          linked_id: string
          linked_label: string | null
          org_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_type: string
          linked_id: string
          linked_label?: string | null
          org_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_type?: string
          linked_id?: string
          linked_label?: string | null
          org_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_ticket_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_ticket_links_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "crm_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tickets: {
        Row: {
          assigned_to: string | null
          body: string | null
          category: string | null
          client_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          org_id: string
          priority: string
          status: string
          subject: string | null
          ticket_number: number
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          body?: string | null
          category?: string | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          priority?: string
          status?: string
          subject?: string | null
          ticket_number?: number
          type?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          body?: string | null
          category?: string | null
          client_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          org_id?: string
          priority?: string
          status?: string
          subject?: string | null
          ticket_number?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_case_expenses: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          damage_case_id: string
          deleted_at: string | null
          description: string
          expense_date: string
          id: string
          org_id: string
          purchase_order_id: string | null
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          damage_case_id: string
          deleted_at?: string | null
          description: string
          expense_date: string
          id?: string
          org_id?: string
          purchase_order_id?: string | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          damage_case_id?: string
          deleted_at?: string | null
          description?: string
          expense_date?: string
          id?: string
          org_id?: string
          purchase_order_id?: string | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_case_expenses_damage_case_id_fkey"
            columns: ["damage_case_id"]
            isOneToOne: false
            referencedRelation: "damage_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_case_expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_case_expenses_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_case_expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      damage_cases: {
        Row: {
          case_number: string
          case_type: string
          created_at: string
          created_by: string | null
          customer_name: string
          date_of_incident: string
          deleted_at: string | null
          description: string
          id: string
          org_id: string
          property_address: string | null
          purchase_order_id: string | null
          resolution_notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          case_number: string
          case_type?: string
          created_at?: string
          created_by?: string | null
          customer_name: string
          date_of_incident: string
          deleted_at?: string | null
          description: string
          id?: string
          org_id?: string
          property_address?: string | null
          purchase_order_id?: string | null
          resolution_notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          case_number?: string
          case_type?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          date_of_incident?: string
          deleted_at?: string | null
          description?: string
          id?: string
          org_id?: string
          property_address?: string | null
          purchase_order_id?: string | null
          resolution_notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "damage_cases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_cases_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_direct_costs: {
        Row: {
          cost_type: string
          created_at: string
          description: string
          estimate_id: string
          id: string
          org_id: string
          overhead_cents: number
          qty: number
          rate_cents: number
          sort_order: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          cost_type?: string
          created_at?: string
          description?: string
          estimate_id: string
          id?: string
          org_id?: string
          overhead_cents?: number
          qty?: number
          rate_cents?: number
          sort_order?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          cost_type?: string
          created_at?: string
          description?: string
          estimate_id?: string
          id?: string
          org_id?: string
          overhead_cents?: number
          qty?: number
          rate_cents?: number
          sort_order?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_direct_costs_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_direct_costs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_line_items: {
        Row: {
          adj_rate_cents: number | null
          budgeted_hours: number
          calc_type: number
          cost_cents: number
          created_at: string
          deleted_at: string | null
          estimate_id: string
          id: string
          margin_bps: number
          markup_bps: number
          org_id: string
          production_rate_sqft_per_hr: number | null
          qty: number
          rate_cents: number
          service_id: string | null
          service_name: string
          sort_order: number
          status: string
          total_budgeted_hours: number
          total_cents: number
          total_cost_cents: number
          unit_type: string | null
          updated_at: string
          visits: number
        }
        Insert: {
          adj_rate_cents?: number | null
          budgeted_hours?: number
          calc_type?: number
          cost_cents?: number
          created_at?: string
          deleted_at?: string | null
          estimate_id: string
          id?: string
          margin_bps?: number
          markup_bps?: number
          org_id?: string
          production_rate_sqft_per_hr?: number | null
          qty?: number
          rate_cents?: number
          service_id?: string | null
          service_name: string
          sort_order?: number
          status?: string
          total_budgeted_hours?: number
          total_cents?: number
          total_cost_cents?: number
          unit_type?: string | null
          updated_at?: string
          visits?: number
        }
        Update: {
          adj_rate_cents?: number | null
          budgeted_hours?: number
          calc_type?: number
          cost_cents?: number
          created_at?: string
          deleted_at?: string | null
          estimate_id?: string
          id?: string
          margin_bps?: number
          markup_bps?: number
          org_id?: string
          production_rate_sqft_per_hr?: number | null
          qty?: number
          rate_cents?: number
          service_id?: string | null
          service_name?: string
          sort_order?: number
          status?: string
          total_budgeted_hours?: number
          total_cents?: number
          total_cost_cents?: number
          unit_type?: string | null
          updated_at?: string
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "crm_services"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_template_items: {
        Row: {
          budgeted_hours: number
          calc_type: number
          created_at: string
          id: string
          org_id: string
          qty: number
          rate_cents: number
          service_id: string | null
          service_name: string
          sort_order: number
          template_id: string
          updated_at: string
          visits: number
        }
        Insert: {
          budgeted_hours?: number
          calc_type?: number
          created_at?: string
          id?: string
          org_id?: string
          qty?: number
          rate_cents?: number
          service_id?: string | null
          service_name: string
          sort_order?: number
          template_id: string
          updated_at?: string
          visits?: number
        }
        Update: {
          budgeted_hours?: number
          calc_type?: number
          created_at?: string
          id?: string
          org_id?: string
          qty?: number
          rate_cents?: number
          service_id?: string | null
          service_name?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_template_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_template_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "crm_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "estimate_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_templates: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          est_document: string
          id: string
          name: string
          org_id: string
          show_discounts: boolean
          show_when: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          est_document?: string
          id?: string
          name: string
          org_id?: string
          show_discounts?: boolean
          show_when?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          est_document?: string
          id?: string
          name?: string
          org_id?: string
          show_discounts?: boolean
          show_when?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          discount_cents: number
          est_document: string
          estimate_date: string
          estimate_number: number
          gross_profit_cents: number
          id: string
          net_profit_cents: number
          notes: string | null
          num_installments: number
          org_id: string
          overhead_cost_cents: number
          overhead_rate_bps: number
          po_number: string | null
          probability_bps: number
          revenue_cents: number
          sales_rep_id: string | null
          show_discounts: boolean
          source: string | null
          stage: string
          subtotal_cents: number
          tax_cents: number
          tax_rate_bps: number
          total_budgeted_hours: number
          total_cents: number
          updated_at: string
          valid_until_date: string | null
          work_order_number: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          discount_cents?: number
          est_document?: string
          estimate_date?: string
          estimate_number?: number
          gross_profit_cents?: number
          id?: string
          net_profit_cents?: number
          notes?: string | null
          num_installments?: number
          org_id?: string
          overhead_cost_cents?: number
          overhead_rate_bps?: number
          po_number?: string | null
          probability_bps?: number
          revenue_cents?: number
          sales_rep_id?: string | null
          show_discounts?: boolean
          source?: string | null
          stage?: string
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          total_budgeted_hours?: number
          total_cents?: number
          updated_at?: string
          valid_until_date?: string | null
          work_order_number?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          discount_cents?: number
          est_document?: string
          estimate_date?: string
          estimate_number?: number
          gross_profit_cents?: number
          id?: string
          net_profit_cents?: number
          notes?: string | null
          num_installments?: number
          org_id?: string
          overhead_cost_cents?: number
          overhead_rate_bps?: number
          po_number?: string | null
          probability_bps?: number
          revenue_cents?: number
          sales_rep_id?: string | null
          show_discounts?: boolean
          source?: string | null
          stage?: string
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          total_budgeted_hours?: number
          total_cents?: number
          updated_at?: string
          valid_until_date?: string | null
          work_order_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          created_at: string
          data: Json
          id: string
          org_id: string
          period_month: string
          record_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          org_id: string
          period_month: string
          record_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          org_id?: string
          period_month?: string
          record_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipt_lines: {
        Row: {
          created_at: string
          id: string
          is_maint_part: boolean
          org_id: string
          part_number: string
          po_line_item_id: string | null
          product_item_name: string
          quantity_ordered: number
          quantity_received: number
          quantity_remaining: number
          receipt_id: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_maint_part?: boolean
          org_id?: string
          part_number?: string
          po_line_item_id?: string | null
          product_item_name?: string
          quantity_ordered?: number
          quantity_received?: number
          quantity_remaining?: number
          receipt_id: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_maint_part?: boolean
          org_id?: string
          part_number?: string
          po_line_item_id?: string | null
          product_item_name?: string
          quantity_ordered?: number
          quantity_received?: number
          quantity_remaining?: number
          receipt_id?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_po_line_item_id_fkey"
            columns: ["po_line_item_id"]
            isOneToOne: false
            referencedRelation: "po_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          grand_total: number
          id: string
          notes: string | null
          org_id: string
          po_number: string
          purchase_order_id: string
          receipt_number: string
          received_at: string
          received_by_id: string | null
          received_by_name: string
          sales_tax: number
          shipping_cost: number
          subtotal: number
          tax_rate_percent: number
          updated_at: string
          vendor_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          org_id?: string
          po_number?: string
          purchase_order_id: string
          receipt_number: string
          received_at?: string
          received_by_id?: string | null
          received_by_name?: string
          sales_tax?: number
          shipping_cost?: number
          subtotal?: number
          tax_rate_percent?: number
          updated_at?: string
          vendor_name?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          org_id?: string
          po_number?: string
          purchase_order_id?: string
          receipt_number?: string
          received_at?: string
          received_by_id?: string | null
          received_by_name?: string
          sales_tax?: number
          shipping_cost?: number
          subtotal?: number
          tax_rate_percent?: number
          updated_at?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_received_by_id_fkey"
            columns: ["received_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          api_key: string | null
          config: Json
          created_at: string
          enabled: boolean
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          org_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          org_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          org_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          asset_id: string | null
          asset_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          linked_work_order_id: string | null
          linked_work_order_number: string | null
          org_id: string
          priority: string
          request_number: string
          requested_by_id: string | null
          requested_by_name: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          asset_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          linked_work_order_id?: string | null
          linked_work_order_number?: string | null
          org_id?: string
          priority?: string
          request_number: string
          requested_by_id?: string | null
          requested_by_name?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          asset_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          linked_work_order_id?: string | null
          linked_work_order_number?: string | null
          org_id?: string
          priority?: string
          request_number?: string
          requested_by_id?: string | null
          requested_by_name?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_linked_work_order_id_fkey"
            columns: ["linked_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meter_readings: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          meter_id: string
          org_id: string
          reading_at: string
          recorded_by_name: string | null
          source: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          meter_id: string
          org_id?: string
          reading_at?: string
          recorded_by_name?: string | null
          source?: string
          updated_at?: string
          value: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          meter_id?: string
          org_id?: string
          reading_at?: string
          recorded_by_name?: string | null
          source?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "meter_readings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_readings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meters: {
        Row: {
          asset_id: string | null
          asset_name: string
          created_at: string
          created_by: string | null
          current_value: number
          deleted_at: string | null
          id: string
          last_reading_at: string | null
          name: string
          org_id: string
          source: string
          unit: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          asset_name?: string
          created_at?: string
          created_by?: string | null
          current_value?: number
          deleted_at?: string | null
          id?: string
          last_reading_at?: string | null
          name: string
          org_id?: string
          source?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          asset_name?: string
          created_at?: string
          created_by?: string | null
          current_value?: number
          deleted_at?: string | null
          id?: string
          last_reading_at?: string | null
          name?: string
          org_id?: string
          source?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notif_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notif_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notif_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          org_id: string
          read: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          org_id: string
          read?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          org_id?: string
          read?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json
          brand_color: string
          cost_method: string
          created_at: string
          customizations: Json
          id: string
          name: string
          plan: string
          portal_enabled: boolean
          slug: string
          tax_rate_percent: number
          updated_at: string
        }
        Insert: {
          address?: Json
          brand_color?: string
          cost_method?: string
          created_at?: string
          customizations?: Json
          id?: string
          name: string
          plan?: string
          portal_enabled?: boolean
          slug: string
          tax_rate_percent?: number
          updated_at?: string
        }
        Update: {
          address?: Json
          brand_color?: string
          cost_method?: string
          created_at?: string
          customizations?: Json
          id?: string
          name?: string
          plan?: string
          portal_enabled?: boolean
          slug?: string
          tax_rate_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      parts: {
        Row: {
          alternate_vendors: Json
          category: string
          cost_layers: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          is_inventory: boolean
          location: string | null
          minimum_stock: number
          name: string
          org_id: string
          parent_part_id: string | null
          part_number: string
          picture_url: string | null
          product_item_id: string | null
          quantity_on_hand: number
          unit_cost: number
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          alternate_vendors?: Json
          category?: string
          cost_layers?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_inventory?: boolean
          location?: string | null
          minimum_stock?: number
          name: string
          org_id?: string
          parent_part_id?: string | null
          part_number?: string
          picture_url?: string | null
          product_item_id?: string | null
          quantity_on_hand?: number
          unit_cost?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          alternate_vendors?: Json
          category?: string
          cost_layers?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_inventory?: boolean
          location?: string | null
          minimum_stock?: number
          name?: string
          org_id?: string
          parent_part_id?: string | null
          part_number?: string
          picture_url?: string | null
          product_item_id?: string | null
          quantity_on_hand?: number
          unit_cost?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_parent_part_id_fkey"
            columns: ["parent_part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "product_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_jobs: {
        Row: {
          address: string
          city: string
          created_at: string
          created_by: string | null
          customer_name: string
          deleted_at: string | null
          id: string
          is_archived: boolean
          name: string
          notes: string | null
          org_id: string
          project_id: string | null
          state: string
          status: string
          updated_at: string
          zip: string
        }
        Insert: {
          address?: string
          city?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          id?: string
          is_archived?: boolean
          name: string
          notes?: string | null
          org_id: string
          project_id?: string | null
          state?: string
          status?: string
          updated_at?: string
          zip?: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          project_id?: string | null
          state?: string
          status?: string
          updated_at?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_schedule_asset_parts: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          part_id: string | null
          part_name: string
          part_number: string
          pm_schedule_asset_id: string
          quantity: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          part_id?: string | null
          part_name?: string
          part_number?: string
          pm_schedule_asset_id: string
          quantity?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          part_id?: string | null
          part_name?: string
          part_number?: string
          pm_schedule_asset_id?: string
          quantity?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_schedule_asset_parts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedule_asset_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedule_asset_parts_pm_schedule_asset_id_fkey"
            columns: ["pm_schedule_asset_id"]
            isOneToOne: false
            referencedRelation: "pm_schedule_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_schedule_assets: {
        Row: {
          asset_id: string
          asset_name: string
          created_at: string
          deleted_at: string | null
          id: string
          org_id: string
          pm_schedule_id: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          asset_name?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          pm_schedule_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          asset_name?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          org_id?: string
          pm_schedule_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_schedule_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedule_assets_pm_schedule_id_fkey"
            columns: ["pm_schedule_id"]
            isOneToOne: false
            referencedRelation: "pm_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_schedule_parts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          org_id: string
          part_id: string | null
          part_name: string
          part_number: string
          pm_schedule_id: string
          quantity: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          part_id?: string | null
          part_name: string
          part_number?: string
          pm_schedule_id: string
          quantity?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          part_id?: string | null
          part_name?: string
          part_number?: string
          pm_schedule_id?: string
          quantity?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_schedule_parts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedule_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedule_parts_pm_schedule_id_fkey"
            columns: ["pm_schedule_id"]
            isOneToOne: false
            referencedRelation: "pm_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_schedules: {
        Row: {
          asset_id: string | null
          asset_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          frequency: string
          id: string
          is_active: boolean
          last_completed_date: string | null
          next_due_date: string
          org_id: string
          title: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          asset_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_completed_date?: string | null
          next_due_date: string
          org_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          asset_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_completed_date?: string | null
          next_due_date?: string
          org_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      po_line_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          org_id: string
          part_id: string | null
          part_number: string
          po_id: string
          product_item_id: string | null
          product_item_name: string
          project_id: string | null
          quantity: number
          total_cost: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          part_id?: string | null
          part_number?: string
          po_id: string
          product_item_id?: string | null
          product_item_name?: string
          project_id?: string | null
          quantity?: number
          total_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          part_id?: string | null
          part_number?: string
          po_id?: string
          product_item_id?: string | null
          product_item_name?: string
          project_id?: string | null
          quantity?: number
          total_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "product_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      product_items: {
        Row: {
          alternate_vendors: Json
          category: string
          cost_layers: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          is_inventory: boolean
          minimum_stock: number
          name: string
          org_id: string
          part_category: string | null
          part_number: string
          picture_url: string | null
          price: number
          quantity_on_hand: number
          unit_cost: number
          updated_at: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          alternate_vendors?: Json
          category: string
          cost_layers?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_inventory?: boolean
          minimum_stock?: number
          name: string
          org_id?: string
          part_category?: string | null
          part_number?: string
          picture_url?: string | null
          price?: number
          quantity_on_hand?: number
          unit_cost?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Update: {
          alternate_vendors?: Json
          category?: string
          cost_layers?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          is_inventory?: boolean
          minimum_stock?: number
          name?: string
          org_id?: string
          part_category?: string | null
          part_number?: string
          picture_url?: string | null
          price?: number
          quantity_on_hand?: number
          unit_cost?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          notification_prefs: Json
          org_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          notification_prefs?: Json
          org_id: string
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          notification_prefs?: Json
          org_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string
          budget_hours: number | null
          burdened_rate_cents: number | null
          client_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          deleted_at: string | null
          end_date: string | null
          id: string
          labor_hours: number | null
          labor_rate_cents: number | null
          name: string
          notes: string | null
          org_id: string
          progress_pct: number
          start_date: string | null
          status: string
          total_cost: number
          updated_at: string
        }
        Insert: {
          address?: string
          budget_hours?: number | null
          burdened_rate_cents?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          labor_hours?: number | null
          labor_rate_cents?: number | null
          name: string
          notes?: string | null
          org_id?: string
          progress_pct?: number
          start_date?: string | null
          status?: string
          total_cost?: number
          updated_at?: string
        }
        Update: {
          address?: string
          budget_hours?: number | null
          burdened_rate_cents?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          labor_hours?: number | null
          labor_rate_cents?: number | null
          name?: string
          notes?: string | null
          org_id?: string
          progress_pct?: number
          start_date?: string | null
          status?: string
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          check_number: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          grand_total: number
          id: string
          invoice_number: string | null
          notes: string | null
          org_id: string
          payment_booked_in_qb: boolean
          payment_remitted: boolean
          payment_submitted_to_ap: boolean
          payment_type: string | null
          po_date: string | null
          po_number: string
          requisition_id: string | null
          sales_tax: number
          shipping_cost: number
          status: string
          subtotal: number
          tax_rate_percent: number
          updated_at: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          check_number?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grand_total?: number
          id?: string
          invoice_number?: string | null
          notes?: string | null
          org_id?: string
          payment_booked_in_qb?: boolean
          payment_remitted?: boolean
          payment_submitted_to_ap?: boolean
          payment_type?: string | null
          po_date?: string | null
          po_number: string
          requisition_id?: string | null
          sales_tax?: number
          shipping_cost?: number
          status?: string
          subtotal?: number
          tax_rate_percent?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Update: {
          check_number?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grand_total?: number
          id?: string
          invoice_number?: string | null
          notes?: string | null
          org_id?: string
          payment_booked_in_qb?: boolean
          payment_remitted?: boolean
          payment_submitted_to_ap?: boolean
          payment_type?: string | null
          po_date?: string | null
          po_number?: string
          requisition_id?: string | null
          sales_tax?: number
          shipping_cost?: number
          status?: string
          subtotal?: number
          tax_rate_percent?: number
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      requisition_line_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          org_id: string
          part_id: string | null
          part_number: string
          product_item_id: string | null
          product_item_name: string
          project_id: string | null
          quantity: number
          requisition_id: string
          total_cost: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          part_id?: string | null
          part_number?: string
          product_item_id?: string | null
          product_item_name?: string
          project_id?: string | null
          quantity?: number
          requisition_id: string
          total_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          part_id?: string | null
          part_number?: string
          product_item_id?: string | null
          product_item_name?: string
          project_id?: string | null
          quantity?: number
          requisition_id?: string
          total_cost?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisition_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_line_items_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_line_items_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "product_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_line_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisition_line_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      requisitions: {
        Row: {
          converted_po_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          grand_total: number
          id: string
          notes: string | null
          org_id: string
          requested_by_id: string | null
          requested_by_name: string
          requisition_number: string
          sales_tax: number
          shipping_cost: number
          status: string
          subtotal: number
          tax_rate_percent: number
          title: string
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
          work_order_id: string | null
        }
        Insert: {
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          org_id?: string
          requested_by_id?: string | null
          requested_by_name?: string
          requisition_number: string
          sales_tax?: number
          shipping_cost?: number
          status?: string
          subtotal?: number
          tax_rate_percent?: number
          title: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
          work_order_id?: string | null
        }
        Update: {
          converted_po_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          grand_total?: number
          id?: string
          notes?: string | null
          org_id?: string
          requested_by_id?: string | null
          requested_by_name?: string
          requisition_number?: string
          sales_tax?: number
          shipping_cost?: number
          status?: string
          subtotal?: number
          tax_rate_percent?: number
          title?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requisitions_converted_po_id_fkey"
            columns: ["converted_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requisitions_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_weeks: {
        Row: {
          created_at: string
          data: Json
          id: string
          org_id: string
          updated_at: string
          week_end: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          org_id: string
          updated_at?: string
          week_end: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          org_id?: string
          updated_at?: string
          week_end?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_weeks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          air_filter_part_number: string | null
          asset_tag: string
          asset_type: string
          assigned_crew: string | null
          barcode: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division: string | null
          engine_model: string | null
          engine_serial_number: string | null
          equipment_number: string | null
          finance_institution: string | null
          fuel_type: string | null
          id: string
          license_plate: string | null
          location: string | null
          make: string | null
          manufacturer: string | null
          model: string | null
          name: string
          next_inspection_sticker_due: string | null
          next_oil_change_due: string | null
          next_oil_change_mileage: number | null
          notes: string | null
          oil_filter_part_number: string | null
          org_id: string
          payment_method: string | null
          photo_url: string | null
          purchase_date: string | null
          purchase_price: number | null
          purchase_vendor_id: string | null
          purchase_vendor_name: string | null
          samsara_vehicle_id: string | null
          serial_number: string | null
          spark_plug_part_number: string | null
          status: string
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          air_filter_part_number?: string | null
          asset_tag?: string
          asset_type?: string
          assigned_crew?: string | null
          barcode?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division?: string | null
          engine_model?: string | null
          engine_serial_number?: string | null
          equipment_number?: string | null
          finance_institution?: string | null
          fuel_type?: string | null
          id?: string
          license_plate?: string | null
          location?: string | null
          make?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          next_inspection_sticker_due?: string | null
          next_oil_change_due?: string | null
          next_oil_change_mileage?: number | null
          notes?: string | null
          oil_filter_part_number?: string | null
          org_id?: string
          payment_method?: string | null
          photo_url?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          purchase_vendor_id?: string | null
          purchase_vendor_name?: string | null
          samsara_vehicle_id?: string | null
          serial_number?: string | null
          spark_plug_part_number?: string | null
          status?: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          air_filter_part_number?: string | null
          asset_tag?: string
          asset_type?: string
          assigned_crew?: string | null
          barcode?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division?: string | null
          engine_model?: string | null
          engine_serial_number?: string | null
          equipment_number?: string | null
          finance_institution?: string | null
          fuel_type?: string | null
          id?: string
          license_plate?: string | null
          location?: string | null
          make?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          next_inspection_sticker_due?: string | null
          next_oil_change_due?: string | null
          next_oil_change_mileage?: number | null
          notes?: string | null
          oil_filter_part_number?: string | null
          org_id?: string
          payment_method?: string | null
          photo_url?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          purchase_vendor_id?: string | null
          purchase_vendor_name?: string | null
          samsara_vehicle_id?: string | null
          serial_number?: string | null
          spark_plug_part_number?: string | null
          status?: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_purchase_vendor_id_fkey"
            columns: ["purchase_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string
          contact_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          phone: string
          updated_at: string
          vendor_type: string | null
          w9_expiration_date: string | null
          w9_received_date: string | null
          w9_status: string
          website: string | null
        }
        Insert: {
          address?: string
          contact_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id?: string
          phone?: string
          updated_at?: string
          vendor_type?: string | null
          w9_expiration_date?: string | null
          w9_received_date?: string | null
          w9_status?: string
          website?: string | null
        }
        Update: {
          address?: string
          contact_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string
          updated_at?: string
          vendor_type?: string | null
          w9_expiration_date?: string | null
          w9_received_date?: string | null
          w9_status?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wo_labor_entries: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          hourly_rate: number
          hours: number
          id: string
          org_id: string
          technician_name: string
          updated_at: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          hourly_rate?: number
          hours?: number
          id?: string
          org_id?: string
          technician_name?: string
          updated_at?: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          hourly_rate?: number
          hours?: number
          id?: string
          org_id?: string
          technician_name?: string
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_labor_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_labor_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_labor_entries_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wo_parts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          org_id: string
          part_id: string | null
          part_name: string
          part_number: string
          quantity: number
          unit_cost: number
          updated_at: string
          work_order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          part_id?: string | null
          part_name?: string
          part_number?: string
          quantity?: number
          unit_cost?: number
          updated_at?: string
          work_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id?: string
          part_id?: string | null
          part_name?: string
          part_number?: string
          quantity?: number
          unit_cost?: number
          updated_at?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_parts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_parts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_parts_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_parts_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wo_vendor_charges: {
        Row: {
          cost: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          org_id: string
          updated_at: string
          vendor_id: string | null
          vendor_name: string
          work_order_id: string
        }
        Insert: {
          cost?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          org_id?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
          work_order_id: string
        }
        Update: {
          cost?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          org_id?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wo_vendor_charges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_vendor_charges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_vendor_charges_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wo_vendor_charges_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          asset_id: string | null
          asset_name: string | null
          assigned_to_id: string | null
          assigned_to_ids: Json
          assigned_to_name: string | null
          assigned_to_names: Json
          automation_id: string | null
          categories: Json
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_recurring: boolean
          linked_entity_type: string | null
          org_id: string
          parent_work_order_id: string | null
          pm_schedule_id: string | null
          priority: string
          recurrence_frequency: string | null
          status: string
          title: string
          updated_at: string
          wo_type: string | null
          work_order_number: string
        }
        Insert: {
          asset_id?: string | null
          asset_name?: string | null
          assigned_to_id?: string | null
          assigned_to_ids?: Json
          assigned_to_name?: string | null
          assigned_to_names?: Json
          automation_id?: string | null
          categories?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          linked_entity_type?: string | null
          org_id?: string
          parent_work_order_id?: string | null
          pm_schedule_id?: string | null
          priority?: string
          recurrence_frequency?: string | null
          status?: string
          title: string
          updated_at?: string
          wo_type?: string | null
          work_order_number: string
        }
        Update: {
          asset_id?: string | null
          asset_name?: string | null
          assigned_to_id?: string | null
          assigned_to_ids?: Json
          assigned_to_name?: string | null
          assigned_to_names?: Json
          automation_id?: string | null
          categories?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          linked_entity_type?: string | null
          org_id?: string
          parent_work_order_id?: string | null
          pm_schedule_id?: string | null
          priority?: string
          recurrence_frequency?: string | null
          status?: string
          title?: string
          updated_at?: string
          wo_type?: string | null
          work_order_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_parent_work_order_id_fkey"
            columns: ["parent_work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_pm_schedule_id_fkey"
            columns: ["pm_schedule_id"]
            isOneToOne: false
            referencedRelation: "pm_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      insert_audit_entry: {
        Args: {
          p_action: string
          p_description: string
          p_field_changed?: string
          p_new_value?: string
          p_old_value?: string
          p_org_id: string
          p_record_id: string
          p_record_type: string
        }
        Returns: undefined
      }
      my_org_id: { Args: never; Returns: string }
      next_damage_case_number: { Args: never; Returns: string }
      sync_client_balance: { Args: { p_client_id: string }; Returns: undefined }
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
A new version of Supabase CLI is available: v2.107.0 (currently installed v2.84.4)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
