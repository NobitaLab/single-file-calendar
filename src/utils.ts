import { moment as _moment, type App, TFile, TFolder } from "obsidian";

import type { PluginSettings } from "./settings";

export const moment = _moment as unknown as typeof _moment.default;

/**
 * Returns the path for the daily notes file
 */
export const getDailyNotesFilePath = (settings: PluginSettings) => {
    const fileName = `${settings.noteName}.md`;
    const folderPath = settings.noteLocation;

    if (!folderPath) {
        return fileName;
    }

    // Remove trailing slash if present
    const cleanFolderPath = folderPath.endsWith("/")
        ? folderPath.slice(0, -1)
        : folderPath;

    return `${cleanFolderPath}/${fileName}`;
};

/**
 * Returns the daily notes file
 */
export const getDailyNotesFile = (
    app: App,
    settings: PluginSettings,
): TFile | null => {
    const path = getDailyNotesFilePath(settings);
    const file = app.vault.getAbstractFileByPath(path);

    if (file && file instanceof TFile) {
        return file;
    } else {
        return null;
    }
};

/**
 * Creates the daily notes file if it doesn't exist
 * Returns the created file or null if creation failed
 */
export const createDailyNotesFile = async (
    app: App,
    settings: PluginSettings,
): Promise<TFile | null> => {
    const path = getDailyNotesFilePath(settings);

    // Check if file already exists
    const existingFile = app.vault.getAbstractFileByPath(path);
    if (existingFile && existingFile instanceof TFile) {
        return existingFile;
    }

    // Get the folder path - remove trailing slash if present
    let folderPath = settings.noteLocation;
    if (folderPath && folderPath.endsWith("/")) {
        folderPath = folderPath.slice(0, -1);
    }

    // Create folder if it doesn't exist and a folder path is specified
    if (folderPath) {
        let folder = app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            // Create the folder - ignore if it already exists
            try {
                await app.vault.createFolder(folderPath);
            } catch (e) {
                // Ignore "folder already exists" error
            }
        }
    }

    // Create the file with initial content
    const initialContent = `# ${settings.noteName}\n\n`;
    const newFile = await app.vault.create(path, initialContent);

    return newFile;
};

/**
 * Returns the level of headingType from settings
 * @example
 * getHeadingLevel({headingType: "h3"})
 * // Returns 3
 */
export const getHeadingLevel = (settings: PluginSettings): number => {
    return parseInt(settings.headingType[1], 10);
};

/**
 * Generates the Markdown for a heading
 * @example
 * getHeadingMd({headingType: "h3"})
 * // Returns ###
 */
export const getHeadingMd = (settings: PluginSettings): string => {
    return "#".repeat(getHeadingLevel(settings));
};

/**
 * Generates a daily note section heading for a date
 * @example
 * getHeadingForDate({headingType: "h3", dateFormat: "DD-MM-YYYY, dddd"}, date(29-05-24))
 * // Returns ### 29-05-2024, Wednesday
 */
export const getHeadingForDate = (
    settings: PluginSettings,
    date: moment.Moment,
): string => {
    return `${getHeadingMd(settings)} ${date.format(settings.dateFormat)}`;
};

export const getSectionForDate = (
    settings: PluginSettings,
    date: moment.Moment,
): string => {
    return `${getHeadingForDate(settings, date)}\n`;
};

export const insertNoteForDate = (
    fileContent: string,
    date: moment.Moment,
    settings: PluginSettings,
): [string, number] => {
    const lines = fileContent.split("\n");

    const headingMd = getHeadingMd(settings);

    // Offset start index if properties are present
    let i = 0;
    if (lines[0] === "---") {
        i++;
        while (lines[i] !== "---") {
            i++;
        }
        i++;
    }

    // 查找是否已存在该日期的区块
    while (i < lines.length) {
        const line = lines[i];

        if (!line.startsWith(headingMd)) {
            i++;
            continue;
        }

        const lineDate = moment(line.split(" ", 2)[1], settings.dateFormat);

        if (!lineDate.isValid()) {
            i++;
            continue;
        }

        if (lineDate.isSame(date, "date")) {
            return [fileContent, i];
        }

        i++;
    }

    // 日期区块不存在，追加到文件末尾
    const note = getSectionForDate(settings, date);
    lines.push(note);
    return [lines.join("\n"), lines.length - 1];
};
