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
          created_at: string
          created_by: string | null
          customer_name: string
          deleted_at: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          start_date: string | null
          status: string
          total_cost: number
          updated_at: string
        }
        Insert: {
          address?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id?: string
          start_date?: string | null
          status?: string
          total_cost?: number
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deleted_at?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          start_date?: string | null
          status?: string
          total_cost?: number
          updated_at?: string
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
