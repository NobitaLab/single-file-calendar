import {
    Notice,
    Plugin,
    type TAbstractFile,
    TFile,
    TFolder,
    type WorkspaceLeaf,
} from "obsidian";
import { VIEW_TYPE_CALENDAR } from "./constants";
import { DEFAULT_SETTINGS, type PluginSettings, SettingsTab } from "./settings";
import { CalendarItemView } from "./calendar/CalendarItemView";
import {
    getDailyNotesFilePath,
    getHeadingMd,
} from "./utils";

export default class SingleFileDailyNotes extends Plugin {
    settings!: PluginSettings;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new SettingsTab(this.app, this));

        // 命令：显示日历（侧边栏）
        this.addCommand({
            id: "show-calendar-sidebar",
            name: "显示日历（侧边栏）",
            callback: async () => {
                await this.showCalendar("sidebar");
            },
        });

        // 命令：显示日历（主面板）
        this.addCommand({
            id: "show-calendar-main",
            name: "显示日历（主面板）",
            callback: async () => {
                await this.showCalendar("main");
            },
        });

        // 命令：隐藏日历
        this.addCommand({
            id: "hide-calendar",
            name: "隐藏日历",
            callback: async () => {
                await this.hideCalendar();
            },
        });

        // Ribbon 图标：显示日历
        this.addRibbonIcon("calendar-range", "显示日历", async () => {
            await this.showCalendar("main");
        });

        // 注册日历视图
        this.registerView(
            VIEW_TYPE_CALENDAR,
            (leaf: WorkspaceLeaf) => new CalendarItemView(leaf, this),
        );

        // 启动时自动显示日历
        if (this.app.workspace.layoutReady) {
            await this.showCalendar("main");
        }

        // 事件监听
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) =>
                this.onRename(file, oldPath),
            ),
        );
    }

    async showCalendar(mode: "sidebar" | "main" = "sidebar") {
        const { workspace } = this.app;

        if (mode === "sidebar") {
            await workspace.ensureSideLeaf(VIEW_TYPE_CALENDAR, "right", {
                reveal: true,
                active: true,
            });
        } else {
            const leaf = workspace.getLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_CALENDAR,
                active: true,
            });
        }
    }

    async hideCalendar() {
        const { workspace } = this.app;

        const leaves = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
        for (const leaf of leaves) {
            leaf.detach();
        }
    }

    /**
     * 更新设置以反映新的日程文件名或路径
     */
    async onRename(file: TAbstractFile, oldPath: string) {
        const { settings } = this;

        const currentPath = getDailyNotesFilePath(settings);

        if (file instanceof TFile && oldPath === currentPath) {
            settings.noteName = file.basename;
        }

        if (file instanceof TFolder && currentPath.startsWith(oldPath)) {
            const newPath = file.path + currentPath.substring(oldPath.length);
            const justPath = newPath.substring(0, newPath.lastIndexOf("/"));
            settings.noteLocation = justPath;
        }

        await this.saveSettings();
    }

    onunload() {
        this.app.workspace
            .getLeavesOfType(VIEW_TYPE_CALENDAR)
            .forEach((leaf) => {
                leaf.detach();
            });
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);

        // 刷新所有日历视图以应用新设置
        this.refreshCalendarViews();
    }

    /**
     * 刷新所有日历视图
     */
    refreshCalendarViews() {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
        for (const leaf of leaves) {
            const view = leaf.view as CalendarItemView;
            if (view && view.updateSettings) {
                view.updateSettings();
            }
        }
    }
}