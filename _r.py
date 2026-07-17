readme = """# ComfyUI Picture Manager

管理 ComfyUI 生成图片的本地桌面工具。拖入 PNG 就能看到用了什么模型、提示词、参数，还能提取别人的工作流 JSON 直接复用。

纯本地运行，不联网。

## 能干什么

### 管理你的 AI 出图

把 ComfyUI 生成的图片拖进来，自动归类、可搜索、可筛选。翻页浏览，右键直接复制提示词或打开文件位置。图多了也不会乱。

### 偷别人的工作流

网上下的 AI 图拖进去，点详情页就能看到对方用的完整 ComfyUI workflow——模型、提示词、采样器参数全部提取。点「保存到 ComfyUI」导出 JSON，拖进 ComfyUI 直接复现。

### 批量整理

选多张图，一次删除或打上同一个标签。配合搜索和筛选，几百张图也能快速找到想要的。

### 自动导入

设置你的 ComfyUI 输出目录，每次跑完图自动出现在管理器里，不用手动拖。

### 备份迁移

一键导出所有数据（数据库 + 图片 + 缩略图）到任意文件夹，换了电脑也能原样恢复。

## 怎么用

1. 启动后点「+ 导入」，选择 ComfyUI 的 PNG 图片（支持多选和拖拽）
2. 图库里翻页浏览，可以按分辨率、底模筛选，输入关键词搜索
3. 点卡片看详情——正面/负面提示词一键复制，参数全部展示
4. 详情页底部折叠区展开 Workflow JSON，复制或保存为文件
5. 多选模式批量删除、批量打标签
6. 右键卡片可快速复制提示词、打开文件夹、删除

## 截图

![图库](screenshots/library.png)

![详情页](screenshots/detail.png)

![批量选择](screenshots/batch.png)

![右键菜单](screenshots/context-menu.png)

![设置](screenshots/settings.png)

## 环境

- Node.js >= 18
- Windows 10/11

```bash
git clone https://github.com/yuyuanzi001/comfyui-picture-manager.git
cd comfyui-picture-manager
npm install
npm start
```

或双击 `启动.bat`。

## 技术栈

Electron 33 / React 19 / TypeScript / Tailwind CSS / SQLite (sql.js) / chokidar

## 许可证

GPL-3.0
"""

dest = r'C:\Users\yuan\Desktop\comfyui-picture-manager\README.md'
with open(dest, 'w', encoding='utf-8') as f:
    f.write(readme)
print('done')
