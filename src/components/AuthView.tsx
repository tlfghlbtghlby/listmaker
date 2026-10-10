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
  onSuccess: () => void;
  onContinueAsGuest?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSuccess, onContinueAsGuest }) => {
  const { loginUser } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const targetIdentifier = identifier.trim();
    if (!targetIdentifier) {
      setErrorMessage('يرجى إدخال اسم المستخدم أو رقم الهاتف أو اسم المحل');
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
      setSuccessMessage('تم تسجيل الدخول بنجاح! جاري تحميل بياناتك ومزامنتها...');
      setTimeout(() => {
        onSuccess();
      }, 300);
    } catch (err: any) {
      console.warn("Login attempt notice:", err?.message || err);
      let msg = err.message || 'بيانات الدخول غير صحيحة. يرجى التحقق من اسم المستخدم وكلمة المرور.';
      if (
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
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Login Form: Supports Username, Phone, Store Name, or Email */}
          <form onSubmit={handleLogin} className="space-y-4">
            
            {/* Input 1: Identifier */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                اسم المستخدم / رقم الهاتف / اسم المحل
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="مثال: muntazar أو 07740193906 أو انشائية المسعودي"
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
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer mt-1"
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

            {/* Quick Demo Credentials */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-1.5 text-xs border-t border-slate-100">
              <span className="text-slate-400 text-[11px] font-medium">حسابات تجربة سريعة:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier('admin');
                    setPassword('admin');
                    setErrorMessage(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] transition cursor-pointer"
                >
                  المدير (admin)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier('muntazar');
                    setPassword('19981998');
                    setErrorMessage(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-bold text-[11px] transition cursor-pointer"
                >
                  العميل (muntazar)
                </button>
              </div>
            </div>
          </form>

          {/* Guest / Direct Access Option (Make app available to everyone) */}
          {onContinueAsGuest && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-3 text-slate-400 text-[11px] font-bold">أو للجميع بدون تسجيل</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <button
                type="button"
                onClick={onContinueAsGuest}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>الدخول المباشر واستخدام البرنامج (تجربة النظام / كزائر)</span>
              </button>
              <p className="text-[11px] text-center text-slate-400">
                متاح لأي شخص استخدام جميع وظائف البرنامج وقوائم البيع والمخزن مباشرة.
              </p>
            </div>
          )}

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
