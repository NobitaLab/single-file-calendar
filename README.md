# Single File Calendar

A lightweight calendar plugin for Obsidian that stores all calendar data in a single markdown file.

## Features

- **Month/Week/Day Views**: Switch between different calendar views
- **Single File Storage**: All events stored in one markdown file
- **Quick Event Creation**: Click dates to create events
- **Event Management**: Edit and delete events via right-click menu
- **Customizable**: Configure file name, location, date format, and heading level

## Installation

### From Obsidian Community Plugin Market
1. Open Obsidian Settings → Community plugins
2. Turn off Safe Mode
3. Search "Single File Calendar"
4. Click Install and Enable

### Manual Install
1. Download `main.js`, `manifest.json`, `styles.css` from GitHub Release
2. Create folder `.obsidian/plugins/single-file-calendar`
3. Put all three files into the folder
4. Restart Obsidian and enable the plugin

## Basic Usage

1. Open calendar view from left sidebar icon
2. Create your first calendar note (or the plugin will create one automatically)
3. Click dates to add events
4. Right-click events to edit or delete
5. Customize week start, color theme in plugin settings

## Settings

- **Calendar File Name**: Name of the markdown file (default: "日程")
- **Calendar File Location**: Folder path where the file is stored
- **Heading Level**: Markdown heading level for date sections (h2-h6)
- **Date Format**: Date display format using moment.js syntax
- **Month Format**: Month display format

## Data Format

Events are stored in markdown format:
```markdown
### 2024-01-15, 星期一

#### Meeting 14:00-15:00
- Discussion notes
```

## License

MIT

---

# Obsidian 单文件日历 (Single File Calendar)

一个功能强大的 [Obsidian](https://obsidian.md) 插件，提供月视图、周视图和日视图，将所有日程记录在同一个 Markdown 文件中。

## 主要特性

- **多视图支持**：月视图、周视图、日视图
- **单文件存储**：所有日程保存在一个 Markdown 文件中
- **快速创建**：点击日期即可创建日程
- **右键菜单**：支持编辑和删除日程
- **高度可配置**：自定义文件名、路径、日期格式等

## 安装

### 从 Obsidian 社区插件市场
1. 打开 Obsidian 设置 → 社区插件
2. 关闭安全模式
3. 搜索 "Single File Calendar"
4. 点击安装并启用

### 手动安装
1. 从 GitHub Release 下载 `main.js`、`manifest.json`、`styles.css`
2. 创建文件夹 `.obsidian/plugins/single-file-calendar`
3. 将三个文件放入文件夹
4. 重启 Obsidian 并启用插件

## 基本用法

1. 从左侧边栏图标打开日历视图
2. 创建第一个日程文件（或插件会自动创建）
3. 点击日期添加日程
4. 右键点击日程进行编辑或删除
5. 在插件设置中自定义周开始日、主题颜色等

## 设置选项

- **日程文件名**：Markdown 文件名（默认为"日程"）
- **日程文件位置**：文件存放的文件夹路径
- **日程区块标题级别**：日期区块使用的标题级别（h2-h6）
- **日程区块日期格式**：使用 moment.js 格式的日期显示格式
- **月份标题格式**：月份显示格式

## 数据格式

日程以 Markdown 格式存储：
```markdown
### 2024-01-15, 星期一

#### 会议 14:00-15:00
- 讨论纪要
```

## 许可证

MIT
