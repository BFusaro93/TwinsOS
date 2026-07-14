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
            referencedRelation: "rpt_vendors"
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
            foreignKeyName: "client_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
      client_files: {
        Row: {
          client_id: string
          created_at: string
          deleted_at: string | null
          id: string
          mime_type: string | null
          name: string
          org_id: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime_type?: string | null
          name: string
          org_id: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime_type?: string | null
          name?: string
          org_id?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_invites: {
        Row: {
          accepted_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          org_id: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          org_id: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          org_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_invites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_settings: {
        Row: {
          accent_color: string
          allow_estimates: boolean
          allow_tickets: boolean
          company_name: string | null
          created_at: string
          id: string
          logo_url: string | null
          org_id: string
          portal_ticket_categories: string[]
          support_email: string | null
          support_phone: string | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          accent_color?: string
          allow_estimates?: boolean
          allow_tickets?: boolean
          company_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          org_id: string
          portal_ticket_categories?: string[]
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          accent_color?: string
          allow_estimates?: boolean
          allow_tickets?: boolean
          company_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          org_id?: string
          portal_ticket_categories?: string[]
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          client_id: string
          created_at: string
          email: string
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email: string
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_users_org_id_fkey"
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
            foreignKeyName: "client_properties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
            foreignKeyName: "client_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
          account_number: string | null
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
          cancellation_reason: string | null
          client_since: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          default_payment_method: string | null
          default_tax_rate_bps: number
          default_terms: string | null
          deleted_at: string | null
          display_name: string
          do_not_market: boolean
          first_name: string | null
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
          office_notes: string | null
          ok_to_email: boolean
          org_id: string
          parent_client_id: string | null
          payment_method: string | null
          phones: Json
          primary_email: string | null
          primary_phone: string | null
          priority: string | null
          referred_by: string | null
          referred_by_client_id: string | null
          revenue_potential_cents: number
          sales_rep_id: string | null
          sales_tax_code: string | null
          source: string | null
          status: string
          turf_sqft: number | null
          updated_at: string
          yards_of_mulch: number | null
        }
        Insert: {
          account_number?: string | null
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
          cancellation_reason?: string | null
          client_since?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          default_payment_method?: string | null
          default_tax_rate_bps?: number
          default_terms?: string | null
          deleted_at?: string | null
          display_name: string
          do_not_market?: boolean
          first_name?: string | null
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
          office_notes?: string | null
          ok_to_email?: boolean
          org_id?: string
          parent_client_id?: string | null
          payment_method?: string | null
          phones?: Json
          primary_email?: string | null
          primary_phone?: string | null
          priority?: string | null
          referred_by?: string | null
          referred_by_client_id?: string | null
          revenue_potential_cents?: number
          sales_rep_id?: string | null
          sales_tax_code?: string | null
          source?: string | null
          status?: string
          turf_sqft?: number | null
          updated_at?: string
          yards_of_mulch?: number | null
        }
        Update: {
          account_number?: string | null
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
          cancellation_reason?: string | null
          client_since?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          default_payment_method?: string | null
          default_tax_rate_bps?: number
          default_terms?: string | null
          deleted_at?: string | null
          display_name?: string
          do_not_market?: boolean
          first_name?: string | null
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
          office_notes?: string | null
          ok_to_email?: boolean
          org_id?: string
          parent_client_id?: string | null
          payment_method?: string | null
          phones?: Json
          primary_email?: string | null
          primary_phone?: string | null
          priority?: string | null
          referred_by?: string | null
          referred_by_client_id?: string | null
          revenue_potential_cents?: number
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
            foreignKeyName: "clients_parent_client_id_fkey"
            columns: ["parent_client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_referred_by_client_id_fkey"
            columns: ["referred_by_client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
      crm_automation_sequences: {
        Row: {
          allow_reentry: boolean
          automation_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          position: number
          reentry_after_minutes: number
          restrict_entry_to: string
          updated_at: string
        }
        Insert: {
          allow_reentry?: boolean
          automation_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string
          position?: number
          reentry_after_minutes?: number
          restrict_entry_to?: string
          updated_at?: string
        }
        Update: {
          allow_reentry?: boolean
          automation_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          position?: number
          reentry_after_minutes?: number
          restrict_entry_to?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_automation_sequences_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "crm_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_automation_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_automations: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
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
          org_id?: string
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
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_automations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaigns: {
        Row: {
          body: string | null
          clicked_count: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          delivered_count: number | null
          id: string
          name: string
          opened_count: number | null
          org_id: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string | null
          target_segment: string
          total_recipients: number | null
          type: string
          unsubscribed_count: number | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          clicked_count?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivered_count?: number | null
          id?: string
          name: string
          opened_count?: number | null
          org_id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          target_segment?: string
          total_recipients?: number | null
          type?: string
          unsubscribed_count?: number | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          clicked_count?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          delivered_count?: number | null
          id?: string
          name?: string
          opened_count?: number | null
          org_id?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          target_segment?: string
          total_recipients?: number | null
          type?: string
          unsubscribed_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_client_custom_field_values: {
        Row: {
          client_id: string
          field_def_id: string
          id: string
          org_id: string
          updated_at: string
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          client_id: string
          field_def_id: string
          id?: string
          org_id: string
          updated_at?: string
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          client_id?: string
          field_def_id?: string
          id?: string
          org_id?: string
          updated_at?: string
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_client_custom_field_values_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_client_custom_field_values_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_client_custom_field_values_field_def_id_fkey"
            columns: ["field_def_id"]
            isOneToOne: false
            referencedRelation: "crm_custom_field_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_client_custom_field_values_org_id_fkey"
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
            foreignKeyName: "crm_contract_notes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rpt_contracts"
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
          sales_rep_id: string | null
          sales_rep_legacy_name: string | null
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
          sales_rep_id?: string | null
          sales_rep_legacy_name?: string | null
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
          sales_rep_id?: string | null
          sales_rep_legacy_name?: string | null
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
            foreignKeyName: "crm_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
            foreignKeyName: "crm_contracts_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contracts_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_crew_member_times: {
        Row: {
          break_minutes: number
          clocked_in_at: string | null
          clocked_out_at: string | null
          created_at: string
          crew_member_id: string
          id: string
          lunch_minutes: number
          org_id: string
          updated_at: string
          visit_id: string
        }
        Insert: {
          break_minutes?: number
          clocked_in_at?: string | null
          clocked_out_at?: string | null
          created_at?: string
          crew_member_id: string
          id?: string
          lunch_minutes?: number
          org_id?: string
          updated_at?: string
          visit_id: string
        }
        Update: {
          break_minutes?: number
          clocked_in_at?: string | null
          clocked_out_at?: string | null
          created_at?: string
          crew_member_id?: string
          id?: string
          lunch_minutes?: number
          org_id?: string
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_crew_member_times_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "crm_crew_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_crew_member_times_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "crm_job_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_crew_member_times_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "rpt_job_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_crew_members: {
        Row: {
          created_at: string
          crew_id: string
          days_of_week: number[]
          id: string
          labor_burden_cents_per_hour: number
          name: string
          org_id: string
          role: string | null
        }
        Insert: {
          created_at?: string
          crew_id: string
          days_of_week?: number[]
          id?: string
          labor_burden_cents_per_hour?: number
          name: string
          org_id?: string
          role?: string | null
        }
        Update: {
          created_at?: string
          crew_id?: string
          days_of_week?: number[]
          id?: string
          labor_burden_cents_per_hour?: number
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
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
            foreignKeyName: "crm_crews_foreman_id_fkey"
            columns: ["foreman_id"]
            isOneToOne: false
            referencedRelation: "rpt_employees"
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
      crm_custom_field_defs: {
        Row: {
          created_at: string
          deleted_at: string | null
          field_type: string
          id: string
          name: string
          org_id: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          field_type?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
          unit?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          field_type?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_custom_field_defs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_custom_reports: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_custom_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_discounts: {
        Row: {
          created_at: string
          deleted_at: string | null
          discount_type: string
          flat_cents: number | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          percent_bps: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          discount_type?: string
          flat_cents?: number | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string
          percent_bps?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          discount_type?: string
          flat_cents?: number | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          percent_bps?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_document_blocks: {
        Row: {
          block_type: string
          content: string | null
          created_at: string
          id: string
          order_index: number
          org_id: string
          settings: Json
          template_id: string
          updated_at: string
        }
        Insert: {
          block_type: string
          content?: string | null
          created_at?: string
          id?: string
          order_index?: number
          org_id: string
          settings?: Json
          template_id: string
          updated_at?: string
        }
        Update: {
          block_type?: string
          content?: string | null
          created_at?: string
          id?: string
          order_index?: number
          org_id?: string
          settings?: Json
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_document_blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_document_blocks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "crm_document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_document_templates: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          doc_type: string
          id: string
          include_pdf: boolean
          is_default: boolean
          name: string
          org_id: string
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          doc_type: string
          id?: string
          include_pdf?: boolean
          is_default?: boolean
          name: string
          org_id: string
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          doc_type?: string
          id?: string
          include_pdf?: boolean
          is_default?: boolean
          name?: string
          org_id?: string
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_document_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_templates: {
        Row: {
          body_html: string
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean
          name: string
          org_id: string
          subject: string
          template_type: string
          updated_at: string
        }
        Insert: {
          body_html: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          name: string
          org_id: string
          subject: string
          template_type?: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
          subject?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_templates_org_id_fkey"
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
            foreignKeyName: "crm_employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "rpt_employees"
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
      crm_estimate_stages: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          id: string
          is_default: boolean
          is_system: boolean
          name: string
          org_id: string
          probability_bps: number
          sort_order: number
          stage_key: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          is_system?: boolean
          name: string
          org_id: string
          probability_bps?: number
          sort_order?: number
          stage_key: string
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          is_system?: boolean
          name?: string
          org_id?: string
          probability_bps?: number
          sort_order?: number
          stage_key?: string
        }
        Relationships: []
      }
      crm_form_fields: {
        Row: {
          config: Json
          created_at: string
          deleted_at: string | null
          description: string | null
          field_type: string
          form_id: string
          id: string
          label: string
          mapped_field: string | null
          options: Json | null
          org_id: string
          page_number: number
          placeholder: string | null
          required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          field_type: string
          form_id: string
          id?: string
          label: string
          mapped_field?: string | null
          options?: Json | null
          org_id: string
          page_number?: number
          placeholder?: string | null
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          field_type?: string
          form_id?: string
          id?: string
          label?: string
          mapped_field?: string | null
          options?: Json | null
          org_id?: string
          page_number?: number
          placeholder?: string | null
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_form_responses: {
        Row: {
          created_at: string
          data: Json
          deleted_at: string | null
          form_id: string
          form_location: string | null
          id: string
          is_read: boolean
          org_id: string
          related_client_id: string | null
          related_ticket_id: string | null
          result: string | null
          status: string
          submitted_by_email: string | null
          submitted_by_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          deleted_at?: string | null
          form_id: string
          form_location?: string | null
          id?: string
          is_read?: boolean
          org_id: string
          related_client_id?: string | null
          related_ticket_id?: string | null
          result?: string | null
          status?: string
          submitted_by_email?: string | null
          submitted_by_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          deleted_at?: string | null
          form_id?: string
          form_location?: string | null
          id?: string
          is_read?: boolean
          org_id?: string
          related_client_id?: string | null
          related_ticket_id?: string | null
          result?: string | null
          status?: string
          submitted_by_email?: string | null
          submitted_by_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_responses_related_client_id_fkey"
            columns: ["related_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_responses_related_client_id_fkey"
            columns: ["related_client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_responses_related_ticket_id_fkey"
            columns: ["related_ticket_id"]
            isOneToOne: false
            referencedRelation: "crm_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_form_rules: {
        Row: {
          action: string
          action_value: string | null
          created_at: string
          form_id: string
          id: string
          operand: string | null
          operator: string
          org_id: string
          rule_type: string
          sort_order: number
          source_field_id: string | null
          updated_at: string
        }
        Insert: {
          action: string
          action_value?: string | null
          created_at?: string
          form_id: string
          id?: string
          operand?: string | null
          operator: string
          org_id: string
          rule_type?: string
          sort_order?: number
          source_field_id?: string | null
          updated_at?: string
        }
        Update: {
          action?: string
          action_value?: string | null
          created_at?: string
          form_id?: string
          id?: string
          operand?: string | null
          operator?: string
          org_id?: string
          rule_type?: string
          sort_order?: number
          source_field_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_rules_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_rules_source_field_id_fkey"
            columns: ["source_field_id"]
            isOneToOne: false
            referencedRelation: "crm_form_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_forms: {
        Row: {
          account_matching_strategy: string
          account_update_strategy: string
          auto_manage_accounts: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          settings: Json
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          account_matching_strategy?: string
          account_update_strategy?: string
          auto_manage_accounts?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          settings?: Json
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_matching_strategy?: string
          account_update_strategy?: string
          auto_manage_accounts?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          settings?: Json
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_invoice_line_items: {
        Row: {
          applied_discount_id: string | null
          created_at: string
          description: string
          discount_cents: number
          discount_type: string | null
          discount_value: number | null
          hours: number | null
          id: string
          invoice_id: string
          is_taxable: boolean
          men: number | null
          name: string | null
          org_id: string
          qty: number
          rate_cents: number
          service_date: string | null
          sort_order: number
          total_cents: number
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          applied_discount_id?: string | null
          created_at?: string
          description: string
          discount_cents?: number
          discount_type?: string | null
          discount_value?: number | null
          hours?: number | null
          id?: string
          invoice_id: string
          is_taxable?: boolean
          men?: number | null
          name?: string | null
          org_id?: string
          qty?: number
          rate_cents?: number
          service_date?: string | null
          sort_order?: number
          total_cents?: number
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          applied_discount_id?: string | null
          created_at?: string
          description?: string
          discount_cents?: number
          discount_type?: string | null
          discount_value?: number | null
          hours?: number | null
          id?: string
          invoice_id?: string
          is_taxable?: boolean
          men?: number | null
          name?: string | null
          org_id?: string
          qty?: number
          rate_cents?: number
          service_date?: string | null
          sort_order?: number
          total_cents?: number
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_invoice_line_items_applied_discount_id_fkey"
            columns: ["applied_discount_id"]
            isOneToOne: false
            referencedRelation: "crm_discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "crm_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rpt_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoice_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoice_line_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "crm_job_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoice_line_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "rpt_job_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_invoices: {
        Row: {
          amount_paid_cents: number
          applied_discount_id: string | null
          balance_cents: number
          client_id: string
          contract_id: string | null
          created_at: string
          created_by: string | null
          crm_job_id: string | null
          deleted_at: string | null
          description: string
          discount_cents: number
          discount_type: string | null
          discount_value: number | null
          due_date: string | null
          estimate_id: string | null
          id: string
          invoice_date: string
          invoice_number: number | null
          locked: boolean
          locked_at: string | null
          notes: string | null
          org_id: string
          po_number: string | null
          preferred_payment_method: string | null
          sales_rep_id: string | null
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
          applied_discount_id?: string | null
          balance_cents?: number
          client_id: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          crm_job_id?: string | null
          deleted_at?: string | null
          description?: string
          discount_cents?: number
          discount_type?: string | null
          discount_value?: number | null
          due_date?: string | null
          estimate_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: number | null
          locked?: boolean
          locked_at?: string | null
          notes?: string | null
          org_id?: string
          po_number?: string | null
          preferred_payment_method?: string | null
          sales_rep_id?: string | null
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
          applied_discount_id?: string | null
          balance_cents?: number
          client_id?: string
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          crm_job_id?: string | null
          deleted_at?: string | null
          description?: string
          discount_cents?: number
          discount_type?: string | null
          discount_value?: number | null
          due_date?: string | null
          estimate_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: number | null
          locked?: boolean
          locked_at?: string | null
          notes?: string | null
          org_id?: string
          po_number?: string | null
          preferred_payment_method?: string | null
          sales_rep_id?: string | null
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
            foreignKeyName: "crm_invoices_applied_discount_id_fkey"
            columns: ["applied_discount_id"]
            isOneToOne: false
            referencedRelation: "crm_discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
            foreignKeyName: "crm_invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rpt_contracts"
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
            foreignKeyName: "crm_invoices_crm_job_id_fkey"
            columns: ["crm_job_id"]
            isOneToOne: false
            referencedRelation: "rpt_jobs"
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
            foreignKeyName: "crm_invoices_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_invoices_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_job_materials: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          job_id: string
          notes: string | null
          org_id: string
          qty: number
          total_cost_cents: number | null
          unit_cost_cents: number
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          id?: string
          job_id: string
          notes?: string | null
          org_id: string
          qty?: number
          total_cost_cents?: number | null
          unit_cost_cents?: number
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          job_id?: string
          notes?: string | null
          org_id?: string
          qty?: number
          total_cost_cents?: number | null
          unit_cost_cents?: number
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_job_materials_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "crm_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_materials_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "rpt_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_materials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_materials_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "crm_job_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_materials_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "rpt_job_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_job_products: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          notes: string | null
          org_id: string
          product_id: string | null
          product_name: string
          qty: number
          unit_cost_cents: number | null
          unit_price_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          notes?: string | null
          org_id: string
          product_id?: string | null
          product_name: string
          qty?: number
          unit_cost_cents?: number | null
          unit_price_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          org_id?: string
          product_id?: string | null
          product_name?: string
          qty?: number
          unit_cost_cents?: number | null
          unit_price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_job_products_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "crm_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_products_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "rpt_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "rpt_products"
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
            foreignKeyName: "crm_job_services_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "rpt_jobs"
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
          {
            foreignKeyName: "crm_job_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "rpt_services"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_job_visits: {
        Row: {
          acknowledged_notes_at: string | null
          actual_hours: number | null
          actual_labor_cost_cents: number
          asset_type: string | null
          assigned_employee_id: string | null
          budgeted_hours: number | null
          client_id: string
          clocked_in_at: string | null
          clocked_out_at: string | null
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
          materials_used: Json
          men_count: number
          notes_to_client: string | null
          notes_to_crew: string | null
          order_num: number | null
          org_id: string
          priority: number
          qty: number | null
          rate_cents: number | null
          scheduled_date: string
          skip_reason: string | null
          snow_depth_inches: number | null
          start_time: string | null
          status: string
          storm_event_id: string | null
          sub_status: string | null
          temperature: number | null
          updated_at: string
        }
        Insert: {
          acknowledged_notes_at?: string | null
          actual_hours?: number | null
          actual_labor_cost_cents?: number
          asset_type?: string | null
          assigned_employee_id?: string | null
          budgeted_hours?: number | null
          client_id: string
          clocked_in_at?: string | null
          clocked_out_at?: string | null
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
          materials_used?: Json
          men_count?: number
          notes_to_client?: string | null
          notes_to_crew?: string | null
          order_num?: number | null
          org_id?: string
          priority?: number
          qty?: number | null
          rate_cents?: number | null
          scheduled_date: string
          skip_reason?: string | null
          snow_depth_inches?: number | null
          start_time?: string | null
          status?: string
          storm_event_id?: string | null
          sub_status?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          acknowledged_notes_at?: string | null
          actual_hours?: number | null
          actual_labor_cost_cents?: number
          asset_type?: string | null
          assigned_employee_id?: string | null
          budgeted_hours?: number | null
          client_id?: string
          clocked_in_at?: string | null
          clocked_out_at?: string | null
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
          materials_used?: Json
          men_count?: number
          notes_to_client?: string | null
          notes_to_crew?: string | null
          order_num?: number | null
          org_id?: string
          priority?: number
          qty?: number | null
          rate_cents?: number | null
          scheduled_date?: string
          skip_reason?: string | null
          snow_depth_inches?: number | null
          start_time?: string | null
          status?: string
          storm_event_id?: string | null
          sub_status?: string | null
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_job_visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
          {
            foreignKeyName: "crm_job_visits_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "rpt_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_job_visits_storm_event_id_fkey"
            columns: ["storm_event_id"]
            isOneToOne: false
            referencedRelation: "crm_storm_events"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_jobs: {
        Row: {
          actual_hours: number | null
          actual_labor_cost_cents: number
          actual_material_cost_cents: number
          arrival_window_hours: number | null
          asset_type: string | null
          budgeted_hours: number | null
          call_ahead: boolean | null
          client_id: string
          completion_notes: string | null
          conflict_days: string[] | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          crew_id: string | null
          date_sold: string | null
          deleted_at: string | null
          end_date_window: string | null
          end_time: string | null
          id: string
          inch_trigger: number | null
          invoice_description: string | null
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
          rate_per_inch_cents: number | null
          recurrence_end: string | null
          recurrence_rule: string | null
          recurrence_start: string | null
          sales_rep_id: string | null
          sales_rep_legacy_name: string | null
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
          actual_labor_cost_cents?: number
          actual_material_cost_cents?: number
          arrival_window_hours?: number | null
          asset_type?: string | null
          budgeted_hours?: number | null
          call_ahead?: boolean | null
          client_id: string
          completion_notes?: string | null
          conflict_days?: string[] | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          date_sold?: string | null
          deleted_at?: string | null
          end_date_window?: string | null
          end_time?: string | null
          id?: string
          inch_trigger?: number | null
          invoice_description?: string | null
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
          rate_per_inch_cents?: number | null
          recurrence_end?: string | null
          recurrence_rule?: string | null
          recurrence_start?: string | null
          sales_rep_id?: string | null
          sales_rep_legacy_name?: string | null
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
          actual_labor_cost_cents?: number
          actual_material_cost_cents?: number
          arrival_window_hours?: number | null
          asset_type?: string | null
          budgeted_hours?: number | null
          call_ahead?: boolean | null
          client_id?: string
          completion_notes?: string | null
          conflict_days?: string[] | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          crew_id?: string | null
          date_sold?: string | null
          deleted_at?: string | null
          end_date_window?: string | null
          end_time?: string | null
          id?: string
          inch_trigger?: number | null
          invoice_description?: string | null
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
          rate_per_inch_cents?: number | null
          recurrence_end?: string | null
          recurrence_rule?: string | null
          recurrence_start?: string | null
          sales_rep_id?: string | null
          sales_rep_legacy_name?: string | null
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
            foreignKeyName: "crm_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
            foreignKeyName: "crm_jobs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rpt_contracts"
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
          {
            foreignKeyName: "crm_jobs_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_list_options: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          list_name: string
          org_id: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          list_name: string
          org_id?: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          list_name?: string
          org_id?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_list_options_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_overhead_settings: {
        Row: {
          contract_oh_bps: number
          equipment_oh_bps: number
          id: string
          labor_burden_bps: number
          labor_oh_bps: number
          materials_oh_bps: number
          org_id: string
          other_oh_bps: number
          updated_at: string
        }
        Insert: {
          contract_oh_bps?: number
          equipment_oh_bps?: number
          id?: string
          labor_burden_bps?: number
          labor_oh_bps?: number
          materials_oh_bps?: number
          org_id: string
          other_oh_bps?: number
          updated_at?: string
        }
        Update: {
          contract_oh_bps?: number
          equipment_oh_bps?: number
          id?: string
          labor_burden_bps?: number
          labor_oh_bps?: number
          materials_oh_bps?: number
          org_id?: string
          other_oh_bps?: number
          updated_at?: string
        }
        Relationships: []
      }
      crm_package_services: {
        Row: {
          created_at: string
          default_b_hrs: number | null
          default_rate_cents: number | null
          end_date: string | null
          id: string
          min_days: number | null
          name: string | null
          org_id: string
          package_id: string
          service_id: string | null
          service_name: string
          sort_order: number
          start_date: string | null
          visits_included: number
        }
        Insert: {
          created_at?: string
          default_b_hrs?: number | null
          default_rate_cents?: number | null
          end_date?: string | null
          id?: string
          min_days?: number | null
          name?: string | null
          org_id?: string
          package_id: string
          service_id?: string | null
          service_name: string
          sort_order?: number
          start_date?: string | null
          visits_included?: number
        }
        Update: {
          created_at?: string
          default_b_hrs?: number | null
          default_rate_cents?: number | null
          end_date?: string | null
          id?: string
          min_days?: number | null
          name?: string | null
          org_id?: string
          package_id?: string
          service_id?: string | null
          service_name?: string
          sort_order?: number
          start_date?: string | null
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
          {
            foreignKeyName: "crm_package_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "rpt_services"
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
          org_id?: string
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
            foreignKeyName: "crm_packages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_payment_allocations: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          invoice_id: string
          org_id: string
          payment_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          invoice_id: string
          org_id?: string
          payment_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          invoice_id?: string
          org_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "crm_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rpt_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_payment_allocations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "crm_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "rpt_payments"
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
            foreignKeyName: "crm_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
            foreignKeyName: "crm_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "rpt_invoices"
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
      crm_property_custom_field_values: {
        Row: {
          field_def_id: string
          id: string
          org_id: string
          property_id: string
          updated_at: string
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          field_def_id: string
          id?: string
          org_id: string
          property_id: string
          updated_at?: string
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          field_def_id?: string
          id?: string
          org_id?: string
          property_id?: string
          updated_at?: string
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_property_custom_field_values_field_def_id_fkey"
            columns: ["field_def_id"]
            isOneToOne: false
            referencedRelation: "crm_rate_matrix_field_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_property_custom_field_values_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "client_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_rate_matrix_field_defs: {
        Row: {
          created_at: string
          deleted_at: string | null
          entity_type: string
          field_key: string
          field_label: string
          field_type: string
          id: string
          options: Json | null
          org_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entity_type?: string
          field_key: string
          field_label: string
          field_type?: string
          id?: string
          options?: Json | null
          org_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entity_type?: string
          field_key?: string
          field_label?: string
          field_type?: string
          id?: string
          options?: Json | null
          org_id?: string
          sort_order?: number
        }
        Relationships: []
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
          org_id?: string
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
      crm_schedules: {
        Row: {
          anchor_date: string | null
          created_at: string
          day_of_week: string
          deleted_at: string | null
          frequency: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          season_end: string | null
          season_start: string | null
          updated_at: string
          week_of_month: string | null
          week_pattern: string | null
        }
        Insert: {
          anchor_date?: string | null
          created_at?: string
          day_of_week: string
          deleted_at?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          name: string
          org_id?: string
          season_end?: string | null
          season_start?: string | null
          updated_at?: string
          week_of_month?: string | null
          week_pattern?: string | null
        }
        Update: {
          anchor_date?: string | null
          created_at?: string
          day_of_week?: string
          deleted_at?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          season_end?: string | null
          season_start?: string | null
          updated_at?: string
          week_of_month?: string | null
          week_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequence_enrollments: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          current_event_position: number
          deleted_at: string | null
          enrolled_at: string
          estimate_id: string | null
          id: string
          next_event_position: number
          next_fire_at: string | null
          org_id: string
          sequence_id: string
          status: string
          stopped_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          current_event_position?: number
          deleted_at?: string | null
          enrolled_at?: string
          estimate_id?: string | null
          id?: string
          next_event_position?: number
          next_fire_at?: string | null
          org_id?: string
          sequence_id: string
          status?: string
          stopped_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          current_event_position?: number
          deleted_at?: string | null
          enrolled_at?: string
          estimate_id?: string | null
          id?: string
          next_event_position?: number
          next_fire_at?: string | null
          org_id?: string
          sequence_id?: string
          status?: string
          stopped_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_enrollments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_automation_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequence_events: {
        Row: {
          config: Json
          created_at: string
          deleted_at: string | null
          event_type: string
          id: string
          is_active: boolean
          org_id: string
          position: number
          sequence_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          event_type: string
          id?: string
          is_active?: boolean
          org_id?: string
          position?: number
          sequence_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          org_id?: string
          position?: number
          sequence_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_events_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_automation_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequence_stop_conditions: {
        Row: {
          created_at: string
          field: string
          id: string
          operator: string
          org_id: string
          sequence_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          field: string
          id?: string
          operator: string
          org_id?: string
          sequence_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          operator?: string
          org_id?: string
          sequence_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_stop_conditions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_stop_conditions_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_automation_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequence_trigger_conditions: {
        Row: {
          condition_group: number
          created_at: string
          field: string
          id: string
          operator: string
          org_id: string
          trigger_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          condition_group?: number
          created_at?: string
          field: string
          id?: string
          operator: string
          org_id?: string
          trigger_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          condition_group?: number
          created_at?: string
          field?: string
          id?: string
          operator?: string
          org_id?: string
          trigger_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_trigger_conditions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_trigger_conditions_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "crm_sequence_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequence_triggers: {
        Row: {
          created_at: string
          id: string
          org_id: string
          position: number
          sequence_id: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string
          position?: number
          sequence_id: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          position?: number
          sequence_id?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_triggers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_triggers_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_automation_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_service_rate_matrix: {
        Row: {
          budgeted_cost_cents: number
          budgeted_hours: number
          calc_type: number
          custom_field_id: string
          deleted_at: string | null
          from_val: number
          id: string
          is_tail_row: boolean
          org_id: string
          rate_cents: number
          service_id: string
          sort_order: number
          tail_every_qty: number | null
          tail_over_qty: number | null
          to_val: number | null
        }
        Insert: {
          budgeted_cost_cents?: number
          budgeted_hours?: number
          calc_type?: number
          custom_field_id: string
          deleted_at?: string | null
          from_val?: number
          id?: string
          is_tail_row?: boolean
          org_id: string
          rate_cents?: number
          service_id: string
          sort_order?: number
          tail_every_qty?: number | null
          tail_over_qty?: number | null
          to_val?: number | null
        }
        Update: {
          budgeted_cost_cents?: number
          budgeted_hours?: number
          calc_type?: number
          custom_field_id?: string
          deleted_at?: string | null
          from_val?: number
          id?: string
          is_tail_row?: boolean
          org_id?: string
          rate_cents?: number
          service_id?: string
          sort_order?: number
          tail_every_qty?: number | null
          tail_over_qty?: number | null
          to_val?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_service_rate_matrix_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "crm_rate_matrix_field_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_service_rate_matrix_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "crm_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_service_rate_matrix_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "rpt_services"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_services: {
        Row: {
          call_script_notes: string | null
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
          target_rate_cents_per_hr: number
          target_rate_with_drive_cents: number
          target_rate_with_drive_cents_per_hr: number
          task_color: string | null
          track_chemicals: boolean
          unit: string | null
          updated_at: string
        }
        Insert: {
          call_script_notes?: string | null
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
          target_rate_cents_per_hr?: number
          target_rate_with_drive_cents?: number
          target_rate_with_drive_cents_per_hr?: number
          task_color?: string | null
          track_chemicals?: boolean
          unit?: string | null
          updated_at?: string
        }
        Update: {
          call_script_notes?: string | null
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
          target_rate_cents_per_hr?: number
          target_rate_with_drive_cents?: number
          target_rate_with_drive_cents_per_hr?: number
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
          {
            foreignKeyName: "crm_services_parent_service_id_fkey"
            columns: ["parent_service_id"]
            isOneToOne: false
            referencedRelation: "rpt_services"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_snow_route_stops: {
        Row: {
          created_at: string
          id: string
          job_id: string
          org_id: string
          route_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          org_id?: string
          route_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          org_id?: string
          route_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_snow_route_stops_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "crm_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_snow_route_stops_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "rpt_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_snow_route_stops_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_snow_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "crm_snow_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_snow_routes: {
        Row: {
          created_at: string
          default_crew_id: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_crew_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_crew_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_snow_routes_default_crew_id_fkey"
            columns: ["default_crew_id"]
            isOneToOne: false
            referencedRelation: "crm_crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_snow_routes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_storm_events: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dispatch_status: string
          event_date: string
          forecast_depth_inches: number | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          temperature: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dispatch_status?: string
          event_date: string
          forecast_depth_inches?: number | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id?: string
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dispatch_status?: string
          event_date?: string
          forecast_depth_inches?: number | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_storm_events_org_id_fkey"
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
            foreignKeyName: "crm_tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
      crm_visit_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          job_id: string
          org_id: string
          storage_path: string
          uploaded_by: string | null
          visit_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          job_id: string
          org_id?: string
          storage_path: string
          uploaded_by?: string | null
          visit_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          job_id?: string
          org_id?: string
          storage_path?: string
          uploaded_by?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_visit_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "crm_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_visit_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "rpt_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_visit_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_visit_photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "crm_job_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_visit_photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "rpt_job_visits"
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
            referencedRelation: "rpt_vendors"
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
      estimate_change_requests: {
        Row: {
          client_id: string | null
          created_at: string
          estimate_id: string
          id: string
          message: string
          org_id: string
          requester_email: string | null
          requester_name: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          estimate_id: string
          id?: string
          message: string
          org_id: string
          requester_email?: string | null
          requester_name: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          estimate_id?: string
          id?: string
          message?: string
          org_id?: string
          requester_email?: string | null
          requester_name?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_change_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_change_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_change_requests_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_change_requests_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_change_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_change_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          description: string
          estimate_id: string
          id?: string
          org_id: string
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
            foreignKeyName: "estimate_direct_costs_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
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
      estimate_emails: {
        Row: {
          body_html: string
          email_type: string
          estimate_id: string
          id: string
          org_id: string
          resend_id: string | null
          sent_at: string
          subject: string
          to_email: string
          to_name: string | null
        }
        Insert: {
          body_html: string
          email_type?: string
          estimate_id: string
          id?: string
          org_id: string
          resend_id?: string | null
          sent_at?: string
          subject: string
          to_email: string
          to_name?: string | null
        }
        Update: {
          body_html?: string
          email_type?: string
          estimate_id?: string
          id?: string
          org_id?: string
          resend_id?: string | null
          sent_at?: string
          subject?: string
          to_email?: string
          to_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_emails_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_emails_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_emails_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_line_item_subitems: {
        Row: {
          confirm_qty: boolean
          cost_cents: number
          create_installed_product: boolean
          created_at: string
          deleted_at: string | null
          id: string
          invoice: boolean
          line_item_id: string
          name: string
          org_id: string
          print_on_invoice: boolean
          product_id: string | null
          qty: number
          rate_cents: number
          service_id: string | null
          sort_order: number
          total_cents: number
          type: string
        }
        Insert: {
          confirm_qty?: boolean
          cost_cents?: number
          create_installed_product?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice?: boolean
          line_item_id: string
          name: string
          org_id: string
          print_on_invoice?: boolean
          product_id?: string | null
          qty?: number
          rate_cents?: number
          service_id?: string | null
          sort_order?: number
          total_cents?: number
          type?: string
        }
        Update: {
          confirm_qty?: boolean
          cost_cents?: number
          create_installed_product?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice?: boolean
          line_item_id?: string
          name?: string
          org_id?: string
          print_on_invoice?: boolean
          product_id?: string | null
          qty?: number
          rate_cents?: number
          service_id?: string | null
          sort_order?: number
          total_cents?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_item_subitems_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "estimate_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_item_subitems_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimate_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_line_items: {
        Row: {
          adj_rate_cents: number | null
          applied_discount_id: string | null
          budgeted_hours: number
          calc_type: number
          cost_cents: number
          created_at: string
          deleted_at: string | null
          discount_cents: number
          discount_type: string | null
          discount_value: number | null
          estimate_desc: string | null
          estimate_id: string
          id: string
          internal_note: string | null
          invoice_desc: string | null
          job_note: string | null
          margin_bps: number
          markup_bps: number
          org_id: string
          production_rate_sqft_per_hr: number | null
          qty: number
          rate_cents: number
          row_type: string
          section_name: string | null
          service_id: string | null
          service_name: string
          sort_order: number
          status: string
          tier: string | null
          total_budgeted_hours: number
          total_cents: number
          total_cost_cents: number
          unit_type: string | null
          updated_at: string
          visits: number
        }
        Insert: {
          adj_rate_cents?: number | null
          applied_discount_id?: string | null
          budgeted_hours?: number
          calc_type?: number
          cost_cents?: number
          created_at?: string
          deleted_at?: string | null
          discount_cents?: number
          discount_type?: string | null
          discount_value?: number | null
          estimate_desc?: string | null
          estimate_id: string
          id?: string
          internal_note?: string | null
          invoice_desc?: string | null
          job_note?: string | null
          margin_bps?: number
          markup_bps?: number
          org_id: string
          production_rate_sqft_per_hr?: number | null
          qty?: number
          rate_cents?: number
          row_type?: string
          section_name?: string | null
          service_id?: string | null
          service_name: string
          sort_order?: number
          status?: string
          tier?: string | null
          total_budgeted_hours?: number
          total_cents?: number
          total_cost_cents?: number
          unit_type?: string | null
          updated_at?: string
          visits?: number
        }
        Update: {
          adj_rate_cents?: number | null
          applied_discount_id?: string | null
          budgeted_hours?: number
          calc_type?: number
          cost_cents?: number
          created_at?: string
          deleted_at?: string | null
          discount_cents?: number
          discount_type?: string | null
          discount_value?: number | null
          estimate_desc?: string | null
          estimate_id?: string
          id?: string
          internal_note?: string | null
          invoice_desc?: string | null
          job_note?: string | null
          margin_bps?: number
          markup_bps?: number
          org_id?: string
          production_rate_sqft_per_hr?: number | null
          qty?: number
          rate_cents?: number
          row_type?: string
          section_name?: string | null
          service_id?: string | null
          service_name?: string
          sort_order?: number
          status?: string
          tier?: string | null
          total_budgeted_hours?: number
          total_cents?: number
          total_cost_cents?: number
          unit_type?: string | null
          updated_at?: string
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_applied_discount_id_fkey"
            columns: ["applied_discount_id"]
            isOneToOne: false
            referencedRelation: "crm_discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
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
          {
            foreignKeyName: "estimate_line_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "rpt_services"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_photos: {
        Row: {
          caption: string | null
          created_at: string
          deleted_at: string | null
          estimate_id: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          org_id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          estimate_id: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          deleted_at?: string | null
          estimate_id?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_photos_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_photos_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_share_tokens: {
        Row: {
          accepted_at: string | null
          accepted_by_name: string | null
          created_at: string
          created_by: string | null
          estimate_id: string
          expires_at: string | null
          first_viewed_at: string | null
          id: string
          ip_address: string | null
          last_viewed_at: string | null
          org_id: string
          signature_data: string | null
          token: string
          view_count: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          created_at?: string
          created_by?: string | null
          estimate_id: string
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          ip_address?: string | null
          last_viewed_at?: string | null
          org_id: string
          signature_data?: string | null
          token?: string
          view_count?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by_name?: string | null
          created_at?: string
          created_by?: string | null
          estimate_id?: string
          expires_at?: string | null
          first_viewed_at?: string | null
          id?: string
          ip_address?: string | null
          last_viewed_at?: string | null
          org_id?: string
          signature_data?: string | null
          token?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_share_tokens_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_share_tokens_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_share_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          org_id: string
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
            foreignKeyName: "estimate_template_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "rpt_services"
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
          org_id: string
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
            foreignKeyName: "estimate_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_versions: {
        Row: {
          created_at: string
          created_by: string | null
          estimate_id: string
          id: string
          org_id: string
          sent_to_email: string | null
          snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimate_id: string
          id?: string
          org_id: string
          sent_to_email?: string | null
          snapshot: Json
          version_number?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimate_id?: string
          id?: string
          org_id?: string
          sent_to_email?: string | null
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_versions_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_versions_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "rpt_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          applied_discount_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deposit_collected_at: string | null
          deposit_collected_cents: number
          deposit_method: string | null
          deposit_notes: string | null
          deposit_reference: string | null
          deposit_required_cents: number
          description: string
          discount_cents: number
          discount_type: string | null
          discount_value: number | null
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
          payment_terms: string | null
          po_number: string | null
          probability_bps: number
          reason: string | null
          revenue_cents: number
          sales_rep_id: string | null
          show_discounts: boolean
          source: string | null
          stage: string
          stage_id: string | null
          subtotal_cents: number
          tax_cents: number
          tax_rate_bps: number
          tier_labels: Json
          tiers_enabled: boolean
          total_budgeted_hours: number
          total_cents: number
          updated_at: string
          valid_until_date: string | null
          work_order_number: string | null
        }
        Insert: {
          applied_discount_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deposit_collected_at?: string | null
          deposit_collected_cents?: number
          deposit_method?: string | null
          deposit_notes?: string | null
          deposit_reference?: string | null
          deposit_required_cents?: number
          description?: string
          discount_cents?: number
          discount_type?: string | null
          discount_value?: number | null
          est_document?: string
          estimate_date: string
          estimate_number?: number
          gross_profit_cents?: number
          id?: string
          net_profit_cents?: number
          notes?: string | null
          num_installments?: number
          org_id: string
          overhead_cost_cents?: number
          overhead_rate_bps?: number
          payment_terms?: string | null
          po_number?: string | null
          probability_bps?: number
          reason?: string | null
          revenue_cents?: number
          sales_rep_id?: string | null
          show_discounts?: boolean
          source?: string | null
          stage?: string
          stage_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          tier_labels?: Json
          tiers_enabled?: boolean
          total_budgeted_hours?: number
          total_cents?: number
          updated_at?: string
          valid_until_date?: string | null
          work_order_number?: string | null
        }
        Update: {
          applied_discount_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deposit_collected_at?: string | null
          deposit_collected_cents?: number
          deposit_method?: string | null
          deposit_notes?: string | null
          deposit_reference?: string | null
          deposit_required_cents?: number
          description?: string
          discount_cents?: number
          discount_type?: string | null
          discount_value?: number | null
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
          payment_terms?: string | null
          po_number?: string | null
          probability_bps?: number
          reason?: string | null
          revenue_cents?: number
          sales_rep_id?: string | null
          show_discounts?: boolean
          source?: string | null
          stage?: string
          stage_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          tax_rate_bps?: number
          tier_labels?: Json
          tiers_enabled?: boolean
          total_budgeted_hours?: number
          total_cents?: number
          updated_at?: string
          valid_until_date?: string | null
          work_order_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_applied_discount_id_fkey"
            columns: ["applied_discount_id"]
            isOneToOne: false
            referencedRelation: "crm_discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
          {
            foreignKeyName: "estimates_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_estimate_stages"
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
          account_number_next: number
          account_number_prefix: string
          account_number_suffix: string
          address: Json
          brand_color: string
          cost_method: string
          created_at: string
          customizations: Json
          default_billing_terms: string
          default_invoice_delivery: string
          default_invoice_frequency: string
          id: string
          name: string
          plan: string
          portal_enabled: boolean
          slug: string
          tax_rate_percent: number
          updated_at: string
        }
        Insert: {
          account_number_next?: number
          account_number_prefix?: string
          account_number_suffix?: string
          address?: Json
          brand_color?: string
          cost_method?: string
          created_at?: string
          customizations?: Json
          default_billing_terms?: string
          default_invoice_delivery?: string
          default_invoice_frequency?: string
          id?: string
          name: string
          plan?: string
          portal_enabled?: boolean
          slug: string
          tax_rate_percent?: number
          updated_at?: string
        }
        Update: {
          account_number_next?: number
          account_number_prefix?: string
          account_number_suffix?: string
          address?: Json
          brand_color?: string
          cost_method?: string
          created_at?: string
          customizations?: Json
          default_billing_terms?: string
          default_invoice_delivery?: string
          default_invoice_frequency?: string
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
            foreignKeyName: "parts_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "rpt_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "rpt_vendors"
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
          client_id: string | null
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
          client_id?: string | null
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
          client_id?: string | null
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
            foreignKeyName: "photo_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "po_line_items_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "rpt_products"
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
            referencedRelation: "rpt_vendors"
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
            foreignKeyName: "project_direct_items_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "rpt_products"
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
            referencedRelation: "rpt_vendors"
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
          budget_hours: number | null
          burdened_rate_cents: number | null
          city: string
          client_id: string | null
          contract_price: number
          created_at: string
          created_by: string | null
          customer_name: string
          deleted_at: string | null
          end_date: string | null
          id: string
          is_archived: boolean
          labor_hours: number | null
          labor_rate_cents: number | null
          name: string
          notes: string | null
          org_id: string
          progress_pct: number
          start_date: string | null
          state: string
          status: string
          total_cost: number
          updated_at: string
          zip: string
        }
        Insert: {
          address?: string
          budget_hours?: number | null
          burdened_rate_cents?: number | null
          city?: string
          client_id?: string | null
          contract_price?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          is_archived?: boolean
          labor_hours?: number | null
          labor_rate_cents?: number | null
          name: string
          notes?: string | null
          org_id?: string
          progress_pct?: number
          start_date?: string | null
          state?: string
          status?: string
          total_cost?: number
          updated_at?: string
          zip?: string
        }
        Update: {
          address?: string
          budget_hours?: number | null
          burdened_rate_cents?: number | null
          city?: string
          client_id?: string | null
          contract_price?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          is_archived?: boolean
          labor_hours?: number | null
          labor_rate_cents?: number | null
          name?: string
          notes?: string | null
          org_id?: string
          progress_pct?: number
          start_date?: string | null
          state?: string
          status?: string
          total_cost?: number
          updated_at?: string
          zip?: string
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
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "rpt_clients"
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
            referencedRelation: "rpt_vendors"
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
            foreignKeyName: "requisition_line_items_product_item_id_fkey"
            columns: ["product_item_id"]
            isOneToOne: false
            referencedRelation: "rpt_products"
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
            referencedRelation: "rpt_vendors"
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
            referencedRelation: "rpt_vendors"
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
            referencedRelation: "rpt_vendors"
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
      rpt_client_activity: {
        Row: {
          activity_type: string | null
          amount_cents: number | null
          body: string | null
          client_name: string | null
          client_status: string | null
          created_at: string | null
          id: string | null
          occurred_at: string | null
          sent_to: string | null
          status: string | null
          subject: string | null
        }
        Relationships: []
      }
      rpt_client_contacts: {
        Row: {
          balance_outstanding_cents: number | null
          client_name: string | null
          client_status: string | null
          contact_type: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string | null
          is_primary: boolean | null
          last_name: string | null
          ok_to_email: boolean | null
          phone: string | null
          phone_type: string | null
          sales_rep: string | null
        }
        Relationships: []
      }
      rpt_clients: {
        Row: {
          account_type: string | null
          balance_credits_cents: number | null
          balance_outstanding_cents: number | null
          balance_prepay_cents: number | null
          balance_uninvoiced_cents: number | null
          billing_address: string | null
          billing_city: string | null
          billing_state: string | null
          billing_terms: string | null
          billing_zip: string | null
          cancellation_reason: string | null
          client_since: string | null
          closed_at: string | null
          created_at: string | null
          display_name: string | null
          first_name: string | null
          gross_sqft: number | null
          id: string | null
          invoice_frequency: string | null
          is_taxable: boolean | null
          map_code: string | null
          payment_method: string | null
          primary_email: string | null
          primary_phone: string | null
          referred_by: string | null
          sales_rep: string | null
          source: string | null
          status: string | null
          turf_sqft: number | null
        }
        Relationships: []
      }
      rpt_contracts: {
        Row: {
          auto_generate: boolean | null
          billing_day_of_month: number | null
          billing_frequency: string | null
          client_name: string | null
          created_at: string | null
          end_date: string | null
          id: string | null
          is_active: boolean | null
          last_billed_date: string | null
          monthly_amount_cents: number | null
          sales_rep: string | null
          source: string | null
          start_date: string | null
          status: string | null
          title: string | null
        }
        Relationships: []
      }
      rpt_employees: {
        Row: {
          applicator_license: string | null
          cell_phone: string | null
          city: string | null
          compensation_type: string | null
          date_hired: string | null
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          employment_status: string | null
          first_name: string | null
          full_name: string | null
          hourly_rate_cents: number | null
          id: string | null
          is_active: boolean | null
          is_sales_rep: boolean | null
          last_name: string | null
          phone: string | null
          resource_code: string | null
          state: string | null
          user_type: string | null
        }
        Insert: {
          applicator_license?: string | null
          cell_phone?: string | null
          city?: string | null
          compensation_type?: string | null
          date_hired?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employment_status?: string | null
          first_name?: string | null
          full_name?: never
          hourly_rate_cents?: number | null
          id?: string | null
          is_active?: boolean | null
          is_sales_rep?: boolean | null
          last_name?: string | null
          phone?: string | null
          resource_code?: string | null
          state?: string | null
          user_type?: string | null
        }
        Update: {
          applicator_license?: string | null
          cell_phone?: string | null
          city?: string | null
          compensation_type?: string | null
          date_hired?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          employment_status?: string | null
          first_name?: string | null
          full_name?: never
          hourly_rate_cents?: number | null
          id?: string | null
          is_active?: boolean | null
          is_sales_rep?: boolean | null
          last_name?: string | null
          phone?: string | null
          resource_code?: string | null
          state?: string | null
          user_type?: string | null
        }
        Relationships: []
      }
      rpt_estimate_line_items: {
        Row: {
          budgeted_hours: number | null
          client_name: string | null
          cost_cents: number | null
          estimate_date: string | null
          estimate_number: number | null
          estimate_stage: string | null
          id: string | null
          margin_pct: number | null
          qty: number | null
          rate_cents: number | null
          sales_rep: string | null
          service_name: string | null
          status: string | null
          total_budgeted_hours: number | null
          total_cents: number | null
          total_cost_cents: number | null
          visits: number | null
        }
        Relationships: []
      }
      rpt_estimates: {
        Row: {
          age_days: number | null
          client_name: string | null
          client_status: string | null
          created_at: string | null
          description: string | null
          discount_cents: number | null
          estimate_date: string | null
          estimate_number: number | null
          gross_profit_cents: number | null
          id: string | null
          net_profit_cents: number | null
          probability_pct: number | null
          reason: string | null
          sales_rep: string | null
          source: string | null
          stage: string | null
          subtotal_cents: number | null
          tax_cents: number | null
          total_budgeted_hours: number | null
          total_cents: number | null
          updated_at: string | null
          valid_until_date: string | null
        }
        Relationships: []
      }
      rpt_invoice_line_items: {
        Row: {
          client_name: string | null
          description: string | null
          hours: number | null
          id: string | null
          invoice_date: string | null
          invoice_number: number | null
          invoice_status: string | null
          is_taxable: boolean | null
          men: number | null
          name: string | null
          qty: number | null
          rate_cents: number | null
          service_date: string | null
          total_cents: number | null
        }
        Relationships: []
      }
      rpt_invoices: {
        Row: {
          amount_paid_cents: number | null
          balance_cents: number | null
          billing_city: string | null
          billing_zip: string | null
          client_name: string | null
          created_at: string | null
          days_overdue: number | null
          description: string | null
          discount_cents: number | null
          due_date: string | null
          id: string | null
          invoice_date: string | null
          invoice_number: number | null
          payment_method: string | null
          po_number: string | null
          sales_rep: string | null
          service_address: string | null
          status: string | null
          subtotal_cents: number | null
          tax_cents: number | null
          terms: string | null
          total_cents: number | null
          under_contract: boolean | null
        }
        Relationships: []
      }
      rpt_job_visits: {
        Row: {
          actual_hours: number | null
          actual_labor_cost_cents: number | null
          budgeted_hours: number | null
          client_name: string | null
          clocked_in_at: string | null
          clocked_out_at: string | null
          completed_at: string | null
          crew_name: string | null
          id: string | null
          man_hours: number | null
          men_count: number | null
          rate_cents: number | null
          rev_per_man_hr_cents: number | null
          revenue_cents: number | null
          sales_rep: string | null
          scheduled_date: string | null
          service_city: string | null
          service_names: string | null
          service_zip: string | null
          skip_reason: string | null
          status: string | null
          sub_status: string | null
          variance_hours: number | null
        }
        Relationships: []
      }
      rpt_jobs: {
        Row: {
          actual_hours: number | null
          budgeted_hours: number | null
          client_name: string | null
          created_at: string | null
          crew_name: string | null
          date_sold: string | null
          id: string | null
          is_complete: boolean | null
          job_number: number | null
          job_type: string | null
          man_count: number | null
          package_name: string | null
          product_total_cents: number | null
          rate_cents: number | null
          sales_rep: string | null
          scheduled_date: string | null
          service_address: string | null
          service_city: string | null
          service_names: string | null
          service_total_cents: number | null
          service_zip: string | null
          source: string | null
          status: string | null
          sub_status: string | null
          tax_cents: number | null
          total_cents: number | null
          under_contract: boolean | null
        }
        Relationships: []
      }
      rpt_payments: {
        Row: {
          amount_cents: number | null
          applied_amount_cents: number | null
          billing_zip: string | null
          client_name: string | null
          created_at: string | null
          id: string | null
          invoice_number: number | null
          is_prepayment: boolean | null
          memo: string | null
          method: string | null
          payment_date: string | null
          reference: string | null
          refunded_amount_cents: number | null
          unused_amount_cents: number | null
        }
        Relationships: []
      }
      rpt_products: {
        Row: {
          category: string | null
          id: string | null
          is_inventory: boolean | null
          minimum_stock: number | null
          name: string | null
          part_category: string | null
          part_number: string | null
          price: number | null
          quantity_on_hand: number | null
          unit_cost: number | null
          vendor_name: string | null
        }
        Insert: {
          category?: string | null
          id?: string | null
          is_inventory?: boolean | null
          minimum_stock?: number | null
          name?: string | null
          part_category?: string | null
          part_number?: string | null
          price?: number | null
          quantity_on_hand?: number | null
          unit_cost?: number | null
          vendor_name?: string | null
        }
        Update: {
          category?: string | null
          id?: string | null
          is_inventory?: boolean | null
          minimum_stock?: number | null
          name?: string | null
          part_category?: string | null
          part_number?: string | null
          price?: number | null
          quantity_on_hand?: number | null
          unit_cost?: number | null
          vendor_name?: string | null
        }
        Relationships: []
      }
      rpt_services: {
        Row: {
          category: string | null
          code: string | null
          default_rate_cents: number | null
          id: string | null
          is_active: boolean | null
          is_taxable: boolean | null
          name: string | null
          production_rate_sqft_per_hr: number | null
          target_rate_cents_per_hr: number | null
          target_rate_with_drive_cents_per_hr: number | null
          unit: string | null
        }
        Insert: {
          category?: string | null
          code?: string | null
          default_rate_cents?: number | null
          id?: string | null
          is_active?: boolean | null
          is_taxable?: boolean | null
          name?: string | null
          production_rate_sqft_per_hr?: number | null
          target_rate_cents_per_hr?: number | null
          target_rate_with_drive_cents_per_hr?: number | null
          unit?: string | null
        }
        Update: {
          category?: string | null
          code?: string | null
          default_rate_cents?: number | null
          id?: string | null
          is_active?: boolean | null
          is_taxable?: boolean | null
          name?: string | null
          production_rate_sqft_per_hr?: number | null
          target_rate_cents_per_hr?: number | null
          target_rate_with_drive_cents_per_hr?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      rpt_timesheets: {
        Row: {
          break_minutes: number | null
          client_name: string | null
          clocked_in_at: string | null
          clocked_out_at: string | null
          crew_name: string | null
          hours: number | null
          id: string | null
          labor_burden_cents_per_hour: number | null
          labor_cost_cents: number | null
          lunch_minutes: number | null
          member_name: string | null
          visit_status: string | null
          work_date: string | null
        }
        Relationships: []
      }
      rpt_vendors: {
        Row: {
          address: string | null
          contact_name: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          phone: string | null
          vendor_type: string | null
          w9_status: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          vendor_type?: string | null
          w9_status?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          phone?: string | null
          vendor_type?: string | null
          w9_status?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_part_quantity: {
        Args: { p_delta: number; p_part_id: string; p_work_order_id?: string }
        Returns: undefined
      }
      assign_invoice_number: { Args: { p_invoice_id: string }; Returns: number }
      crm_run_report: {
        Args: {
          p_aggregates?: Json
          p_columns: string[]
          p_dataset: string
          p_filters?: Json
          p_group_by?: string[]
          p_limit?: number
          p_sort_column?: string
          p_sort_dir?: string
        }
        Returns: Json
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
      receive_part_quantity: {
        Args: {
          p_new_cost_layers: Json
          p_new_unit_cost: number
          p_org_id: string
          p_part_id: string
          p_po_number: string
          p_quantity: number
        }
        Returns: undefined
      }
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
