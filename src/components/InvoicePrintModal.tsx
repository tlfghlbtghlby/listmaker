import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Invoice } from '../types';
import { 
  X, 
  Printer, 
  Share2, 
  Check, 
  FileText, 
  Receipt,
  FileDown,
  Bluetooth,
  RefreshCw,
  Info
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

interface InvoicePrintModalProps {
  invoice: Invoice | null;
  onClose: () => void;
}

// 20-point starburst commercial seal matching the photo
const StarburstSeal: React.FC<{ text: string }> = ({ text }) => (
  <div className="relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 select-none shrink-0">
    <svg viewBox="0 0 100 100" className="w-full h-full fill-none stroke-black stroke-[2]">
      <polygon points="50,2 62,18 82,10 83,31 99,38 89,55 99,71 83,78 82,98 62,91 50,106 38,91 18,98 17,78 1,71 11,55 1,38 17,31 18,10 38,18" />
    </svg>
    <span className="absolute font-black text-xs sm:text-sm text-black" style={{ letterSpacing: 'normal' }}>{text}</span>
  </div>
);

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({ invoice, onClose }) => {
  const { settings } = useApp();
  const [printLayout, setPrintLayout] = useState<'a4' | 'a5' | 'thermal'>(
    settings.printFormat === 'thermal' ? 'thermal' : 'a4'
  );
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

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

  // Formatted time string HH:mm:ss
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');
  const timeFormatted = `${hours}:${minutes}:${seconds}`;

  // Calculations for summary table identical to the photo
  const invoiceTotal = invoice.total;
  const previousDebt = invoice.previousDebt || 0;
  const grandTotal = invoiceTotal + previousDebt;
  const paid = invoice.paidAmount;
  const totalRemainingDebt = Math.max(0, grandTotal - paid);
  const currencyLabel = settings.currency || 'دينار';

  // Native Print
  const handlePrint = () => {
    window.print();
  };

  // Generate high quality PDF Blob using html-to-image & jsPDF (safe from oklch errors and renders Arabic letters connected)
  const generateInvoicePDF = async (): Promise<{ blob: Blob; fileName: string } | null> => {
    const element = document.getElementById('printable-invoice');
    if (!element) return null;

    // Use toPng to capture DOM with native browser text-shaper & font ligatures
    const dataUrl = await toPng(element, {
      quality: 1,
      pixelRatio: 2.5,
      backgroundColor: '#ffffff',
      skipFonts: true,
      style: {
        letterSpacing: 'normal',
        wordSpacing: 'normal',
        fontFamily: "'Cairo', 'Tajawal', Tahoma, Arial, sans-serif",
      },
    });

    // Determine dimensions from generated image
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const aspect = img.naturalHeight / (img.naturalWidth || 1);
    let pdf: jsPDF;
    const fileName = `قائمة_${invoice.invoiceNumber}.pdf`;

    if (printLayout === 'thermal') {
      const imgWidth = 80;
      const imgHeight = imgWidth * aspect;
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [imgWidth, imgHeight + 4]
      });
      pdf.addImage(dataUrl, 'PNG', 0, 2, imgWidth, imgHeight);
    } else if (printLayout === 'a5') {
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a5'
      });
      const pdfWidth = 148;
      const pdfHeight = 210;
      const imgWidth = pdfWidth - 8;
      const imgHeight = imgWidth * aspect;
      pdf.addImage(dataUrl, 'PNG', 4, 4, imgWidth, Math.min(imgHeight, pdfHeight - 8));
    } else {
      // Standard A4
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth - 12;
      const imgHeight = imgWidth * aspect;
      pdf.addImage(dataUrl, 'PNG', 6, 6, imgWidth, Math.min(imgHeight, pdfHeight - 12));
    }

    const blob = pdf.output('blob');
    return { blob, fileName };
  };

  // 1. Download PDF directly
  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    setPdfNotice(null);
    try {
      const result = await generateInvoicePDF();
      if (!result) return;
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPdfNotice('تم تحميل ملف PDF بنجاح بحروف عربية واضحة');
      setTimeout(() => setPdfNotice(null), 4000);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setPdfNotice('حدث خطأ أثناء إنشاء ملف PDF');
      setTimeout(() => setPdfNotice(null), 4000);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // 2. WhatsApp Share: Generates PDF and shares it to WhatsApp
  const handleShareWhatsApp = async () => {
    setIsGeneratingPDF(true);
    setPdfNotice(null);
    try {
      const result = await generateInvoicePDF();
      if (!result) throw new Error('فشل إنشاء ملف الفاتورة');

      const file = new File([result.blob], result.fileName, { type: 'application/pdf' });

      // Summary text for WhatsApp message
      let summaryText = `📋 *فاتورة مبيعات: ${settings.storeName}*\n`;
      summaryText += `رقم القائمة: ${invoice.invoiceNumber}\n`;
      summaryText += `التاريخ: ${dayName} ${dateFormatted}\n`;
      summaryText += `حضرة السيد: ${invoice.customerName}\n`;
      summaryText += `المبلغ المطلوب: ${invoice.total.toLocaleString()} ${currencyLabel}\n`;
      if (totalRemainingDebt > 0) {
        summaryText += `مجموع الديون بذمة العميل: ${totalRemainingDebt.toLocaleString()} ${currencyLabel}\n`;
      }
      summaryText += `\n📄 مرفق ملف القائمة بصيغة PDF.`;

      // A) Try Web Share API with File (Native support on Mobile Android & iOS WhatsApp)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `قائمة ${invoice.invoiceNumber}`,
          text: summaryText,
          files: [file],
        });
        setPdfNotice('تم فتح المشاركة عبر الواتساب بنجاح');
        setTimeout(() => setPdfNotice(null), 3000);
        return;
      }

      // B) Desktop / Browser fallback: Download PDF and open WhatsApp
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      let targetPhone = invoice.customerPhone ? invoice.customerPhone.replace(/[^0-9]/g, '') : '';
      if (targetPhone) {
        if (targetPhone.startsWith('00964')) {
          targetPhone = targetPhone.substring(2);
        } else if (targetPhone.startsWith('07') && targetPhone.length === 11) {
          targetPhone = '964' + targetPhone.substring(1);
        } else if (targetPhone.startsWith('7') && targetPhone.length === 10) {
          targetPhone = '964' + targetPhone;
        }
      }
      const whatsappUrl = targetPhone
        ? `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(summaryText)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText)}`;

      const link = document.createElement('a');
      link.href = whatsappUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setIsCopied(true);
      setPdfNotice('تم تحميل ملف PDF وفتح الواتساب لإرسال القائمة');
      setTimeout(() => {
        setIsCopied(false);
        setPdfNotice(null);
      }, 4000);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('WhatsApp PDF share notice:', err);
        setPdfNotice('تعذر إكمال المشاركة عبر الواتساب تلقائياً');
        setTimeout(() => setPdfNotice(null), 4000);
      }
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // 3. Bluetooth Print
  const handleBluetoothPrint = async () => {
    try {
      if ('bluetooth' in navigator) {
        await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
        });
      } else {
        setPrintLayout('thermal');
        setTimeout(() => window.print(), 200);
      }
    } catch (e) {
      setPrintLayout('thermal');
      setTimeout(() => window.print(), 200);
    }
  };

  return (
    <div className="print-modal-overlay fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      
      {/* Dynamic page print styling based on chosen format */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page {
              size: ${printLayout === 'a4' ? 'A4 portrait' : printLayout === 'a5' ? 'A5 portrait' : '80mm auto'};
              margin: ${printLayout === 'thermal' ? '2mm' : printLayout === 'a5' ? '5mm' : '8mm'};
            }
            ${printLayout === 'thermal' ? '#printable-invoice { width: 80mm !important; max-width: 80mm !important; }' : ''}
          }
        `
      }} />

      <div className="print-modal-card bg-white rounded-2xl border border-slate-300 shadow-2xl max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden">
        
        {/* Top Controls Bar (Hidden in Print) */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 no-print">
          
          {/* Format Selector Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-700">تنسيق الطباعة:</span>
            <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-bold">
              <button
                type="button"
                onClick={() => setPrintLayout('a4')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                  printLayout === 'a4'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>ورقة كاملة (A4)</span>
              </button>

              <button
                type="button"
                onClick={() => setPrintLayout('a5')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                  printLayout === 'a5'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>نصف ورقة (A5)</span>
              </button>

              <button
                type="button"
                onClick={() => setPrintLayout('thermal')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition cursor-pointer ${
                  printLayout === 'thermal'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>وصل كاشير (80mm)</span>
              </button>
            </div>
          </div>

          {/* Action Buttons matching Screenshot 3 */}
          <div className="flex items-center gap-2 flex-wrap">
            
            {/* 1. Print Invoice Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-xs flex items-center gap-1.5 transition cursor-pointer"
              title="طباعة القائمة مباشرة"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة القائمة</span>
            </button>

            {/* 2. Download / Save PDF Button */}
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
              title="حفظ وتحميل الفاتورة كملف PDF رسمي"
            >
              {isGeneratingPDF ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span>حفظ / تحميل PDF</span>
            </button>

            {/* 3. Bluetooth Print Button */}
            <button
              type="button"
              onClick={handleBluetoothPrint}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
              title="طباعة عبر طابعة بلوتوث محمولة"
            >
              <Bluetooth className="w-3.5 h-3.5 text-amber-600" />
              <span>طباعة بلوتوث</span>
            </button>

            {/* 4. WhatsApp Share Button (Creates PDF & shares) */}
            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-400 rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="إنشاء نسخة PDF من القائمة ومشاركتها عبر الواتساب"
            >
              {isGeneratingPDF ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              ) : isCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>واتساب (PDF)</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Notice Toast */}
        {pdfNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs font-bold text-emerald-800 flex items-center justify-between no-print animate-fadeIn">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{pdfNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setPdfNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 text-[11px] underline cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Invoice Viewer and Printable Container */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-200/80 flex justify-center">
          
          <div
            id="printable-invoice"
            dir="rtl"
            style={{ letterSpacing: 'normal' }}
            className={`bg-white shadow-xl text-black mx-auto transition-all ${
              printLayout === 'thermal'
                ? 'w-[320px] p-4 rounded-lg border border-slate-400 font-mono text-xs'
                : printLayout === 'a5'
                ? 'w-full max-w-[640px] p-4 sm:p-6 rounded-lg border border-slate-400 font-sans text-xs'
                : 'w-full max-w-[820px] p-5 sm:p-8 rounded-lg border border-slate-400 font-sans text-xs'
            }`}
          >

            {/* A4 and A5 Full Sheet Invoice matching exact layout in Screenshot 3 */}
            {printLayout !== 'thermal' ? (
              <div className="space-y-2.5 text-black leading-tight">
                
                {/* 1. Header Box with Corner Seals */}
                <div className="border border-black rounded-md p-2.5 sm:p-3 relative flex flex-col items-center justify-center text-center">
                  
                  {/* Right Seal: جملة */}
                  <div className="absolute right-2.5 top-2">
                    <StarburstSeal text={settings.enableWholesale ? "جملة" : "تجزئة"} />
                  </div>

                  {/* Left Seal: مفرد */}
                  <div className="absolute left-2.5 top-2">
                    <StarburstSeal text="مفرد" />
                  </div>

                  {/* Center Store Title */}
                  <h1 className="text-xl sm:text-2xl font-black text-black" style={{ letterSpacing: 'normal' }}>
                    {settings.storeName || 'انشائية المسعودي'}
                  </h1>

                  <div className="text-xs sm:text-sm font-bold text-black mt-1">
                    بإدارة: {settings.ownerName || settings.storeName} · تجارة عامة وبيع الجملة والمفرد
                  </div>

                  {/* Address & Phone */}
                  {(settings.address || settings.phone) && (
                    <div className="text-[11px] font-semibold text-black mt-1 pt-1 border-t border-dotted border-black/40 w-full text-center">
                      {settings.address && <span>{settings.address}&nbsp;&nbsp;&nbsp;&nbsp;</span>}
                      {settings.phone && <span>هاتف: {settings.phone}</span>}
                    </div>
                  )}
                </div>

                {/* 2. Metadata Bar in single bordered box */}
                <div className="border border-black rounded-md px-3 py-1.5 flex items-center justify-between text-xs font-bold text-black">
                  <div className="flex items-center gap-1.5">
                    <span>رقم القائمة:</span>
                    <span className="font-mono text-sm">{invoice.invoiceNumber}</span>
                  </div>

                  <div>
                    <span>التاريخ:</span>&nbsp;
                    <span>{dayName}</span>&nbsp;
                    <span className="font-mono">{dateFormatted}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span>الوقت:</span>
                    <span className="font-mono text-xs">{timeFormatted}</span>
                  </div>
                </div>

                {/* 3. Customer Info Box in single bordered box */}
                <div className="border border-black rounded-md px-3 py-1.5 grid grid-cols-2 gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-black">حضرة السيد:</span>
                    <span className="font-bold text-black text-sm">
                      {invoice.customerName || (invoice.type === 'direct' ? 'زبون نقدي مباشر' : 'عميل غير مسجل')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-black">العنوان / الهاتف:</span>
                    <span className="font-medium text-black">
                      {invoice.customerPhone || (invoice.type === 'direct' ? 'بيع نقدي مباشر' : settings.address || '-')}
                    </span>
                  </div>
                </div>

                {/* 4. Items Table matching exact structure in Screenshot 3 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse border border-black">
                    <thead>
                      <tr className="border-b border-black font-bold bg-slate-50/70">
                        <th className="border border-black py-1 px-1.5 w-7 text-center">ت</th>
                        <th className="border border-black py-1 px-2.5">المادة / التفاصيل</th>
                        <th className="border border-black py-1 px-1.5 w-12 text-center">التجهيز</th>
                        <th colSpan={2} className="border border-black py-0.5 px-1 text-center">
                          الكمية
                          <div className="grid grid-cols-2 border-t border-black mt-0.5 font-semibold text-[10px]">
                            <span className="border-l border-black">كارتون</span>
                            <span>قطعة</span>
                          </div>
                        </th>
                        <th className="border border-black py-1 px-2 w-20 text-center">السعر</th>
                        <th className="border border-black py-1 px-1.5 w-14 text-center">العملة</th>
                        <th className="border border-black py-1 px-2.5 w-24 text-center">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item, index) => {
                        const isPiece = item.unitType === 'piece' || item.unit?.includes('قطعة');
                        const qtyFormatted = Number(item.quantity).toLocaleString();

                        return (
                          <tr key={index} className="border-b border-black">
                            {/* ت */}
                            <td className="border border-black py-1 px-1.5 text-center font-mono font-bold">
                              {index + 1}
                            </td>

                            {/* المادة / التفاصيل */}
                            <td className="border border-black py-1 px-2.5 font-bold text-black text-xs sm:text-[13px]">
                              {item.productName}
                            </td>

                            {/* التجهيز (Checkmark) */}
                            <td className="border border-black py-1 px-1.5 text-center text-black font-bold text-xs">
                              ✓
                            </td>

                            {/* كارتون */}
                            <td className="border border-black py-1 px-1 text-center font-mono font-bold">
                              {!isPiece ? qtyFormatted : '-'}
                            </td>

                            {/* قطعة */}
                            <td className="border border-black py-1 px-1 text-center font-mono font-bold">
                              {isPiece ? qtyFormatted : '-'}
                            </td>

                            {/* السعر */}
                            <td className="border border-black py-1 px-2 text-center font-mono font-bold">
                              {item.unitPrice.toLocaleString()}
                            </td>

                            {/* العملة */}
                            <td className="border border-black py-1 px-1.5 text-center font-bold text-[11px]">
                              {currencyLabel}
                            </td>

                            {/* المبلغ */}
                            <td className="border border-black py-1 px-2.5 text-left font-mono font-black text-sm">
                              {item.total.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 5. Bottom Financial Summary Ledger + Notes/Stamp matching Screenshot 3 */}
                <div className="grid grid-cols-12 gap-2.5 pt-1">
                  
                  {/* Left side: Notes, Stamp, and Signatures (6 cols) */}
                  <div className="col-span-6 border border-black rounded-md p-2 flex flex-col justify-between text-xs">
                    <div>
                      <div className="font-bold text-black border-b border-dotted border-black/40 pb-1 mb-1 flex justify-between items-center">
                        <span>ملاحظات القائمة:</span>
                        <span className="font-normal text-[10px] text-slate-500">ختم وتوقيع التجهيز</span>
                      </div>
                      <p className="text-[11px] text-slate-800 leading-relaxed min-h-[36px]">
                        {invoice.notes || 'تم تدقيق المواد والكميات المسجلة أعلاه ومطابقتها.'}
                      </p>
                    </div>

                    <div className="flex justify-between items-end pt-2 border-t border-dotted border-black/40 text-[11px] font-bold">
                      <div>توقيع البائع: ....................</div>
                      <div>توقيع المستلم: ....................</div>
                    </div>
                  </div>

                  {/* Right side: Financial Ledger Table identical to Screenshot 3 (6 cols) */}
                  <div className="col-span-6">
                    <table className="w-full text-right text-xs border-collapse border border-black">
                      <thead>
                        <tr className="border-b border-black font-bold bg-slate-50/70">
                          <th className="border border-black py-1 px-2">البيان المالي</th>
                          <th className="border border-black py-1 px-2 text-center w-28">المبلغ ({currencyLabel})</th>
                          <th className="border border-black py-1 px-2 text-center w-20">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* مبلغ القائمة (الصافي) */}
                        <tr className="border-b border-black font-bold">
                          <td className="border border-black py-1 px-2">مبلغ القائمة (الصافي)</td>
                          <td className="border border-black py-1 px-2 text-center font-mono font-bold">
                            {invoiceTotal.toLocaleString()}
                          </td>
                          <td className="border border-black py-1 px-2 text-center text-[11px] text-slate-700">
                            حالي
                          </td>
                        </tr>

                        {/* الديون السابقة للزبون */}
                        <tr className="border-b border-black font-bold">
                          <td className="border border-black py-1 px-2">الديون السابقة للزبون</td>
                          <td className="border border-black py-1 px-2 text-center font-mono font-bold">
                            {previousDebt.toLocaleString()}
                          </td>
                          <td className="border border-black py-1 px-2 text-center text-[11px] text-slate-500">
                            {previousDebt > 0 ? 'سابق' : 'لا يوجد'}
                          </td>
                        </tr>

                        {/* المجموع الكلي المطلوب */}
                        <tr className="border-b border-black font-black bg-slate-100/50">
                          <td className="border border-black py-1 px-2">المجموع الكلي المطلوب</td>
                          <td className="border border-black py-1 px-2 text-center font-mono font-black text-sm">
                            {grandTotal.toLocaleString()}
                          </td>
                          <td className="border border-black py-1 px-2 text-center text-[11px] font-bold">
                            إجمالي
                          </td>
                        </tr>

                        {/* الواصل (المسدد نقداً) */}
                        <tr className="border-b border-black font-bold">
                          <td className="border border-black py-1 px-2">الواصل (المسدد نقداً)</td>
                          <td className="border border-black py-1 px-2 text-center font-mono font-bold text-emerald-800">
                            {paid.toLocaleString()}
                          </td>
                          <td className="border border-black py-1 px-2 text-center text-[11px] text-emerald-700 font-bold">
                            {paid >= grandTotal ? 'كامل' : paid > 0 ? 'جزئي' : 'مؤجل'}
                          </td>
                        </tr>

                        {/* الباقي بذمة العميل */}
                        <tr className="font-black bg-slate-100">
                          <td className="border border-black py-1.5 px-2">الباقي بذمة العميل</td>
                          <td className="border border-black py-1.5 px-2 text-center font-mono font-black text-sm text-black">
                            {totalRemainingDebt > 0 ? totalRemainingDebt.toLocaleString() : '(خالص) 0'}
                          </td>
                          <td className="border border-black py-1.5 px-2 text-center text-[11px] font-black">
                            {totalRemainingDebt > 0 ? 'متبقي' : 'مسدد'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div>

                {/* 6. Footer Note identical to Screenshot 3 */}
                <div className="flex items-center justify-between border-t border-black pt-1.5 text-[11px] font-bold text-black">
                  <span>صفحة 1</span>
                  <span>
                    {settings.invoiceFooterNote || 'شكراً لتعاملكم معنا'}
                  </span>
                </div>

              </div>
            ) : (
              /* Thermal 80mm Receipt Layout */
              <div className="space-y-2.5 leading-tight text-black font-mono">
                {/* Header */}
                <div className="text-center border-b border-dashed border-black pb-2">
                  <div className="font-black text-sm">{settings.storeName || 'انشائية المسعودي'}</div>
                  <div className="text-[10px] text-slate-700 mt-0.5">
                    بإدارة: {settings.ownerName || settings.storeName}
                  </div>
                  {settings.phone && <div className="text-[10px] text-slate-700">{settings.phone}</div>}
                  <div className="font-bold text-xs mt-1">
                    {invoice.type === 'direct' ? '** وصل بيع مباشر **' : '** وصل بيع آجل (دين) **'}
                  </div>
                </div>

                {/* Meta */}
                <div className="text-[11px] space-y-0.5 border-b border-dashed border-black pb-2">
                  <div className="flex justify-between">
                    <span>رقم القائمة:</span>
                    <span className="font-bold">{invoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>التاريخ:</span>
                    <span>{dayName} {dateFormatted} {timeFormatted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>حضرة السيد:</span>
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
                        <span>{item.quantity} × {item.unitPrice.toLocaleString()} {currencyLabel}</span>
                        <span className="font-bold">{item.total.toLocaleString()} {currencyLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals */}
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
                    <span>المجموع الكلي:</span>
                    <span>{grandTotal.toLocaleString()} {currencyLabel}</span>
                  </div>
                  <div className="flex justify-between text-emerald-900">
                    <span>الواصل نقداً:</span>
                    <span>{paid.toLocaleString()} {currencyLabel}</span>
                  </div>
                  <div className="flex justify-between text-black pt-0.5 border-t border-slate-300 font-black">
                    <span>الباقي بذمة العميل:</span>
                    <span>{totalRemainingDebt > 0 ? `${totalRemainingDebt.toLocaleString()} ${currencyLabel}` : 'خالص'}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="text-center text-[10px] pt-1 text-slate-700">
                  <p>{settings.invoiceFooterNote || 'شكراً لتعاملكم معنا'}</p>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};

export default InvoicePrintModal;
