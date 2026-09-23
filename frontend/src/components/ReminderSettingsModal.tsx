import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Bell,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  Save,
  HelpCircle,
  Loader2,
  Laptop,
} from 'lucide-react';
import type { NotificationSettings, BrowserNotificationConfig } from '../types';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  getBrowserNotificationConfig,
  saveBrowserNotificationConfig,
  sendTestDesktopNotification,
} from '../utils/browserNotification';
import { apiFetch } from '../utils/api';

interface ReminderSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const ReminderSettingsModal: React.FC<ReminderSettingsModalProps> = ({
  open,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'browser' | 'email'>('browser');

  // --- Browser Notification State ---
  const [browserSupported, setBrowserSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [browserConfig, setBrowserConfig] = useState<BrowserNotificationConfig>({
    enabled: true,
    advanceMinutes: [30],
  });
  const [browserTestMsg, setBrowserTestMsg] = useState<string | null>(null);

  // --- Email Notification State ---
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailStatusMsg, setEmailStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [receiverEmail, setReceiverEmail] = useState('');
  const [smtpHost, setSmtpHost] = useState('smtp.qq.com');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [smtpUseSsl, setSmtpUseSsl] = useState(true);
  const [smtpFromName, setSmtpFromName] = useState('Interview-Copilot');
  const [remindAdvanceHours, setRemindAdvanceHours] = useState(2);

  // Initialize browser & email states on open
  useEffect(() => {
    if (open) {
      setBrowserSupported(isNotificationSupported());
      setPermission(getNotificationPermission());
      setBrowserConfig(getBrowserNotificationConfig());
      setBrowserTestMsg(null);
      setEmailStatusMsg(null);
      fetchEmailSettings();
    }
  }, [open]);

  const fetchEmailSettings = async () => {
    setLoadingSettings(true);
    try {
      const data = await apiFetch<{ settings: NotificationSettings }>('/api/v1/notifications/settings');
      {
        const s: NotificationSettings = data.settings;
        setEmailEnabled(Boolean(s.email_enabled));
        setReceiverEmail(s.receiver_email || '');
        setSmtpHost(s.smtp_host || 'smtp.qq.com');
        setSmtpPort(s.smtp_port || 465);
        setSmtpUser(s.smtp_user || '');
        setSmtpPassword(s.smtp_password || '');
        setHasPassword(Boolean(s.has_password));
        setSmtpUseSsl(s.smtp_use_ssl ?? true);
        setSmtpFromName(s.smtp_from_name || 'Interview-Copilot');
        setRemindAdvanceHours(s.remind_advance_hours || 2);
      }
    } catch (err) {
      console.error('Failed to fetch notification settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  if (!open) return null;

  // --- Browser Tab Handlers ---
  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm === 'granted') {
      const newCfg = { ...browserConfig, enabled: true };
      setBrowserConfig(newCfg);
      saveBrowserNotificationConfig(newCfg);
      setBrowserTestMsg('已成功授权并开启桌面通知！');
    } else if (perm === 'denied') {
      setBrowserTestMsg('权限已被浏览器阻止，请在浏览器地址栏左侧网站设置中手动允许通知。');
    }
  };

  const handleToggleBrowserEnabled = (enabled: boolean) => {
    const newCfg = { ...browserConfig, enabled };
    setBrowserConfig(newCfg);
    saveBrowserNotificationConfig(newCfg);
  };

  const handleToggleAdvanceMinute = (mins: number) => {
    const current = browserConfig.advanceMinutes;
    const next = current.includes(mins)
      ? current.filter((m) => m !== mins)
      : [...current, mins].sort((a, b) => a - b);
    const newCfg = { ...browserConfig, advanceMinutes: next };
    setBrowserConfig(newCfg);
    saveBrowserNotificationConfig(newCfg);
  };

  const handleTestBrowserNotification = () => {
    if (permission !== 'granted') {
      handleRequestPermission();
      return;
    }
    const success = sendTestDesktopNotification();
    if (success) {
      setBrowserTestMsg('桌面测试通知已触发！请检查系统右下角/通知中心。');
    } else {
      setBrowserTestMsg('测试通知触发失败，请确保系统已允许浏览器发送通知。');
    }
  };

  // --- Email Tab Presets ---
  const applyPreset = (type: 'qq' | '163' | 'gmail' | 'custom') => {
    if (type === 'qq') {
      setSmtpHost('smtp.qq.com');
      setSmtpPort(465);
      setSmtpUseSsl(true);
    } else if (type === '163') {
      setSmtpHost('smtp.163.com');
      setSmtpPort(465);
      setSmtpUseSsl(true);
    } else if (type === 'gmail') {
      setSmtpHost('smtp.gmail.com');
      setSmtpPort(587);
      setSmtpUseSsl(false);
    }
  };

  const handleSaveEmailSettings = async () => {
    setSavingSettings(true);
    setEmailStatusMsg(null);
    try {
      const data = await apiFetch<{ settings?: NotificationSettings }>('/api/v1/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_enabled: emailEnabled,
          receiver_email: receiverEmail.trim(),
          smtp_host: smtpHost.trim(),
          smtp_port: Number(smtpPort),
          smtp_user: smtpUser.trim(),
          smtp_password: smtpPassword.trim(),
          smtp_use_ssl: smtpUseSsl,
          smtp_from_name: smtpFromName.trim(),
          remind_advance_hours: Number(remindAdvanceHours),
        }),
      });

      setHasPassword(Boolean(data.settings?.has_password));
      setEmailStatusMsg({ text: '邮件提醒配置已成功保存！' });
    } catch (err: any) {
      setEmailStatusMsg({ text: err.message || '保存失败，请检查填写内容', isError: true });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestEmail = async () => {
    if (!receiverEmail.trim()) {
      setEmailStatusMsg({ text: '请填写用于接收测试邮件的目标邮箱地址', isError: true });
      return;
    }
    setTestingEmail(true);
    setEmailStatusMsg(null);
    try {
      const data = await apiFetch<{ message?: string }>('/api/v1/notifications/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiver_email: receiverEmail.trim(),
          smtp_host: smtpHost.trim(),
          smtp_port: Number(smtpPort),
          smtp_user: smtpUser.trim(),
          smtp_password: smtpPassword.trim() || undefined,
          smtp_use_ssl: smtpUseSsl,
          smtp_from_name: smtpFromName.trim(),
        }),
      });

      setEmailStatusMsg({ text: data.message || `测试邮件已发送至 ${receiverEmail}，请查收！` });
    } catch (err: any) {
      setEmailStatusMsg({ text: err.message || '测试邮件发送失败，请检查 SMTP 账号密码', isError: true });
    } finally {
      setTestingEmail(false);
    }
  };

  const inputCls =
    'w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">面试日程提醒设置</h2>
              <p className="text-[11px] text-gray-400">配置临近面试的桌面弹窗与邮件推送通知</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 bg-gray-950/30 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('browser')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'browser'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>浏览器桌面弹窗</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('email')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
              activeTab === 'email'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>邮件推送通知</span>
            {emailEnabled && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* TAB 1: 浏览器桌面弹窗 */}
          {activeTab === 'browser' && (
            <div className="space-y-5">
              {/* Permission Banner */}
              <div className="p-4 rounded-xl border bg-gray-950/60 flex items-start justify-between gap-4 border-gray-800">
                <div className="flex items-start space-x-3">
                  <div className="mt-0.5">
                    {permission === 'granted' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : permission === 'denied' ? (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <Bell className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">系统桌面通知权限</span>
                      {permission === 'granted' && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-[10px] text-emerald-300 font-medium">
                          已允许
                        </span>
                      )}
                      {permission === 'default' && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-800 text-[10px] text-amber-300 font-medium">
                          未授权
                        </span>
                      )}
                      {permission === 'denied' && (
                        <span className="px-2 py-0.5 rounded-full bg-red-950/80 border border-red-800 text-[10px] text-red-300 font-medium">
                          已禁用
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {permission === 'granted' &&
                        '已获得系统通知权限。即使页面最小化或在后台运行，面试临近时系统也会在屏幕右下角弹出提醒。'}
                      {permission === 'default' &&
                        '点击下方按钮即可弹出浏览器授权窗口，授权后可享受原生桌面级面试临近提醒。'}
                      {permission === 'denied' &&
                        '通知权限已被浏览器阻止。若需开启，请点击浏览器地址栏左侧的“网站设置/锁头图标”，将“通知”权限改为“允许”并刷新。'}
                    </p>
                  </div>
                </div>

                {permission !== 'granted' && browserSupported && (
                  <button
                    type="button"
                    onClick={handleRequestPermission}
                    className="shrink-0 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer shadow-md shadow-emerald-950"
                  >
                    开启权限
                  </button>
                )}
              </div>

              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-950/40 border border-gray-800">
                <div>
                  <div className="text-xs font-medium text-white">启用临近面试桌面弹窗</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    在面试开始前自动通过系统原生弹窗提醒备战
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={browserConfig.enabled && permission === 'granted'}
                    disabled={permission !== 'granted'}
                    onChange={(e) => handleToggleBrowserEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Advance Time Selection */}
              <div className="space-y-2">
                <label className="text-xs text-gray-300 font-medium flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>提前多久发出桌面弹窗提醒（可多选）</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 60, 120].map((mins) => {
                    const selected = browserConfig.advanceMinutes.includes(mins);
                    return (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => handleToggleAdvanceMinute(mins)}
                        className={`py-2 px-3 rounded-xl border text-xs font-medium transition cursor-pointer text-center ${
                          selected
                            ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                            : 'bg-gray-950/60 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                        }`}
                      >
                        {mins < 60 ? `提前 ${mins} 分钟` : `提前 ${mins / 60} 小时`}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  点击切换选中状态；每命中一档会各弹一次提醒（如同时选 2 小时和 15 分钟，则会提前 2 小时和临开始 15 分钟各提醒一次）。全部不选则不弹窗。
                </p>
              </div>

              {/* Test Notification Action */}
              <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
                <div className="text-[11px] text-gray-400">
                  点击按钮立即发送一条测试桌面弹窗，验证系统与显示效果
                </div>
                <button
                  type="button"
                  onClick={handleTestBrowserNotification}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white text-xs font-medium border border-gray-700 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  <span>测试桌面弹窗</span>
                </button>
              </div>

              {browserTestMsg && (
                <div className="p-3 rounded-xl bg-blue-950/50 border border-blue-800/60 text-blue-300 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{browserTestMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 邮件推送通知 */}
          {activeTab === 'email' && (
            <div className="space-y-4">
              {loadingSettings ? (
                <div className="py-12 text-center space-y-2">
                  <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
                  <p className="text-xs text-gray-400">正在载入邮件通知配置...</p>
                </div>
              ) : (
                <>
                  {/* Master Email Toggle */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-950/40 border border-gray-800">
                    <div>
                      <div className="text-xs font-medium text-white">启用面试临近邮件提醒</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        后台定时扫描并在面试前自动向您的邮箱发送全套备战清单与日程卡片
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={emailEnabled}
                        onChange={(e) => setEmailEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  {/* Preset Buttons */}
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 font-medium">常用邮箱快捷模板：</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => applyPreset('qq')}
                        className="px-2.5 py-1 rounded-lg bg-gray-950 hover:bg-gray-800 border border-gray-800 text-xs text-gray-300 hover:text-white transition cursor-pointer"
                      >
                        QQ 邮箱 (smtp.qq.com:465)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset('163')}
                        className="px-2.5 py-1 rounded-lg bg-gray-950 hover:bg-gray-800 border border-gray-800 text-xs text-gray-300 hover:text-white transition cursor-pointer"
                      >
                        163 网易邮箱 (smtp.163.com:465)
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPreset('gmail')}
                        className="px-2.5 py-1 rounded-lg bg-gray-950 hover:bg-gray-800 border border-gray-800 text-xs text-gray-300 hover:text-white transition cursor-pointer"
                      >
                        Gmail (smtp.gmail.com:587)
                      </button>
                    </div>
                  </div>

                  {/* Receiver Email */}
                  <div>
                    <label className="block text-xs text-gray-300 mb-1 font-medium">
                      接收提醒的目标邮箱 <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      value={receiverEmail}
                      onChange={(e) => setReceiverEmail(e.target.value)}
                      placeholder="your_email@example.com"
                      className={inputCls}
                    />
                  </div>

                  {/* SMTP Server & Port */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-300 mb-1 font-medium">
                        SMTP 服务器地址 <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="smtp.qq.com"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1 font-medium">端口</label>
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(Number(e.target.value))}
                        placeholder="465"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  {/* SMTP User & Password / Auth Code */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1 font-medium">
                        发信账号 / 邮箱 <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={smtpUser}
                        onChange={(e) => setSmtpUser(e.target.value)}
                        placeholder="sender@qq.com"
                        className={inputCls}
                        autoComplete="off"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1 font-medium">
                        邮箱授权码 / 密码 <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="password"
                        value={smtpPassword}
                        onChange={(e) => setSmtpPassword(e.target.value)}
                        placeholder={hasPassword ? '****** (已保存，留空则不修改)' : '输入 SMTP 授权码'}
                        className={inputCls}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {/* Advance Time & Sender Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1 font-medium">
                        提前多久发送邮件提醒
                      </label>
                      <select
                        value={remindAdvanceHours}
                        onChange={(e) => setRemindAdvanceHours(Number(e.target.value))}
                        className={inputCls}
                      >
                        <option value={1}>提前 1 小时</option>
                        <option value={2}>提前 2 小时（推荐）</option>
                        <option value={4}>提前 4 小时</option>
                        <option value={12}>提前 12 小时</option>
                        <option value={24}>提前 24 小时（前一天）</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1 font-medium">
                        发件人显示名称
                      </label>
                      <input
                        type="text"
                        value={smtpFromName}
                        onChange={(e) => setSmtpFromName(e.target.value)}
                        placeholder="Interview-Copilot"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  {/* Tips on auth code */}
                  <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800 text-[11px] text-gray-400 leading-relaxed flex items-start space-x-2">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <span>
                      注意：QQ/网易等现代邮箱出于安全策略，请在邮箱网页版
                      <strong>【设置】→【账户】</strong>开启 POP3/SMTP 服务，并使用生成的<strong>16位专用授权码</strong>作为密码。
                    </span>
                  </div>

                  {/* Feedback Status */}
                  {emailStatusMsg && (
                    <div
                      className={`p-3 rounded-xl text-xs flex items-center space-x-2 border ${
                        emailStatusMsg.isError
                          ? 'bg-red-950/50 border-red-800/60 text-red-300'
                          : 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                      }`}
                    >
                      {emailStatusMsg.isError ? (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      )}
                      <span>{emailStatusMsg.text}</span>
                    </div>
                  )}

                  {/* Actions Footer */}
                  <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleTestEmail}
                      disabled={testingEmail}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white text-xs font-medium border border-gray-700 transition cursor-pointer disabled:opacity-50"
                    >
                      {testingEmail ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span>{testingEmail ? '正在发送测试邮件...' : '发送测试邮件'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveEmailSettings}
                      disabled={savingSettings}
                      className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-lg shadow-emerald-950 transition cursor-pointer disabled:opacity-50"
                    >
                      {savingSettings ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      <span>{savingSettings ? '正在保存...' : '保存邮件配置'}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
