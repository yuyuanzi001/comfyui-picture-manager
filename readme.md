# ComfyUI Picture Manager

本地桌面应用，用于管理 ComfyUI 生成的图片、提示词和参数。拖入 PNG 自动提取内嵌的 ComfyUI workflow 元数据——无需联网，纯本地运行。

## 功能

### 导入与元数据提取
- **一键导入** — 选择或拖入多张 PNG/JPG/WebP，自动复制到管理存储
- **Workflow 元数据** — 读取 PNG `tEXt` 数据块，提取 Model、Sampler、Steps、CFG、Seed、正负面提示词
- **完整 Workflow JSON** — 保存并展示完整的 ComfyUI workflow JSON；可复制到剪贴板或保存为 `.json` 文件直接在 ComfyUI 中复用
- **ComfyUI 输出监控** — 设置 ComfyUI 输出目录，通过 `chokidar` 文件监听自动导入新生成的图片

### 图库浏览
- **网格卡片视图** — 缩略图 + 提示词预览 + 模型名 + Steps + 分辨率
- **分页** — 每页 48 张，上/下翻页
- **数据驱动分辨率筛选** — 占图库 >5% 的分辨率作为主选项，其余归入「其他」分组
- **底模筛选** — 下拉列出所有已导入的模型
- **即时搜索** — 输入关键词，在正负面提示词、模型名、采样器中实时过滤
- **关键词 Chips** — 点击 `+` 添加多个关键词取交集过滤，支持重命名和删除

### 详情页
- **大图查看** — 主图 + 多图轮播缩略图
- **生成参数** — Model、Sampler、Steps、CFG、Seed、分辨率、创建时间
- **提示词复制按钮** — 一键复制正/负面提示词到剪贴板
- **可折叠 Workflow** — 格式化 JSON 展示，复制到剪贴板或保存为 `.json` 文件
- **键盘翻图** — 左右方向键切换图片
- **标签管理** — 在详情页直接添加/删除标签

### 批量操作
- **多选模式** — 每张卡片复选框、全选、取消
- **批量删除** — 一次性删除多组提示词及关联图片
- **批量打标签** — Modal 弹窗输入标签名，为选中的多项批量添加同一标签

### 右键菜单
- **查看详情** — 跳转详情页
- **复制正面提示词** — 直接从图库复制
- **打开文件位置** — 资源管理器中打开图片
- **删除** — 确认后删除

### 设置
- **数据存储路径** — 更改数据库和图片的存储位置
- **主题** — 浅色 / 深色 / 跟随系统，即时切换
- **缩略图大小** — 128/256/384/512px，支持重建全部缩略图并显示进度
- **ComfyUI 输出目录** — 配置监控目录实现自动导入
- **备份导出** — 将数据库 + 图片 + 缩略图导出到任意文件夹

### 技术特性
- **纯本地** — SQLite 数据库(sql.js WASM)，无需联网
- **错误边界** — 前端崩溃时显示降级 UI + 重载按钮
- **滚动位置保留** — 从详情页返回图库时恢复之前的滚动位置
- **键盘快捷键** — `Esc` 关闭菜单 / 退出选择模式 / 清除筛选；`Delete` 批量删除选中项
- **单元测试** — 12 个 vitest 测试覆盖数据库参数化查询和 PNG 元数据提取

## 截图

### 图库
![图库](screenshots/library.png)

### 详情页
![详情页](screenshots/detail.png)

### 批量选择
![批量选择](screenshots/batch.png)

### 右键菜单
![右键菜单](screenshots/context-menu.png)

### 设置
![设置](screenshots/settings.png)

## 快速开始

```bash
git clone https://github.com/yuyuanzi001/comfyui-picture-manager.git
cd comfyui-picture-manager
npm install
npm start
```

或者双击 `启动.bat` 一键构建启动。

**环境要求**：Node.js >= 18，Windows 10/11

## 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Electron 33 |
| 前端 | React 19 + TypeScript |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand + React Query |
| 数据库 | SQLite via sql.js (WASM) |
| 文件监听 | chokidar |
| 图片处理 | Electron nativeImage |
| 构建(主进程) | TypeScript (tsc) |
| 构建(渲染进程) | Vite 6 |
| 打包 | electron-builder (NSIS/dmg/AppImage) |
| 测试 | Vitest (12 个单元测试) |

## 项目结构

```
src/
├── main/               # Electron 主进程
│   ├── index.ts        # 窗口、文件监听、启动流程
│   ├── database.ts     # SQLite 初始化、迁移、参数化查询
│   ├── ipc/
│   │   ├── index.ts    # Handler 注册入口
│   │   └── handlers/   # app, prompts, tags, images, search
│   ├── migrations/     # 数据库迁移脚本
│   ├── services/       # 共享导入逻辑
│   └── utils/          # PNG 元数据解析、缩略图生成、路径管理
├── preload/            # contextBridge API
├── renderer/           # React 前端
│   ├── App.tsx         # 路由 + 主题 + ErrorBoundary
│   ├── components/
│   │   ├── layout/     # AppShell, Sidebar
│   │   ├── library/    # PromptCard
│   │   └── shared/     # Button, Modal, Toast, EmptyState, Spinner, TextInput, ErrorBoundary
│   ├── hooks/          # usePrompts, useTags
│   ├── lib/            # IPC 客户端
│   └── pages/          # LibraryPage, PromptDetailPage, ImportPage, SettingsPage
└── shared/             # TypeScript 类型 & IPC 通道常量
```

## 许可证

GPL-3.0 — 详见 [LICENSE](LICENSE)
