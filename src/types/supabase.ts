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
    PostgrestVersion: "14.4"
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
          license_plate: string | null
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
          license_plate?: string | null
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
          license_plate?: string | null
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
      avb_crews: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avb_crews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avb_employees: {
        Row: {
          created_at: string
          csv_job: string
          csv_name: string
          default_crew: string
          deleted_at: string | null
          id: string
          is_active: boolean
          is_field: boolean
          name: string
          org_id: string
          updated_at: string
          uuid: string
        }
        Insert: {
          created_at?: string
          csv_job?: string
          csv_name?: string
          default_crew?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_field?: boolean
          name: string
          org_id: string
          updated_at?: string
          uuid: string
        }
        Update: {
          created_at?: string
          csv_job?: string
          csv_name?: string
          default_crew?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_field?: boolean
          name?: string
          org_id?: string
          updated_at?: string
          uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "avb_employees_org_id_fkey"
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
      crm_crew_members: {
        Row: {
          created_at: string
          crew_id: string
          id: string
          name: string
          org_id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          crew_id: string
          id?: string
          name: string
          org_id?: string
          role?: string | null
        }
        Update: {
          created_at?: string
          crew_id?: string
          id?: string
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
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
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
            foreignKeyName: "crm_crews_org_id_fkey"
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
          job_number: number
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
          job_number?: number
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
          job_number?: number
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
      crm_reports: {
        Row: {
          html_content: string
          id: string
          metrics: Json | null
          updated_at: string | null
        }
        Insert: {
          html_content: string
          id?: string
          metrics?: Json | null
          updated_at?: string | null
        }
        Update: {
          html_content?: string
          id?: string
          metrics?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_services: {
        Row: {
          category: string
          code: string | null
          created_at: string
          created_by: string | null
          default_rate_cents: number | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          production_rate_sqft_per_hr: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_rate_cents?: number | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string
          production_rate_sqft_per_hr?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_rate_cents?: number | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          production_rate_sqft_per_hr?: number | null
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
      job_photos: {
        Row: {
          annotated_path: string | null
          before_after: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          display_name: string | null
          file_name: string
          file_size: number
          gps_lat: number | null
          gps_lng: number | null
          has_annotations: boolean
          height: number | null
          id: string
          mime_type: string
          notes: string | null
          org_id: string
          photo_job_id: string
          storage_path: string
          tags: string[]
          thumbnail_path: string | null
          updated_at: string
          upload_context: string
          uploaded_by: string
          uploaded_by_name: string
          width: number | null
        }
        Insert: {
          annotated_path?: string | null
          before_after?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string | null
          file_name: string
          file_size: number
          gps_lat?: number | null
          gps_lng?: number | null
          has_annotations?: boolean
          height?: number | null
          id?: string
          mime_type: string
          notes?: string | null
          org_id: string
          photo_job_id: string
          storage_path: string
          tags?: string[]
          thumbnail_path?: string | null
          updated_at?: string
          upload_context?: string
          uploaded_by: string
          uploaded_by_name: string
          width?: number | null
        }
        Update: {
          annotated_path?: string | null
          before_after?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string | null
          file_name?: string
          file_size?: number
          gps_lat?: number | null
          gps_lng?: number | null
          has_annotations?: boolean
          height?: number | null
          id?: string
          mime_type?: string
          notes?: string | null
          org_id?: string
          photo_job_id?: string
          storage_path?: string
          tags?: string[]
          thumbnail_path?: string | null
          updated_at?: string
          upload_context?: string
          uploaded_by?: string
          uploaded_by_name?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_photo_job_id_fkey"
            columns: ["photo_job_id"]
            isOneToOne: false
            referencedRelation: "photo_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_actuals: {
        Row: {
          actual_value: number | null
          created_at: string
          created_by: string | null
          id: string
          metric_key: string
          org_id: string
          period: string
          target_value: number | null
          updated_at: string
        }
        Insert: {
          actual_value?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          metric_key: string
          org_id: string
          period: string
          target_value?: number | null
          updated_at?: string
        }
        Update: {
          actual_value?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          metric_key?: string
          org_id?: string
          period?: string
          target_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_actuals_org_id_fkey"
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
          automation_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          equipment_type: string | null
          has_repair_tag: boolean | null
          id: string
          linked_work_order_id: string | null
          linked_work_order_number: string | null
          org_id: string
          priority: string
          repair_category: string | null
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
          automation_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          equipment_type?: string | null
          has_repair_tag?: boolean | null
          id?: string
          linked_work_order_id?: string | null
          linked_work_order_number?: string | null
          org_id?: string
          priority?: string
          repair_category?: string | null
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
          automation_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          equipment_type?: string | null
          has_repair_tag?: boolean | null
          id?: string
          linked_work_order_id?: string | null
          linked_work_order_number?: string | null
          org_id?: string
          priority?: string
          repair_category?: string | null
          request_number?: string
          requested_by_id?: string | null
          requested_by_name?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
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
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          org_id: string
          read: boolean
          title: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message: string
          org_id: string
          read?: boolean
          title?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          org_id?: string
          read?: boolean
          title?: string | null
          type?: string | null
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
          categories: string[]
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
          categories?: string[]
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
          categories?: string[]
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
      photo_annotations: {
        Row: {
          author_id: string
          author_name: string
          created_at: string
          fabric_json: Json
          id: string
          org_id: string
          photo_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          author_name: string
          created_at?: string
          fabric_json: Json
          id?: string
          org_id: string
          photo_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          author_name?: string
          created_at?: string
          fabric_json?: Json
          id?: string
          org_id?: string
          photo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_annotations_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_annotations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_annotations_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "job_photos"
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
            foreignKeyName: "photo_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          assigned_to_id: string | null
          assigned_to_name: string | null
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
          assigned_to_id?: string | null
          assigned_to_name?: string | null
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
          assigned_to_id?: string | null
          assigned_to_name?: string | null
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
          taxable: boolean
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
          taxable?: boolean
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
          taxable?: boolean
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
          photo_module_access: boolean
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
          photo_module_access?: boolean
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
          photo_module_access?: boolean
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
      project_direct_items: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          org_id: string
          part_number: string
          product_item_id: string | null
          product_item_name: string
          project_id: string
          quantity: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          org_id: string
          part_number?: string
          product_item_id?: string | null
          product_item_name?: string
          project_id: string
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
          part_number?: string
          product_item_id?: string | null
          product_item_name?: string
          project_id?: string
          quantity?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_direct_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_direct_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_direct_items_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "product_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_direct_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_subcontract_costs: {
        Row: {
          amount: number
          cost_date: string | null
          cost_type: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          notes: string | null
          org_id: string
          project_id: string
          updated_at: string
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          amount?: number
          cost_date?: string | null
          cost_type: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          notes?: string | null
          org_id: string
          project_id: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          amount?: number
          cost_date?: string | null
          cost_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          notes?: string | null
          org_id?: string
          project_id?: string
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_subcontract_costs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_subcontract_costs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_subcontract_costs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string
          city: string
          contract_price: number
          created_at: string
          created_by: string | null
          customer_name: string
          deleted_at: string | null
          end_date: string | null
          id: string
          is_archived: boolean
          labor_hours: number | null
          name: string
          notes: string | null
          org_id: string
          start_date: string | null
          state: string
          status: string
          total_cost: number
          updated_at: string
          zip: string
        }
        Insert: {
          address?: string
          city?: string
          contract_price?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          is_archived?: boolean
          labor_hours?: number | null
          name: string
          notes?: string | null
          org_id?: string
          start_date?: string | null
          state?: string
          status?: string
          total_cost?: number
          updated_at?: string
          zip?: string
        }
        Update: {
          address?: string
          city?: string
          contract_price?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          is_archived?: boolean
          labor_hours?: number | null
          name?: string
          notes?: string | null
          org_id?: string
          start_date?: string | null
          state?: string
          status?: string
          total_cost?: number
          updated_at?: string
          zip?: string
        }
        Relationships: [
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
          start_date: string | null
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
          start_date?: string | null
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
          start_date?: string | null
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
      adjust_part_quantity: {
        Args: { p_delta: number; p_part_id: string }
        Returns: undefined
      }
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
