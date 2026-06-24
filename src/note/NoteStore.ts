import { type App, TFile } from "obsidian";
import type { PluginSettings } from "../settings";
import {
    getDailyNotesFile,
    getHeadingMd,
    moment,
} from "../utils";

/**
 * 日程信息（单个条目）
 */
export interface NoteEntry {
    /** 唯一ID */
    id: string;
    /** 日期键 (YYYY-MM-DD) */
    dateKey: string;
    /** 日期标题（完整标题文本，如 ### 2024-01-01） */
    heading: string;
    /** 条目标题（不含时间部分） */
    title: string;
    /** 完整标题行（#### HH:mm-HH:mm 标题） */
    fullTitle: string;
    /** 行号 */
    lineNumber: number;
    /** 内容行数 */
    lineCount: number;
    /** 详细内容（不含标题行） */
    content: string[];
    /** 开始时间 (HH:mm) */
    startTime?: string;
    /** 结束时间 (HH:mm) */
    endTime?: string;
}

/**
 * 日程数据存储 - 从日程文件中提取每天的日程信息
 */
export class NoteStore {
    private notes: Map<string, NoteEntry[]> = new Map();
    private app: App;
    private settings: PluginSettings;
    private lastModified: number = 0;
    private onRefreshCallbacks: Set<() => void> = new Set();

    constructor(app: App, settings: PluginSettings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * 获取缓存的日程（不触发刷新）
     */
    getCachedNotes(): NoteEntry[] {
        return Array.from(this.notes.values()).flat();
    }

    /**
     * 从文件刷新缓存
     */
    async refresh(): Promise<void> {
        const file = getDailyNotesFile(this.app, this.settings);
        if (!file) {
            this.notes.clear();
            return;
        }

        const content = await this.app.vault.read(file);
        const notes = this.parseFile(content);

        this.notes.clear();
        for (const note of notes) {
            const existing = this.notes.get(note.dateKey) || [];
            existing.push(note);
            this.notes.set(note.dateKey, existing);
        }

        this.lastModified = file.stat.mtime;

        // 通知订阅者
        for (const callback of this.onRefreshCallbacks) {
            callback();
        }
    }

    /**
     * 订阅刷新事件
     */
    onRefresh(callback: () => void): () => void {
        this.onRefreshCallbacks.add(callback);
        return () => this.onRefreshCallbacks.delete(callback);
    }

    /**
     * 从文件内容解析所有日程
     * 新格式：#### HH:mm-HH:mm 标题
     */
    private parseFile(content: string): NoteEntry[] {
        const lines = content.split("\n");
        const notes: NoteEntry[] = [];

        const dateHeadingMd = getHeadingMd(this.settings);
        const dateHeadingRegex = new RegExp(`^${dateHeadingMd} (.+)`);

        let skipFrontMatter = lines[0] === "---";
        let frontMatterEnd = -1;  // 改为 -1，表示没有 front matter

        // 查找 front matter 结束位置
        if (skipFrontMatter) {
            for (let i = 1; i < lines.length; i++) {
                if (lines[i] === "---") {
                    frontMatterEnd = i;
                    break;
                }
            }
        }

        // 如果有 front matter，从结束位置后开始；否则从开头开始
        const startIndex = frontMatterEnd >= 0 ? frontMatterEnd + 1 : 0;

        for (
            let i = startIndex;
            i < lines.length;
            i++
        ) {
            const line = lines[i];
            const dateHeadingMatch = line.match(dateHeadingRegex);

            if (dateHeadingMatch) {
                // 解析日期标题（如 ### 2024-01-01）
                const dateStr = dateHeadingMatch[1];

                // 尝试多种日期格式解析
                let date = moment(dateStr, this.settings.dateFormat, true);

                // 如果主格式不匹配，尝试备用格式
                if (!date.isValid()) {
                    const fallbackFormats = [
                        "YYYY-MM-DD, dddd",
                        "YYYY-MM-DD",
                        "YYYY-MM-DD, 星期五",
                        "YYYY-MM-DD, 星期六",
                        "YYYY年MM月DD日",
                        "MM-DD-YYYY, dddd",
                    ];
                    for (const format of fallbackFormats) {
                        date = moment(dateStr, format, true);
                        if (date.isValid()) {
                            break;
                        }
                    }
                }

                if (date.isValid()) {
                    const dateKey = date.format("YYYY-MM-DD");
                    const dateHeadingLine = i;

                    // 找到下一个日期标题的位置
                    let contentEnd = lines.length;
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].match(dateHeadingRegex)) {
                            contentEnd = j;
                            break;
                        }
                    }

                    // 解析该日期区块内的所有条目（4级标题 ####）
                    let currentLine = i + 1;
                    while (currentLine < contentEnd) {
                        const contentLine = lines[currentLine];

                        // 匹配条目标题：#### 标题 HH:mm-HH:mm 或 #### 标题
                        const entryMatch = contentLine.match(/^####\s+(.+)$/);

                        if (entryMatch) {
                            const entryContent = entryMatch[1];
                            const entryLineNumber = currentLine;
                            let entryLineCount = 1;

                            // 解析时间格式：标题 HH:mm-HH:mm（时间在末尾）
                            const timeRangeMatch = entryContent.match(/^(.+?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);

                            let title: string;
                            let startTime: string | undefined;
                            let endTime: string | undefined;
                            let additionalContent: string[] = [];

                            if (timeRangeMatch) {
                                title = timeRangeMatch[1].trim();
                                startTime = timeRangeMatch[2];
                                endTime = timeRangeMatch[3];
                            } else {
                                title = entryContent;
                            }

                            // 收集后续非标题内容（详细内容）
                            currentLine++;
                            while (currentLine < contentEnd) {
                                const nextLine = lines[currentLine];
                                // 非标题行都属于当前条目的详细内容（包括空行后的内容）
                                if (!nextLine.match(/^#{1,6}\s/)) {
                                    if (nextLine.trim() !== "") {
                                        additionalContent.push(nextLine);
                                    }
                                    entryLineCount++;
                                    currentLine++;
                                } else {
                                    // 遇到新标题，停止
                                    break;
                                }
                            }

                            // 创建唯一ID
                            const noteId = `${dateKey}-${entryLineNumber}`;

                            notes.push({
                                id: noteId,
                                dateKey,
                                heading: line, // 日期标题
                                title, // 条目标题（不含时间）
                                fullTitle: contentLine, // 完整条目标题行
                                lineNumber: entryLineNumber,
                                lineCount: entryLineCount,
                                content: additionalContent,
                                startTime,
                                endTime,
                            });
                        } else {
                            currentLine++;
                        }
                    }
                }
            }
        }

        return notes;
    }

    /**
     * 更新日程（新格式：#### 标题 HH:mm-HH:mm）
     */
    async updateNoteWithTitle(
        note: NoteEntry,
        newTitle: string,
        newContent: string,
        startTime: string,
        endTime: string
    ): Promise<void> {
        const file = getDailyNotesFile(this.app, this.settings);
        if (!file) throw new Error("日程文件未找到");

        await this.app.vault.process(file, (content) => {
            const lines = content.split("\n");

            // 构建新的条目标题行：#### 标题 HH:mm-HH:mm
            const newEntryLine = `#### ${newTitle} ${startTime}-${endTime}`;

            // 替换条目标题行
            lines[note.lineNumber] = newEntryLine;

            // 删除旧的详细内容
            let deleteCount = note.lineCount - 1;
            if (deleteCount > 0) {
                lines.splice(note.lineNumber + 1, deleteCount);
            }

            // 插入新的详细内容（先加空行，再加内容）
            if (newContent.trim()) {
                const contentLines = newContent.split("\n").filter(l => l.trim());
                // 先插入空行
                lines.splice(note.lineNumber + 1, 0, "");
                // 再插入内容
                for (let i = 0; i < contentLines.length; i++) {
                    lines.splice(note.lineNumber + 2 + i, 0, contentLines[i]);
                }
            }

            return lines.join("\n");
        });

        // 文件修改后，vault.on("modify") 会自动触发 refresh()
    }

    /**
     * 删除日程 - 如果当日没有日程则删除日期标题
     */
    async deleteNote(note: NoteEntry): Promise<void> {
        const file = getDailyNotesFile(this.app, this.settings);
        if (!file) throw new Error("日程文件未找到");

        await this.app.vault.process(file, (content) => {
            const lines = content.split("\n");
            const dateHeadingMd = getHeadingMd(this.settings);

            // 找到该日期区块的起始位置
            let sectionStart = -1;
            for (let i = 0; i <= note.lineNumber; i++) {
                if (lines[i].startsWith(dateHeadingMd + " ")) {
                    sectionStart = i;
                    break;
                }
            }

            if (sectionStart === -1) {
                // 找不到日期标题，直接删除
                lines.splice(note.lineNumber, note.lineCount);
                return lines.join("\n");
            }

            // 检查该日期区块内是否还有其他日程
            // 需要检查整个日期区块，不只是被删除日程之后的部分
            let hasOtherNotes = false;
            for (let i = sectionStart; i < lines.length; i++) {
                const line = lines[i];
                // 如果遇到下一个日期标题，停止检查
                if (line.startsWith(dateHeadingMd + " ") && i !== sectionStart) {
                    break;
                }
                // 检查是否有其他日程（4级标题），排除当前要删除的日程
                if (line.startsWith("#### ") && i !== note.lineNumber) {
                    hasOtherNotes = true;
                    break;
                }
            }

            if (!hasOtherNotes) {
                // 没有其他日程了，删除整个日期区块（包含日期标题）
                const deleteCount = note.lineNumber - sectionStart + note.lineCount;
                lines.splice(sectionStart, deleteCount);
            } else {
                // 还有其他日程，直接删除日程行
                lines.splice(note.lineNumber, note.lineCount);
            }

            return lines.join("\n");
        });

        // 文件修改后，vault.on("modify") 会自动触发 refresh()
    }

    /**
     * 更新设置引用
     */
    updateSettings(settings: PluginSettings): void {
        this.settings = settings;
    }
}