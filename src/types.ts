export type {
  BulkActionPayload,
  BulkMutationResult,
  Category,
  CreateLeadInput,
  FaqItem,
  Lead,
  LeadItem,
  LeadItemInput,
  LeadStatus,
  NewsItem,
  PricingOption,
  Product,
  Review,
  SiteSettings,
  TelegramWebhookEvent
} from "../shared/models";

export interface AdminSessionResponse {
  authenticated: boolean;
}
