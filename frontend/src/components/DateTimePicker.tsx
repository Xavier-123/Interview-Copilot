import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const WEEK_DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

interface DateTimePickerProps {
  /** 受控值，格式 "YYYY-MM-DDTHH:mm"（与 datetime-local 一致） */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface ParsedDateTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const pad = (n: number) => n.toString().padStart(2, '0');

function parseValue(value: string | undefined): ParsedDateTime | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{1,2})/.exec(value ?? '');
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  if (!y || !mo || !d || !h || !mi) return null;
  return {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
  };
}

function buildValue(p: ParsedDateTime): string {
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

function formatDisplay(value: string): string {
  const p = parseValue(value);
  if (!p) return '';
  const weekDay = WEEK_DAY_NAMES[new Date(p.year, p.month - 1, p.day).getDay()];
  return `${p.year}-${pad(p.month)}-${pad(p.day)} (${weekDay}) ${pad(p.hour)}:${pad(p.minute)}`;
}

function isSameDay(date: Date, p: ParsedDateTime | null): boolean {
  if (!p) return false;
  return (
    date.getFullYear() === p.year &&
    date.getMonth() === p.month - 1 &&
    date.getDate() === p.day
  );
}

function isToday(date: Date): boolean {
  const n = new Date();
  return (
    date.getFullYear() === n.getFullYear() &&
    date.getMonth() === n.getMonth() &&
    date.getDate() === n.getDate()
  );
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  placeholder = '请选择日期时间',
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0-based
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const parsed = parseValue(value);

  // 打开时将日历视图重置到已选时间（或今天）所在月份
  useEffect(() => {
    if (!open) return;
    const p = parseValue(value);
    const now = new Date();
    setViewYear(p ? p.year : now.getFullYear());
    setViewMonth(p ? p.month - 1 : now.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 弹层固定定位：优先展示在触发器下方，空间不足时翻转到上方，并收进视口内
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const w = popRef.current?.offsetWidth ?? 312;
    const h = popRef.current?.offsetHeight ?? 430;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const top =
      spaceBelow >= h + 12 || spaceBelow >= spaceAbove ? r.bottom + 6 : r.top - h - 6;
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8));
    setPos((prev) => (prev && prev.top === top && prev.left === left ? prev : { top, left }));
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, updatePosition]);

  // 点击弹层与触发器以外区域 / Escape 关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const gridCells = useMemo(() => {
    const lead = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // 周一为第一列
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(viewYear, viewMonth, 1 - lead + i);
      cells.push({ date, inMonth: date.getMonth() === viewMonth });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const minuteOptions = useMemo(() => {
    const opts: number[] = [];
    for (let m = 0; m < 60; m += 5) opts.push(m);
    const cur = parsed?.minute;
    if (cur !== undefined && cur % 5 !== 0) {
      opts.push(cur);
      opts.sort((a, b) => a - b);
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.minute]);

  const presets = useMemo(() => {
    const make = (offsetDays: number, hour: number, minute: number, label: string) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      return {
        label,
        value: buildValue({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          day: d.getDate(),
          hour,
          minute,
        }),
      };
    };
    const mondayIndex = (new Date().getDay() + 6) % 7;
    const daysToNextMonday = mondayIndex === 0 ? 7 : 7 - mondayIndex;
    return [
      make(1, 14, 0, '明天 14:00'),
      make(3, 10, 0, '3天后 10:00'),
      make(daysToNextMonday, 10, 0, '下周一 10:00'),
    ];
  }, []);

  const selectDay = (date: Date) => {
    const now = new Date();
    const base = parsed ?? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: 14, minute: 0 };
    onChange(
      buildValue({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: base.hour,
        minute: base.minute,
      })
    );
  };

  const setTime = (hour: number, minute: number) => {
    const now = new Date();
    const base = parsed ?? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour, minute };
    onChange(buildValue({ ...base, hour, minute }));
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const jumpToThisMonth = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  };

  const selectClass =
    'flex-1 min-w-0 text-xs px-2 py-1.5 rounded-lg bg-surface border border-line-default text-content-primary focus:outline-none focus:border-brand-primary cursor-pointer';

  return (
    <div className="w-full">
      {/* 触发器：外观与表单其他输入框一致 */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 text-left text-xs px-3 py-2.5 rounded-xl bg-surface border transition cursor-pointer ${
          open ? 'border-brand-primary' : 'border-line-subtle hover:border-line-default'
        }`}
      >
        <span
          className={`truncate ${
            value ? 'text-content-primary' : 'text-content-placeholder'
          }`}
        >
          {value ? formatDisplay(value) : placeholder}
        </span>
        <Calendar className="w-3.5 h-3.5 text-brand-primary shrink-0" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: 312,
            }}
            className="z-[60] picker-pop rounded-2xl bg-surface-elevated border border-line-default shadow-popover p-3 select-none"
          >
            {/* 月份导航 */}
            <div className="flex items-center justify-between mb-2 px-0.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-content-primary">
                  {viewYear} 年 {viewMonth + 1} 月
                </span>
                <button
                  type="button"
                  onClick={jumpToThisMonth}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-line-default text-content-secondary hover:text-brand-primary hover:border-brand-primary transition cursor-pointer"
                >
                  本月
                </button>
              </div>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface-hover transition cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* 星期表头（周一起始） */}
            <div className="grid grid-cols-7 mb-1">
              {WEEK_LABELS.map((w) => (
                <div key={w} className="text-center text-[10px] font-semibold text-content-muted py-1">
                  {w}
                </div>
              ))}
            </div>

            {/* 日期网格 */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {gridCells.map(({ date, inMonth }, idx) => {
                const selected = isSameDay(date, parsed);
                const today = isToday(date);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectDay(date)}
                    className={[
                      'w-9 h-8 mx-auto rounded-lg text-xs flex items-center justify-center transition cursor-pointer',
                      selected
                        ? 'bg-brand-primary text-content-inverse font-bold shadow-card'
                        : today
                          ? 'text-brand-primary ring-1 ring-inset ring-brand-primary/40 hover:bg-surface-hover'
                          : inMonth
                            ? 'text-content-secondary hover:bg-surface-hover'
                            : 'text-content-disabled hover:bg-surface-hover hover:text-content-muted',
                    ].join(' ')}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {/* 时间选择 */}
            <div className="mt-3 pt-3 border-t border-line-subtle flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-brand-primary shrink-0" />
              <select
                value={parsed?.hour ?? 14}
                onChange={(e) => setTime(Number(e.target.value), parsed?.minute ?? 0)}
                className={selectClass}
                aria-label="小时"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {pad(h)} 时
                  </option>
                ))}
              </select>
              <select
                value={parsed?.minute ?? 0}
                onChange={(e) => setTime(parsed?.hour ?? 14, Number(e.target.value))}
                className={selectClass}
                aria-label="分钟"
              >
                {minuteOptions.map((m) => (
                  <option key={m} value={m}>
                    {pad(m)} 分
                  </option>
                ))}
              </select>
            </div>

            {/* 快捷预设 */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    onChange(p.value);
                    setOpen(false);
                  }}
                  className="px-2.5 py-1 rounded-full border border-line-default bg-surface text-[11px] text-content-secondary hover:text-brand-primary hover:border-brand-primary transition cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* 底部：实时预览 + 确认 */}
            <div className="mt-3 pt-3 border-t border-line-subtle flex items-center justify-between gap-3">
              <span className="text-[11px] text-content-secondary truncate">
                {value ? formatDisplay(value) : '尚未选择时间'}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-brand-primary hover:bg-brand-hover text-white text-xs font-medium transition cursor-pointer shrink-0"
              >
                确定
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
