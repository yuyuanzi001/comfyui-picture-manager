import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  ListOptions, SearchParams, CreatePromptDTO, UpdatePromptDTO,
  PaginatedResult, PromptListItem, PromptDetail, Tag,
  SearchSuggestion, ImportResult, ImageRecord, AppPaths,
} from '../shared/types';

const api = {
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  prompts: {
    list: (opts: ListOptions): Promise<PaginatedResult<PromptListItem>> => ipcRenderer.invoke(IPC.PROMPTS_LIST, opts),
    get: (id: number): Promise<PromptDetail> => ipcRenderer.invoke(IPC.PROMPTS_GET, id),
    create: (dto: CreatePromptDTO): Promise<PromptDetail> => ipcRenderer.invoke(IPC.PROMPTS_CREATE, dto),
    update: (id: number, dto: UpdatePromptDTO): Promise<PromptDetail> => ipcRenderer.invoke(IPC.PROMPTS_UPDATE, id, dto),
    delete: (id: number): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.PROMPTS_DELETE, id),
    batchDelete: (ids: number[]): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.PROMPTS_BATCH_DELETE, ids),
  },
  tags: {
    all: (): Promise<Tag[]> => ipcRenderer.invoke(IPC.TAGS_ALL),
    create: (name: string): Promise<Tag> => ipcRenderer.invoke(IPC.TAGS_CREATE, name),
    delete: (id: number): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.TAGS_DELETE, id),
    getForPrompt: (promptId: number): Promise<Tag[]> => ipcRenderer.invoke(IPC.TAGS_GET_FOR_PROMPT, promptId),
    setForPrompt: (promptId: number, tagIds: number[]): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.TAGS_SET_FOR_PROMPT, promptId, tagIds),
  },
  images: {
    import: (filePaths: string[], autoExtract?: boolean): Promise<ImportResult> => ipcRenderer.invoke(IPC.IMAGES_IMPORT, { filePaths, autoExtract }),
    rebuildThumbs: (size?: number): Promise<{ rebuilt: number; failed: number; total: number; size: number }> => ipcRenderer.invoke(IPC.IMAGES_REBUILD_THUMBS, size),
    scanImages: (): Promise<{ scanned: number; imported: number; cleaned: number; fixedThumbs: number }> => ipcRenderer.invoke(IPC.IMAGES_SCAN),
    delete: (id: number): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.IMAGES_DELETE, id),
    getForPrompt: (promptId: number): Promise<ImageRecord[]> => ipcRenderer.invoke(IPC.IMAGES_GET_FOR_PROMPT, promptId),
    getThumbnail: (id: number): Promise<string | null> => ipcRenderer.invoke(IPC.IMAGES_GET_THUMBNAIL, id),
    setPrimary: (id: number): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.IMAGES_SET_PRIMARY, id),
    openFolder: (id: number): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.IMAGES_OPEN_FOLDER, id),
  },
  search: {
    query: (params: SearchParams): Promise<PaginatedResult<PromptListItem>> => ipcRenderer.invoke(IPC.SEARCH_QUERY, params),
    suggest: (prefix: string): Promise<SearchSuggestion[]> => ipcRenderer.invoke(IPC.SEARCH_SUGGEST, prefix),
  },
  dialog: {
    openImages: (): Promise<string[]> => ipcRenderer.invoke(IPC.DIALOG_OPEN_IMAGES),
    openDirectory: (): Promise<string | null> => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR),
  },
  app: {
    getPaths: (): Promise<AppPaths> => ipcRenderer.invoke(IPC.APP_GET_PATHS),
    getDataDir: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_DATA_DIR),
    setDataDir: (dir: string): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.APP_SET_DATA_DIR, dir),
    openPath: (p: string): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.APP_OPEN_PATH, p),
    exportData: (): Promise<{ success: boolean; message: string; count?: number; path?: string }> => ipcRenderer.invoke(IPC.APP_EXPORT_DATA),
    saveWorkflowFile: (json: string): Promise<{ success: boolean; message: string; path?: string }> => ipcRenderer.invoke(IPC.APP_SAVE_WORKFLOW, json),
    getSetting: (key: string): Promise<string | null> => ipcRenderer.invoke(IPC.APP_GET_SETTING, key),
    setSetting: (key: string, value: string): Promise<{ success: boolean }> => ipcRenderer.invoke(IPC.APP_SET_SETTING, key, value),
  },
  onFilesChanged: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on('files-changed', handler);
    return () => { ipcRenderer.removeListener('files-changed', handler); };
  },
  onRebuildProgress: (cb: (data: { rebuilt: number; failed: number; total: number }) => void): (() => void) => {
    const handler = (_: any, data: any) => cb(data);
    ipcRenderer.on('rebuild-progress', handler);
    return () => { ipcRenderer.removeListener('rebuild-progress', handler); };
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
export type ElectronAPI = typeof api;
