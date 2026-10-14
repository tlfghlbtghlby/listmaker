import React, { useState } from 'react';
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

  // Invoice print modal
  const [invoiceToPrint, setInvoiceToPrint] = useState<Invoice | null>(null);

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

  const handleInvoiceCreated = (invoice: Invoice) => {
    setInvoiceToPrint(invoice);
  };

  // Show loading spinner while determining auth state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white" dir="rtl">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-base font-bold">جاري تحميل نظام المبيعات والمخزن...</div>
        <div className="text-xs text-slate-400 mt-1">الربط والمزامنة السحابية</div>
      </div>
    );
  }

  // If not logged in and not guest, show the Login screen directly
  if (!currentUser && !isGuest) {
    return (
      <AuthView
        onSuccess={() => setIsGuest(false)}
        onContinueAsGuest={() => setIsGuest(true)}
      />
    );
  }

  return (
    <div className={`min-h-screen flex flex-col bg-slate-100 text-slate-800 print:min-h-0 print:h-auto print:block print:bg-white ${isMobile ? 'selection:bg-emerald-600' : ''}`}>
      {/* Top Header */}
      <Header 
        onOpenAuth={() => setIsGuest(false)}
      />

      {/* Main Tab Navigation */}
      {!isFullComputerMode && (
        <Navigation
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
        />
      )}

      {/* Active Tab View */}
      <main className={`no-print flex-1 w-full mx-auto ${
        isMobile 
          ? 'max-w-2xl px-2.5 sm:px-4 py-3 sm:py-4' 
          : isFullComputerMode 
          ? 'max-w-[1600px] px-3 sm:px-6 py-3 sm:py-4' 
          : 'max-w-7xl px-4 sm:px-6 lg:px-8 py-5'
      }`}>
        
        {/* وضع الكمبيوتر الكامل: شريط العودة السريع */}
        {isFullComputerMode && activeTab !== 'pos' && (
          <div className="bg-slate-900 text-white px-4 py-2.5 rounded-xl flex items-center justify-between mb-4 shadow-sm border border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="text-slate-400">أنت تتصفح حالياً:</span>
              <span className="text-emerald-400">
                {activeTab === 'inventory' && 'جدول المخزون الكامل'}
                {activeTab === 'invoices' && 'سجل الفواتير والقوائم'}
                {activeTab === 'customers' && 'حسابات الديون والعملاء'}
                {activeTab === 'reports' &&
