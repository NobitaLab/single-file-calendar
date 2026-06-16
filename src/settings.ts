import { type App, Notice, PluginSettingTab, Setting, TFile } from "obsidian";
import type SingleFileDailyNotes from "./main";
import { getDailyNotesFile, getHeadingMd, moment } from "./utils";

export interface PluginSettings {
    noteName: string;
    noteLocation: string;
    headingType: string;
    dateFormat: string;
    monthFormat: string;
}

export const DEFAULT_SETTINGS: PluginSettings = Object.freeze({
    noteName: "日程",
    noteLocation: "",
    headingType: "h3",
    dateFormat: "YYYY-MM-DD, dddd",
    monthFormat: "YYYY年MM月",
});

export class SettingsTab extends PluginSettingTab {
    plugin: SingleFileDailyNotes;

    constructor(app: App, plugin: SingleFileDailyNotes) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        this.containerEl.empty();

        // 日程设置
        this.containerEl.createEl("h3", { text: "日程设置" });
        this.fileNameSetting();
        this.filePathSetting();
        this.headingTypeSetting();
        this.dateFormatSetting();
        this.monthFormatSetting();
    }

    private fileNameSetting() {
        new Setting(this.containerEl)
            .setName("日程文件名")
            .setDesc("设置日程文件的名称")
            .addText((text) =>
                text
                    .setPlaceholder("输入文件名")
                    .setValue(this.plugin.settings.noteName)
                    .onChange(async (value) => {
                        this.plugin.settings.noteName = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }

    private filePathSetting() {
        new Setting(this.containerEl)
            .setName("日程文件位置")
            .setDesc("设置日程文件的存放路径（留空则为根目录）")
            .addText((text) =>
                text
                    .setPlaceholder("输入路径")
                    .setValue(this.plugin.settings.noteLocation)
                    .onChange(async (value) => {
                        this.plugin.settings.noteLocation = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }

    private headingTypeSetting() {
        new Setting(this.containerEl)
            .setName("日程区块标题级别")
            .setDesc("设置日程区块使用的标题级别")
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        h2: "h2 (##)",
                        h3: "h3 (###)",
                        h4: "h4 (####)",
                        h5: "h5 (#####)",
                        h6: "h6 (######)",
                    })
                    .setValue(this.plugin.settings.headingType)
                    .onChange(async (value) => {
                        this.plugin.settings.headingType = value;
                        await this.plugin.saveSettings();

                        this.updateHeadings(value);
                    }),
            );
    }

    private updateHeadings(value: string) {
        const file = getDailyNotesFile(this.app, this.plugin.settings);

        if (file instanceof TFile) {
            void this.app.vault.process(file, (data) => {
                const lines = data.split("\n");

                const dateFormat = this.plugin.settings.dateFormat;
                const monthFormat = this.plugin.settings.monthFormat;
                const dateHeadingRegex = /^(#{1,6}) (.*)/;
                const newHeading = getHeadingMd(this.plugin.settings);

                for (const [i, line] of lines.entries()) {
                    const match = dateHeadingRegex.exec(line);
                    if (!match) continue;

                    if (moment(match[2], dateFormat, true).isValid()) {
                        lines[i] = line.replace(match[1], newHeading);
                    } else if (moment(match[2], monthFormat, true).isValid()) {
                        lines[i] = line.replace(match[1], newHeading.slice(1));
                    }
                }

                return lines.join("\n");
            });

            new Notice(`已将日程标题级别更新为 ${value}`);
        }
    }

    private dateFormatSetting() {
        const description = new DocumentFragment();
        description.createSpan({ text: "设置自定义的 " });
        description.appendChild(
            createEl("a", {
                text: "moment.js 格式",
                href: "https://momentjs.com/docs/#/parsing/string-format/",
            }),
        );
        description.appendText(" 字符串来使用不同的日期格式");

        new Setting(this.containerEl)
            .setName("日程区块日期格式")
            .setDesc(description)
            .addText((text) =>
                text
                    .setPlaceholder("输入格式字符串")
                    .setValue(this.plugin.settings.dateFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.dateFormat = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }

    private monthFormatSetting() {
        const description = new DocumentFragment();
        description.createSpan({ text: "设置自定义的 " });
        description.appendChild(
            createEl("a", {
                text: "moment.js 格式",
                href: "https://momentjs.com/docs/#/parsing/string-format/",
            }),
        );
        description.appendText(" 字符串来使用不同的月份标题格式");

        new Setting(this.containerEl)
            .setName("月份标题格式")
            .setDesc(description)
            .addText((text) =>
                text
                    .setPlaceholder("输入格式字符串")
                    .setValue(this.plugin.settings.monthFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.monthFormat = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}