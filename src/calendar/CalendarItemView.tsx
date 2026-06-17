import {
    type App,
    ItemView,
    MarkdownView,
    Menu,
    Modal,
    Notice,
    TFile,
    type WorkspaceLeaf,
} from "obsidian";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { VIEW_TYPE_CALENDAR } from "../constants";
import type SingleFileDailyNotes from "../main";
import { SimpleCalendarView } from "./SimpleCalendarView";
import { NoteStore, type NoteEntry } from "../note/NoteStore";
import {
    getDailyNotesFile,
    getHeadingForDate,
    getHeadingMd,
    insertNoteForDate,
    createDailyNotesFile,
    moment,
} from "../utils";

/**
 * 日程创建数据
 */
export interface NoteCreateData {
    title: string;
    content: string;
    startTime: string;
    endTime: string;
}

/**
 * 获取当前时间的 HH:mm 格式
 */
function getCurrentTime(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
}

/**
 * 获取结束时间（开始时间+1小时）
 */
function getEndTime(startTime: string): string {
    const [hours, minutes] = startTime.split(":").map(Number);
    const endHours = (hours + 1) % 24;
    return `${endHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Obsidian ItemView 包装器 - 日历视图用于点击日期创建日程
 */
export class CalendarItemView extends ItemView {
    plugin: SingleFileDailyNotes;
    root: Root | null = null;
    noteStore: NoteStore;

    constructor(leaf: WorkspaceLeaf, plugin: SingleFileDailyNotes) {
        super(leaf);
        this.plugin = plugin;
        this.noteStore = new NoteStore(this.app, this.plugin.settings);
    }

    getViewType(): string {
        return VIEW_TYPE_CALENDAR;
    }

    getDisplayText(): string {
        return "日历";
    }

    getIcon(): string {
        return "calendar-days";
    }

    async onOpen() {
        // 初始化 NoteStore
        await this.noteStore.refresh();

        // 注册文件变更监听
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                const dailyNotesFile = getDailyNotesFile(
                    this.app,
                    this.plugin.settings
                );
                if (file instanceof TFile && file === dailyNotesFile) {
                    // 文件修改时刷新数据，刷新完成后会自动触发 onRefresh 回调更新日历
                    void this.noteStore.refresh();
                }
            })
        );

        this.root = createRoot(this.containerEl.children[1]);
        this.render();
    }

    async onClose() {
        this.root?.unmount();
    }

    private render() {
        this.root?.render(
            <StrictMode>
                <SimpleCalendarView
                    settings={this.plugin.settings}
                    noteStore={this.noteStore}
                    onDateClick={this.handleDateClick.bind(this)}
                    onNoteClick={this.handleNoteClick.bind(this)}
                    onNoteRightClick={this.handleNoteRightClick.bind(this)}
                />
            </StrictMode>
        );
    }

    /**
     * 处理点击日期（弹出新建日程窗口）
     */
    private async handleDateClick(date: Date) {
        let file = this.getDailyNotesFile();

        // 如果日程文件不存在，自动创建
        if (!file) {
            try {
                file = await createDailyNotesFile(this.app, this.plugin.settings);
                if (!file) {
                    new Notice("创建日程文件失败");
                    return;
                }
                new Notice("日程文件已创建");
            } catch (error) {
                const err = error as Error;
                new Notice("创建日程文件失败: " + err.message);
                return;
            }
        }

        const targetDate = moment(date);

        // 弹出新建日程窗口
        // biome-ignore lint/security/noUnsafeArgument: moment.js 类型问题
        new CreateNoteModal(
            this.app,
            targetDate,
            this.plugin.settings.dateFormat,
            async (data: NoteCreateData) => {
                await this.createNoteForDate(targetDate, data);
            },
        ).open();
    }

    /**
     * 处理点击日程（跳转到日程位置）
     */
    private async handleNoteClick(note: NoteEntry) {
        const file = this.getDailyNotesFile();
        if (!file) return;

        await this.goToNote(file, note.heading);
    }

    /**
     * 处理右键点击日程（显示菜单）
     */
    private handleNoteRightClick(note: NoteEntry, e: MouseEvent) {
        const menu = new Menu();

        menu.addItem((item) =>
            item
                .setTitle("编辑日程")
                .setIcon("pencil")
                .onClick(() => {
                    void this.handleEditNote(note);
                })
        );

        menu.addItem((item) =>
            item
                .setTitle("跳转到日程")
                .setIcon("arrow-right")
                .onClick(() => {
                    void this.handleNoteClick(note);
                })
        );

        menu.addItem((item) =>
            item
                .setTitle("打开日程文件")
                .setIcon("file-text")
                .onClick(() => {
                    void this.handleOpenDiaryFile();
                })
        );

        menu.addSeparator();

        menu.addItem((item) =>
            item
                .setTitle("删除日程")
                .setIcon("trash")
                .onClick(() => {
                    void this.handleDeleteNote(note);
                })
        );

        menu.showAtMouseEvent(e);
    }

    /**
     * 打开日程文件
     */
    private async handleOpenDiaryFile() {
        const file = this.getDailyNotesFile();
        if (!file) {
            new Notice("日程文件未找到");
            return;
        }

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
    }

    /**
     * 编辑日程
     */
    private async handleEditNote(note: NoteEntry) {
        const file = this.getDailyNotesFile();
        if (!file) return;

        new EditNoteModal(
            this.app,
            note,
            async (data: NoteCreateData) => {
                await this.noteStore.updateNoteWithTitle(
                    note,
                    data.title,
                    data.content,
                    data.startTime,
                    data.endTime
                );
                // 文件修改后，vault.on("modify") 会自动触发 refresh() 和日历更新
                new Notice("日程已更新");
            },
            async () => {
                await this.handleDeleteNote(note);
            },
        ).open();
    }

    /**
     * 删除日程
     */
    private async handleDeleteNote(note: NoteEntry) {
        const file = this.getDailyNotesFile();
        if (!file) return;

        await this.noteStore.deleteNote(note);
        // 文件修改后，vault.on("modify") 会自动触发 refresh() 和日历更新
        new Notice("日程已删除");
    }

    /**
     * 跳转到日程区块
     */
    private async goToNote(file: TFile, heading: string) {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            const content = await this.app.vault.read(file);
            const lines = content.split("\n");
            const lineIndex = lines.findIndex((line) => line.startsWith(heading));

            if (lineIndex !== -1) {
                const pos = { line: lineIndex + 1, ch: 0 };
                view.editor.setCursor(pos);
                view.editor.scrollIntoView(
                    { from: pos, to: { line: pos.line, ch: 999 } },
                    true,
                );
            }
        }
    }

    /**
     * 创建日程（格式：#### 标题 HH:mm-HH:mm）
     */
    private async createNoteForDate(date: moment.Moment, data: NoteCreateData) {
        const file = this.getDailyNotesFile();
        if (!file) return;

        // 构建条目内容：4级标题格式
        // 格式：#### 标题 HH:mm-HH:mm
        //       （空行）
        //       详细内容
        //       （空行）- 日程之间的分隔
        let noteLines: string[] = [`#### ${data.title} ${data.startTime}-${data.endTime}`];

        // 如果有详细内容，添加空行后再添加内容
        if (data.content.trim()) {
            noteLines.push(""); // 空行
            const contentLines = data.content.split("\n").filter(l => l.trim());
            noteLines.push(...contentLines);
        }

        // 日程末尾添加空行，作为日程之间的分隔
        noteLines.push("");

        await this.app.vault.process(file, (fileContent) => {
            // 先创建区块（如果不存在）
            const [newContent, insertIndex] = insertNoteForDate(
                fileContent,
                date,
                this.plugin.settings,
            );

            // 添加内容到区块中
            const lines = newContent.split("\n");
            const heading = getHeadingForDate(this.plugin.settings, date);
            let sectionStart = -1;
            for (let i = insertIndex; i < lines.length; i++) {
                if (lines[i].startsWith(heading)) {
                    sectionStart = i;
                    break;
                }
            }

            if (sectionStart !== -1) {
                // 找到该日期区块的结束位置（下一个日期标题或文件末尾）
                // 注意：日程标题是 ####，日期标题是 ###，需要精确匹配标题级别
                const dateHeadingMd = getHeadingMd(this.plugin.settings);
                const dateHeadingPattern = new RegExp(`^${dateHeadingMd} `);  // 精确匹配 "### "（后面有空格）
                let sectionEnd = lines.length;
                for (let i = sectionStart + 1; i < lines.length; i++) {
                    if (dateHeadingPattern.test(lines[i])) {
                        sectionEnd = i;
                        break;
                    }
                }

                // 在日期区块末尾追加条目（直接插入多个行元素）
                lines.splice(sectionEnd, 0, ...noteLines);
                return lines.join("\n");
            }

            return newContent;
        });

        // 文件修改后，vault.on("modify") 会自动触发 refresh()
        // refresh() 完成后会触发 onRefresh 回调更新日历
        new Notice("日程已创建");
    }

    /**
     * 获取日程文件
     */
    private getDailyNotesFile(): TFile | null {
        return getDailyNotesFile(this.app, this.plugin.settings);
    }

    /**
     * 更新设置（当设置变更时调用）
     */
    updateSettings() {
        this.noteStore.updateSettings(this.plugin.settings);
        void this.noteStore.refresh().then(() => {
            this.render();
        });
    }
}

/**
 * 新建日程模态框（时间必设）
 */
export class CreateNoteModal extends Modal {
    date: moment.Moment;
    dateFormat: string;
    onCreate: (data: NoteCreateData) => Promise<void>;

    private title: string = "";
    private content: string = "";
    private startTime: string;
    private endTime: string;

    constructor(
        app: App,
        date: moment.Moment,
        dateFormat: string,
        onCreate: (data: NoteCreateData) => Promise<void>,
    ) {
        super(app);
        this.date = date;
        this.dateFormat = dateFormat;
        this.onCreate = onCreate;

        // 默认时间：开始时间为当前时间，结束时间为开始时间+1小时
        const currentTime = getCurrentTime();
        this.startTime = currentTime;
        this.endTime = getEndTime(currentTime);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("create-note-modal");

        // 标题
        contentEl.createEl("h2", {
            text: "新建日程",
        });

        // 日期显示
        contentEl.createEl("p", {
            text: `日期：${this.date.format(this.dateFormat)}`,
            cls: "note-date",
        });

        // 时间输入区域（必填）- 单行显示：开始时间 - 结束时间
        const timeDiv = contentEl.createDiv("time-inputs-container");

        // 开始时间输入框
        const startTimeInput = timeDiv.createEl("input", {
            attr: {
                type: "time",
                value: this.startTime,
            },
        });

        // 分隔符
        timeDiv.createEl("span", { text: "-", cls: "time-divider" });

        // 结束时间输入框
        const endTimeInput = timeDiv.createEl("input", {
            attr: {
                type: "time",
                value: this.endTime,
            },
        });

        // 时间标签（放在上方）
        const timeLabel = contentEl.createEl("label", {
            text: "时间：",
            cls: "modal-form-label",
        });
        contentEl.insertBefore(timeLabel, timeDiv);

        startTimeInput.addEventListener("input", (e) => {
            this.startTime = (e.target as HTMLInputElement).value;
        });

        endTimeInput.addEventListener("input", (e) => {
            this.endTime = (e.target as HTMLInputElement).value;
        });

        // 标题输入
        contentEl.createEl("label", {
            text: "标题：",
            cls: "modal-form-label",
        });
        const titleInput = contentEl.createEl("input", {
            attr: {
                type: "text",
                placeholder: "输入标题...",
            },
            cls: "modal-text-input",
        });

        // 内容输入
        contentEl.createEl("label", {
            text: "详细内容（可选）：",
            cls: "modal-form-label",
        });
        const textarea = contentEl.createEl("textarea", {
            attr: {
                placeholder: "输入详细内容...",
                rows: "4",
            },
            cls: "modal-textarea",
        });
        textarea.addEventListener("input", (e) => {
            this.content = (e.target as HTMLTextAreaElement).value;
        });

        // 按钮
        const buttonDiv = contentEl.createDiv("modal-button-container");

        buttonDiv
            .createEl("button", { text: "取消" })
            .addEventListener("click", () => {
                this.close();
            });

        buttonDiv
            .createEl("button", { text: "创建", cls: "mod-cta" })
            // biome-ignore lint: button click handler
            .addEventListener("click", async () => {
                if (!this.title.trim()) {
                    new Notice("请输入标题");
                    return;
                }
                if (!this.startTime || !this.endTime) {
                    new Notice("请设置时间");
                    return;
                }
                await this.onCreate({
                    title: this.title,
                    content: this.content,
                    startTime: this.startTime,
                    endTime: this.endTime,
                });
                this.close();
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * 编辑日程模态框
 */
export class EditNoteModal extends Modal {
    note: NoteEntry;
    onSave: (data: NoteCreateData) => Promise<void>;
    onDelete: () => Promise<void>;

    private title: string;
    private content: string;
    private startTime: string;
    private endTime: string;

    constructor(
        app: App,
        note: NoteEntry,
        onSave: (data: NoteCreateData) => Promise<void>,
        onDelete: () => Promise<void>,
    ) {
        super(app);
        this.note = note;
        this.onSave = onSave;
        this.onDelete = onDelete;

        // 解析现有内容
        const parsed = this.parseNoteContent(note);
        this.title = parsed.title;
        this.content = parsed.content;
        this.startTime = parsed.startTime || getCurrentTime();
        this.endTime = parsed.endTime || getCurrentTime();
    }

    /**
     * 解析日程内容，提取标题、时间和详细内容
     * 新格式：#### 标题 HH:mm-HH:mm
     */
    private parseNoteContent(note: NoteEntry): { title: string; content: string; startTime?: string; endTime?: string } {
        // 从标题行解析（note.title 可能包含时间信息）
        // 条目格式：#### 标题 HH:mm-HH:mm
        const titleLine = note.title;

        // 尝试解析时间格式：标题 HH:mm-HH:mm（时间在末尾）
        const timeRangeMatch = titleLine.match(/^(.+?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
        if (timeRangeMatch) {
            const title = timeRangeMatch[1].trim();
            const startTime = timeRangeMatch[2];
            const endTime = timeRangeMatch[3];
            const content = note.content.join("\n");
            return { title, content, startTime, endTime };
        }

        // 没有时间格式
        const content = note.content.join("\n");
        return { title: titleLine, content };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("edit-note-modal");

        // 标题
        contentEl.createEl("h2", {
            text: "编辑日程",
        });

        // 日期显示
        contentEl.createEl("p", {
            text: `日期：${this.note.dateKey}`,
            cls: "note-date",
        });

        // 时间输入区域（必填）- 单行显示：开始时间 - 结束时间
        const timeDiv = contentEl.createDiv("time-inputs-container");

        // 开始时间输入框
        const startTimeInput = timeDiv.createEl("input", {
            attr: {
                type: "time",
                value: this.startTime,
            },
        });

        // 分隔符
        timeDiv.createEl("span", { text: "-", cls: "time-divider" });

        // 结束时间输入框
        const endTimeInput = timeDiv.createEl("input", {
            attr: {
                type: "time",
                value: this.endTime,
            },
        });

        // 时间标签（放在上方）
        const timeLabel = contentEl.createEl("label", {
            text: "时间：",
            cls: "modal-form-label",
        });
        contentEl.insertBefore(timeLabel, timeDiv);

        startTimeInput.addEventListener("input", (e) => {
            this.startTime = (e.target as HTMLInputElement).value;
        });

        endTimeInput.addEventListener("input", (e) => {
            this.endTime = (e.target as HTMLInputElement).value;
        });

        // 条目标题输入
        contentEl.createEl("label", {
            text: "条目标题：",
            cls: "modal-form-label",
        });
        const titleInput = contentEl.createEl("input", {
            attr: {
                type: "text",
                placeholder: "输入条目标题...",
                value: this.title,
            },
            cls: "modal-text-input",
        });

        // 内容输入
        contentEl.createEl("label", {
            text: "详细内容（可选）：",
            cls: "modal-form-label",
        });
        const textarea = contentEl.createEl("textarea", {
            attr: {
                placeholder: "输入详细内容...",
                rows: "6",
            },
            cls: "modal-textarea",
        });
        textarea.value = this.content;
        textarea.addEventListener("input", (e) => {
            this.content = (e.target as HTMLTextAreaElement).value;
        });

        // 按钮
        const buttonDiv = contentEl.createDiv("modal-button-container-with-delete");

        // 左侧：删除按钮
        const deleteButton = buttonDiv.createEl("button", {
            text: "删除",
            cls: "mod-danger modal-delete-button",
        });
        // biome-ignore lint: button click handler
        deleteButton.addEventListener("click", async () => {
            await this.onDelete();
            this.close();
        });

        // 右侧：取消和保存按钮
        const rightButtons = buttonDiv.createDiv("modal-button-right");

        rightButtons
            .createEl("button", { text: "取消" })
            .addEventListener("click", () => {
                this.close();
            });

        rightButtons
            .createEl("button", { text: "保存", cls: "mod-cta" })
            // biome-ignore lint: button click handler
            .addEventListener("click", async () => {
                if (!this.title.trim()) {
                    new Notice("请输入标题");
                    return;
                }
                if (!this.startTime || !this.endTime) {
                    new Notice("请设置时间");
                    return;
                }
                await this.onSave({
                    title: this.title,
                    content: this.content,
                    startTime: this.startTime,
                    endTime: this.endTime,
                });
                this.close();
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}