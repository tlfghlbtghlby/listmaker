import React, { useState, useEffect, useRef } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { POSView } from './components/POSView';
import { InventoryView } from './components/InventoryView';
import { InvoicesView } from './components/InvoicesView';
import { CustomersView } from './components/CustomersView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { ProductModal } from './components/ProductModal';
import { InvoicePrintModal } from './components/InvoicePrintModal';
import { AuthView } from './components/AuthView';
import { Product, Invoice } from './types';
import { 
  Boxes, 
  FileText, 
  Users, 
  BarChart3, 
  Settings, 
  ArrowRight
} from 'lucide-react';

const MainContent: React.FC = () => {
  const { settings, currentUser, authLoading } = useApp();
  const [isGuest, setIsGuest] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const isMobile = settings.deviceMode === 'mobile';
  const isFullComputerMode = !isMobile && (settings.desktopLayout === 'full');
  
  // Product modal
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [initialBarcodeForNewProduct, setInitialBarcodeForNewProduct] = useState<string | undefined>(undefined);

  // Invoice print modal (للمعاينة والطباعة)
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);

  // فاتورة الطباعة الصامتة المباشرة لتطبيق Electron
  const [directInvoice, setDirectInvoice] = useState<Invoice | null>(null);

  // قفل لمنع إرسال أمر الطباعة مرتين لنفس الفاتورة
  const isPrintingRef = useRef(false);

  // Settings initial tab
  const [settingsInitialTab, setSettingsInitialTab] = useState<'store' | 'quick-add' | 'pricing' | 'security' | 'all'>('store');

  const handleOpenNewProduct = (initialBarcode?: string) => {
    setProductToEdit(null);
    setInitialBarcodeForNewProduct(initialBarcode);
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (prod: Product) => {
    setProductToEdit(prod);
    setIsProductModalOpen(true);
  };

  // معالجة إنشاء الفاتورة: تمييز بيئة أندرويد عن بيئة ويندوز (Electron)
  const handleInvoiceCreated = (invoice: Invoice, andPrint: boolean) => {
    if (!andPrint) {
      return;
    }

    const electronBridge = (window as any).electronAPI || (window as any).electron;

    // إذا كان التطبيق يعمل داخل ويندوز وElectron ومفعل به الطباعة الصامتة
    if (settings.directPrintEnabled && electronBridge) {
      if (isPrintingRef.current) return;
      setInvoiceToPrint(null);
      setDirectInvoice(invoice);
    } else {
      // للأندرويد والمتصفحات: فتح نافذة الفاتورة واستدعاء نافذة طباعة النظام
      setDirectInvoice(null);
      setInvoiceToPrint(invoice);
    }
  };

  // تنفيذ الطباعة المباشرة لـ Electron في ويندوز
  useEffect(() => {
    if (!directInvoice || isPrintingRef.current) return;

    isPrintingRef.current = true;
    let isMounted = true;

    const executeSilentPrint = async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (!isMounted) {
        isPrintingRef.current = false;
        return;
      }

      const paperSize = settings.printerPaperSize || (settings.printFormat === 'thermal' ? 'thermal80' : 'a4');
      const pageSize = paperSize === 'a4' ? 'A4' : paperSize === 'thermal58' ? '58mm' : '80mm';
      const electronBridge = (window as any).electronAPI || (window as any).electron;

      if (typeof window !== 'undefined' && electronBridge) {
        try {
          if (typeof electronBridge.printDirect === 'function') {
            await electronBridge.printDirect({
              silent: true,
              paperSize,
              pageSize,
            });
          } else if (typeof electronBridge.printSilent === 'function') {
            await electronBridge.printSilent(paperSize);
          }
        } catch (err) {
          console.error('فشل في تنفيذ الطباعة الصامتة المباشرة:', err);
        } finally {
          if (isMounted) {
            setDirectInvoice(null);
            setTimeout(() => {
              isPrintingRef.current = false;
            }, 800);
          }
        }
      } else {
        // بديل احتياطي إذا لم يتوفر كوبري إلكترون
        window.print();
        if (isMounted) {
          setDirectInvoice(null);
          isPrintingRef.current = false;
        }
      }
    };

    executeSilentPrint();

    return () => {
      isMounted = false;
    };
  }, [directInvoice, settings.printerPaperSize, settings.printFormat]);

  // إطلاق الطباعة التلقائية للأندرويد عند فتح الفاتورة
  useEffect(() => {
    if (invoiceToPrint) {
      const isAndroid = /Android/i.test(navigator.userAgent) || !(window as any).electronAPI;
      if (isAndroid) {
        const timer = setTimeout(() => {
          window.print();
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [invoiceToPrint]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white" dir="rtl">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-base font-bold">جاري تحميل نظام المبيعات والمخزن...</div>
        <div className="text-xs text-slate-400 mt-1">الربط والمزامنة السحابية</div>
      </div>
    );
  }

  if (!currentUser && !isGuest) {
    return (
      <AuthView
        onSuccess={() => setIsGuest(false)}
        onContinueAsGuest={() => setIsGuest(true)}
      />
    );
  }

  const getActiveTabTitle = () => {
    switch (activeTab) {
      case 'inventory': return 'جدول المخزون الكامل';
      case 'invoices': return 'سجل الفواتير والقوائم';
      case 'customers': return 'حسابات الديون والعملاء';
      case 'reports': return 'الأرباح والتقارير المالية';
      case 'settings': return 'الإعدادات العامة والنسخ الاحتياطي';
      default: return '';
    }
  };

  return (
    <div className={`min-h-screen flex flex-col bg-slate-100 text-slate-800 print:min-h-0 print:h-auto print:block print:bg-white ${isMobile ? 'selection:bg-emerald-600' : ''}`}>
      <Header 
        onOpenAuth={() => setIsGuest(false)}
      />

      {!isFullComputerMode && (
        <Navigation
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
        />
      )}

      <main className={`no-print flex-1 w-full mx-auto ${
        isMobile 
          ? 'max-w-2xl px-2.5 sm:px-4 py-3 sm:py-4' 
          : isFullComputerMode 
          ? 'max-w-[1600px] px-3 sm:px-6 py-3 sm:py-4' 
          : 'max-w-7xl px-4 sm:px-6 lg:px-8 py-5'
      }`}>
        
        {isFullComputerMode && activeTab !== 'pos' && (
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl flex items-center justify-between mb-4 shadow-sm border border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="text-slate-400">أنت تتصفح حالياً:</span>
              <span className="text-emerald-400">{getActiveTabTitle()}</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('pos')}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة لشاشة المواد وقائمة البيع (وضع الكمبيوتر الكامل)</span>
            </button>
          </div>
        )}

        {isFullComputerMode && activeTab === 'pos' && (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-white p-2 sm:px-3 rounded-xl border border-slate-200 shadow-2xs text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>وضع الكمبيوتر الكامل</span>
              </span>
              <span className="text-slate-500 text-xs hidden md:inline">
                (المواد على اليمين وبجانبها القائمة مباشرة بشكل مستطيل وجانبي)
              </span>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('inventory')}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1 cursor-pointer"
                title="عرض جدول المواد والمخزون الكامل"
              >
                <Boxes className="w-3.5 h-3.5 text-slate-500" />
                <span>المخزون الكامل</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('invoices')}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1 cursor-pointer"
                title="عرض سجل الفواتير والقوائم السابقة"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>سجل الفواتير</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('customers')}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1 cursor-pointer"
                title="عرض حسابات ديون العملاء والبيع الآجل"
              >
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>الديون والعملاء</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1 cursor-pointer"
                title="عرض الأرباح والتقارير المالية"
              >
                <BarChart3 className="w-3.5 h-3.5 text-slate-500" />
                <span>التقارير</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1 cursor-pointer"
                title="فتح إعدادات النظام والنسخ الاحتياطي"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span>الإعدادات</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'pos' && (
          <POSView
            onInvoiceCreated={handleInvoiceCreated}
            onOpenNewProduct={handleOpenNewProduct}
            onEditProduct={handleOpenEditProduct}
            onOpenSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            onOpenNewProduct={handleOpenNewProduct}
            onEditProduct={handleOpenEditProduct}
            onOpenQuickAdd={() => {
              setSettingsInitialTab('quick-add');
              setActiveTab('settings');
            }}
          />
        )}

        {activeTab === 'invoices' && (
          <InvoicesView
            onViewInvoice={(inv) => setInvoiceToPrint(inv)}
          />
        )}

        {activeTab === 'customers' && (
          <CustomersView
            onViewInvoice={(inv) => setInvoiceToPrint(inv)}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView />
        )}

        {activeTab === 'settings' && (
          <SettingsView initialTab={settingsInitialTab} />
        )}
      </main>

      <ProductModal
        isOpen={isProductModalOpen}
        productToEdit={productToEdit}
        initialCode={initialBarcodeForNewProduct}
        onClose={() => {
          setIsProductModalOpen(false);
          setProductToEdit(null);
          setInitialBarcodeForNewProduct(undefined);
        }}
      />

      <InvoicePrintModal
        invoice={invoiceToPrint}
        onClose={() => setInvoiceToPrint(null)}
      />

      {directInvoice && (
        <div
          id="direct-print-offscreen-container"
          aria-hidden="true"
          className="fixed -left-[9999px] -top-[9999px] opacity-0 pointer-events-none direct-print-offscreen print:opacity-100 print:pointer-events-auto print:static print:left-auto print:top-auto print:block"
        >
          <InvoicePrintModal
            invoice={directInvoice}
            onClose={() => setDirectInvoice(null)}
          />
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
