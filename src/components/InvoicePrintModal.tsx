import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Invoice } from '../types';
import { 
  X, 
  Printer, 
  Share2, 
  Check, 
  FileText, 
  Receipt
} from 'lucide-react';

interface InvoicePrintModalProps {
  invoice: Invoice | null;
  onClose: () => void;
}

// 20-point starburst commercial seal matching the photo
const StarburstSeal: React.FC<{ text: string }> = ({ text }) => (
  <div className="relative flex items-center justify-center w-16 h-16 select-none shrink-0">
    <svg viewBox="0 0 100 100" className="w-full h-full fill-none stroke-black stroke-[2]">
      <polygon points="50,2 62,18 82,10 83,31 99,38 89,55 99,71 83,78 82,98 62,91 50,106 38,91 18,98 17,78 1,71 11,55 1,38 17,31 18,10 38,18" />
    </svg>
    <span className="absolute font-black text-sm text-black tracking-wider">{text}</span>
  </div>
);

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({ invoice, onClose }) => {
  const { settings, formatMoney } = useApp();
  const [printLayout, setPrintLayout] = useState<'a4' | 'thermal'>(settings.printFormat || 'a4');
  const [copied, setCopied] = useState(false);

  if (!invoice) return null;

  const dateObj = new Date(invoice.date);
  
  // Day name in Arabic
  const arabicDays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayName = arabicDays[dateObj.getDay()];

  // Formatted date string YYYY/MM/DD
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const dateFormatted = `${year}/${month}/${day}`;

  // Formatted time string YYYY/MM/DD HH:mm:ss
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');
  const fullDateTime = `${dateFormatted} ${hours}:${minutes}:${seconds}`;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    let text = `📋 *${settings.storeName}*\n`;
    text += `رقم القائمة: ${invoice.invoiceNumber}\n`;
    text += `التاريخ: ${dayName} ${dateFormatted}\n`;
    text += `حضرة السيد: ${invoice.customerName}\n`;
    text += `---------------------------------\n`;
    invoice.items.forEach((item, index) => {
      text += `${index + 1}. ${item.productName} - عدد (${item.quantity} ${item.unit}) × ${item.unitPrice.toLocaleString()} = ${item.total.toLocaleString()} ${settings.currency}\n`;
    });
    text += `---------------------------------\n`;
    text += `مبلغ القائمة: ${invoice.total.toLocaleString()} ${settings.currency}\n`;
    if (invoice.previousDebt > 0) {
      text += `الديون السابقة: ${invoice.previousDebt.toLocaleString()} ${settings.currency}\n`;
      text += `المجموع: ${(invoice.total + invoice.previousDebt).toLocaleString()} ${settings.currency}\n`;
    }
    text += `التسديد: ${invoice.paidAmount.toLocaleString()} ${settings.currency}\n`;
    text += `مجموع الديون: ${(invoice.total + invoice.previousDebt - invoice.paidAmount).toLocaleString()} ${settings.currency}\n`;
    text += `\n${settings.address} - ${settings.phone}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculations for summary table identical to the photo
  const invoiceTotal = invoice.total;
  const previousDebt = invoice.previousDebt || 0;
  const grandTotal = invoiceTotal + previousDebt;
  const paid = invoice.paidAmount;
  const totalRemainingDebt = Math.max(0, grandTotal - paid);

  // Currency label
  const currencyLabel = settings.currency || 'دينار';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[94vh] flex flex-col overflow-hidden">
        
        {/* Top Controls Bar (Hidden in Print) */}
        <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">شكل القائمة:</span>
            <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-bold">
              <button
                onClick={() => setPrintLayout('a4')}
                className={`flex items-center gap-1 px-3 py-1 rounded-md transition ${
                  printLayout === 'a4'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>قائمة A4 (كما في الصورة)</span>
              </button>
              <button
                onClick={() => setPrintLayout('thermal')}
                className={`flex items-center gap-1 px-3 py-1 rounded-md transition ${
                  printLayout === 'thermal'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>وصل كاشير 80mm</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyText}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 flex items-center gap-1 transition"
              title="نسخ ملخص القائمة للواتساب"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copied ? 'تم النسخ!' : 'واتساب'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة القائمة</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Viewer and Printable Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/70 flex justify-center">
          
          <div
            id="printable-invoice"
            className={`bg-white shadow-lg text-black mx-auto ${
              printLayout === 'a4'
                ? 'w-full max-w-[800px] p-6 sm:p-8 rounded-lg border border-slate-400 font-sans'
                : 'w-[320px] p-4 rounded-lg border border-slate-400 font-mono text-xs'
            }`}
          >

            {/* A4 Invoice matching photo IMG_20260921_024649_677.jpg */}
            {printLayout === 'a4' ? (
              <div className="space-y-3 text-black leading-tight">
                
                {/* 1. Header Box with Corner Seals */}
                <div className="border border-black rounded-md p-3 relative flex flex-col items-center justify-center text-center">
                  
                  {/* Right Seal: جملة if enabled, or تجزئة if retail-only */}
                  <div className="absolute right-3 top-2">
                    <StarburstSeal text={settings.enableWholesale ? "جملة" : "تجزئة"} />
                  </div>

                  {/* Left Seal: مفرد */}
                  <div className="absolute left-3 top-2">
                    <StarburstSeal text="مفرد" />
                  </div>

                  {/* Center Store Title */}
                  <h1 className="text-2xl sm:text-3xl font-black tracking-wide text-black">
                    {settings.storeName || 'مخزن الغاضرية'}
                  </h1>

                  <div className="text-sm font-bold text-black mt-1">
                    {settings.enableWholesale 
                      ? 'تجارة عامة و تجارة المواد الغذائية بالجملة والمفرد' 
                      : 'تجارة عامة و تجارة المفرد والتجزئة'}
                  </div>

                  {/* Address & Phone line */}
                  <div className="text-xs font-semibold text-black mt-2 pt-1 border-t border-dotted border-black/40 w-full text-center">
                    {settings.address || 'كربلاء المقدسة - شارع شريط المعلمين - مجاور المعارض'}&nbsp;&nbsp;&nbsp;&nbsp;
                    {settings.ownerName ? `${settings.ownerName} ` : ''}
                    {settings.phone || '0781 016 8612  0773 924 9241'}
                  </div>

                </div>

                {/* 2. Metadata Bar */}
                <div className="flex items-center justify-between text-xs font-bold text-black px-1 pt-1">
                  <div className="flex items-center gap-2">
                    <span>رقم القائمة:</span>
                    <span className="font-mono text-sm">{invoice.invoiceNumber}</span>
                  </div>

                  <div className="text-sm font-black">
                    {dayName}
                  </div>

                  <div className="flex items-center gap-4">
                    <div>
                      <span>تأريخ القائمة:</span>&nbsp;
                      <span className="font-mono">{dateFormatted}</span>
                    </div>
                    <div className="font-mono text-[11px] text-black/80">
                      {fullDateTime}
                    </div>
                  </div>
                </div>

                {/* 3. Customer Info Boxes (حضرة السيد & العنوان) */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="border border-black rounded-md px-3 py-1.5 flex items-center justify-between">
                    <span className="font-bold text-black">حضرة السيد:</span>
                    <span className="font-bold text-sm text-black">
                      {invoice.customerName || (invoice.type === 'direct' ? 'البيع المباشر' : 'عميل غير مسجل')}
                    </span>
                  </div>

                  <div className="border border-black rounded-md px-3 py-1.5 flex items-center justify-between">
                    <span className="font-bold text-black">العنوان:</span>
                    <span className="font-medium text-black">
                      {invoice.customerPhone ? invoice.customerPhone : settings.address}
                    </span>
                  </div>
                </div>

                {/* 4. Items Table matching exact columns in the photo */}
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse border border-black">
                    <thead>
                      <tr className="border-b border-black font-bold bg-slate-50/50">
                        <th className="border border-black py-1.5 px-2 w-8 text-center">ت</th>
                        <th className="border border-black py-1.5 px-3">التفاصيل</th>
                        <th className="border border-black py-1.5 px-2 w-14 text-center">التجهيز</th>
                        <th colSpan={2} className="border border-black py-1 px-1 text-center">
                          العدد
                          <div className="grid grid-cols-2 border-t border-black mt-1 font-semibold text-[11px]">
                            <span className="border-l border-black">كارتون</span>
                            <span>قطعة</span>
                          </div>
                        </th>
                        <th className="border border-black py-1.5 px-2 w-20 text-center">السعر</th>
                        <th className="border border-black py-1.5 px-2 w-16 text-center">العملة</th>
                        <th className="border border-black py-1.5 px-3 w-24 text-center">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item, index) => {
                        const isPiece = item.unit.includes('قطعة');
                        const qtyFormatted = item.quantity.toFixed(2);

                        return (
                          <tr key={index} className="border-b border-black">
                            {/* ت */}
                            <td className="border border-black py-1 px-2 text-center font-mono font-bold">
                              {index + 1}
                            </td>

                            {/* التفاصيل */}
                            <td className="border border-black py-1 px-3 font-bold text-black text-[13px]">
                              {item.productName}
                            </td>

                            {/* التجهيز (Checkmark as in photo) */}
                            <td className="border border-black py-1 px-2 text-center text-slate-700 font-bold">
                              ✓
                            </td>

                            {/* العدد: كارتون */}
                            <td className="border border-black py-1 px-1 text-center font-mono font-bold">
                              {!isPiece ? qtyFormatted : ''}
                            </td>

                            {/* العدد: قطعة */}
                            <td className="border border-black py-1 px-1 text-center font-mono font-bold">
                              {isPiece ? qtyFormatted : ''}
                            </td>

                            {/* السعر */}
                            <td className="border border-black py-1 px-2 text-center font-mono font-bold">
                              {item.unitPrice.toLocaleString()}
                            </td>

                            {/* العملة */}
                            <td className="border border-black py-1 px-2 text-center font-bold text-[11px]">
                              {currencyLabel}
                            </td>

                            {/* المبلغ */}
                            <td className="border border-black py-1 px-3 text-left font-mono font-black text-sm">
                              {item.total.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 5. Bottom Financial Summary Ledger + Notes/Stamp */}
                <div className="grid grid-cols-12 gap-3 pt-2">
                  
                  {/* Left side: Financial Table identical to photo (7 cols) */}
                  <div className="col-span-6">
                    <table className="w-full text-right text-xs border-collapse border border-black">
                      <thead>
                        <tr className="border-b border-black font-bold">
                          <th className="border border-black py-1 px-2"></th>
                          <th className="border border-black py-1 px-2 text-center w-24">دينار</th>
                          <th className="border border-black py-1 px-2 text-center w-20">دولار</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* مبلغ القائمة */}
                        <tr className="border-b border-black font-bold">
                          <td className="border border-black py-1 px-2">مبلغ القائمة</td>
                          <td className="border border-black py-1 px-2 text-center font-mono font-bold">
                            {invoiceTotal.toLocaleString()}
                          </td>
                          <td className="border border-black py-1 px-2 text-center font-mono"></td>
                        </tr>

                        {/* الديون السابقة */}
                        <tr className="border-b border-black font-bold">
                          <td className="border border-black py-1 px-2">الديون السابقة</td>
                          <td className="border border-black py-1 px-2 text-center font-mono font-bold">
                            {previousDebt > 0 ? previousDebt.toLocaleString() : ''}
                          </td>
                          <td className="border border-black py-1 px-2 text-center font-mono"></td>
                        </tr>

                        {/* المجموع */}
                        <tr className="border-b border-black font-black bg-slate-50">
                          <td className="border border-black py-1 px-2">المجموع</td>
                          <td className="border border-black py-1 px-2 text-center font-mono font-black text-sm">
                            {grandTotal.toLocaleString()}
                          </td>
                          <td className="border border-black py-1 px-2 text-center font-mono"></td>
                        </tr>

                        {/* التسديد */}
                        <tr className="border-b border-black font-bold">
                          <td className="border border-black py-1 px-2">التسديد</td>
                          <td className="border border-black py-1 px-2 text-center font-mono font-bold text-emerald-900">
                            {paid > 0 ? paid.toLocaleString() : ''}
                          </td>
                          <td className="border border-black py-1 px-2 text-center font-mono"></td>
                        </tr>

                        {/* مجموع الديون */}
                        <tr className="font-black bg-slate-100/70">
                          <td className="border border-black py-1.5 px-2">مجموع الديون</td>
                          <td className="border border-black py-1.5 px-2 text-center font-mono font-black text-sm text-black">
                            {totalRemainingDebt > 0 ? totalRemainingDebt.toLocaleString() : 'خالص'}
                          </td>
                          <td className="border border-black py-1.5 px-2 text-center font-mono"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Right side: Handwriting / Warehouse Notes / Stamp space (6 cols) */}
                  <div className="col-span-6 border border-black rounded p-2 flex flex-col justify-between text-xs">
                    <div>
                      <div className="font-bold text-black border-b border-dotted border-black/40 pb-1 mb-1.5 flex justify-between">
                        <span>ملاحظات وتوقيع المستلم:</span>
                        <span className="font-normal text-[11px] text-slate-500">ختم المخزن والتجهيز</span>
                      </div>
                      <p className="text-[11px] text-slate-700 min-h-[48px] leading-relaxed">
                        {invoice.notes || ''}
                      </p>
                    </div>

                    <div className="flex justify-between items-end pt-3 border-t border-dotted border-black/40 text-[11px] font-bold">
                      <div>توقيع البائع: ....................</div>
                      <div>توقيع المشتري: ....................</div>
                    </div>
                  </div>

                </div>

                {/* 6. Footer Note identical to photo */}
                <div className="flex items-center justify-between border-t border-black pt-2 text-[11px] font-bold text-black">
                  <span>Page 1</span>
                  <span>
                    {settings.invoiceFooterNote || 'ملاحظة: في حالة حصول خطأ أو سهو في التجهيز يجب إعلامنا في نفس اليوم'}
                  </span>
                </div>

              </div>
            ) : (
              /* Thermal 80mm Receipt Layout */
              <div className="space-y-3 leading-tight text-black font-mono">
                {/* Header */}
                <div className="text-center border-b border-dashed border-black pb-2">
                  <div className="font-black text-sm">{settings.storeName}</div>
                  <div className="text-[10px] text-slate-700 mt-0.5">{settings.address}</div>
                  <div className="text-[10px] text-slate-700">{settings.phone}</div>
                  <div className="font-bold text-xs mt-1">
                    {invoice.type === 'direct' ? '** وصل بيع مباشر **' : '** وصل بيع آجل (دين) **'}
                  </div>
                </div>

                {/* Meta */}
                <div className="text-[11px] space-y-0.5 border-b border-dashed border-black pb-2">
                  <div className="flex justify-between">
                    <span>رقم الوصل:</span>
                    <span className="font-bold">{invoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>التاريخ:</span>
                    <span>{dayName} {dateFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الزبون:</span>
                    <span className="font-bold">{invoice.customerName}</span>
                  </div>
                  {invoice.customerPhone && (
                    <div className="flex justify-between">
                      <span>الهاتف:</span>
                      <span>{invoice.customerPhone}</span>
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="border-b border-dashed border-black pb-2 space-y-1">
                  {invoice.items.map((item, idx) => (
                    <div key={idx} className="flex flex-col">
                      <div className="font-bold">{item.productName}</div>
                      <div className="flex justify-between text-[10px] text-slate-700">
                        <span>{item.quantity} × {item.unitPrice.toLocaleString()} ({item.unit})</span>
                        <span className="font-bold">{item.total.toLocaleString()} {currencyLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals identical to warehouse ledger */}
                <div className="space-y-1 border-b border-dashed border-black pb-2 font-bold text-xs">
                  <div className="flex justify-between">
                    <span>مبلغ القائمة:</span>
                    <span>{invoiceTotal.toLocaleString()} {currencyLabel}</span>
                  </div>
                  {previousDebt > 0 && (
                    <div className="flex justify-between text-slate-700">
                      <span>الديون السابقة:</span>
                      <span>{previousDebt.toLocaleString()} {currencyLabel}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black pt-0.5 border-t border-slate-300">
                    <span>المجموع:</span>
                    <span>{grandTotal.toLocaleString()} {currencyLabel}</span>
                  </div>
                  <div className="flex justify-between text-emerald-900">
                    <span>التسديد:</span>
                    <span>{paid.toLocaleString()} {currencyLabel}</span>
                  </div>
                  <div className="flex justify-between text-black pt-0.5 border-t border-slate-300 font-black">
                    <span>مجموع الديون:</span>
                    <span>{totalRemainingDebt.toLocaleString()} {currencyLabel}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="text-center text-[10px] pt-1 text-slate-700">
                  <p>{settings.invoiceFooterNote || 'في حالة حصول خطأ أو سهو في التجهيز يجب إعلامنا في نفس اليوم'}</p>
                  <p className="mt-1 font-bold">شكراً لتعاملكم معنا</p>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};
