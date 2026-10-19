import React, { useState } from 'react';
import { Play, X, Clock, Wallet, FileText, UserCheck, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const StartShiftModal: React.FC = () => {
  const { 
    isStartShiftModalOpen, 
    setIsStartShiftModalOpen, 
    startShift, 
    currentUser, 
    sessionRole,
    settings,
    formatMoney
  } = useApp();

  const [startingCash, setStartingCash] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isStartShiftModalOpen) return null;

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const cash = parseFloat(startingCash) || 0;
      await startShift(cash, notes);
      setIsStartShiftModalOpen(false);
      setStartingCash('0');
      setNotes('');
    } catch (err) {
      console.error('فشل في بدء الشفت:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cashierRoleLabel = 
    sessionRole === 'admin' ? 'المدير العام (أدمن)' : 
    sessionRole === 'supervisor' ? 'المشرف المعتمد' : 
    'الموظف (الكاشير)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden text-right"
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-xs text-white">
              <Play className="w-5 h-5 fill-current text-indigo-200" />
            </div>
            <div>
              <h3 className="text-base font-extrabold">بدء شفت عمل جديد</h3>
              <p className="text-xs text-indigo-200">تشغيل المؤقت وبدء رصد القوائم والمواد المباعة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsStartShiftModalOpen(false)}
            className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleStart} className="p-5 space-y-4">
          {/* Cashier / Session Info */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-700">المسؤول عن فتح الشفت:</span>
            </div>
            <div className="text-left">
              <span className="text-xs font-extrabold text-indigo-950 block">
                {currentUser?.displayName || currentUser?.storeName || 'المستخدم الحالي'}
              </span>
              <span className="text-[10px] text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-full font-bold">
                {cashierRoleLabel}
              </span>
            </div>
          </div>

          {/* Starting Drawer Cash (اختياري) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <span>النقد الافتتاحي في القاصة / الصرافة الأولية:</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                placeholder="0"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              />
              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">
                {settings.currency}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              المبلغ النقدي الموجود في الدرج قبل بدء البيع لاسترجاع الباقي للزبائن.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-500" />
              <span>ملاحظات بداية الشفت (اختياري):</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثلاً: وردية الصباح، كاشير 1..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition resize-none"
            />
          </div>

          {/* Feature highlights */}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-[11px] text-slate-600 space-y-1.5">
            <div className="flex items-center gap-2 text-indigo-700 font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ماذا يحدث عند بدء الشفت؟</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500 pr-1">
              <li>سيبدأ مؤقت الوقت في شريط الأدوات بجانب وضع الحاسبة.</li>
              <li>سيتم احتساب جميع الفواتير والمواد المباعة ونقد البيع والأرباح تلقائياً.</li>
              <li>عند انتهاء الوردية، اضغط نفس الزر لإنهاء الشفت وحفظه في تبويب الشفتات.</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-indigo-600/20 active:scale-98 disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isSubmitting ? 'جاري بدء الشفت...' : 'تأكيد وبدء الشفت الآن'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsStartShiftModalOpen(false)}
              className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
