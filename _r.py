with open(r'C:\Users\yuan\Desktop\comfyui-picture-manager\README.md', 'r', encoding='utf-8') as f:
    content = f.read()

old = "网上下的 AI 图拖进去，点详情页就能看到对方用的完整 ComfyUI workflow——模型、提示词、采样器参数全部提取。点「保存到 ComfyUI」导出 JSON，拖进 ComfyUI 直接复现。"

new = """网上下的 AI 图拖进去，点详情页就能看到对方用的完整 ComfyUI workflow——模型、提示词、采样器参数全部提取。点「保存到 ComfyUI」导出 JSON，拖进 ComfyUI 直接复现。

> **注意**：微信、QQ、微博、Twitter 等社交平台发送图片时会压缩重新编码，嵌入的 ComfyUI 元数据会被清除。**只有从 ComfyUI 直接导出、或通过网盘/邮件以原文件形式分享的 PNG 才包含 workflow 信息。**"""

content = content.replace(old, new)

with open(r'C:\Users\yuan\Desktop\comfyui-picture-manager\README.md', 'w', encoding='utf-8') as f:
    f.write(content)
print('done')
