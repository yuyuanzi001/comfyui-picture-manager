// ---- Entities ----

export interface Prompt {
  id: number;
  positive: string;
  negative: string;
  model: string;
  sampler: string;
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface PromptListItem extends Prompt {
  primary_thumb_path: string | null;
  primary_file_path: string | null;
  tag_ids: number[];
  tag_names: string[];
}

export interface PromptDetail extends Prompt {
  images: ImageRecord[];
  tags: Tag[];
}

export interface ImageRecord {
  id: number;
  prompt_id: number;
  file_name: string;
  file_path: string;
  thumb_path: string | null;
  width: number;
  height: number;
  file_size: number;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
  prompt_count?: number;
}

// ---- DTOs ----

export interface CreatePromptDTO {
  positive: string;
  negative: string;
  model: string;
  sampler: string;
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
  notes?: string;
  tagIds?: number[];
  imagePaths?: string[];
}

export interface UpdatePromptDTO {
  positive?: string;
  negative?: string;
  model?: string;
  sampler?: string;
  steps?: number;
  cfg?: number;
  seed?: number;
  width?: number;
  height?: number;
  notes?: string;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  sort?: 'created_at' | 'updated_at' | 'model' | 'steps';
  order?: 'asc' | 'desc';
  tagIds?: number[];
}

export interface SearchParams {
  query: string;
  tagIds?: number[];
  model?: string;
  page?: number;
  pageSize?: number;
  sort?: 'created_at' | 'updated_at';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SearchSuggestion {
  type: 'tag' | 'model';
  text: string;
  id?: number;
}

export interface ExtractedMetadata {
  positive: string;
  negative: string;
  model: string;
  sampler: string;
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
  workflow?: string; // raw workflow JSON string
}

export interface ImportResult {
  importedCount: number;
  errors: Array<{ fileName: string; error: string }>;
}

export interface AppPaths {
  userData: string;
  imagesDir: string;
  thumbnailsDir: string;
}
