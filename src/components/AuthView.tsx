import React, { useState } from 'react';
import { loginWithEmailOrUsername } from '../firebase';
import { useApp } from '../context/AppContext';
import { 
  Lock, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  LogIn, 
  Cloud, 
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Eye,
  EyeOff
} from 'lucide-react';

interface AuthViewProps {
  onSuccess?: () => void;
  onContinueAsGuest?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSuccess, onContinueAsGuest }) => {
  const { loginUser } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [logoutNotice, setLogoutNotice] = useState<string | null>(() => {
    try {
      const reason = sessionStorage.getItem('auth_logout_reason');
      if (reason === 'deleted') {
        sessionStorage.removeItem('auth_logout_reason');
        return '⚠️ تم حذف هذا الحساب نهائياً من قبل الإدارة. تم تسجيل الخروج التلقائي من النظام.';
      } else if (reason === 'disabled') {
        sessionStorage.removeItem('auth_logout_reason');
        return '⚠️ تم تعطيل وتجميد هذا الحساب من قبل الإدارة. تم تسجيل الخروج التلقائي. يرجى مراجعة المدير العام.';
      }
    } catch {}
    return null;
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const targetIdentifier = identifier.trim();
    if (!targetIdentifier) {
      setErrorMessage('يرجى إدخال اسم المستخدم أو رقم الهاتف أو البريد الإلكتروني');
      return;
    }
    if (!password) {
      setErrorMessage('يرجى إدخال كلمة المرور');
      return;
    }

    setIsLoading(true);
    try {
      const loggedInUser = await loginWithEmailOrUsername(targetIdentifier, password);
      if (loginUser && loggedInUser) {
        await loginUser(loggedInUser);
      }
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.warn("Login attempt notice:", err?.message || err);
      let msg = err.message || 'بيانات الدخول غير صحيحة. يرجى التحقق من اسم المستخدم وكلمة المرور.';
      if (msg.includes('معطل') || msg.includes('تعطيل') || msg.includes('حذف')) {
        // Keep the exact explanatory message
      } else if (
        err.code === 'auth/invalid-credential' || 
        err.code === 'auth/user-not-found' || 
        err.code === 'auth/wrong-password' ||
        msg.includes('auth/invalid-credential') ||
        msg.includes('api-key-not-valid') ||
        msg.includes('auth/')
      ) {
        msg = 'اسم المستخدم أو كلمة المرور غير صحيحة. يرجى التأكد من البيانات أو مراجعة المدير.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'تم حظر المحاولات مؤقتاً بسبب تكرار المحاولات الخاطئة. يرجى الانتظار دقيقة واحدة.';
      } else if (err.code === 'auth/network-request-failed') {
        msg = 'تعذر الاتصال بالسيرفر. يرجى التأكد من اتصالك بالإنترنت.';
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex flex-col justify-center items-center p-4 selection:bg-emerald-600 selection:text-white" dir="rtl">
      
      <div className="w-full max-w-md my-auto space-y-4">
        
        {/* Brand & Cloud Status Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-xl shadow-emerald-900/40 mb-1 font-black text-2xl">
            ن
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">
            نظام إدارة المبيعات والمخزن
          </h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <Cloud className="w-3.5 h-3.5" />
            <span>نظام سحابي متاح للجميع مع مزامنة فورية</span>
          </div>
        </div>

        {/* Main Login Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xl p-6 sm:p-7 space-y-5">
          
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-extrabold text-slate-900">تسجيل الدخول للنظام</h2>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              وصول مباشر
            </span>
          </div>

          {/* Feedback messages */}
          {logoutNotice && (
            <div className="p-3.5 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-900 text-xs font-bold flex items-start gap-2.5 shadow-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                {logoutNotice}
              </div>
              <button
                type="button"
                onClick={() => setLogoutNotice(null)}
                className="text-amber-500 hover:text-amber-800 text-xs px-1 cursor-pointer"
                title="إغلاق التنبيه"
              >
                ✕
              </button>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Login Form: Supports Username, Phone, Store Name, or Email */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Input 1: Identifier */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                اسم المستخدم / البريد الإلكتروني / رقم الهاتف
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="أدخل اسم المستخدم أو البريد"
                  required
                  autoFocus
                  className="w-full pl-3 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                />
              </div>
            </div>

            {/* Input 2: Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-left font-mono"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Login Action Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري تسجيل الدخول والتحقق...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>تسجيل الدخول</span>
                </>
              )}
            </button>
          </form>

        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400">
          نظام المبيعات والمخزن السحابي · متاح لجميع الأجهزة والمنصات
        </div>

      </div>

    </div>
  );
};

export default AuthView;
