import React, { useState, useRef, useEffect } from 'react';
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
  Info,
  ArrowDownAZ
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
  const [printLayout, setPrintLayout] = useState<'a4' | 'a5' | 'thermal80' | 'thermal58'>(
    settings.printFormat === 'thermal58' ? 'thermal58' : settings.printFormat === 'thermal' ? 'thermal80' : 'a4'
  );
  const [sortByAlphabet, setSortByAlphabet] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Ensure native Ctrl+P / browser print invocation also starts at top 0 of Page 1
  useEffect(() => {
    const handleBeforePrint = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, []);

  if (!invoice) return null;

  const isThermal = printLayout === 'thermal80' || printLayout === 'thermal58';
  const is58mm = printLayout === 'thermal58';

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

  // Calculations for summary table
  const invoiceTotal = invoice.total;
  const previousDebt = invoice.previousDebt || 0;
  const grandTotal = invoiceTotal + previousDebt;
  const paid = invoice.paidAmount;
  const totalRemainingDebt = Math.max(0, grandTotal - paid);
  const currencyLabel = settings.currency || 'دينار';

  // فرز المواد المعروضة في القائمة المطبوعة فقط أبجدياً
  const displayedItems = sortByAlphabet
    ? [...invoice.items].sort((a, b) => {
        const nameA = a.name || a.productName || '';
        const nameB = b.name || b.productName || '';
        return nameA.localeCompare(nameB, 'ar');
      })
    : invoice.items;

  // Native Print with absolute top scroll reset
  const handlePrint = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }

    setTimeout(() => {
      window.print();
    }, 50);
  };

  // Generate high quality PDF Blob using html-to-image & jsPDF
  const generateInvoicePDF = async (): Promise<{ blob: Blob; fileName: string } | null> => {
    const element = document.getElementById('printable-invoice');
    if (!element) return null;

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

    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const aspect = img.naturalHeight / (img.naturalWidth || 1);
    let pdf: jsPDF;
    const fileName = `قائمة_${invoice.invoiceNumber}.pdf`;

    if (printLayout === 'thermal58') {
      const imgWidth = 48; // العرض الفعلي لمنطقة الطباعة في رول 58
      const imgHeight = imgWidth * aspect;
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [58, imgHeight + 4]
      });
      pdf.addImage(dataUrl, 'PNG', 5, 2, imgWidth, imgHeight);
    } else if (printLayout === 'thermal80') {
      const imgWidth = 72; // العرض الفعلي لمنطقة الطباعة في رول 80
      const imgHeight = imgWidth * aspect;
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, imgHeight + 4]
      });
      pdf.addImage(dataUrl, 'PNG', 4, 2, imgWidth, imgHeight);
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

  // 2. WhatsApp Share
  const handleShareWhatsApp = async () => {
    setIsGeneratingPDF(true);
    setPdfNotice(null);
    try {
      const result = await generateInvoicePDF();
      if (!result) throw new Error('فشل إنشاء ملف الفاتورة');

      const file = new File([result.blob], result.fileName, { type: 'application/pdf' });

      let summaryText = `📋 *فاتورة مبيعات: ${settings.storeName}*\n`;
      summaryText += `رقم القائمة: ${invoice.invoiceNumber}\n`;
      summaryText += `التاريخ: ${dayName} ${dateFormatted}\n`;
      summaryText += `حضرة السيد: ${invoice.customerName}\n`;
      summaryText += `المبلغ المطلوب: ${invoice.total.toLocaleString()} ${currencyLabel}\n`;
      if (totalRemainingDebt > 0) {
        summaryText += `مجموع الديون بذمة العميل: ${totalRemainingDebt.toLocaleString()} ${currencyLabel}\n`;
      }
      summaryText += `\n📄 مرفق ملف القائمة بصيغة PDF.`;

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
        setPrintLayout('thermal80');
        setTimeout(() => window.print(), 200);
      }
    } catch (e) {
      setPrintLayout('thermal80');
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
              size: ${printLayout === 'a4' ? 'A4 portrait' : printLayout === 'a5' ? 'A5 portrait' : printLayout === 'thermal58' ? '58mm auto' : '80mm auto'};
              margin: ${isThermal ? '1mm 1mm 1mm 1mm' : printLayout === 'a5' ? '2mm 4mm 4mm 4mm' : '2mm 5mm 5mm 5mm'} !important;
            }
            ${printLayout === 'thermal58' ? '#printable-invoice { width: 48mm !important; max-width: 48mm !important; padding: 0 !important; font-size: 10px !important; }' : ''}
            ${printLayout === 'thermal80' ? '#printable-invoice { width: 72mm !important; max-width: 72mm !important; padding: 0 !important; font-size: 11px !important; }' : ''}
            ${printLayout === 'a5' ? '#printable-invoice { width: 100% !important; max-width: 100% !important; }' : ''}
            ${printLayout === 'a4' ? '#printable-invoice { width: 100% !important; max-width: 100% !important; }' : ''}
          }
        `
      }} />

      <div className="print-modal-card bg-white rounded-2xl border border-slate-300 shadow-2xl max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden">
        
        {/* Top Controls Bar (Hidden in Print) */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 no-print">
          
          {/* Format Selector Tabs & Print Options */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5">
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
                  <span>A4</span>
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
                  <span>A5</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintLayout('thermal80')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition cursor-pointer ${
                    printLayout === 'thermal80'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>80mm</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintLayout('thermal58')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition cursor-pointer ${
                    printLayout === 'thermal58'
                      ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-500/40'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>58mm</span>
                </button>
              </div>
            </div>

            {/* ترتيب المواد أبجدياً */}
            <div className="flex items-center gap-1.5 border-r border-slate-300 pr-2.5 sm:mr-1">
              <label 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition select-none shadow-2xs ${
                  sortByAlphabet
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-1 ring-emerald-500/30'
                    : 'bg-white border-slate-300 hover:border-slate-400 text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={sortByAlphabet}
                  onChange={(e) => setSortByAlphabet(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                />
                <ArrowDownAZ className={`w-4 h-4 ${sortByAlphabet ? 'text-emerald-600' : 'text-slate-500'}`} />
                <span>ترتيب أبجدي (أ - ي)</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة القائمة</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            >
              {isGeneratingPDF ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span>حفظ PDF</span>
            </button>

            <button
              type="button"
              onClick={handleBluetoothPrint}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            >
              <Bluetooth className="w-3.5 h-3.5 text-amber-600" />
              <span>بلوتوث</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-400 rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
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
        <div 
          ref={scrollContainerRef}
          className="print-invoice-scroll-area flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-200/80 flex justify-center print:p-0 print:m-0 print:bg-transparent print:overflow-visible print:block"
        >
          
          <div
            id="printable-invoice"
            dir="rtl"
            style={{ letterSpacing: 'normal' }}
            className={`bg-white shadow-xl text-black mx-auto transition-all print:p-0 print:m-0 print:border-none print:shadow-none print:rounded-none print:w-full print:max-w-none ${
              is58mm
                ? 'w-[230px] p-2 rounded-lg border border-slate-400 font-mono text-[10px]'
                : printLayout === 'thermal80'
                ? 'w-[320px] p-4 rounded-lg border border-slate-400 font-mono text-xs'
                : printLayout === 'a5'
                ? 'w-full max-w-[640px] p-4 sm:p-6 rounded-lg border border-slate-400 font-sans text-xs'
                : 'w-full max-w-[820px] p-5 sm:p-8 rounded-lg border border-slate-400 font-sans text-xs'
            }`}
          >

            {/* A4 and A5 Full Sheet Invoice */}
            {!isThermal ? (
              <div className="space-y-2.5 text-black leading-tight">
                {/* 1. Header Box */}
                <div className="border border-black rounded-md p-2.5 sm:p-3 relative flex flex-col items-center justify-center text-center">
                  <div className="absolute right-2.5 top-2">
                    <StarburstSeal 
                      text={settings.headerRightSealText || (settings.enableWholesale ? "جملة" : "تجزئة")} 
                    />
                  </div>
                  <div className="absolute left-2.5 top-2">
                    <StarburstSeal 
                      text={settings.headerLeftSealText || "مفرد"} 
                    />
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-black">
                    {settings.storeName || 'انشائية المسعودي'}
                  </h1>
                  <div className="text-xs sm:text-sm font-bold text-black mt-1">
  import React, { useState, useRef, useEffect } from 'react';
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
  Info,
  ArrowDownAZ
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
  const [printLayout, setPrintLayout] = useState<'a4' | 'a5' | 'thermal80' | 'thermal58'>(
    settings.printFormat === 'thermal58' ? 'thermal58' : settings.printFormat === 'thermal' ? 'thermal80' : 'a4'
  );
  const [sortByAlphabet, setSortByAlphabet] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Ensure native Ctrl+P / browser print invocation also starts at top 0 of Page 1
  useEffect(() => {
    const handleBeforePrint = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
    };
  }, []);

  if (!invoice) return null;

  const isThermal = printLayout === 'thermal80' || printLayout === 'thermal58';
  const is58mm = printLayout === 'thermal58';

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

  // Calculations for summary table
  const invoiceTotal = invoice.total;
  const previousDebt = invoice.previousDebt || 0;
  const grandTotal = invoiceTotal + previousDebt;
  const paid = invoice.paidAmount;
  const totalRemainingDebt = Math.max(0, grandTotal - paid);
  const currencyLabel = settings.currency || 'دينار';

  // فرز المواد المعروضة في القائمة المطبوعة فقط أبجدياً
  const displayedItems = sortByAlphabet
    ? [...invoice.items].sort((a, b) => {
        const nameA = a.name || a.productName || '';
        const nameB = b.name || b.productName || '';
        return nameA.localeCompare(nameB, 'ar');
      })
    : invoice.items;

  // Native Print with absolute top scroll reset
  const handlePrint = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }

    setTimeout(() => {
      window.print();
    }, 50);
  };

  // Generate high quality PDF Blob using html-to-image & jsPDF
  const generateInvoicePDF = async (): Promise<{ blob: Blob; fileName: string } | null> => {
    const element = document.getElementById('printable-invoice');
    if (!element) return null;

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

    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const aspect = img.naturalHeight / (img.naturalWidth || 1);
    let pdf: jsPDF;
    const fileName = `قائمة_${invoice.invoiceNumber}.pdf`;

    if (printLayout === 'thermal58') {
      const imgWidth = 48; // العرض الفعلي لمنطقة الطباعة في رول 58
      const imgHeight = imgWidth * aspect;
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [58, imgHeight + 4]
      });
      pdf.addImage(dataUrl, 'PNG', 5, 2, imgWidth, imgHeight);
    } else if (printLayout === 'thermal80') {
      const imgWidth = 72; // العرض الفعلي لمنطقة الطباعة في رول 80
      const imgHeight = imgWidth * aspect;
      pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, imgHeight + 4]
      });
      pdf.addImage(dataUrl, 'PNG', 4, 2, imgWidth, imgHeight);
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

  // 2. WhatsApp Share
  const handleShareWhatsApp = async () => {
    setIsGeneratingPDF(true);
    setPdfNotice(null);
    try {
      const result = await generateInvoicePDF();
      if (!result) throw new Error('فشل إنشاء ملف الفاتورة');

      const file = new File([result.blob], result.fileName, { type: 'application/pdf' });

      let summaryText = `📋 *فاتورة مبيعات: ${settings.storeName}*\n`;
      summaryText += `رقم القائمة: ${invoice.invoiceNumber}\n`;
      summaryText += `التاريخ: ${dayName} ${dateFormatted}\n`;
      summaryText += `حضرة السيد: ${invoice.customerName}\n`;
      summaryText += `المبلغ المطلوب: ${invoice.total.toLocaleString()} ${currencyLabel}\n`;
      if (totalRemainingDebt > 0) {
        summaryText += `مجموع الديون بذمة العميل: ${totalRemainingDebt.toLocaleString()} ${currencyLabel}\n`;
      }
      summaryText += `\n📄 مرفق ملف القائمة بصيغة PDF.`;

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
        setPrintLayout('thermal80');
        setTimeout(() => window.print(), 200);
      }
    } catch (e) {
      setPrintLayout('thermal80');
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
              size: ${printLayout === 'a4' ? 'A4 portrait' : printLayout === 'a5' ? 'A5 portrait' : printLayout === 'thermal58' ? '58mm auto' : '80mm auto'};
              margin: ${isThermal ? '1mm 1mm 1mm 1mm' : printLayout === 'a5' ? '2mm 4mm 4mm 4mm' : '2mm 5mm 5mm 5mm'} !important;
            }
            ${printLayout === 'thermal58' ? '#printable-invoice { width: 48mm !important; max-width: 48mm !important; padding: 0 !important; font-size: 10px !important; }' : ''}
            ${printLayout === 'thermal80' ? '#printable-invoice { width: 72mm !important; max-width: 72mm !important; padding: 0 !important; font-size: 11px !important; }' : ''}
            ${printLayout === 'a5' ? '#printable-invoice { width: 100% !important; max-width: 100% !important; }' : ''}
            ${printLayout === 'a4' ? '#printable-invoice { width: 100% !important; max-width: 100% !important; }' : ''}
          }
        `
      }} />

      <div className="print-modal-card bg-white rounded-2xl border border-slate-300 shadow-2xl max-w-4xl w-full max-h-[96vh] flex flex-col overflow-hidden">
        
        {/* Top Controls Bar (Hidden in Print) */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 no-print">
          
          {/* Format Selector Tabs & Print Options */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5">
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
                  <span>A4</span>
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
                  <span>A5</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintLayout('thermal80')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition cursor-pointer ${
                    printLayout === 'thermal80'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>80mm</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintLayout('thermal58')}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md transition cursor-pointer ${
                    printLayout === 'thermal58'
                      ? 'bg-white text-emerald-800 shadow-xs ring-1 ring-emerald-500/40'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>58mm</span>
                </button>
              </div>
            </div>

            {/* ترتيب المواد أبجدياً */}
            <div className="flex items-center gap-1.5 border-r border-slate-300 pr-2.5 sm:mr-1">
              <label 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition select-none shadow-2xs ${
                  sortByAlphabet
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-1 ring-emerald-500/30'
                    : 'bg-white border-slate-300 hover:border-slate-400 text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={sortByAlphabet}
                  onChange={(e) => setSortByAlphabet(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
                />
                <ArrowDownAZ className={`w-4 h-4 ${sortByAlphabet ? 'text-emerald-600' : 'text-slate-500'}`} />
                <span>ترتيب أبجدي (أ - ي)</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة القائمة</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            >
              {isGeneratingPDF ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span>حفظ PDF</span>
            </button>

            <button
              type="button"
              onClick={handleBluetoothPrint}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
            >
              <Bluetooth className="w-3.5 h-3.5 text-amber-600" />
              <span>بلوتوث</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              disabled={isGeneratingPDF}
              className="px-3.5 py-1.5 text-xs font-bold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-400 rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow-xs"
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
        <div 
          ref={scrollContainerRef}
          className="print-invoice-scroll-area flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-200/80 flex justify-center print:p-0 print:m-0 print:bg-transparent print:overflow-visible print:block"
        >
          
          <div
            id="printable-invoice"
            dir="rtl"
            style={{ letterSpacing: 'normal' }}
            className={`bg-white shadow-xl text-black mx-auto transition-all print:p-0 print:m-0 print:border-none print:shadow-none print:rounded-none print:w-full print:max-w-none ${
              is58mm
                ? 'w-[230px] p-2 rounded-lg border border-slate-400 font-mono text-[10px]'
                : printLayout === 'thermal80'
                ? 'w-[320px] p-4 rounded-lg border border-slate-400 font-mono text-xs'
                : printLayout === 'a5'
                ? 'w-full max-w-[640px] p-4 sm:p-6 rounded-lg border border-slate-400 font-sans text-xs'
                : 'w-full max-w-[820px] p-5 sm:p-8 rounded-lg border border-slate-400 font-sans text-xs'
            }`}
          >

            {/* A4 and A5 Full Sheet Invoice */}
            {!isThermal ? (
              <div className="space-y-2.5 text-black leading-tight">
                {/* 1. Header Box */}
                <div className="border border-black rounded-md p-2.5 sm:p-3 relative flex flex-col items-center justify-center text-center">
                  <div className="absolute right-2.5 top-2">
                    <StarburstSeal 
                      text={settings.headerRightSealText || (settings.enableWholesale ? "جملة" : "تجزئة")} 
                    />
                  </div>
                  <div className="absolute left-2.5 top-2">
                    <StarburstSeal 
                      text={settings.headerLeftSealText || "مفرد"} 
                    />
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-black">
                    {settings.storeName || 'انشائية المسعودي'}
                  </h1>
                  <div className="text-xs sm:text-sm font-bold text-black mt-1">
                    {settings.managerLabel || 'بإدارة'}: {settings.ownerName || settings.storeName} · {settings.businessSubtitle || 'تجارة عامة وبيع الجملة والمفرد'}
                  </div>
                  {(settings.address || settings.phone) && (
                    <div className="text-[11px] font-semibold text-black mt-1 pt-1 border-t border-dotted border-black/40 w-full text-center">
                      {settings.address && <span>{settings.address}&nbsp;&nbsp;&nbsp;&nbsp;</span>}
                      {settings.phone && <span>هاتف: {settings.phone}</span>}
                    </div>
                  )}
                </div>

                {/* 2. Metadata Bar */}
                <div className="border border-black rounded-md px-3 py-1.5 flex items-center justify-between text-xs font-bold text-black">
                  <div className="flex items-center gap-1.5">
                    <span>رقم القائمة:</span>
                  {settings.managerLabel || 'بإدارة'}: {settings.ownerName || settings.storeName} · {settings.businessSubtitle || 'تجارة عامة وبيع الجملة والمفرد'}
                  </div>
                  {(settings.address || settings.phone) && (
                    <div className="text-[11px] font-semibold text-black mt-1 pt-1 border-t border-dotted border-black/40 w-full text-center">
                      {settings.address && <span>{settings.address}&nbsp;&nbsp;&nbsp;&nbsp;</span>}
                      {settings.phone && <span>هاتف: {settings.phone}</span>}
                    </div>
                  )}
                </div>

                {/* 2. Metadata Bar */}
                <div className="border border-black rounded-md px-3 py-1.5 flex items-center justify-between text-xs font-bold text-black">
                  <div className="flex items-center gap-1.5">
                    <span>رقم القائمة:</span>
