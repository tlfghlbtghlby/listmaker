import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where
} from 'firebase/firestore';
import { db, logoutAccount } from '../firebase';
import { User } from 'firebase/auth';
import { 
  Product, 
  Customer, 
  Invoice, 
  InvoiceItem,
  InvoiceStatus,
  PaymentRecord, 
  StoreSettings, 
  CreateInvoiceInput 
} from '../types';

interface AppContextType {
  // Data
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  settings: StoreSettings;

  // Product actions
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Product;
  addBulkProducts: (items: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[], onProgress?: (curr: number, total: number) => void) => Promise<{ success: boolean; count: number; products: Product[] }>;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  adjustStock: (id: string, delta: number) => void;

  // Customer actions
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'totalDebt'> & { initialDebt?: number }) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;

  // Invoicing & Sales actions
  createInvoice: (data: CreateInvoiceInput) => Invoice;
  deleteInvoice: (id: string) => void;
  returnInvoice: (id: string) => Promise<boolean>;

  // Product actions & Bulk adjustments
  applyBulkPriceAdjustment: (percentage: number, priceTargets: { retail: boolean; wholesale: boolean; cost: boolean }, roundToHundreds?: boolean) => Promise<{ updatedCount: number }>;

  // Payments / Debt settlements
  recordPayment: (customerId: string, amount: number, notes?: string) => PaymentRecord;

  // Settings & Storage
  updateSettings: (newSettings: Partial<StoreSettings>) => void;
  resetToDemo: () => void;
  resetToZero: () => void;
  exportDataJSON: () => string;
  importDataJSON: (jsonStr: string) => { success: boolean; error?: string };
  formatMoney: (amount: number) => string;

  // Cloud & Auth
  currentUser: any;
  authLoading: boolean;
  isCloudConnected: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  syncNotice: string | null;
  setSyncNotice: (msg: string | null) => void;
  syncNow: () => Promise<void>;
  loginUser: (user: any) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const defaultAdminSettings: StoreSettings = {
  storeName: 'لوحة الإدارة المركزية',
  ownerName: 'المدير العام',
  phone: '',
  address: '',
  currency: 'دينار',
  invoiceFooterNote: 'شكراً لتعاملكم معنا',
  printFormat: 'a4',
  enableWholesale: true,
  deviceMode: typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
  desktopLayout: 'full',
};

export const sanitizeForFirestore = <T = any>(obj: T): T => {
  if (obj === null || obj === undefined) return null as any;
  if (obj instanceof Date) return obj.toISOString() as any;
  if (Array.isArray(obj)) {
    return obj
      .filter(item => item !== undefined)
      .map(item => sanitizeForFirestore(item)) as any;
  }
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = sanitizeForFirestore(value);
      }
    }
    return clean as any;
  }
  return obj;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(defaultAdminSettings);

  // Cloud & Auth State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isCloudConnected, setIsCloudConnected] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // 1. Initial Local Backup & Session Read
  useEffect(() => {
    try {
      const activeSession = localStorage.getItem('active_client_session');
      if (activeSession) {
        const userObj = JSON.parse(activeSession);
        setCurrentUser(userObj);

        const currentUid = userObj.uid;
        const itemsRaw = localStorage.getItem(`items_backup_${currentUid}`);
        if (itemsRaw) setProducts(JSON.parse(itemsRaw));
        const invRaw = localStorage.getItem(`invoices_backup_${currentUid}`);
        if (invRaw) setInvoices(JSON.parse(invRaw));
        const custRaw = localStorage.getItem(`customers_backup_${currentUid}`);
        if (custRaw) setCustomers(JSON.parse(custRaw));
        const settingsRaw = localStorage.getItem(`settings_backup_${currentUid}`);
        if (settingsRaw) setSettings(JSON.parse(settingsRaw));
      }
    } catch (e) {
      console.warn("Local storage backup read notice:", e);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // 2. Real-time Multi-Tenant Listeners
  useEffect(() => {
    if (!currentUser) {
      setProducts([]);
      setCustomers([]);
      setInvoices([]);
      setPayments([]);
      setSettings(defaultAdminSettings);
      return;
    }

    const currentUid = currentUser.uid;
    const isAdmin = currentUser.role === 'admin';

    // إذا كان المستخدم هو المدير العام: لا يعرض بضائع متجر المشتركين الخاصة به
    if (isAdmin) {
      setProducts([]);
      setCustomers([]);
      setInvoices([]);
      setPayments([]);
      setSettings({
        ...defaultAdminSettings,
        storeName: currentUser.storeName || 'لوحة الإدارة المركزية',
        ownerName: currentUser.displayName || 'المدير العام',
      });
      return;
    }

    // للمشتركين (مثل متجر منتظر): جلب بياناتهم مع الحفاظ الكامل على قاعدة بياناتهم الأصلية
    const unsubItems = onSnapshot(collection(db, 'items'), (snapshot) => {
      const list = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any))
        .filter(item => !item.ownerUid || item.ownerUid === currentUid); // متوافق تماماً مع بضائع منتظر الحالية

      setProducts(list);
      try { localStorage.setItem(`items_backup_${currentUid}`, JSON.stringify(list)); } catch (e) {}
      setIsCloudConnected(true);
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, (err) => {
      console.warn("Firestore items notice:", err);
      setIsCloudConnected(false);
    });

    const unsubInvoices = onSnapshot(collection(db, 'invoices'), (snapshot) => {
      const list = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any))
        .filter(inv => !inv.ownerUid || inv.ownerUid === currentUid);

      setInvoices(list);
      try { localStorage.setItem(`invoices_backup_${currentUid}`, JSON.stringify(list)); } catch (e) {}
    }, (err) => {
      console.warn("Firestore invoices notice:", err);
    });

    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const list = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as any))
        .filter(cust => !cust.ownerUid || cust.ownerUid === currentUid);

      setCustomers(list);
      
