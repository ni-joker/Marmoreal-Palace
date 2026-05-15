# HTML 表单数据填充工具

一个基于 Electron 的桌面应用，用于将 CSV / JSON 数据批量填充进 HTML 表单。适合表单测试、批量生成报表、模板数据填充等场景。

## ✨ 功能特性

- 🖱 **可视化操作**：图形界面，无需编写代码
- 📄 **HTML 表单解析**：自动识别 `input`、`textarea`、`select`、`radio`、`checkbox` 等字段
- 📊 **多种数据源**：支持 CSV 与 JSON 数据导入
- 🔗 **智能字段映射**：根据字段名/标签/占位符自动匹配数据列
- 👁 **实时预览**：边填边看，所见即所得
- 💾 **单条 / 批量导出**：可导出单个填充结果，也可批量生成多个文件
- 🎨 **现代化界面**：清晰的步骤指引，简洁直观

## 📸 工作流程

1. **加载 HTML**：选择需要填充的 HTML 表单文件
2. **导入数据**：选择 CSV 或 JSON 格式的数据文件
3. **字段映射**：检查并调整自动映射，确认数据列与表单字段的对应关系
4. **填充导出**：填充当前行预览，或批量导出全部数据

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18
- npm ≥ 9

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/ni-joker/html-form-filler.git
cd html-form-filler

# 安装依赖
npm install

# 启动应用
npm start

# 启动开发模式（带 DevTools）
npm run dev
```

### 打包为可执行文件

```bash
# 当前平台
npm run build

# 指定平台
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

打包产物会输出到 `dist/` 目录。

## 📂 示例数据

仓库中的 `samples/` 目录包含示例文件，可以直接用于测试：

- `samples/sample-form.html` — 一个员工信息登记表单
- `samples/sample-data.csv` — 5 条 CSV 测试数据
- `samples/sample-data.json` — 3 条 JSON 测试数据

## 📋 支持的字段类型

| 字段类型 | 填充方式 |
|---------|---------|
| `input[type="text/email/number/tel/url/password/date/...]` | 设置 `value` 属性 |
| `textarea` | 设置内部文本 |
| `select` | 按值或显示文本匹配 `option` |
| `input[type="radio"]` | 按 `value` 匹配选项 |
| `input[type="checkbox"]` | 解析真值（1/true/yes/是/真 等） |

## 🔍 字段映射规则

自动映射会按以下顺序匹配数据列：

1. 字段 `name` 属性精确匹配
2. 字段 `id` 属性精确匹配
3. 字段标签文本精确匹配
4. 占位符（placeholder）精确匹配
5. 模糊包含匹配

匹配时忽略大小写、空格、下划线和连字符。如果自动映射不准确，可以在侧边栏手动调整。

## 🛠 技术栈

- [Electron](https://www.electronjs.org/) — 跨平台桌面应用框架
- 纯原生 JavaScript / HTML / CSS（无前端框架依赖）
- 内置轻量级 CSV 解析器（无需第三方依赖）

## 📁 项目结构

```
html-form-filler/
├── main.js          # Electron 主进程
├── preload.js       # 预加载脚本（安全 IPC 桥接）
├── index.html       # 渲染进程 UI
├── styles.css       # 样式表
├── renderer.js      # 渲染进程逻辑（解析、映射、填充）
├── package.json     # 项目配置
├── samples/         # 示例 HTML 与数据
└── README.md
```

## ⌨️ 快捷键

| 操作 | Windows / Linux | macOS |
|------|----------------|-------|
| 打开 HTML | Ctrl + O | Cmd + O |
| 导入数据 | Ctrl + I | Cmd + I |
| 导出结果 | Ctrl + S | Cmd + S |

## 🤝 贡献

欢迎提交 Issue 与 Pull Request！

1. Fork 本仓库
2. 创建特性分支 `git checkout -b feature/your-feature`
3. 提交修改 `git commit -m "feat: add your feature"`
4. 推送到分支 `git push origin feature/your-feature`
5. 提交 Pull Request

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

## ❓ 常见问题

**Q: 我的 HTML 表单有 JavaScript 验证逻辑，填充后会触发吗？**
A: 应用直接修改 HTML 源码中的 `value`/`checked` 属性，导出的是静态填充结果。预览中的 iframe 默认禁用脚本（出于安全考虑），实际运行时取决于使用环境。

**Q: CSV 中有英文逗号、引号或换行怎么办？**
A: 内置 CSV 解析器支持双引号包裹的字段，转义引号请使用 `""`。例如：`"包含,逗号","包含""引号"""`。

**Q: JSON 数据格式有什么要求？**
A: 必须是对象数组：`[{"key1": "value1", ...}, {...}]`。所有对象的键的并集会作为可用数据列。

**Q: 如何映射多选框？**
A: 单选框（radio）按 `value` 匹配数据列的值。复选框（checkbox）会判断数据值是否为真（1/true/yes/是/真），决定是否勾选。
