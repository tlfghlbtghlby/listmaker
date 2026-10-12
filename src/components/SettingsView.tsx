import React, { useState, useRef, Suspense } from 'react';
import { useApp } from '../context/AppContext';
import { ADMIN_EMAIL } from '../types';
import { changeAccountPassword } from '../firebase';
import { 
  Settings, 
  Store, 
  FileText, 
  Download, 
  Upload, 
  Check, 
  AlertTriangle,
  Cloud,
  LogOut,
  Trash2,
  RefreshCw,
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Percent,
  Sliders,
  Sparkles,
  Zap
} from 'lucide-react';
import { QuickAddItemsSection } from './QuickAddItemsSection';

// Dynamic lazy import to completely exclude AdminPanel code chunk for regular clients
const AdminPanel = React.lazy(() => import('./AdminPanel'));

const COMMON_CURRENCIES = [
  { code: 'د.ع', name: 'دينار عراقي (IQD)' },
  { code: '$', name: 'دولار أمريكي (USD)' },
  { code: 'ر.س', name: 'ريال سعودي (SAR)' },
  { code: 'ج.م', name: 'جنيه مصري (EGP)' },
  { code: 'د.إ', name: 'درهم إماراتي (AED)' },
  { code: 'د.ك', name: 'دينار كويتي (KWD)' },
  { code: 'د.أ', name: 'دينار أردني (JOD)' },
];

interface SettingsViewProps {
  initialTab?: 'store' | 'quick-add' | 'pricing' | 'security' | 'all';
}

export const SettingsView: React.FC<SettingsViewProps> = ({ initialTab = 'store' }) => {
  const { 
    settings, 
    updateSettings, 
    exportDataJSON, 
    importDataJSON, 
    resetToZero,
    currentUser,
    logout,
    products,
    applyBulkPriceAdjustment
  } = useApp();

  const [storeName, setStoreName] = useState(settings.storeName);
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [currency, setCurrency] = useState(settings.currency);
  const [invoiceFooterNote, setInvoiceFooterNote] = useState(settings.invoiceFooterNote);
  const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>(settings.printFormat);
  const [enableWholesale, setEnableWholesale] = useState<boolean>(settings.enableWholesale ?? true);
  const [desktopLayout, setDesktopLayout] = useState<'full' | 'partial'>(settings.desktopLayout || 'full');

  // تخصيص وترويسة القائمة والمصطلحات (جملة/تجزئة، مفرد/قطع، عنوان التجارة)
  const [headerRightSealText, setHeaderRightSealText] = useState(settings.headerRightSealText ?? (settings.enableWholesale ? 'جملة' : 'تجزئة'));
  const [headerLeftSealText, setHeaderLeftSealText] = useState(settings.headerLeftSealText ?? 'مفرد');
  const [businessSubtitle, setBusinessSubtitle] = useState(settings.businessSubtitle ?? 'تجارة عامة وبيع الجملة والمفرد');
  const [managerLabel, setManagerLabel] = useState(settings.managerLabel ?? 'بإدارة');

  // حالة ميزة تصعيد / تخفيض أسعار المواد بالجملة
  const [bulkPercent, setBulkPercent] = useState<number>(15);
  const [customPercentInput, setCustomPercentInput] = useState<string>('15');
  const [priceDirection, setPriceDirection] = useState<'increase' | 'decrease'>('increase');
  const [targetRetail, setTargetRetail] = useState(true);
  const [targetWholesale, setTargetWholesale] = useState(true);
  const [targetCost, setTargetCost] = useState(false);
  const [roundToHundreds, setRoundToHundreds] = useState(true);
  const [isApplyingBulkPrices, setIsApplyingBulkPrices] = useState(false);
  const [bulkPriceSuccess, setBulkPriceSuccess] = useState<string | null>(null);

  // تبويب الإعدادات النشط
  const [activeSettingsTab, setActiveSettingsTab] = useState<'store' | 'quick-add' | 'pricing' | 'security' | 'all'>(initialTab);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      storeName: storeName.trim(),
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      currency: currency.trim() || 'د.ع',
      invoiceFooterNote: invoiceFooterNote.trim(),
      printFormat,
      enableWholesale,
      desktopLayout,
      headerRightSealText: headerRightSealText.trim() || (enableWholesale ? 'جملة' : 'تجزئة'),
      headerLeftSealText: headerLeftSealText.trim() || 'مفرد',
      businessSubtitle: businessSubtitle.trim() || 'تجارة عامة وبيع الجملة والمفرد',
      managerLabel: managerLabel.trim() || 'بإدارة',
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleApplyBulkPrices = async () => {
    const rawNum = parseFloat(customPercentInput);
    if (isNaN(rawNum) || rawNum <= 0) {
      alert('يرجى تحديد نسبة مئوية صحيحة أكبر من صفر (مثال: 15 أو 20)');
      return;
    }

    if (!targetRetail && !targetWholesale && !targetCost) {
      alert('يرجى اختيار نوع سعر واحد على الأقل للتطبيق (المفرد، الجملة، أو التكلفة)');
      return;
    }

    const actualPercent = priceDirection === 'increase' ? rawNum : -rawNum;
    const directionWord = priceDirection === 'increase' ? 'تصعيد ورفع' : 'تخفيض';

    const confirmed = confirm(
      `هل أنت متأكد من ${directionWord} أسعار المواد بنسبة ${rawNum}% لكافة مواد المخزن (${products.length} مادة)؟\n` +
      `سيتم تحديث الأسعار سحابياً ومحلياً فوراً.`
    );

    if (!confirmed) return;

    setIsApplyingBulkPrices(true);
    try {
      const res = await applyBulkPriceAdjustment(
        actualPercent,
        {
          retail: targetRetail,
          wholesale: targetWholesale,
          cost: targetCost,
        },
        roundToHundreds
      );

      setBulkPriceSuccess(
        `تم بنجاح ${directionWord} أسعار ${res.updatedCount} مادة بنسبة ${rawNum}%!`
      );
      setTimeout(() => setBulkPriceSuccess(null), 5000);
    } catch (err: any) {
      console.error('Error applying bulk prices:', err);
      alert('حدث خطأ أثناء تحديث الأسعار: ' + (err.message || err));
    } finally {
      setIsApplyingBulkPrices(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (!oldPassword.trim()) {
      setPasswordFeedback({ type: 'error', message: 'يرجى إدخال كلمة المرور القديمة' });
      return;
    }
    if (!newPassword.trim()) {
      setPasswordFeedback({ type: 'error', message: 'يرجى إدخال كلمة المرور الجديدة' });
      return;
    }
    if (newPassword.trim().length < 6) {
      setPasswordFeedback({ type: 'error', message: 'يجب ألا تقل كلمة المرور الجديدة عن 6 خانات' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'كلمة المرور الجديدة غير متطابقة مع التأكيد' });
      return;
    }
    if (!currentUser) {
      setPasswordFeedback({ type: 'error', message: 'يجب تسجيل الدخول لتغيير كلمة المرور' });
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await changeAccountPassword(currentUser.uid, oldPassword.trim(), newPassword.trim());
      if (res.success) {
        setPasswordFeedback({ type: 'success', message: res.message || 'تم حفظ وتحديث كلمة المرور الجديدة بنجاح!' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordFeedback(null), 5000);
      } else {
        setPasswordFeedback({ type: 'error', message: res.error || 'فشل تحديث كلمة المرور' });
      }
    } catch (err: any) {
      setPasswordFeedback({ type: 'error', message: err.message || 'حدث خطأ أثناء تغيير كلمة المرور' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDownloadBackup = () => {
    const jsonStr = exportDataJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `نسخة_احتياطية_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = importDataJSON(content);
      if (res.success) {
        setImportError(null);
        setImportStatus('تمت استعادة البيانات بنجاح!');
        setTimeout(() => setImportStatus(null), 3000);
      } else {
        setImportStatus(null);
        setImportError(res.error || 'فشلت استعادة البيانات من الملف');
        setTimeout(() => setImportError(null), 5000);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* Admin Panel: Loaded conditionally via React.lazy so clients NEVER download or bundle admin code */}
      {isAdmin && (
        <Suspense fallback={
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 text-center text-emerald-400 font-bold flex items-center justify-center gap-2 shadow-lg">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>جاري تحميل لوحة تحكم الإدارة العليا بأمان...</span>
          </div>
        }>
          <AdminPanel />
        </Suspense>
      )}

      {/* Cloud Account & Database Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white rounded-xl border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">الربط السحابي والمزامنة</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                  متصل وقيد المزامنة
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {currentUser ? (
                  <>
                    الحساب: <strong className="text-white">{currentUser.displayName || currentUser.email}</strong> · مزامنة كاملة لجميع الأجهزة
                  </>
                ) : (
                  'أنت تعمل حالياً في وضع الضيف المحلي دون تسجيل حساب'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {currentUser && (
              <button
                type="button"
                onClick={logout}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="تسجيل الخروج من الحساب الحالي"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span>تسجيل الخروج</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/80 rounded-2xl overflow-x-auto border border-slate-300/60 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveSettingsTab('store')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSettingsTab === 'store'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <Store className="w-4 h-4 text-slate-700" />
          <span>بيانات المحل والقوائم</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab('quick-add')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSettingsTab === 'quick-add'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'text-amber-800 bg-amber-100/70 hover:bg-amber-200/80 border border-amber-300/70'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500" />
          <span>إضافة مواد سريعة</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 font-extrabold">
            جديد
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab('pricing')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSettingsTab === 'pricing'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>تصعيد وتخفيض الأسعار</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab('security')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSettingsTab === 'security'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <KeyRound className="w-4 h-4 text-slate-700" />
          <span>الأمان والنسخ الاحتياطي</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSettingsTab('all')}
          className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 whitespace-nowrap cursor-pointer mr-auto ${
            activeSettingsTab === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
          }`}
        >
          <span>عرض الكل</span>
        </button>
      </div>

      {/* Store Settings Form */}
      {(activeSettingsTab === 'store' || activeSettingsTab === 'all') && (
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">بيانات المحل والقوائم</h2>
              <p className="text-xs text-slate-400">تظهر هذه المعلومات في ترويسة وتذييل الفواتير المطبوعة</p>
            </div>
          </div>

          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              تم حفظ التعديلات بنجاح!
            </span>
          )}
        </div>

        <form onSubmit={handleSaveSettings} className="p-6 space-y-4">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم المحل أو المعرض / الشركة <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم صاحب المحل / الإدارة
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم الهاتف (يظهر في القوائم)
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                العنوان والموقع التجاري
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                العملة المعتمدة
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="د.ع"
                  className="w-24 px-3 py-2 text-sm border border-slate-300 rounded-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex-1 text-xs bg-slate-100 border border-slate-300 rounded-lg px-2 text-slate-700"
                >
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                نمط الطباعة الافتراضي للقوائم
              </label>
              <select
                value={printFormat}
                onChange={(e) => setPrintFormat(e.target.value as 'a4' | 'thermal')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="a4">فاتورة قياس A4 رسمية كاملة</option>
                <option value="thermal">وصل كاشير حراري قياس 80mm</option>
              </select>
            </div>
          </div>

          {/* Wholesale Mode Toggle */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <label className="text-xs font-bold text-slate-800 block">
                  نظام البيع بالجملة وأسعار الجملة
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  حدد ما إذا كان المحل يبيع بالجملة والمفرد، أو يبيع بالمفرد فقط لإخفاء خيارات الجملة
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Option 1: Enabled (Wholesale + Retail) */}
              <div
                onClick={() => setEnableWholesale(true)}
                className={`p-3 rounded-lg border cursor-pointer transition select-none flex items-start gap-2.5 ${
                  enableWholesale
                    ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-slate-100/70 border-slate-200 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="wholesaleMode"
                  checked={enableWholesale}
                  onChange={() => setEnableWholesale(true)}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    محل يبيع جملة ومفرد (تفعيل الجملة)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    إظهار أسعار الجملة، وأزرار البيع بالجملة السريعة في نقطة البيع والقوائم.
                  </div>
                </div>
              </div>

              {/* Option 2: Disabled (Retail Only) */}
              <div
                onClick={() => setEnableWholesale(false)}
                className={`p-3 rounded-lg border cursor-pointer transition select-none flex items-start gap-2.5 ${
                  !enableWholesale
                    ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-slate-100/70 border-slate-200 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="wholesaleMode"
                  checked={!enableWholesale}
                  onChange={() => setEnableWholesale(false)}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    محل مفرد وتجزئة فقط (إلغاء بيع الجملة)
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    إخفاء أسعار وأزرار البيع بالجملة من شاشة البيع، والاعتماد على سعر المفرد فقط.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Layout Mode: Full Computer Mode vs Partial Computer Mode */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-800 block">
                نظام عرض شاشة الكمبيوتر (وضع الحاسبة)
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                اختر طريقة عرض المواد والقوائم على شاشة الكمبيوتر والحاسبة
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Option 1: Full Computer Mode (الأساسي والافتراضي) */}
              <div
                onClick={() => setDesktopLayout('full')}
                className={`p-3 rounded-lg border cursor-pointer transition select-none flex items-start gap-2.5 ${
                  desktopLayout === 'full'
                    ? 'bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-slate-100/70 border-slate-200 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="desktopLayoutMode"
                  checked={desktopLayout === 'full'}
                  onChange={() => setDesktopLayout('full')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>وضع الكمبيوتر الكامل</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-semibold">
                      الأساسي والافتراضي
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    شاشة مستطيلة عريضة وجانبية: تظهر المواد وبجانبها القائمة مباشرة دون الحاجة للاختيار من الخيارات العلوية.
                  </div>
                </div>
              </div>

              {/* Option 2: Partial Computer Mode (الوضع السابق بالتبويبات) */}
              <div
                onClick={() => setDesktopLayout('partial')}
                className={`p-3 rounded-lg border cursor-pointer transition select-none flex items-start gap-2.5 ${
                  desktopLayout === 'partial'
                    ? 'bg-white border-slate-700 ring-2 ring-slate-400/20 shadow-xs'
                    : 'bg-slate-100/70 border-slate-200 hover:bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="desktopLayoutMode"
                  checked={desktopLayout === 'partial'}
                  onChange={() => setDesktopLayout('partial')}
                  className="mt-0.5 text-slate-700 focus:ring-slate-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    وضع الكمبيوتر الجزئي
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    شاشة التبويبات العلوية المنفصلة: تقسيم البرنامج إلى صفحات مستقلة للمبيعات والمخزون والفواتير والتقارير.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* تخصيص مظهر ونصوص ترويسة القائمة وختمها */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  تخصيص عبارات ومظهر القائمة المطبوعة (الختم، التجارة، الإدارة)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تحكم بجميع الكلمات والنصوص التي تظهر في أعلى القائمة (مثلاً تغيير تجزئة إلى جملة، أو مفرد إلى قطع)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* ختم اليمين (مثال: جملة / تجزئة) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نص الختم الأيمن (الافتراضي: جملة أو تجزئة)
                </label>
                <input
                  type="text"
                  value={headerRightSealText}
                  onChange={(e) => setHeaderRightSealText(e.target.value)}
                  placeholder="جملة"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  يمكن كتابة: تجزئة، جملة، مورد، معتمد، أو أي كلمة تريدها داخل النجمة اليمنى
                </span>
              </div>

              {/* ختم اليسار (مثال: مفرد / قطع) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نص الختم الأيسر (الافتراضي: مفرد أو قطع)
                </label>
                <input
                  type="text"
                  value={headerLeftSealText}
                  onChange={(e) => setHeaderLeftSealText(e.target.value)}
                  placeholder="مفرد"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  يمكن كتابة: مفرد، قطع، نقداً، فوري، أو أي كلمة تريدها داخل النجمة اليسرى
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* كلمة بإدارة أو إشراف */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  بادئة اسم المدير / الإشراف
                </label>
                <input
                  type="text"
                  value={managerLabel}
                  onChange={(e) => setManagerLabel(e.target.value)}
                  placeholder="بإدارة"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  مثال: بإدارة، بإشراف، المدير العام، مسؤول المبيعات
                </span>
              </div>

              {/* نوع التجارة أو النشاط */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نوع التجارة والنشاط (يظهر بجانب اسم الإدارة)
                </label>
                <input
                  type="text"
                  value={businessSubtitle}
                  onChange={(e) => setBusinessSubtitle(e.target.value)}
                  placeholder="تجارة عامة وبيع الجملة والمفرد"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  اكتب نشاط محلك: لتجارة المواد الإنشائية والكهربائية، أدوات منزلية، تجهيزات غذائية، إلخ.
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظة أسفل القوائم (شروط الاستبدال، الختم)
            </label>
            <textarea
              rows={2}
              value={invoiceFooterNote}
              onChange={(e) => setInvoiceFooterNote(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition"
            >
              حفظ إعدادات المحل والقوائم
            </button>
          </div>

        </form>

      </div>
      )}

      {/* Quick Add Items Section (إضافة مواد سريعة) */}
      {(activeSettingsTab === 'quick-add' || activeSettingsTab === 'all') && (
        <QuickAddItemsSection />
      )}

      {/* ميزة تصعيد وتعديل أسعار المواد (Bulk Price Adjustment) */}
      {(activeSettingsTab === 'pricing' || activeSettingsTab === 'all') && (
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                تصعيد أو تخفيض أسعار المواد في المخزن
              </h2>
              <p className="text-xs text-slate-400">
                رفع أو خفض الأسعار بنسبة مئوية (مثلاً 15% أو 20% أو أي نسبة يحددها صاحب المحل) عند تغير السوق
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
            {products.length} مادة بالمخزن
          </span>
        </div>

        <div className="p-6 space-y-5">
          {bulkPriceSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2 shadow-2xs animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{bulkPriceSuccess}</span>
            </div>
          )}

          {/* الاتجاه: رفع/تصعيد أم خفض */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              نوع العملية المطلوبة:
            </label>
            <div className="grid grid-cols-2 gap-3 max-w-md">
              <button
                type="button"
                onClick={() => setPriceDirection('increase')}
                className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                  priceDirection === 'increase'
                    ? 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-rose-600" />
                <span>تصعيد ورفع الأسعار (زيادة)</span>
              </button>

              <button
                type="button"
                onClick={() => setPriceDirection('decrease')}
                className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer ${
                  priceDirection === 'decrease'
                    ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                <TrendingDown className="w-4 h-4 text-blue-600" />
                <span>تخفيض الأسعار (نزول السوق)</span>
              </button>
            </div>
          </div>

          {/* اختيار النسبة المئوية */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              النسبة المئوية المراد تطبيقها:
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {[5, 10, 15, 20, 25, 30].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setBulkPercent(pct);
                    setCustomPercentInput(String(pct));
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                    customPercentInput === String(pct)
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {pct}%
                </button>
              ))}

              <div className="flex items-center gap-1.5 mr-2">
                <span className="text-xs text-slate-500 font-bold">أو نسبة مخصصة:</span>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    max="500"
                    step="0.5"
                    value={customPercentInput}
                    onChange={(e) => {
                      setCustomPercentInput(e.target.value);
                      const parsed = parseFloat(e.target.value);
                      if (!isNaN(parsed)) setBulkPercent(parsed);
                    }}
                    placeholder="20"
                    className="w-20 pl-7 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg text-center font-black focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <Percent className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>
          </div>

          {/* تحديد الأسعار المستهدفة بالتعديل */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <label className="block text-xs font-bold text-slate-800 mb-2">
              الأسعار التي سيتم تعديلها:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-emerald-400">
                <input
                  type="checkbox"
                  checked={targetRetail}
                  onChange={(e) => setTargetRetail(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-slate-800">سعر البيع المفرد (التجزئة)</span>
              </label>

              {settings.enableWholesale && (
                <label className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-emerald-400">
                  <input
                    type="checkbox"
                    checked={targetWholesale}
                    onChange={(e) => setTargetWholesale(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs font-bold text-slate-800">سعر بيع الجملة</span>
                </label>
              )}

              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-emerald-400">
                <input
                  type="checkbox"
                  checked={targetCost}
                  onChange={(e) => setTargetCost(e.target.checked)}
                  className="rounded text-slate-600 focus:ring-slate-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">سعر التكلفة والشراء</span>
                  <span className="text-[10px] text-slate-400">في حال ارتفعت تكلفة الاستيراد</span>
                </div>
              </label>
            </div>

            {/* خيار التقريب التجاري الأنيق */}
            <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={roundToHundreds}
                  onChange={(e) => setRoundToHundreds(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs text-slate-700 font-semibold">
                  تقريب الأسعار تجارياً لأقرب 250 دينار (تجنب الكسور المعقدة في الصرف)
                </span>
              </label>
            </div>
          </div>

          {/* زر تطبيق تصعيد / تخفيض الأسعار */}
          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-slate-500">
              {priceDirection === 'increase' ? 'الزيادة المقررة:' : 'الخصم المقرر:'}
              <strong className="text-slate-900 mx-1">
                {priceDirection === 'increase' ? '+' : '-'}{customPercentInput || '0'}%
              </strong>
              على {targetRetail && 'المفرد '}{targetWholesale && 'الجملة '}{targetCost && 'التكلفة'}
            </div>

            <button
              type="button"
              disabled={isApplyingBulkPrices || products.length === 0}
              onClick={handleApplyBulkPrices}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition flex items-center gap-2 shadow-xs cursor-pointer ${
                isApplyingBulkPrices
                  ? 'bg-slate-500 cursor-wait'
                  : priceDirection === 'increase'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isApplyingBulkPrices ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري تحديث أسعار المخزن...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    تطبيق {priceDirection === 'increase' ? 'تصعيد الأسعار' : 'تخفيض الأسعار'} الآن ({customPercentInput}%)
                  </span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
      )}

      {/* Password Change & Backup Sections */}
      {(activeSettingsTab === 'security' || activeSettingsTab === 'all') && (
        <>
          {/* Password Change Section (تغيير كلمة المرور) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center shadow-2xs">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">تغيير كلمة المرور / رمز الحساب</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                أدخل كلمة المرور القديمة الحالية، ثم أدخل كلمة المرور الجديدة لحفظها فوراً
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
            {currentUser?.displayName || currentUser?.email || 'حساب نشط'}
          </span>
        </div>

        {passwordFeedback && (
          <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border shadow-2xs ${
            passwordFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : 'bg-rose-50 text-rose-800 border-rose-300'
          }`}>
            {passwordFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{passwordFeedback.message}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
          {/* Old Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              كلمة المرور القديمة (الحالية) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showOldPassword ? 'text' : 'password'}
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="أدخل كلمة المرور القديمة..."
                className="w-full pl-10 pr-3 py-2.5 text-xs font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-slate-50/50"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showOldPassword ? 'إخفاء' : 'إظهار'}
              >
                {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                كلمة المرور الجديدة <span className="text-emerald-600">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="6 خانات أو أكثر..."
                  className="w-full pl-10 pr-3 py-2.5 text-xs font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showNewPassword ? 'إخفاء' : 'إظهار'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                تأكيد كلمة المرور الجديدة <span className="text-emerald-600">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد كتابة الجديدة..."
                  className="w-full pl-10 pr-3 py-2.5 text-xs font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showConfirmPassword ? 'إخفاء' : 'إظهار'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isChangingPassword}
              className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                isChangingPassword
                  ? 'bg-amber-700 opacity-80 cursor-wait'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isChangingPassword ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري الحفظ والتحقق...</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>حفظ كلمة المرور الجديدة</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Backup & Data Management */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div>
          <h3 className="font-bold text-base text-slate-900">النسخ الاحتياطي وإدارة البيانات</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            احفظ نسخة احتياطية من المواد والمبيعات والزبائن على جهازك للرجوع إليها بأي وقت
          </p>
        </div>

        {importStatus && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-800 flex items-center gap-1.5 shadow-2xs">
            <Check className="w-4 h-4" />
            <span>{importStatus}</span>
          </div>
        )}

        {importError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold text-rose-800 flex items-center gap-1.5 shadow-2xs">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{importError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          
          {/* Export JSON */}
          <button
            onClick={handleDownloadBackup}
            className="p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-slate-50 text-right flex flex-col justify-between transition group"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-2 group-hover:bg-emerald-600 group-hover:text-white transition">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900">تحميل نسخة احتياطية</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                تنزيل ملف JSON يحفظ كافة البيانات
              </div>
            </div>
          </button>

          {/* Import JSON */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-slate-50 text-right flex flex-col justify-between transition group cursor-pointer"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".json"
              className="hidden"
            />
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center mb-2 group-hover:bg-blue-600 group-hover:text-white transition">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900">استعادة من ملف</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                رفع ملف نسخة احتياطية سابقة
              </div>
            </div>
          </div>

        </div>
      </div>
        </>
      )}

    </div>
  );
};
