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
  Tag,
  Briefcase,
} from 'lucide-react';
import type { SavedResumeItem, SavedResumeDetail } from '../types';

interface ResumeManagementViewProps {
  onBack: () => void;
  onSelectResumeForMock: (resumeText: string, resumeTitle?: string) => void;
}

export const ResumeManagementView: React.FC<ResumeManagementViewProps> = ({
  onBack,
  onSelectResumeForMock,
}) => {
  const [resumes, setResumes] = useState<SavedResumeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [previewResume, setPreviewResume] = useState<SavedResumeDetail | null>(null);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [pastedText, setPastedText] = useState<string>('');
  const [pastedTitle, setPastedTitle] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchResumes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/profiles/resumes');
      if (res.ok) {
        const data = await res.json();
        setResumes(data.resumes || []);
      }
    } catch (err) {
      console.error('Failed to load resumes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResumes();
  }, []);

  // Upload file handler
  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/v1/profiles/upload-resume', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '简历上传解析失败');
      }
      await res.json();
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

  // Delete resume
  const handleDelete = async (resumeId: string, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`确定要删除简历 "${filename}" 吗？此操作不可恢复。`)) return;

    try {
      const res = await fetch(`/api/v1/profiles/resumes/${resumeId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setResumes((prev) => prev.filter((r) => r.id !== resumeId));
        if (previewResume?.id === resumeId) setPreviewResume(null);
      } else {
        alert('删除失败，请稍后重试');
      }
    } catch (err) {
      console.error('Failed to delete resume:', err);
    }
  };

  // View resume detail
  const handleViewDetail = async (resumeId: string) => {
    try {
      const res = await fetch(`/api/v1/profiles/resumes/${resumeId}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewResume(data);
      } else {
        alert('获取简历详情失败');
      }
    } catch (err) {
      console.error('Failed to fetch resume detail:', err);
    }
  };

  // Launch mock with selected resume
  const handleLaunchMock = async (resumeItem: SavedResumeItem) => {
    try {
      // Fetch full raw text
      const res = await fetch(`/api/v1/profiles/resumes/${resumeItem.id}`);
      if (res.ok) {
        const data = await res.json();
        onSelectResumeForMock(data.raw_text || resumeItem.raw_text_preview, resumeItem.filename);
      } else {
        onSelectResumeForMock(resumeItem.raw_text_preview, resumeItem.filename);
      }
    } catch {
      onSelectResumeForMock(resumeItem.raw_text_preview, resumeItem.filename);
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

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-6 animate-fade-in">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center space-x-1.5 text-xs text-gray-400 hover:text-white transition mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回首页工作台</span>
          </button>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
              <FileText className="w-6 h-6 text-purple-400" />
              <span>简历管理中心</span>
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-900/50 text-purple-300 border border-purple-700/50">
              共 {resumes.length} 份
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            集中管理不同职位方向与定制版本的简历，支持 AI 深度画像解析并一键带入全真模拟对练。
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-purple-600/30 transition cursor-pointer"
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
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
          <p className="text-xs text-gray-400">正在加载简历库...</p>
        </div>
      ) : resumes.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-gray-800 rounded-2xl p-8 space-y-4 bg-gray-900/30">
          <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
            <FileText className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">暂未录入任何简历</h3>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              上传你的第一份简历（PDF、Word、TXT），AI 将自动为你提取核心技能栈并结构化解析，随后即可针对性发起模拟面试。
            </p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition cursor-pointer"
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
            const role = profile.title || profile.job_role || '通用候选人';
            const expYears = profile.experience_years ? `${profile.experience_years}年经验` : null;

            return (
              <div
                key={resume.id}
                className="group relative rounded-2xl bg-gray-900/70 border border-gray-800 hover:border-purple-600/60 p-5 transition-all duration-200 hover:shadow-xl hover:shadow-purple-950/20 flex flex-col justify-between"
              >
                <div className="space-y-3.5">
                  {/* Title & Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate group-hover:text-purple-300 transition" title={resume.filename}>
                          {resume.filename}
                        </h3>
                        <div className="flex items-center space-x-2 text-[11px] text-gray-400 mt-0.5">
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span>{formatDate(resume.created_at)}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDelete(resume.id, resume.filename, e)}
                      title="删除该简历"
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Profile Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-blue-950/60 border border-blue-800/40 text-[11px] text-blue-300">
                      <Briefcase className="w-3 h-3" />
                      <span>{role}</span>
                    </span>
                    {expYears && (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-800/40 text-[11px] text-indigo-300">
                        <span>{expYears}</span>
                      </span>
                    )}
                  </div>

                  {/* Core Skills Preview */}
                  {skills.length > 0 ? (
                    <div className="space-y-1">
                      <div className="text-[11px] text-gray-400 flex items-center space-x-1">
                        <Tag className="w-3 h-3 text-purple-400" />
                        <span>核心技术栈 ({skills.length}):</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {skills.slice(0, 6).map((sk, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-gray-800/80 text-gray-300 text-[11px] border border-gray-700/60"
                          >
                            {sk}
                          </span>
                        ))}
                        {skills.length > 6 && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-800/50 text-gray-400 text-[10px]">
                            +{skills.length - 6}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 line-clamp-2 italic">
                      {resume.raw_text_preview || '未提取到特定技术栈'}
                    </p>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 pt-3 border-t border-gray-800/70 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleViewDetail(resume.id)}
                    className="inline-flex items-center space-x-1 text-xs text-gray-400 hover:text-purple-300 transition cursor-pointer px-2 py-1 rounded hover:bg-gray-800"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>预览详情</span>
                  </button>

                  <button
                    onClick={() => handleLaunchMock(resume)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs shadow-md shadow-purple-900/30 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>以此发起模拟</span>
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
          <div className="w-full max-w-xl rounded-2xl bg-gray-900 border border-gray-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <Upload className="w-4 h-4 text-purple-400" />
                <span>录入新简历</span>
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 rounded text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Option A: File Upload */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-700 hover:border-purple-500/80 rounded-xl p-6 text-center cursor-pointer transition bg-gray-950/40 hover:bg-purple-950/10 space-y-2 group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto group-hover:scale-110 transition">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-medium text-white group-hover:text-purple-300">
                    点击选择简历文件或拖拽至此
                  </span>
                  <p className="text-[11px] text-gray-400 mt-1">
                    支持 PDF、Word (.docx)、纯文本 (.txt)、Markdown (.md)
                  </p>
                </div>
              </div>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-gray-800 w-full" />
                <span className="bg-gray-900 px-3 text-[11px] text-gray-400 absolute">或者直接粘贴文本</span>
              </div>

              {/* Option B: Direct Text Paste */}
              <div className="space-y-2.5">
                <input
                  type="text"
                  placeholder="简历标题 / 标识（例如：前端架构师版、校招简历）"
                  value={pastedTitle}
                  onChange={(e) => setPastedTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
                <textarea
                  rows={6}
                  placeholder="在此粘贴你的简历 Markdown / 纯文本内容..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="w-full text-xs p-3 rounded-lg bg-gray-950 border border-gray-800 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 resize-none font-mono"
                />
                <button
                  onClick={handlePasteSubmit}
                  disabled={uploading || !pastedText.trim()}
                  className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs transition flex items-center justify-center space-x-2 cursor-pointer"
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
          <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl bg-gray-900 border border-gray-800 p-6 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">{previewResume.filename}</h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    onSelectResumeForMock(previewResume.raw_text, previewResume.filename);
                    setPreviewResume(null);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>以此发起模拟</span>
                </button>
                <button
                  onClick={() => setPreviewResume(null)}
                  className="p-1 rounded text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Profile summary if parsed */}
              {previewResume.parsed_profile && Object.keys(previewResume.parsed_profile).length > 0 && (
                <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-3">
                  <div className="text-xs font-bold text-purple-300 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI 结构化解析画像</span>
                  </div>
                  {previewResume.parsed_profile.skills && (
                    <div className="flex flex-wrap gap-1.5">
                      {previewResume.parsed_profile.skills.map((s: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-purple-900/60 text-purple-200 border border-purple-700/50 text-[11px]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {previewResume.parsed_profile.summary && (
                    <p className="text-xs text-gray-300 leading-relaxed">
                      {previewResume.parsed_profile.summary}
                    </p>
                  )}
                </div>
              )}

              {/* Raw text */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-gray-300">简历原文内容：</div>
                <div className="p-4 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                  {previewResume.raw_text}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
