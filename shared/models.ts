export type LeadStatus = "new" | "contacted" | "closed";

export interface BulkActionPayload<TPatch = Record<string, unknown>> {
  ids: string[];
  action: string;
  patch?: TPatch;
}

export interface BulkMutationResult {
  count: number;
}

export interface SiteSettings {
  siteName: string;
  telegramChannel: string;
  heroTitle: string;
  heroSubtitle: string;
  footerDescription: string;
  leadTitle: string;
  leadSubtitle: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt?: string;
}

export interface PricingOption {
  id: string;
  label: string;
  price: number;
  compareAt: number | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  summary: string;
  details: string[];
  logo: string;
  isHot: boolean;
  isActive: boolean;
  sortOrder: number;
  pricingOptions: PricingOption[];
  updatedAt?: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  dateLabel: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt?: string;
}

export interface Review {
  id: string;
  name: string;
  rating: number;
  content: string;
  sortOrder: number;
  isActive: boolean;
  isModerated: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface LeadItem {
  id: string;
  productId: string;
  pricingOptionId: string | null;
  labelSnapshot: string;
  unitPriceSnapshot: number;
  compareAtSnapshot: number | null;
  quantity: number;
}

export interface LeadItemInput {
  productId: string;
  pricingOptionId?: string | null;
  quantity?: number;
}

export interface CreateLeadInput {
  name: string;
  contact: string;
  message: string;
  items?: LeadItemInput[];
  productId?: string | null;
}

export interface Lead {
  id: string;
  name: string;
  contact: string;
  items: LeadItem[];
  message: string;
  status: LeadStatus;
  createdAt: string;
}
