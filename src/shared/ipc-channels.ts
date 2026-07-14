export const IPC = {
  // Prompts
  PROMPTS_LIST: 'prompts:list',
  PROMPTS_GET: 'prompts:get',
  PROMPTS_CREATE: 'prompts:create',
  PROMPTS_UPDATE: 'prompts:update',
  PROMPTS_DELETE: 'prompts:delete',
  PROMPTS_BATCH_DELETE: 'prompts:batchDelete',

  // Tags
  TAGS_ALL: 'tags:all',
  TAGS_CREATE: 'tags:create',
  TAGS_DELETE: 'tags:delete',
  TAGS_GET_FOR_PROMPT: 'tags:getForPrompt',
  TAGS_SET_FOR_PROMPT: 'tags:setForPrompt',

  // Images
  IMAGES_IMPORT: 'images:import',
  IMAGES_DELETE: 'images:delete',
  IMAGES_GET_FOR_PROMPT: 'images:getForPrompt',
  IMAGES_GET_THUMBNAIL: 'images:getThumbnail',
  IMAGES_SET_PRIMARY: 'images:setPrimary',
  IMAGES_REORDER: 'images:reorder',
  IMAGES_OPEN_FOLDER: 'images:openFolder',

  // Search
  SEARCH_QUERY: 'search:query',
  SEARCH_SUGGEST: 'search:suggest',

  // Dialogs
  DIALOG_OPEN_IMAGES: 'dialog:openImages',

  // App
  APP_GET_PATHS: 'app:getPaths',
} as const;
