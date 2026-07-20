/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'Owner' | 'Worker';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  shop_id?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface Customer {
  id: string;
  shop_id?: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  email?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface Measurements {
  id: string;
  shop_id?: string;
  customer_id: string;
  // Key-value store of custom measurements (e.g., neck: 15.5, chest: 42, length: 30)
  data: Record<string, string | number>;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export type OrderStatus = 'Pending' | 'Cutting' | 'Stitching' | 'Fitting' | 'Ready' | 'Ready to Deliver' | 'Delivered' | 'Archived';

export interface OrderItem {
  type: string;
  price: number;
  quantity?: number;
  notes?: string;
  color?: string;
  delivery_date?: string;
  measurement_snapshot?: Record<string, string | number>;
  styling_snapshot?: Record<string, string>;
}

export interface Order {
  id: string;
  shop_id?: string;
  order_number: string;
  customer_id: string;
  customer_name?: string; // joined
  customer_phone?: string; // joined
  customer_whatsapp?: string; // joined
  customer_address?: string; // joined
  status: OrderStatus;
  items: OrderItem[];
  total_amount: number;
  paid_amount: number;
  due_date: string;
  measurement_snapshot: Record<string, string | number>;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface AuditMeta {
  user_name?: string;
  user_role?: string;
  module?: string;
  record_id?: string;
  previous_value?: any;
  new_value?: any;
  device?: string;
  ip_address?: string;
  notes?: string;
}

export interface AuditLog {
  id: string;
  shop_id?: string;
  user_id: string;
  user_email: string;
  action: string;
  details: Record<string, any>;
  created_at: string;
  user_name?: string;
  user_role?: string;
  module?: string;
  record_id?: string;
  previous_value?: any;
  new_value?: any;
  device?: string;
  ip_address?: string;
  notes?: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  enabled: boolean;
}

export interface ShopSettings {
  shop_id?: string;
  shop_name: string;
  phone: string;
  address: string;
  currency: string; // e.g., $, PKR, INR, AED, £
  measurement_fields: string[]; // customizable measurement parameters
  pipeline_stages?: PipelineStage[]; // customizable pipeline stages
  auto_archive_days?: number; // default: 30 days
  measurement_unit?: 'Inches' | 'Centimeters' | 'Feet';
  whatsapp_message_template?: string;
  updated_at: string;
  updated_by: string;
}

export interface MeasurementField {
  name: string;
  required: boolean;
  display_order: number;
}

export interface GarmentType {
  id: string;
  shop_id?: string;
  name: string;
  enabled: boolean;
  display_order: number;
  price?: number;
  measurement_fields: MeasurementField[];
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

export interface MeasurementProfile {
  id: string;
  garment_type_id: string;
  garment_name: string;
  values: Record<string, string | number>;
  styling_preferences?: Record<string, string>; // Category ID/Name -> Option ID/Name
  created_at: string;
  updated_at: string;
}

export interface StylingOption {
  id: string;
  name: string;
  enabled: boolean;
  display_order: number;
}

export interface StylingCategory {
  id: string;
  shop_id?: string;
  garment_type_id?: string;
  name: string;
  display_order: number;
  options: StylingOption[];
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
}

