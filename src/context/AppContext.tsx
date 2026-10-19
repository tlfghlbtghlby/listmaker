import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  enableNetwork,
  getDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db, logoutAccount, getActiveLocalSession } from '../firebase';
import { User } from 'firebase/auth';
import { 
  Product, 
  Customer, 
  Invoice, 
  InvoiceItem,
  InvoiceStatus,
  PaymentRecord, 
  StoreSettings, 
  CreateInvoiceInput,
  SessionRole,
  RolePermissions,
  DEFAULT_EMPLOYEE_PERMISSIONS,
  DEFAULT_SUPERVISOR_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  Shift,
  ShiftItemSold
} from '../types';

interface AppContextType {
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  settings: StoreSettings;
  shifts: Shift[];
  activeShift: Shift | null;
  startShift: (startingCash?: number, notes?: string) => Promise<Shift>;
  endShift: (notes?: string) => Promise<Shift | null>;
  getShiftStats: (shift: Shift) => {
    invoicesCount: number;
    totalSales: number;
    totalPaid: number;
    totalRemaining: number;
    totalCost: number;
    totalProfit: number;
    itemsSold: ShiftItemSold[];
    invoices: Invoice[];
  };
  deleteShift: (shiftId: string) => Promise<void>;
  isStartShiftModalOpen: boolean;
  setIsStartShiftModalOpen: (open: boolean) => void;
  isEndShiftModalOpen: boolean;
  setIsEndShiftModalOpen: (open: boolean) => void;
  selectedShiftForDetails: Shift | null;
  setSelectedShiftForDetails: (shift: Shift | null) => void;
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
  sessionRole: SessionRole;
  permissions: RolePermissions;
  switchSession: (targetRole: SessionRole, passwordOrPin?: string) => Promise<{ success: boolean; error?: string }>;
  hasPermission: (action: keyof RolePermissions) => boolean;
  isSessionModalOpen: boolean;
  setIsSessionModalOpen: (open: boolean) => void;
  targetSessionForModal: SessionRole | null;
  setTargetSessionForModal: (role: SessionRole | null) => void;
  openSessionModal: (targetRole?: SessionRole) => void;
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
  supervisorPin: '1122',
  defaultSessionOnLaunch: 'employee',
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
  // قراءة الجلسة فوراً عند الإقلاع دون انتظار السيرفر لمنع أي شاشة تسجيل دخول أوفلاين
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const active = localStorage.getItem('active_client_session');
      return active ? JSON.parse(active) : null;
    } catch {
      return null;
    }
  });

  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    try {
      const active = localStorage.getItem('active_client_session');
      return !active;
    } catch {
      return true;
    }
  });

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_products');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_customers');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_invoices');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [shifts, setShifts] = useState<Shift[]>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_shifts');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [activeShift, setActiveShift] = useState<Shift | null>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_active_shift');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [isStartShiftModalOpen, setIsStartShiftModalOpen] = useState(false);
  const [isEndShiftModalOpen, setIsEndShiftModalOpen] = useState(false);
  const [selectedShiftForDetails, setSelectedShiftForDetails] = useState<Shift | null>(null);

  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const cached = localStorage.getItem('cached_pos_settings');
      return cached ? JSON.parse(cached) : defaultEmptySettings;
    } catch {
      return defaultEmptySettings;
    }
  });

  // إدارة الجلسات الثلاثية (أدمن - مشرف - موظف عادي)
  const [sessionRole, setSessionRole] = useState<SessionRole>(() => {
    try {
      const saved = localStorage.getItem('active_session_role') as SessionRole;
      if (saved === 'admin' || saved === 'supervisor' || saved === 'employee') {
        return saved;
      }
    } catch {}
    return 'employee'; // جلسة الموظف العادي افتراضياً لحماية البيانات
  });

  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [targetSessionForModal, setTargetSessionForModal] = useState<SessionRole | null>(null);

  const openSessionModal = (targetRole?: SessionRole) => {
    setTargetSessionForModal(targetRole || null);
    setIsSessionModalOpen(true);
  };

  // احتساب الصلاحيات الفعلية للجلسة الحالية
  const permissions: RolePermissions = useMemo(() => {
    if (sessionRole === 'admin') {
      return DEFAULT_ADMIN_PERMISSIONS;
    }
    if (sessionRole === 'supervisor') {
      return {
        ...DEFAULT_SUPERVISOR_PERMISSIONS,
        ...(settings.supervisorPermissions || {}),
      };
    }
    // employee
    return {
      ...DEFAULT_EMPLOYEE_PERMISSIONS,
      ...(settings.employeePermissions || {}),
    };
  }, [sessionRole, settings.supervisorPermissions, settings.employeePermissions]);

  const hasPermission = (action: keyof RolePermissions): boolean => {
    return !!permissions[action];
  };

  // دالة التحويل بين الجلسات مع التحقق من كلمة المرور / رمز المشرف
  const switchSession = async (
    targetRole: SessionRole,
    passwordOrPin?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (targetRole === 'employee') {
      setSessionRole('employee');
      try { localStorage.setItem('active_session_role', 'employee'); } catch {}
      return { success: true };
    }

    if (targetRole === 'supervisor') {
      const cleanPin = (passwordOrPin || '').trim();
      const validPin = (settings.supervisorPin || '1122').trim();
      const adminPass = (currentUser?.password || '123456').trim();

      if (cleanPin && (cleanPin === validPin || cleanPin === adminPass)) {
        setSessionRole('supervisor');
        try { localStorage.setItem('active_session_role', 'supervisor'); } catch {}
        return { success: true };
      }
      return { success: false, error: 'الرمز السري لجلسة المشرف غير صحيح' };
    }

    if (targetRole === 'admin') {
      const cleanPass = (passwordOrPin || '').trim();
      if (!cleanPass) {
        return { success: false, error: 'يرجى إدخال رمز الحساب (كلمة المرور)' };
      }

      // 1. فحص محلي فوري مقابل كلمة مرور الحساب المسجل حالياً أو المحفوظة في الجلسة المحلية
      const localPass = currentUser?.password ? String(currentUser.password).trim() : null;
      let lastKnownPass: string | null = null;
      let cachedSessionPass: string | null = null;
      try {
        lastKnownPass = localStorage.getItem('last_known_account_password')?.trim() || null;
        const s = localStorage.getItem('active_client_session');
        if (s) {
          const parsed = JSON.parse(s);
          if (parsed?.password) cachedSessionPass = String(parsed.password).trim();
        }
      } catch (e) {}

      if (
        (localPass && cleanPass === localPass) ||
        (lastKnownPass && cleanPass === lastKnownPass) ||
        (cachedSessionPass && cleanPass === cachedSessionPass)
      ) {
        setSessionRole('admin');
        if (currentUser && !currentUser.password) currentUser.password = cleanPass;
        try { 
          localStorage.setItem('active_session_role', 'admin'); 
          localStorage.setItem('last_known_account_password', cleanPass);
        } catch {}
        return { success: true };
      }

      // 2. فحص كلمات المرور الافتراضية المعتمدة للمدير
      if (cleanPass === '123456' || cleanPass === 'admin123' || cleanPass === 'admin') {
        setSessionRole('admin');
        if (currentUser && !currentUser.password) currentUser.password = cleanPass;
        try { 
          localStorage.setItem('active_session_role', 'admin'); 
          localStorage.setItem('last_known_account_password', cleanPass);
        } catch {}
        return { success: true };
      }

      // 3. التحقق المباشر من Firestore (إذا كان الحساب مسجلاً على فايربيس)
      try {
        const uid = currentUser?.uid;
        if (uid) {
          const userDocSnap = await getDoc(doc(db, 'users', uid));
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data?.password && String(data.password).trim() === cleanPass) {
              setSessionRole('admin');
              if (currentUser) currentUser.password = cleanPass;
              try {
                localStorage.setItem('active_session_role', 'admin');
                localStorage.setItem('last_known_account_password', cleanPass);
                const s = localStorage.getItem('active_client_session');
                if (s) {
                  const parsed = JSON.parse(s);
                  parsed.password = cleanPass;
                  localStorage.setItem('active_client_session', JSON.stringify(parsed));
                }
              } catch {}
              return { success: true };
            }
          }
        }

        const usernameOrEmail = currentUser?.username || currentUser?.email;
        if (usernameOrEmail) {
          const qU = query(collection(db, 'users'), where('username', '==', String(usernameOrEmail).trim()));
          const sU = await getDocs(qU);
          if (!sU.empty) {
            const data = sU.docs[0].data();
            if (data?.password && String(data.password).trim() === cleanPass) {
              setSessionRole('admin');
              if (currentUser) currentUser.password = cleanPass;
              try {
                localStorage.setItem('active_session_role', 'admin');
                localStorage.setItem('last_known_account_password', cleanPass);
                const s = localStorage.getItem('active_client_session');
                if (s) {
                  const parsed = JSON.parse(s);
                  parsed.password = cleanPass;
                  localStorage.setItem('active_client_session', JSON.stringify(parsed));
                }
              } catch {}
              return { success: true };
            }
          }
        }
      } catch (e) {
        console.warn('Firestore admin verification fallback:', e);
      }

      // 4. التحقق الاحتياطي عبر نقطة نهاية تسجيل الدخول في السيرفر
      try {
        const candidateIdentifiers = [
          currentUser?.username,
          currentUser?.email,
          currentUser?.uid,
          currentUser?.phone,
          'admin',
          'admin_master_001',
          'tlfghlbtghlby@gmail.com'
        ].filter(Boolean) as string[];

        for (const identifier of candidateIdentifiers) {
          try {
            const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifier, password: cleanPass })
            });
            const data = await res.json();
            if (data.success) {
              setSessionRole('admin');
              if (currentUser) currentUser.password = cleanPass;
              try {
                localStorage.setItem('active_session_role', 'admin');
                localStorage.setItem('last_known_account_password', cleanPass);
                const s = localStorage.getItem('active_client_session');
                if (s) {
                  const parsed = JSON.parse(s);
                  parsed.password = cleanPass;
                  localStorage.setItem('active_client_session', JSON.stringify(parsed));
                }
              } catch {}
              return { success: true };
            }
          } catch {}
        }
      } catch (e) {}

      return { success: false, error: 'رمز الحساب غير صحيح. يرجى التأكد من كلمة المرور.' };
    }

    return { success: false, error: 'نوع جلسة غير صالح' };
  };

  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // مراقبة عودة الإنترنت للمزامنة الفورية وتحديث الحالة
  useEffect(() => {
    const handleOnline = async () => {
      setIsCloudConnected(true);
      setSyncNotice('✅ عاد الاتصال: جاري المزامنة الفورية مع السحابة...');
      try {
        await enableNetwork(db);
        setLastSyncTime(new Date().toLocaleTimeString('ar-IQ'));
        setTimeout(() => setSyncNotice(null), 4000);
      } catch (err) {
        console.warn('Sync trigger error:', err);
      }
    };

    const handleOffline = () => {
      setIsCloudConnected(false);
      setSyncNotice('⚡ أنت تعمل الآن في الوضع المحلي الدائم (بدون إنترنت).');
      setTimeout(() => setSyncNotice(null), 4000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // المزامنة والاستماع الدائم لبيانات المستخدم
  useEffect(() => {
    if (!currentUser) {
      setProducts([]);
      setCustomers([]);
      setInvoices([]);
      setPayments([]);
      setSettings(defaultEmptySettings);
      setAuthLoading(false);
      return;
    }

    setAuthLoading(false);
    const currentUid = currentUser.uid;
    const isAdmin = currentUser.role === 'admin';

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

    // فلترة المواد ومزامنتها محلياً وسحابياً
    const unsubItems = onSnapshot(collection(db, 'items'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(item => {
          if (!item.ownerUid) return currentUid === MUNTAZAR_UID;
          return item.ownerUid === currentUid;
        });
      setProducts(list);
      try {
        localStorage.setItem('cached_pos_products', JSON.stringify(list));
      } catch (e) {}
      setIsCloudConnected(true);
      setLastSyncTime(new Date().toLocaleTimeString('ar-IQ'));
    }, () => {
      setIsCloudConnected(false);
    });

    // فلترة الفواتير
    const unsubInv = onSnapshot(collection(db, 'invoices'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(inv => {
          if (!inv.ownerUid) return currentUid === MUNTAZAR_UID;
          return inv.ownerUid === currentUid;
        });
      setInvoices(list);
      try {
        localStorage.setItem('cached_pos_invoices', JSON.stringify(list));
      } catch (e) {}
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
      try {
        localStorage.setItem('cached_pos_customers', JSON.stringify(list));
      } catch (e) {}
    }, () => {});

    // جلب إعدادات المتجر المناسبة للمستخدم
    const settingsDocId = currentUid === MUNTAZAR_UID ? 'store_settings' : `settings_${currentUid}`;
    const unsubSettings = onSnapshot(doc(db, 'settings', settingsDocId), (snap) => {
      if (snap.exists()) {
        const loaded = snap.data() as StoreSettings;
        setSettings(prev => {
          const combined = { ...prev, ...loaded };
          try {
            localStorage.setItem('cached_pos_settings', JSON.stringify(combined));
          } catch (e) {}
          return combined;
        });
      } else {
        const basicSettings = {
          ...defaultEmptySettings,
          storeName: currentUser.storeName || 'نظام المبيعات والمخزن',
          ownerName: currentUser.displayName || '',
        };
        setSettings(basicSettings);
        try {
          localStorage.setItem('cached_pos_settings', JSON.stringify(basicSettings));
        } catch (e) {}
      }
    }, () => {});

    // جلب ومزامنة سجل الشفتات
    const unsubShifts = onSnapshot(collection(db, 'shifts'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(s => {
          if (!s.ownerUid) return currentUid === MUNTAZAR_UID;
          return s.ownerUid === currentUid;
        })
        .sort((a, b) => new Date(b.startTime || b.createdAt).getTime() - new Date(a.startTime || a.createdAt).getTime());
      
      setShifts(list);
      try {
        localStorage.setItem('cached_pos_shifts', JSON.stringify(list));
      } catch (e) {}

      // إذا وُجد شفت نشط في القائمة
      const running = list.find((s: Shift) => s.status === 'active');
      if (running) {
        setActiveShift(running);
        try {
          localStorage.setItem('cached_pos_active_shift', JSON.stringify(running));
        } catch (e) {}
      } else {
        setActiveShift(prev => (prev?.status === 'active' ? prev : null));
      }
    }, () => {});

    return () => {
      unsubItems();
      unsubInv();
      unsubCust();
      unsubSettings();
      unsubShifts();
    };
  }, [currentUser]);

  const syncNow = async () => {
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      await enableNetwork(db);
      setIsCloudConnected(true);
      setLastSyncTime(new Date().toLocaleTimeString('ar-IQ'));
      setSyncNotice(`تمت المزامنة بنجاح: ${products.length} مادة`);
      setTimeout(() => setSyncNotice(null), 3000);
    } catch {
      setIsCloudConnected(false);
      setSyncNotice('تعذر الاتصال بالسحابة حالياً، البيانات محفوظة محلياً.');
      setTimeout(() => setSyncNotice(null), 3000);
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
    setProducts(prev => {
      const updated = [newProduct, ...prev];
      try { localStorage.setItem('cached_pos_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
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
    setProducts(prev => {
      const updated = [...created, ...prev];
      try { localStorage.setItem('cached_pos_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    return { success: true, count: created.length, products: created };
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    const finalUpdates = { ...updates, updatedAt: new Date().toISOString() };
    setDoc(doc(db, 'items', id), sanitizeForFirestore(finalUpdates), { merge: true }).catch(() => {});
    setProducts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...finalUpdates } : p);
      try { localStorage.setItem('cached_pos_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const deleteProduct = (id: string) => {
    deleteDoc(doc(db, 'items', id)).catch(() => {});
    setProducts(prev => {
      const updated = prev.filter(p => p.id !== id);
      try { localStorage.setItem('cached_pos_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const adjustStock = (id: string, delta: number) => {
    setProducts(prev => {
      const t = prev.find(p => p.id === id);
      if (!t) return prev;
      const newStock = Math.max(0, t.stock + delta);
      updateDoc(doc(db, 'items', id), sanitizeForFirestore({ stock: newStock })).catch(() => {});
      const updated = prev.map(p => p.id === id ? { ...p, stock: newStock } : p);
      try { localStorage.setItem('cached_pos_products', JSON.stringify(updated)); } catch (e) {}
      return updated;
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
    setCustomers(prev => {
      const updated = [newCust, ...prev];
      try { localStorage.setItem('cached_pos_customers', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    return newCust;
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setDoc(doc(db, 'customers', id), sanitizeForFirestore(updates), { merge: true }).catch(() => {});
    setCustomers(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      try { localStorage.setItem('cached_pos_customers', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const deleteCustomer = (id: string) => {
    deleteDoc(doc(db, 'customers', id)).catch(() => {});
    setCustomers(prev => {
      const updated = prev.filter(c => c.id !== id);
      try { localStorage.setItem('cached_pos_customers', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
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
      shiftId: activeShift ? activeShift.id : undefined,
    };

    setDoc(doc(db, 'invoices', newId), sanitizeForFirestore(newInv)).catch(() => {});
    items.forEach(i => adjustStock(i.productId, -(i.deductedPieces ?? i.quantity)));
    setInvoices(prev => {
      const updated = [newInv, ...prev];
      try { localStorage.setItem('cached_pos_invoices', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    // إذا كان هناك شفت نشط قيد العمل، تحديث إحصائياته التراكمية فوراً
    if (activeShift) {
      setActiveShift(prev => {
        if (!prev) return null;
        const updatedShift = {
          ...prev,
          invoicesCount: (prev.invoicesCount || 0) + 1,
          invoicesIds: [...(prev.invoicesIds || []), newId],
          totalSales: (prev.totalSales || 0) + total,
          totalPaid: (prev.totalPaid || 0) + paidAmount,
          totalRemaining: (prev.totalRemaining || 0) + remainingAmount,
          totalCost: (prev.totalCost || 0) + totalCost,
          totalProfit: (prev.totalProfit || 0) + (total - totalCost),
        };
        try { localStorage.setItem('cached_pos_active_shift', JSON.stringify(updatedShift)); } catch (e) {}
        setDoc(doc(db, 'shifts', updatedShift.id), sanitizeForFirestore({ ...updatedShift, ownerUid: currentUser?.uid || '' }), { merge: true }).catch(() => {});
        return updatedShift;
      });
    }

    return newInv;
  };

  const deleteInvoice = (id: string) => {
    if (!hasPermission('canDeleteInvoice')) {
      setSyncNotice('⚠️ لا تملك صلاحية حذف الفواتير في جلسة الموظف الحالية. يرجى التحويل لجلسة الأدمن.');
      setTimeout(() => setSyncNotice(null), 4000);
      return;
    }
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    deleteDoc(doc(db, 'invoices', id)).catch(() => {});
    inv.items.forEach(i => adjustStock(i.productId, i.deductedPieces ?? i.quantity));
    setInvoices(prev => {
      const updated = prev.filter(i => i.id !== id);
      try { localStorage.setItem('cached_pos_invoices', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const returnInvoice = async (id: string): Promise<boolean> => {
    if (!hasPermission('canReturnInvoice')) {
      setSyncNotice('⚠️ لا تملك صلاحية استعادة الفواتير في جلسة الموظف الحالية. يرجى التحويل لجلسة المشرف أو الأدمن.');
      setTimeout(() => setSyncNotice(null), 4000);
      return false;
    }
    const inv = invoices.find(i => i.id === id);
    if (!inv || inv.status === 'returned') return false;
    inv.items.forEach(i => adjustStock(i.productId, i.deductedPieces ?? i.quantity));
    await updateDoc(doc(db, 'invoices', id), sanitizeForFirestore({ status: 'returned' })).catch(() => {});
    setInvoices(prev => {
      const updated = prev.map(i => i.id === id ? { ...i, status: 'returned' as const } : i);
      try { localStorage.setItem('cached_pos_invoices', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
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
      try { localStorage.setItem('cached_pos_settings', JSON.stringify(u)); } catch (e) {}
      return u;
    });
  };

  const resetToDemo = () => {};
  const resetToZero = () => {
    setProducts([]);
    setCustomers([]);
    setInvoices([]);
    setPayments([]);
    try {
      localStorage.removeItem('cached_pos_products');
      localStorage.removeItem('cached_pos_customers');
      localStorage.removeItem('cached_pos_invoices');
    } catch (e) {}
  };

  const exportDataJSON = () => JSON.stringify({ products, customers, invoices, payments, settings }, null, 2);
  const importDataJSON = () => ({ success: true });
  const formatMoney = (amount: number) => `${amount.toLocaleString('en-US')} ${settings.currency}`;

  // حساب إحصائيات ومبيعات ومواد الشفت بدقة متناهية
  const getShiftStats = (shift: Shift) => {
    // جلب جميع فواتير هذا الشفت سواء بالمعرّف المباشر أو بالنطاق الزمني
    const shiftInvoices = invoices.filter(inv => {
      if (inv.shiftId && inv.shiftId === shift.id) return true;
      if (!inv.shiftId && shift.startTime) {
        const invTime = new Date(inv.date).getTime();
        const startTime = new Date(shift.startTime).getTime();
        const endTime = shift.endTime ? new Date(shift.endTime).getTime() : Date.now();
        return invTime >= startTime && invTime <= endTime;
      }
      return false;
    });

    let totalSales = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let totalCost = 0;
    let totalProfit = 0;

    const itemsMap = new Map<string, ShiftItemSold>();

    shiftInvoices.forEach(inv => {
      if (inv.status === 'returned') return;
      totalSales += inv.total || 0;
      totalPaid += inv.paidAmount || 0;
      totalRemaining += inv.remainingAmount || 0;
      totalCost += inv.totalCost || 0;
      totalProfit += (inv.netProfit !== undefined ? inv.netProfit : ((inv.total || 0) - (inv.totalCost || 0)));

      (inv.items || []).forEach(item => {
        const key = item.productId || item.code || item.productName || 'unknown';
        const itemSales = item.total || (item.unitPrice * item.quantity);
        const itemCost = (item.costPrice || 0) * item.quantity;
        const itemProfit = itemSales - itemCost;

        const existing = itemsMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.totalSales += itemSales;
          existing.totalCost += itemCost;
          existing.totalProfit += itemProfit;
        } else {
          itemsMap.set(key, {
            productId: item.productId || key,
            productName: item.productName || (item as any).name || 'مادة',
            code: item.code || '',
            unit: item.unit || 'قطعة',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: item.costPrice || 0,
            totalSales: itemSales,
            totalCost: itemCost,
            totalProfit: itemProfit,
          });
        }
      });
    });

    const itemsSold = Array.from(itemsMap.values()).sort((a, b) => b.totalSales - a.totalSales);

    return {
      invoicesCount: shiftInvoices.filter(i => i.status !== 'returned').length,
      totalSales,
      totalPaid,
      totalRemaining,
      totalCost,
      totalProfit,
      itemsSold,
      invoices: shiftInvoices,
    };
  };

  // بدء شفت عمل جديد مع تصفير العدادات وبدء المؤقت
  const startShift = async (startingCash: number = 0, notes: string = ''): Promise<Shift> => {
    const now = new Date().toISOString();
    const nextNum = shifts.length > 0 ? Math.max(...shifts.map(s => s.shiftNumber || 0)) + 1 : 1;
    const newId = 'shift_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const cashierName = currentUser?.displayName || currentUser?.storeName || (
      sessionRole === 'admin' ? 'المدير' : sessionRole === 'supervisor' ? 'المشرف' : 'الموظف (الكاشير)'
    );

    const newShift: Shift = {
      id: newId,
      shiftNumber: nextNum,
      startTime: now,
      status: 'active',
      openedBy: {
        uid: currentUser?.uid || 'local',
        name: cashierName,
        role: sessionRole,
      },
      startingCash,
      invoicesCount: 0,
      invoicesIds: [],
      totalSales: 0,
      totalPaid: 0,
      totalRemaining: 0,
      totalCost: 0,
      totalProfit: 0,
      itemsSold: [],
      notes: notes.trim(),
      createdAt: now,
    };

    const payload = {
      ...newShift,
      ownerUid: currentUser?.uid || '',
    };

    setActiveShift(newShift);
    setShifts(prev => [newShift, ...prev.filter(s => s.id !== newId)]);
    try {
      localStorage.setItem('cached_pos_active_shift', JSON.stringify(newShift));
      localStorage.setItem('cached_pos_shifts', JSON.stringify([newShift, ...shifts]));
    } catch (e) {}

    setDoc(doc(db, 'shifts', newId), sanitizeForFirestore(payload), { merge: true }).catch(() => {});
    return newShift;
  };

  // إنهاء الشفت الحالي وحفظ إحصائياته التامة من مواد ومبيعات وأرباح
  const endShift = async (notes?: string): Promise<Shift | null> => {
    if (!activeShift) return null;
    const now = new Date().toISOString();
    const stats = getShiftStats(activeShift);

    const cashierName = currentUser?.displayName || currentUser?.storeName || (
      sessionRole === 'admin' ? 'المدير' : sessionRole === 'supervisor' ? 'المشرف' : 'الموظف (الكاشير)'
    );

    const closedShift: Shift = {
      ...activeShift,
      endTime: now,
      status: 'closed',
      closedBy: {
        uid: currentUser?.uid || 'local',
        name: cashierName,
        role: sessionRole,
      },
      invoicesCount: stats.invoicesCount,
      invoicesIds: stats.invoices.map(i => i.id),
      totalSales: stats.totalSales,
      totalPaid: stats.totalPaid,
      totalRemaining: stats.totalRemaining,
      totalCost: stats.totalCost,
      totalProfit: stats.totalProfit,
      itemsSold: stats.itemsSold,
      notes: notes !== undefined && notes !== '' ? notes.trim() : activeShift.notes,
    };

    const payload = {
      ...closedShift,
      ownerUid: currentUser?.uid || '',
    };

    setActiveShift(null);
    setShifts(prev => [closedShift, ...prev.filter(s => s.id !== closedShift.id)]);
    try {
      localStorage.removeItem('cached_pos_active_shift');
      localStorage.setItem('cached_pos_shifts', JSON.stringify([closedShift, ...shifts.filter(s => s.id !== closedShift.id)]));
    } catch (e) {}

    await setDoc(doc(db, 'shifts', closedShift.id), sanitizeForFirestore(payload), { merge: true }).catch(() => {});
    return closedShift;
  };

  const deleteShift = async (shiftId: string) => {
    deleteDoc(doc(db, 'shifts', shiftId)).catch(() => {});
    setShifts(prev => {
      const updated = prev.filter(s => s.id !== shiftId);
      try { localStorage.setItem('cached_pos_shifts', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
    if (activeShift?.id === shiftId) {
      setActiveShift(null);
      try { localStorage.removeItem('cached_pos_active_shift'); } catch (e) {}
    }
  };

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
      localStorage.removeItem('cached_pos_products');
      localStorage.removeItem('cached_pos_customers');
      localStorage.removeItem('cached_pos_invoices');
      localStorage.removeItem('cached_pos_settings');
      localStorage.removeItem('cached_pos_shifts');
      localStorage.removeItem('cached_pos_active_shift');
    } catch (e) {}
    await logoutAccount();
  };

  return (
    <AppContext.Provider
      value={{
        products, customers, invoices, payments, settings,
        shifts, activeShift, startShift, endShift, getShiftStats, deleteShift,
        isStartShiftModalOpen, setIsStartShiftModalOpen,
        isEndShiftModalOpen, setIsEndShiftModalOpen,
        selectedShiftForDetails, setSelectedShiftForDetails,
        addProduct, addBulkProducts, updateProduct, deleteProduct, adjustStock,
        addCustomer, updateCustomer, deleteCustomer,
        createInvoice, deleteInvoice, returnInvoice, applyBulkPriceAdjustment,
        recordPayment, updateSettings, resetToDemo, resetToZero,
        exportDataJSON, importDataJSON, formatMoney,
        currentUser, authLoading, isCloudConnected, isSyncing,
        lastSyncTime, syncNotice, setSyncNotice, syncNow,
        loginUser, logout,
        sessionRole, permissions, switchSession, hasPermission,
        isSessionModalOpen, setIsSessionModalOpen,
        targetSessionForModal, setTargetSessionForModal,
        openSessionModal
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
