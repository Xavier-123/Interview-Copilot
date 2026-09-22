import React, { useCallback, useEffect, useState } from 'react';
import {
  Users2,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Sparkles,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Persona } from '../types';
import { PersonaEvolutionModal } from './PersonaEvolutionModal';

const AVATAR_OPTIONS = ['🎭', '🔥', '🧠', '🎯', '⚡', '🦅', '💎', '🧙', '🕵️', '👨‍💻', '👩‍💻', '🧑‍🏫'];

const EMPTY_FORM = {
  name: '',
  avatar: '🎭',
  description: '',
  system_prompt: '',
  focus_topics: '',
  opening_hint: '',
  deep_dive_hint: '',
  probe_hint: '',
  switch_hint: '',
};

interface PersonaFormState {
  name: string;
  avatar: string;
  description: string;
  system_prompt: string;
  focus_topics: string;
  opening_hint: string;
  deep_dive_hint: string;
  probe_hint: string;
  switch_hint: string;
}

const PersonaLibraryView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonaFormState>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const [evolutionPersona, setEvolutionPersona] = useState<Persona | null>(null);

  const openEvolution = (p: Persona) => {
    setEvolutionPersona(p);
    setEvolutionOpen(true);
  };

  const fetchPersonas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/personas');
      if (!res.ok) throw new Error('角色列表加载失败');
      const data = await res.json();
      setPersonas(data.personas || []);
    } catch (err: any) {
      setError(err.message || '角色列表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setAdvancedOpen(false);
    setModalOpen(true);
  };

  const openEdit = (p: Persona) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      avatar: p.avatar || '🎭',
      description: p.description || '',
      system_prompt: p.system_prompt,
      focus_topics: (p.focus_topics || []).join(', '),
      opening_hint: p.opening_hint || '',
      deep_dive_hint: p.deep_dive_hint || '',
      probe_hint: p.probe_hint || '',
      switch_hint: p.switch_hint || '',
    });
    setAdvancedOpen(!!(p.opening_hint || p.deep_dive_hint || p.probe_hint || p.switch_hint));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || form.system_prompt.trim().length < 5) {
      alert('请填写角色名称和人设正文（至少 5 个字）');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        avatar: form.avatar,
        description: form.description.trim(),
        system_prompt: form.system_prompt.trim(),
        focus_topics: form.focus_topics.split(/[,，]/).map((t) => t.trim()).filter(Boolean).slice(0, 8),
        opening_hint: form.opening_hint.trim(),
        deep_dive_hint: form.deep_dive_hint.trim(),
        probe_hint: form.probe_hint.trim(),
        switch_hint: form.switch_hint.trim(),
        enabled: true,
      };
      const res = await fetch(
        editingId ? `/api/v1/personas/${editingId}` : '/api/v1/personas',
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || '保存失败');
      }
      setModalOpen(false);
      await fetchPersonas();
    } catch (err: any) {
      alert(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除该面试官角色吗？已创建的面试会话使用快照，不受影响。')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/personas/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('删除失败');
      setPersonas((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert(err.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const updateForm = (patch: Partial<PersonaFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <div className="max-w-6xl mx-auto py-6 px-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2">
            <Users2 className="w-5 h-5 text-violet-400" />
            <span>面试官角色库</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            设计你自己的面试官人设，在「自选定制面试」中与内置面试官自由组队出场。
          </p>
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={onBack}
            className="text-xs px-3 py-2 rounded-xl bg-gray-900 border border-gray-800 text-gray-300 hover:text-white transition"
          >
            返回
          </button>
          <button
            type="button"
            onClick={openCreate}
            title="新建自定义面试官角色"
            className="flex items-center space-x-1.5 text-xs px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建角色</span>
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="py-20 flex flex-col items-center space-y-3 text-gray-400 text-xs">
          <Loader2 className="w-7 h-7 animate-spin text-violet-500" />
          <span>正在加载角色库...</span>
        </div>
      ) : error ? (
        <div className="py-16 flex flex-col items-center space-y-2 text-gray-400 text-xs">
          <AlertTriangle className="w-7 h-7 text-amber-400" />
          <span>{error}</span>
        </div>
      ) : personas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-950/40 p-12 flex flex-col items-center text-center space-y-3">
          <Sparkles className="w-8 h-8 text-violet-400/70" />
          <p className="text-sm text-gray-300 font-medium">还没有自定义面试官角色</p>
          <p className="text-xs text-gray-500 max-w-md leading-relaxed">
            例如：专怼系统设计的架构委员会成员、只考 Kotlin 的 Android 专家、压力拉满的 CFO……
            人设写得多具体，面试就有多真实。
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-1 flex items-center space-x-1.5 text-xs px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>创建第一个角色</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {personas.map((p) => (
            <div
              key={p.id}
              className="group relative rounded-2xl border border-gray-800 bg-gray-900/60 hover:border-violet-700/60 transition p-4 flex flex-col"
            >
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-xl bg-violet-950/40 border border-violet-800/50 flex items-center justify-center text-xl shrink-0">
                  {p.avatar || '🎭'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-gray-100 truncate">{p.name}</div>
                  <div className="text-[11px] text-gray-500 truncate">{p.description || '自定义面试官角色'}</div>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 mt-3 leading-relaxed line-clamp-3 flex-1">
                {p.system_prompt}
              </p>

              {(p.focus_topics?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {p.focus_topics.slice(0, 4).map((t) => (
                    <span
                      key={t}
                      className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-950/40 border border-violet-900/50 text-violet-300"
                    >
                      {t}
                    </span>
                  ))}
                  {p.focus_topics.length > 4 && (
                    <span className="text-[10px] px-1.5 py-0.5 text-gray-500">+{p.focus_topics.length - 4}</span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end space-x-1.5 mt-3 pt-3 border-t border-gray-800/70">
                <button
                  type="button"
                  onClick={() => openEvolution(p)}
                  title="通过真实对抗模拟演练并针对性优化此面试官"
                  className="flex items-center space-x-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-violet-950/60 border border-violet-800/50 hover:bg-violet-900/60 text-violet-300 transition"
                >
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  <span>一键仿真进化</span>
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  className="flex items-center space-x-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                >
                  <Pencil className="w-3 h-3" />
                  <span>编辑</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                  className="flex items-center space-x-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900/40 hover:text-red-300 text-gray-400 transition disabled:opacity-50"
                >
                  {deletingId === p.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  <span>删除</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span>{editingId ? '编辑面试官角色' : '新建面试官角色'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">角色名称 *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => updateForm({ name: e.target.value })}
                    placeholder="如：毒舌架构师"
                    maxLength={32}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">头像</label>
                  <div className="flex flex-wrap gap-1">
                    {AVATAR_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => updateForm({ avatar: emoji })}
                        className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center border transition ${
                          form.avatar === emoji
                            ? 'bg-violet-600/30 border-violet-500'
                            : 'bg-gray-950 border-gray-800 hover:border-gray-600'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">一句话简介</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder="如：以毒舌著称的架构委员会成员，专怼系统设计"
                  maxLength={128}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  人设正文 *（背景、专业领域、提问策略与口头禅，越具体越传神）
                </label>
                <textarea
                  value={form.system_prompt}
                  onChange={(e) => updateForm({ system_prompt: e.target.value })}
                  rows={6}
                  maxLength={2000}
                  placeholder="如：你是一位带过百人团队的 CTO，面试时喜欢从真实线上事故切入追问技术方案；口头禅是“这个方案线上跑过吗？”……"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 leading-relaxed focus:outline-none focus:border-violet-500 resize-y"
                />
                <div className="text-[10px] text-gray-600 mt-1 text-right">{form.system_prompt.length} / 2000</div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">考察重点（逗号分隔，最多 8 个）</label>
                <input
                  type="text"
                  value={form.focus_topics}
                  onChange={(e) => updateForm({ focus_topics: e.target.value })}
                  placeholder="如：高并发架构, 分布式一致性, 线上事故复盘"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Advanced hints */}
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="flex items-center space-x-1 text-[11px] text-gray-500 hover:text-gray-300 transition"
              >
                {advancedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                <span>高级选项：自定义追问策略（留空则使用系统默认）</span>
              </button>
              {advancedOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">开场首题引导</label>
                    <textarea
                      value={form.opening_hint}
                      onChange={(e) => updateForm({ opening_hint: e.target.value })}
                      rows={2}
                      maxLength={400}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-[11px] text-gray-200 focus:outline-none focus:border-violet-500 resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">深挖追问引导（答得好时）</label>
                    <textarea
                      value={form.deep_dive_hint}
                      onChange={(e) => updateForm({ deep_dive_hint: e.target.value })}
                      rows={2}
                      maxLength={400}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-[11px] text-gray-200 focus:outline-none focus:border-violet-500 resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">补漏引导（答得浅时）</label>
                    <textarea
                      value={form.probe_hint}
                      onChange={(e) => updateForm({ probe_hint: e.target.value })}
                      rows={2}
                      maxLength={400}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-[11px] text-gray-200 focus:outline-none focus:border-violet-500 resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">换题引导（切换考点时）</label>
                    <textarea
                      value={form.switch_hint}
                      onChange={(e) => updateForm({ switch_hint: e.target.value })}
                      rows={2}
                      maxLength={400}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-[11px] text-gray-200 focus:outline-none focus:border-violet-500 resize-y"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-2 p-4 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-xs px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center space-x-1.5 text-xs px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium transition disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{editingId ? '保存修改' : '创建角色'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persona Auto-Evolution Modal */}
      <PersonaEvolutionModal
        open={evolutionOpen}
        persona={evolutionPersona}
        onClose={() => setEvolutionOpen(false)}
        onSuccess={fetchPersonas}
      />
    </div>
  );
};

export { PersonaLibraryView };
