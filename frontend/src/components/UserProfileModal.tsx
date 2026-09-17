import React, { useState, useEffect } from 'react';
import { X, Plus, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface UserProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ open, onClose }) => {
  const { user, updateProfile, logout } = useAuth();
  const profile = user?.profile;

  const [realName, setRealName] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [targetLevel, setTargetLevel] = useState('senior');
  const [experienceYears, setExperienceYears] = useState(3);
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setRealName(profile.real_name || '');
      setTargetRole(profile.target_role || '');
      setTargetIndustry(profile.target_industry || '互联网/电商');
      setTargetLevel(profile.target_level || 'senior');
      setExperienceYears(profile.experience_years || 3);
      setSkills(profile.skills || []);
      setBio(profile.bio || '');
    }
  }, [profile]);

  if (!open || !user) return null;

  const handleAddSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await updateProfile({
        real_name: realName,
        target_role: targetRole,
        target_industry: targetIndustry,
        target_level: targetLevel,
        experience_years: Number(experienceYears),
        skills,
        bio,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-lg p-6 relative shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-lg">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <span>{realName || user.username}</span>
              {user.is_guest && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700/50">
                  游客账号
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-400">@{user.username} · 个人画像与偏好档案</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-300 mb-1 font-medium">真实姓名 / 昵称</label>
              <input
                type="text"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-300 mb-1 font-medium">工作年限 (年)</label>
              <input
                type="number"
                min={0}
                max={40}
                value={experienceYears}
                onChange={(e) => setExperienceYears(Number(e.target.value))}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-300 mb-1 font-medium">目标岗位</label>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="例如：大模型架构师"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-300 mb-1 font-medium">目标行业</label>
              <select
                value={targetIndustry}
                onChange={(e) => setTargetIndustry(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="互联网/电商">互联网/电商</option>
                <option value="人工智能/大模型">人工智能/大模型</option>
                <option value="金融科技/量化">金融科技/量化</option>
                <option value="智能制造/自动驾驶">智能制造/自动驾驶</option>
                <option value="企业服务/SaaS">企业服务/SaaS</option>
                <option value="游戏开发">游戏开发</option>
                <option value="医疗健康/生物医药">医疗健康/生物医药</option>
                <option value="通用行业">通用行业</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-300 mb-1 font-medium">考核职级定位</label>
            <select
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 px-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
            >
              <option value="intern">校招新人 / 实习生</option>
              <option value="junior">初级工程师 (1-3年)</option>
              <option value="senior">资深工程师 (3-5年)</option>
              <option value="expert">技术专家 / 架构师 (5-10年)</option>
              <option value="director">技术总监 / 管理岗 (10年+)</option>
            </select>
          </div>

          {/* Skills Tag Editor */}
          <div>
            <label className="block text-xs text-gray-300 mb-1 font-medium">核心技能标签</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-blue-950/80 border border-blue-800/50 text-blue-300 text-xs"
                >
                  <span>{skill}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSkill(skill)}
                    className="text-blue-400 hover:text-red-400 transition ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex space-x-2">
              <input
                type="text"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                placeholder="输入新技能并按回车添加..."
                className="flex-1 bg-gray-950 border border-gray-800 rounded-xl py-1.5 px-3 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加</span>
              </button>
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-xs text-gray-300 mb-1 font-medium">自我简介 / 求职偏好</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={2}
              placeholder="简要描述你的优势领域或求职亮点..."
              className="w-full bg-gray-950 border border-gray-800 rounded-xl p-2.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                logout();
                onClose();
              }}
              className="text-xs text-red-400 hover:text-red-300 transition"
            >
              退出登录
            </button>

            <div className="flex items-center space-x-2">
              {success && (
                <span className="text-xs text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>已保存</span>
                </span>
              )}
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
