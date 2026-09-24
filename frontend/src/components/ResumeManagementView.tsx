import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Sparkles,
  Trash2,
  Eye,
  Calendar,
  X,
  Plus,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Tag,
  Briefcase,
  Pencil,
  Wand2,
  Target,
  Lightbulb,
} from 'lucide-react';
import type {
  SavedResumeItem,
  SavedResumeDetail,
  ResumePolishReport,
  ResumePolishApplyResult,
} from '../types';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { calculateResumeCompleteness } from '../utils/resumeUtils';
import { ResumeEditorModal, type ResumeEditorFormState } from './ResumeEditorModal';


const splitList = (value: string): string[] =>
  value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

// 上传白名单与大小上限，与后端 profiles.py 保持一致
const ALLOWED_RESUME_EXTS = ['.pdf', '.docx', '.txt', '.md', '.json'];
const MAX_UPLOAD_MB = 10;

// 打磨建议的类型与严重程度展示映射（dark/light 双主题样式）
const ISSUE_TYPE_LABELS: Record<string, string> = {
  vague: '表达空泛',
  no_metrics: '缺少量化',
  overstated: '表述夸大',
  structure: '结构问题',
  risky_claim: '易被追问',
  typo: '文字瑕疵',
};

const SEVERITY_BADGES: Record<string, { dark: string; light: string }> = {
  high: {
    dark: 'bg-red-950/60 border-red-700/50 text-red-300',
    light: 'bg-red-50 border-red-200 text-red-700',
  },
  medium: {
    dark: 'bg-amber-950/60 border-amber-700/50 text-amber-300',
    light: 'bg-amber-50 border-amber-200 text-amber-700',
  },
  low: {
    dark: 'bg-gray-800/80 border-gray-700/60 text-gray-300',
    light: 'bg-gray-100 border-gray-200 text-gray-600',
  },
};

const SEVERITY_LABELS: Record<string, string> = {
  high: '严重',
  medium: '中等',
  low: '轻微',
};

const GAP_STATUS_META: Record<string, { label: string; dark: string; light: string }> = {
  missing: {
    label: '缺失',
    dark: 'bg-red-950/60 border-red-700/50 text-red-300',
    light: 'bg-red-50 border-red-200 text-red-700',
  },
  weak: {
    label: '证据薄弱',
    dark: 'bg-amber-950/60 border-amber-700/50 text-amber-300',
    light: 'bg-amber-50 border-amber-200 text-amber-700',
  },
  covered: {
    label: '已覆盖',
    dark: 'bg-emerald-950/60 border-emerald-700/50 text-emerald-300',
    light: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
};

interface ResumeManagementViewProps {
  onBack: () => void;
  onSelectResumeForMock: (resumeText: string, resumeTitle?: string) => void;
}

export const ResumeManagementView: React.FC<ResumeManagementViewProps> = ({
  onBack,
  onSelectResumeForMock,
}) => {
  const { isDark } = useTheme();
  const [resumes, setResumes] = useState<SavedResumeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [previewResume, setPreviewResume] = useState<SavedResumeDetail | null>(null);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [pastedText, setPastedText] = useState<string>('');
  const [pastedTitle, setPastedTitle] = useState<string>('');
  const [editorResumeDetail, setEditorResumeDetail] = useState<SavedResumeDetail | null>(null);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);
  // 删除确认弹窗状态
  const [deletingTarget, setDeletingTarget] = useState<{ id: string; filename: string } | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // AI 体检（简历打磨）状态
  const [polishingResume, setPolishingResume] = useState<{ id: string; filename: string } | null>(null);
  const [polishRole, setPolishRole] = useState<string>('');
  const [polishJd, setPolishJd] = useState<string>('');
  const [polishing, setPolishing] = useState<boolean>(false);
  const [polishReport, setPolishReport] = useState<ResumePolishReport | null>(null);
  const [adoptedIdx, setAdoptedIdx] = useState<number[]>([]);
  const [applying, setApplying] = useState<boolean>(false);
  const [polishError, setPolishError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchResumes = async () => {
    setLoading(true);
    setListError(null);
    try {
      const data = await apiFetch<{ resumes?: SavedResumeItem[] }>('/api/v1/profiles/resumes');
      setResumes(data.resumes || []);
    } catch (err: any) {
      console.error('Failed to load resumes:', err);
      setListError(err.message || '简历列表加载失败，请检查后端服务后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResumes();
  }, []);

  // Upload file handler
  const handleFileUpload = async (file: File) => {
    // 前端预检：类型与大小，避免无效的网络往返
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (!ALLOWED_RESUME_EXTS.includes(ext)) {
      setUploadError(
        `不支持的文件类型 "${ext || file.name}"，仅支持 PDF、DOCX、TXT、MD、JSON 格式`
      );
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(
        `文件大小 ${(file.size / 1024 / 1024).toFixed(1)}MB 超过 ${MAX_UPLOAD_MB}MB 上限，请压缩后重试`
      );
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await apiFetch('/api/v1/profiles/upload-resume', {
        method: 'POST',
        body: formData,
      });
      setUploadSuccess(`成功解析并保存简历: ${file.name}`);
      setShowUploadModal(false);
      await fetchResumes();
    } catch (err: any) {
      setUploadError(err.message || '上传处理失败');
    } finally {
      setUploading(false);
    }
  };

  // Paste text upload handler
  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) {
      setUploadError('请输入或粘贴简历文本内容');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const blob = new Blob([pastedText], { type: 'text/plain' });
      const filename = (pastedTitle.trim() || '我的定制简历') + '.txt';
      const file = new File([blob], filename, { type: 'text/plain' });
      await handleFileUpload(file);
      setPastedText('');
      setPastedTitle('');
    } catch (err: any) {
      setUploadError(err.message || '文本保存失败');
      setUploading(false);
    }
  };

  // 打开删除确认弹窗（替代原生 window.confirm）
  const handleDelete = (resumeId: string, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingTarget({ id: resumeId, filename });
  };

  // 用户确认后真正执行删除
  const handleConfirmDelete = async () => {
    if (!deletingTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/profiles/resumes/${deletingTarget.id}`, {
        method: 'DELETE',
      });
      setResumes((prev) => prev.filter((r) => r.id !== deletingTarget.id));
      if (previewResume?.id === deletingTarget.id) setPreviewResume(null);
      setUploadSuccess(`简历已删除: ${deletingTarget.filename}`);
      setDeletingTarget(null);
    } catch (err: any) {
      console.error('Failed to delete resume:', err);
      setUploadError(err.message || `删除简历 "${deletingTarget.filename}" 失败，请稍后重试`);
    } finally {
      setDeleting(false);
    }
  };

  // View resume detail
  const handleViewDetail = async (resumeId: string) => {
    try {
      setPreviewResume(await apiFetch<SavedResumeDetail>(`/api/v1/profiles/resumes/${resumeId}`));
    } catch (err: any) {
      console.error('Failed to fetch resume detail:', err);
      setUploadError(err.message || '简历详情加载失败，请稍后重试');
    }
  };

  // Open modern edit modal with current resume values
  const handleEdit = async (resumeId: string) => {
    try {
      setEditError(null);
      const data = await apiFetch<SavedResumeDetail>(`/api/v1/profiles/resumes/${resumeId}`);
      setEditorResumeDetail(data);
    } catch (err: any) {
      console.error('Failed to open resume editor:', err);
      setUploadError(err.message || '简历数据加载失败，无法打开编辑器');
    }
  };

  // Persist edit via PUT, then refresh list and any open preview
  const handleSaveEdit = async (form: ResumeEditorFormState) => {
    const filename = form.filename.trim();
    const rawText = form.raw_text.trim();
    if (!filename || !rawText) {
      setEditError('简历标题与原文内容不能为空');
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = {
        filename,
        raw_text: rawText,
        reparse: form.reparse,
      };
      if (!form.reparse) {
        body.parsed_profile = {
          name: form.name.trim() || '候选人',
          job_role: form.job_role.trim() || undefined,
          experience_years: form.experience_years
            ? Number(form.experience_years)
            : undefined,
          skills: form.skills,
          projects: form.projects
            .filter((p) => p.name.trim() || p.highlights.trim())
            .map((p) => ({
              name: p.name.trim(),
              role: p.role.trim(),
              tech_stack: splitList(p.tech_stack),
              highlights: p.highlights.trim(),
            })),
          education: form.education.trim(),
          summary_profile: form.summary_profile.trim(),
        };
      }

      const data = await apiFetch<SavedResumeDetail>(`/api/v1/profiles/resumes/${form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setEditorResumeDetail(null);
      setUploadSuccess(`简历已更新: ${data.filename}`);
      await fetchResumes();
      if (previewResume?.id === data.id) setPreviewResume(data);
    } catch (err: any) {
      setEditError(err.message || '保存失败');
    } finally {
      setSavingEdit(false);
    }
  };

  // Launch mock with selected resume
  const handleLaunchMock = async (resumeItem: SavedResumeItem) => {
    try {
      // Fetch full raw text
      const data = await apiFetch<SavedResumeDetail>(`/api/v1/profiles/resumes/${resumeItem.id}`);
      onSelectResumeForMock(data.raw_text || '', resumeItem.filename);
    } catch (err: any) {
      // 拉取全文失败时中止发起，避免用截断的 200 字预览静默降级
      console.error('Failed to fetch resume for mock:', err);
      setUploadError(
        err.message || `无法加载简历 "${resumeItem.filename}" 的全文，已中止发起模拟面试，请稍后重试`
      );
    }
  };

  // ===== AI 体检（简历打磨） =====
  const openPolish = (resumeId: string, filename: string) => {
    setPolishingResume({ id: resumeId, filename });
    setPolishRole('');
    setPolishJd('');
    setPolishReport(null);
    setAdoptedIdx([]);
    setPolishing(false);
    setApplying(false);
    setPolishError(null);
  };

  const closePolish = () => setPolishingResume(null);

  const runPolish = async () => {
    if (!polishingResume) return;
    setPolishing(true);
    setPolishError(null);
    try {
      const data = await apiFetch<{ status: string; report: ResumePolishReport }>(
        `/api/v1/profiles/resumes/${polishingResume.id}/polish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jd_text: polishJd.trim() || null,
            target_role: polishRole.trim() || null,
          }),
        }
      );
      setPolishReport(data.report || null);
      setAdoptedIdx([]);
    } catch (err: any) {
      setPolishError(err.message || 'AI 体检失败，请稍后重试');
    } finally {
      setPolishing(false);
    }
  };

  const toggleAdopt = (idx: number) => {
    setAdoptedIdx((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  // 把勾选的改写建议提交后端，生成新的优化版简历副本（原件不动）
  const applyAdopted = async () => {
    if (!polishingResume || !polishReport) return;
    const items = (polishReport.issues || [])
      .map((issue, idx) => ({ issue, idx }))
      .filter(({ issue, idx }) => adoptedIdx.includes(idx) && issue.applicable !== false && !!issue.rewritten)
      .map(({ issue }) => ({ quote: issue.quote, rewritten: issue.rewritten as string }));
    if (items.length === 0) return;

    setApplying(true);
    setPolishError(null);
    try {
      const data = await apiFetch<ResumePolishApplyResult>(
        `/api/v1/profiles/resumes/${polishingResume.id}/polish/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items,
            target_role: polishRole.trim() || null,
          }),
        }
      );
      setPolishingResume(null);
      await fetchResumes();
      const skippedNote = data.skipped?.length ? `，另有 ${data.skipped.length} 条未能定位已跳过` : '';
      setUploadSuccess(`优化版简历已生成: ${data.resume.filename}（采纳 ${data.applied.length} 条建议${skippedNote}）`);
    } catch (err: any) {
      setPolishError(err.message || '生成优化版简历失败');
    } finally {
      setApplying(false);
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
      return isoStr;
    }
  };

  // 按当前主题取 badge 样式（体检弹窗内使用）
  const severityBadgeCls = (severity?: string) =>
    (SEVERITY_BADGES[severity || 'medium'] || SEVERITY_BADGES.medium)[isDark ? 'dark' : 'light'];
  const gapBadgeCls = (status?: string) =>
    (GAP_STATUS_META[status || 'weak'] || GAP_STATUS_META.weak)[isDark ? 'dark' : 'light'];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-fade-in">
      {/* 1. Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5 transition-colors ${
        isDark ? 'border-gray-800' : 'border-gray-200'
      }`}>
        <div>
          <button
            onClick={onBack}
            className={`inline-flex items-center space-x-1.5 text-xs transition mb-2 cursor-pointer ${
              isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回首页工作台</span>
          </button>
          <div className="flex items-center space-x-3">
            <h1 className={`text-2xl font-bold flex items-center space-x-2.5 ${
              isDark ? 'text-white' : 'text-gray-900'
            }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isDark ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-600 border border-blue-200'
              }`}>
                <FileText className="w-4.5 h-4.5" />
              </div>
              <span>简历管理中心</span>
            </h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border font-mono ${
              isDark
                ? 'bg-blue-950/60 text-blue-300 border-blue-800/40'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              共 {resumes.length} 份
            </span>
          </div>
          <p className={`text-xs mt-1.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            集中管理不同职位方向与定制版本的简历，实时监控完整度并支持全真模拟对练与 AI 视角深度体检。
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>上传或录入新简历</span>
          </button>
        </div>
      </div>

      {/* Alert Notices */}
      {uploadSuccess && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{uploadSuccess}</span>
          </div>
          <button onClick={() => setUploadSuccess(null)} className="text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {uploadError && (
        <div className="p-3 rounded-lg bg-red-950/60 border border-red-700/60 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Resume Cards Grid */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>正在加载简历库...</p>
        </div>
      ) : listError ? (
        <div className={`py-16 text-center border border-dashed rounded-2xl p-8 space-y-4 ${
          isDark ? 'border-red-800/60 bg-red-950/20' : 'border-red-200 bg-red-50/50'
        }`}>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
            isDark ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-red-50 border border-red-200 text-red-600'
          }`}>
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              简历列表加载失败
            </h3>
            <p className={`text-xs max-w-md mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              {listError}
            </p>
          </div>
          <button
            onClick={fetchResumes}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition cursor-pointer shadow-md shadow-blue-600/20"
          >
            <Loader2 className="w-3.5 h-3.5" />
            <span>重新加载</span>
          </button>
        </div>
      ) : resumes.length === 0 ? (
        <div className={`py-16 text-center border border-dashed rounded-2xl p-8 space-y-4 ${
          isDark ? 'border-gray-800 bg-gray-900/30' : 'border-gray-300 bg-white shadow-xs'
        }`}>
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
            isDark ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400' : 'bg-blue-50 border border-blue-200 text-blue-600'
          }`}>
            <FileText className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              暂未录入任何简历
            </h3>
            <p className={`text-xs max-w-md mx-auto ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              上传你的第一份简历（PDF、Word、TXT），AI 将自动为你提取核心技能栈并结构化解析，随后即可针对性发起模拟面试。
            </p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition cursor-pointer shadow-md shadow-blue-600/20"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>立即上传简历</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {resumes.map((resume) => {
            const profile = resume.parsed_profile || {};
            const skills: string[] = profile.skills || [];
            const role = profile.job_role || profile.title || '通用岗位候选人';
            const expYears = profile.experience_years ? `${profile.experience_years}年经验` : null;
            const completeness = calculateResumeCompleteness(resume.parsed_profile, resume.raw_text_preview);

            return (
              <div
                key={resume.id}
                className={`group relative rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between ${
                  isDark
                    ? 'bg-gray-900/70 border-gray-800 hover:border-blue-500/50 hover:shadow-[0_16px_36px_rgba(0,0,0,0.5)]'
                    : 'bg-white border-gray-200/90 hover:border-blue-500/40 hover:shadow-[0_16px_36px_rgba(37,99,235,0.08)]'
                }`}
              >
                <div className="space-y-3.5">
                  {/* Title & Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isDark ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400' : 'bg-blue-50 border border-blue-200 text-blue-600'
                      }`}>
                        <FileText className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <h3
                          className={`text-sm font-bold truncate transition cursor-pointer ${
                            isDark ? 'text-white group-hover:text-blue-400' : 'text-gray-900 group-hover:text-blue-600'
                          }`}
                          title={resume.filename}
                          onClick={() => handleEdit(resume.id)}
                        >
                          {resume.filename}
                        </h3>
                        <div className={`flex items-center space-x-2 text-[11px] mt-0.5 ${
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3 opacity-70" />
                            <span>{formatDate(resume.created_at)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(resume.id);
                        }}
                        title="完善与编辑"
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          isDark
                            ? 'text-gray-400 hover:text-blue-300 hover:bg-blue-950/40'
                            : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(resume.id, resume.filename, e)}
                        title="删除该简历"
                        className={`p-1.5 rounded-lg transition cursor-pointer ${
                          isDark
                            ? 'text-gray-400 hover:text-red-400 hover:bg-red-950/40'
                            : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Completeness bar & score indicator */}
                  <div className={`p-2.5 rounded-xl border transition ${
                    isDark ? 'bg-gray-950/50 border-gray-800/80' : 'bg-gray-50/80 border-gray-100'
                  }`}>
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className={`font-medium flex items-center space-x-1.5 ${
                        isDark ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        <Sparkles className="w-3 h-3 text-blue-500" />
                        <span>简历完整度</span>
                      </span>
                      <span className={`font-semibold font-mono text-[11px] ${completeness.feedback.color}`}>
                        {completeness.score}% · {completeness.feedback.badgeText}
                      </span>
                    </div>
                    <div className={`h-1.5 w-full rounded-full overflow-hidden ${
                      isDark ? 'bg-gray-800' : 'bg-gray-200'
                    }`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${completeness.feedback.bgGradient}`}
                        style={{ width: `${completeness.score}%` }}
                      />
                    </div>
                  </div>

                  {/* Profile Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {resume.source_resume_id && (
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md border text-[11px] ${
                        isDark ? 'bg-emerald-950/60 border-emerald-800/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      }`}>
                        <Wand2 className="w-3 h-3" />
                        <span>AI 优化版</span>
                      </span>
                    )}
                    <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md border text-[11px] ${
                      isDark ? 'bg-blue-950/60 border-blue-800/40 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'
                    }`}>
                      <Briefcase className="w-3 h-3" />
                      <span>{role}</span>
                    </span>
                    {expYears && (
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md border text-[11px] ${
                        isDark ? 'bg-indigo-950/60 border-indigo-800/40 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                      }`}>
                        <span>{expYears}</span>
                      </span>
                    )}
                  </div>

                  {/* Core Skills Preview */}
                  {skills.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className={`text-[11px] flex items-center space-x-1 ${
                        isDark ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        <Tag className="w-3 h-3 text-blue-500" />
                        <span>核心技术栈 ({skills.length}):</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {skills.slice(0, 6).map((sk, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 rounded text-[11px] border ${
                              isDark ? 'bg-gray-800/80 text-gray-300 border-gray-700/60' : 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}
                          >
                            {sk}
                          </span>
                        ))}
                        {skills.length > 6 && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            isDark ? 'bg-gray-800/50 text-gray-400' : 'bg-gray-100 text-gray-500'
                          }`}>
                            +{skills.length - 6}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className={`text-xs line-clamp-2 italic ${
                      isDark ? 'text-gray-500' : 'text-gray-400'
                    }`}>
                      {resume.raw_text_preview || '未提取到特定技术栈'}
                    </p>
                  )}
                </div>

                {/* Bottom Actions：次要操作为彩色 chip（图标+短文字），主 CTA 通栏 */}
                <div className={`mt-5 pt-3 border-t space-y-2.5 ${
                  isDark ? 'border-gray-800/70' : 'border-gray-100'
                }`}>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleEdit(resume.id)}
                      aria-label="完善与编辑简历"
                      title="完善与编辑简历"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap transition cursor-pointer ${
                        isDark
                          ? 'bg-blue-950/60 border-blue-800/40 text-blue-300 hover:bg-blue-900/60 hover:text-blue-200'
                          : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800'
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>编辑</span>
                    </button>
                    <button
                      onClick={() => openPolish(resume.id, resume.filename)}
                      aria-label="AI 从面试官视角体检这份简历"
                      title="AI 从面试官视角体检这份简历"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap transition cursor-pointer ${
                        isDark
                          ? 'bg-amber-950/60 border-amber-800/40 text-amber-300 hover:bg-amber-900/60 hover:text-amber-200'
                          : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:text-amber-800'
                      }`}
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>AI 体检</span>
                    </button>
                    <button
                      onClick={() => handleViewDetail(resume.id)}
                      aria-label="预览详情"
                      title="预览详情"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap transition cursor-pointer ${
                        isDark
                          ? 'bg-violet-950/60 border-violet-800/40 text-violet-300 hover:bg-violet-900/60 hover:text-violet-200'
                          : 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 hover:text-violet-800'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>预览</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleLaunchMock(resume)}
                    className="inline-flex w-full items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>以此简历发起模拟</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-xl rounded-2xl border p-6 space-y-5 shadow-2xl transition-colors ${
            isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
          }`}>
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-gray-800' : 'border-gray-200'
            }`}>
              <h3 className={`text-base font-bold flex items-center space-x-2 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>
                <Upload className="w-4 h-4 text-blue-500" />
                <span>录入新简历</span>
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className={`p-1 rounded transition ${
                  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Option A: File Upload (click + real drag & drop) */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition space-y-2 group ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-500/10'
                    : isDark
                    ? 'border-gray-700 hover:border-blue-500/80 bg-gray-950/40 hover:bg-blue-950/10'
                    : 'border-gray-300 hover:border-blue-500 bg-gray-50/70 hover:bg-blue-50/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = '';
                  }}
                />
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto group-hover:scale-110 transition ${
                  isDark
                    ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                    : 'bg-blue-50 border border-blue-200 text-blue-600'
                }`}>
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className={`text-xs font-medium ${
                    isDark ? 'text-white group-hover:text-blue-300' : 'text-gray-900 group-hover:text-blue-600'
                  }`}>
                    点击选择简历文件或拖拽至此
                  </span>
                  <p className={`text-[11px] mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    支持 PDF、Word (.docx)、纯文本 (.txt)、Markdown (.md)、JSON，最大 10MB
                  </p>
                </div>
              </div>

              <div className="relative flex items-center justify-center">
                <div className={`border-t w-full ${isDark ? 'border-gray-800' : 'border-gray-200'}`} />
                <span className={`px-3 text-[11px] absolute ${
                  isDark ? 'bg-gray-900 text-gray-400' : 'bg-white text-gray-500'
                }`}>或者直接粘贴文本</span>
              </div>

              {/* Option B: Direct Text Paste */}
              <div className="space-y-2.5">
                <input
                  type="text"
                  placeholder="简历标题 / 标识（例如：前端架构师版、校招简历）"
                  value={pastedTitle}
                  onChange={(e) => setPastedTitle(e.target.value)}
                  className={`w-full text-xs px-3.5 py-2.5 rounded-lg border transition ${
                    isDark
                      ? 'bg-gray-950 border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15'
                      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15'
                  }`}
                />
                <textarea
                  rows={6}
                  placeholder="在此粘贴你的简历 Markdown / 纯文本内容..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className={`w-full text-xs p-3.5 rounded-lg border resize-none font-mono transition leading-relaxed ${
                    isDark
                      ? 'bg-gray-950 border-gray-800 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15'
                      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15'
                  }`}
                />
                <button
                  onClick={handlePasteSubmit}
                  disabled={uploading || !pastedText.trim()}
                  className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs shadow-md shadow-blue-600/20 transition flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>AI 正在解析提取画像...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>保存并进行 AI 智能解析</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Resume Detail & Preview Drawer/Modal */}
      {previewResume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-3xl max-h-[85vh] rounded-2xl border p-6 flex flex-col shadow-2xl transition-colors ${
            isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
          }`}>
            {/* Header */}
            <div className={`flex items-center justify-between border-b pb-3 ${
              isDark ? 'border-gray-800' : 'border-gray-200'
            }`}>
              <div className="flex items-center space-x-2 min-w-0">
                <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                <h3 className={`text-base font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {previewResume.filename}
                </h3>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => {
                    const id = previewResume.id;
                    const filename = previewResume.filename;
                    setPreviewResume(null);
                    openPolish(id, filename);
                  }}
                  className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                    isDark
                      ? 'border-gray-700 hover:border-amber-500 text-gray-300 hover:text-amber-300'
                      : 'border-gray-300 hover:border-amber-500 text-gray-700 hover:text-amber-700 bg-white'
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-500" />
                  <span>AI 体检</span>
                </button>
                <button
                  onClick={() => {
                    const id = previewResume.id;
                    setPreviewResume(null);
                    handleEdit(id);
                  }}
                  className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                    isDark
                      ? 'border-gray-700 hover:border-blue-500 text-gray-300 hover:text-blue-300'
                      : 'border-gray-300 hover:border-blue-500 text-gray-700 hover:text-blue-700 bg-white'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5 text-blue-500" />
                  <span>完善与编辑</span>
                </button>
                <button
                  onClick={() => {
                    onSelectResumeForMock(previewResume.raw_text, previewResume.filename);
                    setPreviewResume(null);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-600/20 transition cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>以此发起模拟</span>
                </button>
                <button
                  onClick={() => setPreviewResume(null)}
                  className={`p-1 rounded transition ${
                    isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Profile summary if parsed */}
              {previewResume.parsed_profile && Object.keys(previewResume.parsed_profile).length > 0 && (
                <div className={`p-4 rounded-xl border space-y-3 ${
                  isDark ? 'bg-blue-950/20 border-blue-800/40' : 'bg-blue-50/50 border-blue-100'
                }`}>
                  <div className="text-xs font-bold text-blue-500 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI 结构化解析画像</span>
                  </div>
                  {previewResume.parsed_profile.skills && (
                    <div className="flex flex-wrap gap-1.5">
                      {previewResume.parsed_profile.skills.map((s: string, idx: number) => (
                        <span
                          key={idx}
                          className={`px-2 py-0.5 rounded-md text-[11px] border ${
                            isDark
                              ? 'bg-blue-900/60 text-blue-200 border-blue-700/50'
                              : 'bg-blue-100/70 text-blue-800 border-blue-200'
                          }`}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {previewResume.parsed_profile.summary_profile && (
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      {previewResume.parsed_profile.summary_profile}
                    </p>
                  )}
                </div>
              )}

              {/* Raw text */}
              <div className="space-y-1.5">
                <div className={`text-xs font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  简历原文内容：
                </div>
                <div className={`p-4 rounded-xl border text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto ${
                  isDark
                    ? 'bg-gray-950 border-gray-800 text-gray-300'
                    : 'bg-gray-50 border-gray-200 text-gray-800'
                }`}>
                  {previewResume.raw_text}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modern Dual-Column Resume Editor Modal */}
      {editorResumeDetail && (
        <ResumeEditorModal
          initialData={editorResumeDetail}
          open={Boolean(editorResumeDetail)}
          onClose={() => {
            setEditorResumeDetail(null);
            setEditError(null);
          }}
          onSave={handleSaveEdit}
          saving={savingEdit}
          error={editError}
        />
      )}
      {/* 6. AI Polish Modal */}
      {polishingResume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-3xl max-h-[85vh] rounded-2xl border p-6 flex flex-col shadow-2xl transition-colors ${
            isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
          }`}>
            {/* Header */}
            <div className={`flex items-start justify-between border-b pb-3 ${
              isDark ? 'border-gray-800' : 'border-gray-200'
            }`}>
              <div>
                <div className="flex items-center space-x-2">
                  <Wand2 className="w-5 h-5 text-purple-500" />
                  <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>AI 简历体检</h3>
                </div>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{polishingResume.filename}</p>
              </div>
              <button
                onClick={closePolish}
                disabled={applying}
                className={`p-1 rounded transition disabled:opacity-40 ${
                  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {polishError && (
                <div className={`p-2.5 rounded-lg border text-xs flex items-center space-x-2 ${
                  isDark
                    ? 'bg-red-950/60 border-red-700/60 text-red-300'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{polishError}</span>
                </div>
              )}

              {!polishReport ? (
                <>
                  {/* Intro & fact-boundary promise */}
                  <div className={`p-3.5 rounded-xl border space-y-1.5 ${
                    isDark
                      ? 'bg-purple-950/20 border-purple-800/40'
                      : 'bg-purple-50/70 border-purple-200'
                  }`}>
                    <div className={`text-xs font-bold flex items-center space-x-1.5 ${
                      isDark ? 'text-purple-300' : 'text-purple-700'
                    }`}>
                      <Target className="w-3.5 h-3.5" />
                      <span>面试官视角的简历体检</span>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      AI 将从真实面试官的角度诊断这份简历：JD 匹配缺口、表达质量问题、以及哪些内容会被追问翻车。
                    </p>
                    <p className={`text-[11px] leading-relaxed ${isDark ? 'text-purple-300/80' : 'text-purple-700/80'}`}>
                      事实边界：AI 只重组和润色原文，不会编造任何经历；所有改写建议由你逐条确认后生成新版本，原简历不会被修改。
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      目标岗位 <span className="font-normal text-gray-500">（可选，例如：资深后端工程师）</span>
                    </label>
                    <input
                      type="text"
                      value={polishRole}
                      onChange={(e) => setPolishRole(e.target.value)}
                      className={`w-full text-xs px-3 py-2 rounded-lg border placeholder-gray-400 focus:outline-none focus:border-purple-500 ${
                        isDark
                          ? 'bg-gray-950 border-gray-800 text-white'
                          : 'bg-white border-gray-200 text-gray-900'
                      }`}
                      placeholder="留空则做通用体检；采纳建议时将作为新版本的命名标签"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={`text-xs font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      岗位描述 JD <span className="font-normal text-gray-500">（可选，提供后输出匹配度评分与缺口分析）</span>
                    </label>
                    <textarea
                      rows={6}
                      value={polishJd}
                      onChange={(e) => setPolishJd(e.target.value)}
                      className={`w-full text-xs p-3 rounded-lg border resize-y leading-relaxed placeholder-gray-400 focus:outline-none focus:border-purple-500 ${
                        isDark
                          ? 'bg-gray-950 border-gray-800 text-white'
                          : 'bg-white border-gray-200 text-gray-900'
                      }`}
                      placeholder="粘贴目标岗位的 JD 全文..."
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Overall verdict */}
                  {(polishReport.overall_comment || polishReport.match_score != null) && (
                    <div className={`p-4 rounded-xl border space-y-2.5 ${
                      isDark
                        ? 'bg-purple-950/20 border-purple-800/40'
                        : 'bg-purple-50/70 border-purple-200'
                    }`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className={`text-xs font-bold flex items-center space-x-1.5 ${
                          isDark ? 'text-purple-300' : 'text-purple-700'
                        }`}>
                          <Target className="w-3.5 h-3.5" />
                          <span>总体诊断</span>
                        </div>
                        {polishReport.match_score != null && (
                          <div className="flex items-center space-x-2 shrink-0">
                            <div className={`w-28 h-1.5 rounded-full overflow-hidden ${
                              isDark ? 'bg-gray-800' : 'bg-gray-200'
                            }`}>
                              <div
                                className={`h-full rounded-full transition-all ${
                                  polishReport.match_score >= 80
                                    ? 'bg-emerald-500'
                                    : polishReport.match_score >= 60
                                      ? 'bg-amber-500'
                                      : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.max(2, polishReport.match_score)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {polishReport.match_score}
                              <span className="text-[10px] text-gray-500"> /100</span>
                            </span>
                          </div>
                        )}
                      </div>
                      {polishReport.overall_comment && (
                        <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{polishReport.overall_comment}</p>
                      )}
                    </div>
                  )}

                  {/* JD gaps */}
                  {(polishReport.gaps?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <div className={`text-xs font-bold flex items-center space-x-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        <Briefcase className="w-3.5 h-3.5 text-purple-500" />
                        <span>JD 匹配缺口</span>
                      </div>
                      {polishReport.gaps!.map((gap, idx) => {
                        const meta = GAP_STATUS_META[gap.status] || GAP_STATUS_META.weak;
                        return (
                          <div key={idx} className={`p-3 rounded-xl border space-y-1.5 ${
                            isDark ? 'bg-gray-950/40 border-gray-800' : 'bg-gray-50 border-gray-200'
                          }`}>
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{gap.requirement}</span>
                              <span className={`shrink-0 px-2 py-0.5 rounded border text-[10px] ${gapBadgeCls(gap.status)}`}>
                                {meta.label}
                              </span>
                            </div>
                            {gap.evidence && <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{gap.evidence}</p>}
                            {gap.advice && (
                              <p className={`text-[11px] leading-relaxed ${isDark ? 'text-purple-300/90' : 'text-purple-700'}`}>建议：{gap.advice}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Adoptable issues */}
                  {(polishReport.issues?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <div className={`text-xs font-bold flex items-center space-x-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        <Wand2 className="w-3.5 h-3.5 text-purple-500" />
                        <span>逐条打磨建议（勾选采纳后将生成新版本）</span>
                      </div>
                      {polishReport.issues!.map((issue, idx) => {
                        const canAdopt = issue.applicable !== false && !!issue.rewritten;
                        const checked = adoptedIdx.includes(idx);
                        return (
                          <div
                            key={idx}
                            className={`p-3 rounded-xl border space-y-2 transition ${
                              checked
                                ? isDark
                                  ? 'border-purple-600/60 bg-purple-950/20'
                                  : 'border-purple-500/60 bg-purple-50/70'
                                : isDark
                                ? 'border-gray-800 bg-gray-950/40'
                                : 'border-gray-200 bg-gray-50'
                            } ${!canAdopt ? 'opacity-60' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                <span className={`px-2 py-0.5 rounded border text-[10px] ${severityBadgeCls(issue.severity)}`}>
                                  {SEVERITY_LABELS[issue.severity || 'medium'] || '中等'}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] border ${
                                  isDark
                                    ? 'bg-gray-800/80 text-gray-300 border-gray-700/60'
                                    : 'bg-gray-100 text-gray-600 border-gray-200'
                                }`}>
                                  {ISSUE_TYPE_LABELS[issue.type || ''] || '表达优化'}
                                </span>
                              </div>
                              {canAdopt ? (
                                <label className={`flex items-center space-x-1.5 text-[11px] cursor-pointer select-none shrink-0 ${
                                  isDark ? 'text-gray-300' : 'text-gray-700'
                                }`}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleAdopt(idx)}
                                    className={`w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer ${
                                      isDark ? 'border-gray-600 bg-gray-950' : 'border-gray-300 bg-white'
                                    }`}
                                  />
                                  <span>采纳</span>
                                </label>
                              ) : (
                                <span className="text-[10px] text-gray-500 shrink-0">无法定位原文</span>
                              )}
                            </div>
                            <div className={`p-2 rounded-lg border text-[11px] font-mono whitespace-pre-wrap leading-relaxed ${
                              isDark
                                ? 'bg-gray-900 border-gray-800 text-gray-300'
                                : 'bg-gray-100/70 border-gray-200 text-gray-700'
                            }`}>
                              {issue.quote}
                            </div>
                            {issue.problem && (
                              <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>问题：{issue.problem}</p>
                            )}
                            {canAdopt && (
                              <div className={`p-2 rounded-lg border text-[11px] whitespace-pre-wrap leading-relaxed ${
                                isDark
                                  ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              }`}>
                                {issue.rewritten}
                              </div>
                            )}
                            {issue.reason && (
                              <p className="text-[11px] text-gray-500 leading-relaxed">理由：{issue.reason}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Interviewer challenge risks */}
                  {(polishReport.challenge_risks?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <div className={`text-xs font-bold flex items-center space-x-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>追问风险（面试官视角）</span>
                      </div>
                      {polishReport.challenge_risks!.map((risk, idx) => (
                        <div key={idx} className={`p-3 rounded-xl border space-y-1.5 ${
                          isDark
                            ? 'bg-amber-950/20 border-amber-800/40'
                            : 'bg-amber-50/70 border-amber-200'
                        }`}>
                          {risk.quote && (
                            <p className={`text-[11px] font-mono ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>「{risk.quote}」</p>
                          )}
                          {risk.likely_question && (
                            <p className={`text-xs leading-relaxed ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>可能的追问：{risk.likely_question}</p>
                          )}
                          {risk.advice && <p className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>应对：{risk.advice}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* General tips */}
                  {(polishReport.general_tips?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <div className={`text-xs font-bold flex items-center space-x-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                        <span>整体建议</span>
                      </div>
                      <ul className={`p-3 rounded-xl border space-y-1.5 list-disc list-inside ${
                        isDark ? 'bg-gray-950/40 border-gray-800' : 'bg-gray-50 border-gray-200'
                      }`}>
                        {polishReport.general_tips!.map((tip, idx) => (
                          <li key={idx} className={`text-[11px] leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className={`pt-3 border-t flex items-center justify-between gap-3 ${
              isDark ? 'border-gray-800' : 'border-gray-200'
            }`}>
              <p className="text-[11px] text-gray-500 min-w-0">
                {polishReport
                  ? `已选 ${adoptedIdx.length} 条建议 · 生成新简历副本，原件不动`
                  : 'JD 与目标岗位均为可选，提供后诊断更精准'}
              </p>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={closePolish}
                  disabled={applying}
                  className={`px-4 py-2 rounded-lg border text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                    isDark
                      ? 'border-gray-700 text-gray-300 hover:text-white'
                      : 'border-gray-300 text-gray-700 hover:text-gray-900'
                  }`}
                >
                  取消
                </button>
                {!polishReport ? (
                  <button
                    onClick={runPolish}
                    disabled={polishing}
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs transition cursor-pointer"
                  >
                    {polishing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>AI 体检中...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        <span>开始 AI 体检</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={applyAdopted}
                    disabled={applying || adoptedIdx.length === 0}
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs transition cursor-pointer"
                  >
                    {applying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>生成中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>用 {adoptedIdx.length} 条建议生成优化版</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Delete Confirm Modal */}
      {deletingTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-2xl transition-colors ${
            isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10 border border-red-500/30 text-red-500">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  确认删除简历
                </h3>
                <p className={`text-xs leading-relaxed break-all ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  确定要删除 <span className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>"{deletingTarget.filename}"</span> 吗？删除后不可恢复。
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                onClick={() => setDeletingTarget(null)}
                disabled={deleting}
                className={`px-4 py-2 rounded-lg border text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                  isDark
                    ? 'border-gray-700 text-gray-300 hover:text-white'
                    : 'border-gray-300 text-gray-700 hover:text-gray-900'
                }`}
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-red-600/20 transition cursor-pointer"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{deleting ? '删除中...' : '确认删除'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
