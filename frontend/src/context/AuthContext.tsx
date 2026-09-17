import React, { createContext, useContext, useState, useEffect } from 'react';
import type { UserData, UserProfileData } from '../types';

interface AuthContextType {
  user: UserData | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: {
    username: string;
    password: string;
    email?: string;
    real_name?: string;
    target_role?: string;
    target_industry?: string;
  }) => Promise<void>;
  guestLogin: () => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<UserProfileData>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('interview_copilot_token'));
  const [isLoading, setIsLoading] = useState(true);

  // Fetch current user if token exists
  useEffect(() => {
    const fetchMe = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          // Token invalid
          localStorage.removeItem('interview_copilot_token');
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error('Failed to fetch current user:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMe();
  }, [token]);

  const login = async (username: string, password: string) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '登录失败');
    }
    const data = await res.json();
    localStorage.setItem('interview_copilot_token', data.access_token);
    setToken(data.access_token);
    setUser(data.user);
  };

  const register = async (data: {
    username: string;
    password: string;
    email?: string;
    real_name?: string;
    target_role?: string;
    target_industry?: string;
  }) => {
    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '注册失败');
    }
    const result = await res.json();
    localStorage.setItem('interview_copilot_token', result.access_token);
    setToken(result.access_token);
    setUser(result.user);
  };

  const guestLogin = async () => {
    const res = await fetch('/api/v1/auth/guest', {
      method: 'POST'
    });
    if (!res.ok) {
      throw new Error('游客登录失败');
    }
    const data = await res.json();
    localStorage.setItem('interview_copilot_token', data.access_token);
    setToken(data.access_token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('interview_copilot_token');
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (data: Partial<UserProfileData>) => {
    if (!token) throw new Error('未登录');
    const res = await fetch('/api/v1/auth/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      throw new Error('更新资料失败');
    }
    const result = await res.json();
    if (user) {
      setUser({ ...user, profile: result.profile });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        guestLogin,
        logout,
        updateProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
