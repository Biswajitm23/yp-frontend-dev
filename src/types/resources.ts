// src/types/resources.ts

export type ResourceEnvelope<T> = {
  status: "OK" | "ERROR";
  message: string;
  data: T;
};

export interface ResourceCategory {
  id: string;
  category_name: string;
  banner_text: string | null;
  banner_image_url: string | null;
}

export interface ResourceCategoryRef {
  id: string;
  category_name: string;
}

export type ResourceMediaType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "document"
  | "youtube"
  | "";

export interface ResourceMedia {
  id: string;
  media_type: ResourceMediaType;
  url: string;
  /**
   * Per-media image thumbnail (webp). Present for pdf/doc media so the banner
   * can show a poster + play button before loading the actual file; null when
   * the media is itself an image (or has no generated thumbnail).
   */
  thumbnail_url: string | null;
  sort_order: number;
}

export interface ResourceListItem {
  id: string;
  title: string;
  excerpt: string;
  category: ResourceCategoryRef;
  thumbnail_url: string | null;
  /** Authoritative type of the resource's primary media (pdf | docx | image | video | audio | youtube). */
  primary_media_type?: string | null;
  media_count: number;
  is_featured: boolean;
  published_at: string | null;
  created_at: string | null;
}

export interface ResourceListData {
  count: number;
  total_count: number;
  result: ResourceListItem[];
}

export interface ResourceDetail {
  id: string;
  title: string;
  body: string | null;
  is_featured: boolean;
  view_count: number;
  category: ResourceCategory;
  /** Resource-level image thumbnail (webp) — mirrors the primary media's thumbnail. */
  thumbnail_url?: string | null;
  /** Authoritative type of the resource's primary media (pdf | docx | image | video | audio | youtube). */
  primary_media_type?: string | null;
  media: ResourceMedia[];
  published_at: string | null;
  created_at: string | null;
}
