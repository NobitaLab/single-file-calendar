import { useEffect, useRef, useState, useCallback } from "react";
import { Calendar } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { PluginSettings } from "../settings";
import type { NoteEntry, NoteStore } from "../note/NoteStore";
import type { EventClickArg } from "@fullcalendar/core";

interface SimpleCalendarViewProps {
    settings: PluginSettings;
    noteStore: NoteStore;
    onDateClick: (date: Date) => void;
    onNoteClick: (note: NoteEntry) => void;
    onNoteRightClick: (note: NoteEntry, e: MouseEvent) => void;
}

/**
 * FullCalendar 视图 - 显示日历网格和日程
 */
export function SimpleCalendarView({
    settings,
    noteStore,
    onDateClick,
    onNoteClick,
    onNoteRightClick,
}: SimpleCalendarViewProps) {
    const calendarRef = useRef<HTMLDivElement>(null);
    const calendarInstance = useRef<Calendar | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const isInitialized = useRef(false);

    // 使用 ref 存储 notes，确保在 eventDidMount 中可以访问
    const notesMapRef = useRef<Map<string, NoteEntry>>(new Map());

    // 防止重复更新的标志
    const isUpdatingRef = useRef(false);

    // 从 eventId 查找 NoteEntry 的辅助函数
    const findNoteById = useCallback((eventId: string): NoteEntry | undefined => {
        return notesMapRef.current.get(eventId);
    }, []);

    // 更新事件源的函数 - 只负责更新日历，不主动刷新数据
    const updateEventSource = useCallback(() => {
        if (!calendarInstance.current || isUpdatingRef.current) {
            return;
        }

        isUpdatingRef.current = true;

        try {
            // 直接从 NoteStore 获取缓存的数据（不触发刷新）
            const allNotes = noteStore.getCachedNotes();

            // 更新 notesMapRef
            const map = new Map<string, NoteEntry>();
            for (const note of allNotes) {
                map.set(note.id, note);
            }
            notesMapRef.current = map;

            // 使用已获取的数据创建事件 - 过滤掉无效事件
            const events = allNotes
                .filter((note: NoteEntry) => note.title && note.title.trim())
                .map((note: NoteEntry) => {
                if (note.startTime) {
                    const startDateTime = `${note.dateKey}T${note.startTime}`;
                    let endDateTime: string;

                    // 如果有结束时间且与开始时间不同，使用结束时间
                    if (note.endTime && note.endTime !== note.startTime) {
                        endDateTime = `${note.dateKey}T${note.endTime}`;
                    } else {
                        // 对于没有结束时间或相同时间的事件，设置默认持续1小时
                        const [hours, minutes] = note.startTime.split(":").map(Number);
                        const endHours = (hours + 1) % 24;
                        endDateTime = `${note.dateKey}T${endHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
                    }
                    return {
                        id: note.id,
                        title: note.title,
                        start: startDateTime,
                        end: endDateTime,
                        allDay: false,
                        extendedProps: {
                            heading: note.heading,
                            lineNumber: note.lineNumber,
                            lineCount: note.lineCount,
                            content: note.content,
                            dateKey: note.dateKey,
                            startTime: note.startTime,
                            endTime: note.endTime,
                        },
                    };
                }
                return {
                    id: note.id,
                    title: note.title,
                    start: note.dateKey,
                    allDay: true,
                    extendedProps: {
                        heading: note.heading,
                        lineNumber: note.lineNumber,
                        lineCount: note.lineCount,
                        content: note.content,
                        dateKey: note.dateKey,
                    },
                };
            });

            const eventSource = { events, id: "daily-notes" };
            calendarInstance.current.removeAllEventSources();
            calendarInstance.current.addEventSource(eventSource);
            calendarInstance.current.render();
        } finally {
            isUpdatingRef.current = false;
        }
    }, [noteStore]);

    // 初始化日历
    useEffect(() => {
        if (!calendarRef.current || isInitialized.current) return;

        const calendar = new Calendar(calendarRef.current, {
            plugins: [
                dayGridPlugin,
                timeGridPlugin,
                interactionPlugin,
            ],
            initialView: "dayGridMonth",

            // 标题栏工具按钮
            headerToolbar: {
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
            },

            // 按钮文本
            buttonText: {
                today: "今天",
                month: "月",
                week: "周",
                day: "日",
            },

            // 本地化设置
            firstDay: 1,

            // 样式设置
            height: "100%",
            navLinks: true,
            dayMaxEvents: 3,
            weekends: true,
            nowIndicator: true,

            // 事件显示 - 使用 auto 让 FullCalendar 自动决定
            eventDisplay: "auto",

            // 时间网格视图设置
            expandRows: true,

            // 事件高度设置
            eventMinHeight: 30,

            // 时间格式（24小时制）
            eventTimeFormat: {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            },

            // slot 时间格式
            slotLabelFormat: {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            },

            // 星期标题格式（英文）
            dayHeaderContent: (args) => {
                const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                return {
                    html: `<span class="fc-custom-day-header">${dayNames[args.date.getDay()]}</span>`,
                };
            },

            // 点击日期创建日程
            dateClick: (info) => {
                onDateClick(info.date);
            },

            // 点击事件（日程）
            eventClick: (info: EventClickArg) => {
                const note = findNoteById(info.event.id);
                if (note) {
                    onNoteClick(note);
                }
            },

            // 事件渲染后的处理
            eventDidMount: (info) => {
                const note = findNoteById(info.event.id);
                if (note) {
                    // 添加右键菜单事件
                    info.el.addEventListener("contextmenu", (e: MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onNoteRightClick(note, e);
                    });

                    // 添加样式类
                    info.el.addClass("fc-event-daily-note");

                    // 创建自定义悬浮提示 - 使用 activeDocument 兼容 popout 窗口
                    const doc = window.document;
                    const tooltip = doc.createElement("div");
                    tooltip.className = "fc-event-tooltip";

                    // 构建提示内容
                    const tooltipTitle = doc.createElement("div");
                    tooltipTitle.className = "fc-tooltip-title";
                    tooltipTitle.textContent = note.title;
                    tooltip.appendChild(tooltipTitle);

                    if (note.startTime && note.endTime) {
                        const tooltipTime = doc.createElement("div");
                        tooltipTime.className = "fc-tooltip-time";
                        tooltipTime.textContent = `${note.startTime} - ${note.endTime}`;
                        tooltip.appendChild(tooltipTime);
                    }
                    if (note.content && note.content.length > 0) {
                        const tooltipContent = doc.createElement("div");
                        tooltipContent.className = "fc-tooltip-content";
                        tooltipContent.textContent = note.content.join("\n");
                        tooltip.appendChild(tooltipContent);
                    }

                    // 添加悬停事件
                    info.el.addEventListener("mouseenter", (e: MouseEvent) => {
                        doc.body.appendChild(tooltip);
                        const rect = info.el.getBoundingClientRect();
                        tooltip.style.left = `${rect.left}px`;
                        tooltip.style.top = `${rect.bottom + 8}px`;
                        tooltip.style.display = "block";
                    });

                    info.el.addEventListener("mouseleave", () => {
                        tooltip.style.display = "none";
                        if (tooltip.parentElement) {
                            tooltip.parentElement.removeChild(tooltip);
                        }
                    });
                }
            },
        });

        calendar.render();
        calendarInstance.current = calendar;
        isInitialized.current = true;

        setIsLoading(false);

        // 初始化完成后刷新数据，刷新完成后会自动触发 onRefresh 回调来更新事件源
        void noteStore.refresh();

        // 监听视口变化，自动调整日历大小
        const handleResize = () => {
            if (calendarInstance.current) {
                calendarInstance.current.updateSize();
            }
        };

        window.addEventListener("resize", handleResize);

        // 监听 Obsidian 侧边栏变化
        const resizeObserver = new ResizeObserver(() => {
            if (calendarInstance.current) {
                calendarInstance.current.updateSize();
            }
        });
        resizeObserver.observe(calendarRef.current);

        return () => {
            window.removeEventListener("resize", handleResize);
            resizeObserver.disconnect();
            calendar.destroy();
            calendarInstance.current = null;
            isInitialized.current = false;
        };
    }, [settings, onDateClick, onNoteClick, onNoteRightClick, findNoteById, noteStore]);

    // 订阅刷新事件 - 当数据刷新完成后更新事件源
    useEffect(() => {
        const unsubscribe = noteStore.onRefresh(() => {
            updateEventSource();
        });
        return unsubscribe;
    }, [noteStore, updateEventSource]);

    return (
        <div className="full-calendar-wrapper">
            {isLoading && (
                <div className="full-calendar-loading">
                    <span>加载日历...</span>
                </div>
            )}
            <div ref={calendarRef} className="full-calendar-container" />
        </div>
    );
}