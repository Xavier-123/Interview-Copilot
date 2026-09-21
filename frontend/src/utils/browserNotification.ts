import type { InterviewScheduleItem, BrowserNotificationConfig } from '../types';

const STORAGE_KEY_CONFIG = 'interview_copilot_browser_notify_config';
const NOTIFIED_PREFIX = 'interview_copilot_notified_';
const DEFAULT_ADVANCE_MINUTES = [30];

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const cfg = getBrowserNotificationConfig();
      saveBrowserNotificationConfig({ ...cfg, enabled: true });
    }
    return permission;
  } catch (err) {
    console.error('Failed to request notification permission:', err);
    return Notification.permission;
  }
}

/** 归一化提前提醒档位：兼容旧版单值 number 配置，去重、剔除非法值后升序返回。 */
function normalizeAdvanceMinutes(value: unknown): number[] {
  if (value === undefined || value === null) return [...DEFAULT_ADVANCE_MINUTES];
  const list = Array.isArray(value) ? value : [value];
  const cleaned = Array.from(
    new Set(list.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))
  );
  return cleaned.sort((a, b) => a - b);
}

export function getBrowserNotificationConfig(): BrowserNotificationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed.enabled),
        advanceMinutes: normalizeAdvanceMinutes(parsed.advanceMinutes),
      };
    }
  } catch {
    // ignore
  }

  // Default config
  const isGranted = isNotificationSupported() && Notification.permission === 'granted';
  return {
    enabled: isGranted,
    advanceMinutes: [...DEFAULT_ADVANCE_MINUTES],
  };
}

export function saveBrowserNotificationConfig(config: BrowserNotificationConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  } catch (err) {
    console.error('Failed to save browser notification config:', err);
  }
}

export function sendDesktopNotification(
  title: string,
  options?: NotificationOptions & { onClick?: () => void }
): Notification | null {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return null;
  }

  try {
    const n = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });

    n.onclick = () => {
      window.focus();
      if (options?.onClick) {
        options.onClick();
      }
      n.close();
    };

    return n;
  } catch (err) {
    console.error('Failed to create browser Notification:', err);
    return null;
  }
}

export function sendTestDesktopNotification(): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const notification = sendDesktopNotification('🎉 桌面通知测试成功！', {
    body: '您已成功开启 Interview-Copilot 桌面弹窗提醒，临近面试时将自动在此提醒您。',
    tag: 'test_notification_' + Date.now(),
  });

  return Boolean(notification);
}

/**
 * 遍历待面试列表，对每个选中的提前档位独立判断是否进入提醒窗口，并按"日程+档位"去重防骚扰。
 */
export function checkAndNotifyUpcomingSchedules(
  schedules: InterviewScheduleItem[],
  onNavigateToSchedule?: (schedule: InterviewScheduleItem) => void
): number {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return 0;
  }

  const config = getBrowserNotificationConfig();
  if (!config.enabled || config.advanceMinutes.length === 0) {
    return 0;
  }

  const now = Date.now();
  let triggeredCount = 0;

  for (const s of schedules) {
    if (s.status !== 'upcoming') continue;

    try {
      const targetTime = new Date(s.scheduled_at).getTime();
      const diffMs = targetTime - now;

      // 仅对未来的日程做提醒
      if (diffMs <= 0) continue;

      for (const mins of config.advanceMinutes) {
        const advanceMs = mins * 60 * 1000;

        // 尚未进入该档位的提前提醒窗口
        if (diffMs > advanceMs) continue;

        const key = `${NOTIFIED_PREFIX}${s.id}_${mins}`;
        const lastNotified = localStorage.getItem(key);

        // 同一场面试的同一档位 12 小时内只弹一次，防止重复轰炸
        if (lastNotified && now - Number(lastNotified) < 12 * 3600 * 1000) {
          continue;
        }

        const diffMins = Math.max(1, Math.round(diffMs / 60000));
        const diffDesc =
          diffMins >= 60 ? `${Math.floor(diffMins / 60)} 小时 ${diffMins % 60} 分钟` : `${diffMins} 分钟`;
        const title = `【面试临近提醒】${s.company} · ${s.job_role}`;
        const body = `面试将于约 ${diffDesc}后开始（${s.interview_round}）。点击直接进入备战或对练！`;

        sendDesktopNotification(title, {
          body,
          tag: `interview_reminder_${s.id}_${mins}`,
          requireInteraction: true,
          onClick: () => {
            if (onNavigateToSchedule) {
              onNavigateToSchedule(s);
            }
          },
        });

        localStorage.setItem(key, String(now));
        triggeredCount++;
      }
    } catch (err) {
      console.error('Error checking schedule for notification:', err);
    }
  }

  return triggeredCount;
}
