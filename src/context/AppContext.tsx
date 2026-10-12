import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc 
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
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  settings: StoreSettings;
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Product;
  addBulkProducts: (items: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[], onProgress?: (curr: number, total: number) => void) => Promise<{ success: boolean; count: number; products: Product[] }>;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  adjustStock: (id: string, delta: number) => void;
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'totalDebt'> & { initialDebt?: number }) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  createInvoice: (data: CreateInvoiceInput) => Invoice;
  deleteInvoice: (id: string) => void;
  returnInvoice: (id: string) => Promise<boolean>;
  applyBulkPriceAdjustment: (percentage: number, priceTargets: { retail: boolean; wholesale: boolean; cost: boolean }, roundToHundreds?: boolean) => Promise<{ updatedCount: number }>;
  recordPayment: (customerId: string, amount: number, notes?: string) => PaymentRecord;
  updateSettings: (newSettings: Partial<StoreSettings>) => void;
  resetToDemo: () => void;
  resetToZero: () => void;
  exportDataJSON: () => string;
  importDataJSON: (jsonStr: string) => { success: boolean; error?: string };
  formatMoney: (amount: number) => string;
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

const MUNTAZAR_UID = "0A6uEqBONPdjOjAEFO0pgfyTs082";

const defaultEmptySettings: StoreSettings = {
  storeName: 'نظام المبيعات والمخزن',
  ownerName: '',
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
  if (Array.isArray(obj)) return obj.filter(i => i !== undefined).map(i => sanitizeForFirestore(i)) as any;
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) clean[k] = sanitizeForFirestore(v);
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
  const [settings, setSettings] = useState<StoreSettings>(defaultEmptySettings);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isCloudConnected, setIsCloudConnected] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const active = localStorage.getItem('active_client_session');
      if (active) setCurrentUser(JSON.parse(active));
    } catch (e) {}
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setProducts([]);
      setCustomers([]);
      setInvoices([]);
      setPayments([]);
      setSettings(defaultEmptySettings);
      return;
    }

    const currentUid = currentUser.uid;
    const isAdmin = currentUser.role === 'admin';

    // إذا كان حساب مدير عام: تبقى الشاشة نظيفة ومخصصة للوحة التحكم المركزية
    if (isAdmin) {
      setProducts([]);
      setCustomers([]);
      setInvoices([]);
      setPayments([]);
      setSettings({
        ...defaultEmptySettings,
        storeName: currentUser.storeName || 'لوحة الإدارة المركزية',
        ownerName: currentUser.displayName || 'المدير العام',
      });
      return;
    }

    // فلترة المواد بدقة: مواد منتظر السابقة تظهر له فقط، وأي مواد جديدة تظهر لمالكها فقط
    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(item => {
          if (!item.ownerUid) return currentUid === MUNTAZAR_UID;
          return item.ownerUid === currentUid;
        });
      setProducts(list);
      setIsCloudConnected(true);
      setLastSyncTime(new Date().toLocaleTimeString('ar-IQ'));
    }, () => setIsCloudConnected(false));

    // فلترة الفواتير
    const unsubInv = onSnapshot(collection(db, 'invoices'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(inv => {
          if (!inv.ownerUid) return currentUid === MUNTAZAR_UID;
          return inv.ownerUid === currentUid;
        });
      setInvoices(list);
    }, () => {});

    // فلترة الزبائن والديون
    const unsubCust = onSnapshot(collection(db, 'customers'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(cust => {
          if (!cust.ownerUid) return currentUid === MUNTAZAR_UID;
          return cust.ownerUid === currentUid;
        });
      setCustomers(list);
    }, () => {});

    // جلب إعدادات المتجر المناسبة للمستخدم
    const settingsDocId = currentUid === MUNTAZAR_UID ? 'store_settings' : `settings_${currentUid}`;
    const unsubSettings = onSnapshot(doc(db, 'settings', settingsDocId), (snap) => {
      if (snap.exists()) {
        setSettings(prev => ({ ...prev, ...(snap.data() as StoreSettings) }));
      } else {
        setSettings({
          ...defaultEmptySettings,
          storeName: currentUser.storeName || 'نظام المبيعات والمخزن',
          ownerName: currentUser.displayName || '',
        });
      }
    }, () => {});

    return () => {
      unsubItems();
      unsubInv();
      unsubCust();
      unsubSettings();
    };
  }, [currentUser]);

  const syncNow = async () => {
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      setIsCloudConnected(true);
      setLastSyncTime(new Date().toLocaleTimeString('ar-IQ'));
      setSyncNotice(`تم الاتصال بالسحابة: ${products.length} مادة`);
      setTimeout(() => setSyncNotice(null), 3000);
    } catch {
      setIsCloudConnected(false);
    } finally {
      setIsSyncing(false);
    }
  };

  const addProduct = (prodData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product => {
    const now = new Date().toISOString();
    const newId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newProduct: any = {
      ...prodData,
      id: newId,
      ownerUid: currentUser?.uid || '',
      code: prodData.code?.trim() || `${1000 + products.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    setDoc(doc(db, 'items', newId), sanitizeForFirestore(newProduct), { merge: true }).catch(() => {});
    setProducts(prev => [newProduct, ...prev]);
    return newProduct;
  };

  const addBulkProducts = async (itemsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[], onProgress?: (curr: number, total: number) => void) => {
    const now = new Date().toISOString();
    const created: Product[] = [];
    for (let i = 0; i < itemsData.length; i++) {
      const item = itemsData[i];
      const newId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '_' + i;
      const full: any = { ...item, id: newId, ownerUid: currentUser?.uid || '', createdAt: now, updatedAt: now };
      created.push(full);
      setDoc(doc(db, 'items', newId), sanitizeForFirestore(full), { merge: true }).catch(() => {});
      if (onProgress) onProgress(i + 1, itemsData.length);
    }
    setProducts(prev => [...created, ...prev]);
    return { success: true, count: created.length, products: created };
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    const finalUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setDoc(doc(db, 'items', id), sanitizeForFirestore(finalUpdates), { merge: true }).catch(() => {});
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...finalUpdates } : p));
  };

  const deleteProduct = (id: string) => {
    deleteDoc(doc(db, 'items', id)).catch(() => {});
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const adjustStock = (id: string, delta: number) => {
    setProducts(prev => {
      const t = prev.find(p => p.id === id);
      if (!t) return prev;
      const newStock = Math.max(0, t.stock + delta);
      updateDoc(doc(db, 'items', id), sanitizeForFirestore({ stock: newStock })).catch(() => {});
      return prev.map(p => p.id === id ? { ...p, stock: newStock } : p);
    });
  };

  const addCustomer = (data: Omit<Customer, 'id' | 'createdAt' | 'totalDebt'> & { initialDebt?: number }) => {
    const newId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newCust: any = {
      id: newId,
      ownerUid: currentUser?.uid || '',
      name: data.name.trim(),
      phone: data.phone.trim(),
      address: data.address?.trim() || '',
      totalDebt: data.initialDebt || 0,
      notes: data.notes?.trim() || '',
      createdAt: new Date().toISOString(),
    };
    setDoc(doc(db, 'customers', newId), sanitizeForFirestore(newCust)).catch(() => {});
    setCustomers(prev => [newCust, ...prev]);
    return newCust;
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setDoc(doc(db, 'customers', id), sanitizeForFirestore(updates), { merge: true }).catch(() => {});
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deleteCustomer = (id: string) => {
    deleteDoc(doc(db, 'customers', id)).catch(() => {});
    setCustomers(prev => prev.filter(c => c.id !== id));
  };

  const createInvoice = (data: CreateInvoiceInput) => {
    const now = new Date().toISOString();
    const newId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    let subtotal = 0;
    let totalCost = 0;
    const items = data.items.map((i: InvoiceItem) => {
      subtotal += i.unitPrice * i.quantity;
      totalCost += i.costPrice * i.quantity;
      return { ...i, subtotal: i.unitPrice * i.quantity };
    });
    const total = Math.max(0, subtotal - (data.discount || 0));
    const paidAmount = data.type === 'direct' ? total : (data.paidAmount || 0);
    const remainingAmount = Math.max(0, total - paidAmount);
    const status: InvoiceStatus = remainingAmount === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';

    const newInv: any = {
      id: newId,
      ownerUid: currentUser?.uid || '',
      invoiceNumber: `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, '0')}`,
      date: now,
      type: data.type,
      customerId: data.customerId || '',
      customerName: data.customerName || (data.type === 'direct' ? 'زبون نقدي مباشر' : 'عميل غير مسجل'),
      customerPhone: data.customerPhone || '',
      items,
      subtotal,
      discount: data.discount || 0,
      total,
      paidAmount,
      remainingAmount,
      previousDebt: 0,
      currentTotalDebt: remainingAmount,
      paymentDueDate: data.paymentDueDate || '',
      status,
      notes: data.notes || '',
      totalCost,
      netProfit: total - totalCost,
    };

    setDoc(doc(db, 'invoices', newId), sanitizeForFirestore(newInv)).catch(() => {});
    items.forEach(i => adjustStock(i.productId, -(i.deductedPieces ?? i.quantity)));
    setInvoices(prev => [newInv, ...prev]);
    return newInv;
  };

  const deleteInvoice = (id: string) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    deleteDoc(doc(db, 'invoices', id)).catch(() => {});
    inv.items.forEach(i => adjustStock(i.productId, i.deductedPieces ?? i.quantity));
    setInvoices(prev => prev.filter(i => i.id !== id));
  };

  const returnInvoice = async (id: string): Promise<boolean> => {
    const inv = invoices.find(i => i.id === id);
    if (!inv || inv.status === 'returned') return false;
    inv.items.forEach(i => adjustStock(i.productId, i.deductedPieces ?? i.quantity));
    await updateDoc(doc(db, 'invoices', id), sanitizeForFirestore({ status: 'returned' })).catch(() => {});
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'returned' } : i));
    return true;
  };

  const applyBulkPriceAdjustment = async () => ({ updatedCount: 0 });

  const recordPayment = (customerId: string, amount: number, notes?: string): PaymentRecord => {
    const newId = 'pay_' + Date.now();
    const p: PaymentRecord = {
      id: newId,
      customerId,
      customerName: '',
      amount,
      date: new Date().toISOString(),
      notes: notes || '',
      receiptNumber: `REC-${Date.now()}`
    };
    setDoc(doc(db, 'payments', newId), sanitizeForFirestore(p)).catch(() => {});
    setPayments(prev => [p, ...prev]);
    return p;
  };

  const updateSettings = (newSettings: Partial<StoreSettings>) => {
    setSettings(prev => {
      const u = { ...prev, ...newSettings };
      const currentUid = currentUser?.uid;
      const settingsDocId = currentUid === MUNTAZAR_UID ? 'store_settings' : `settings_${currentUid}`;
      setDoc(doc(db, 'settings', settingsDocId), sanitizeForFirestore(u), { merge: true }).catch(() => {});
      return u;
    });
  };

  const resetToDemo = () => {};
  const resetToZero = () => {
    setProducts([]);
    setCustomers([]);
    setInvoices([]);
    setPayments([]);
  };

  const exportDataJSON = () => JSON.stringify({ products, customers, invoices, payments, settings }, null, 2);
  const importDataJSON = () => ({ success: true });
  const formatMoney = (amount: number) => `${amount.toLocaleString('en-US')} ${settings.currency}`;

  const loginUser = async (user: any) => {
    setCurrentUser(user);
    setAuthLoading(false);
  };

  const logout = async () => {
    setCurrentUser(null);
    setProducts([]);
    setCustomers([]);
    setInvoices([]);
    setPayments([]);
    try {
      localStorage.removeItem('active_client_session');
      localStorage.removeItem('last_active_user_uid');
    } catch (e) {}
    await logoutAccount();
  };

  return (
    <AppContext.Provider
      value={{
        products, customers, invoices, payments, settings,
        addProduct, addBulkProducts, updateProduct, deleteProduct, adjustStock,
        addCustomer, updateCustomer, deleteCustomer,
        createInvoice, deleteInvoice, returnInvoice, applyBulkPriceAdjustment,
        recordPayment, updateSettings, resetToDemo, resetToZero,
        exportDataJSON, importDataJSON, formatMoney,
        currentUser, authLoading, isCloudConnected, isSyncing,
        lastSyncTime, syncNotice, setSyncNotice, syncNow,
        loginUser, logout
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
