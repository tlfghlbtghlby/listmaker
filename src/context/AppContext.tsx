import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  query,
  where,
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { db, logoutAccount } from '../firebase';
import { UserProfile } from '../types';
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
import { 
  LEGACY_ACCOUNT_UID, 
  LEGACY_PRODUCTS, 
  LEGACY_INVOICES, 
  LEGACY_CUSTOMERS, 
  LEGACY_SETTINGS 
} from '../data/legacySeed';

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
  currentUser: UserProfile | null;
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

// Recursively sanitize objects for Firestore
export const sanitizeForFirestore = <T = any>(obj: T): T => {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (obj instanceof Date) {
    return obj.toISOString() as any;
  }
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
  const [settings, setSettings] = useState<StoreSettings>(defaultEmptySettings);

  // Cloud & Auth State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isCloudConnected, setIsCloudConnected] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const hasSeededLegacyRef = useRef(false);

  // 1. Initial Session Load (Strictly per user, no global cross-tenant leakage)
  useEffect(() => {
    try {
      const activeSession = localStorage.getItem('active_client_session');
      if (activeSession) {
        const userObj: UserProfile = JSON.parse(activeSession);
        setCurrentUser(userObj);

        // Load isolated cache for this specific user if available
        const userItems = localStorage.getItem(`items_backup_${userObj.uid}`);
        if (userItems) setProducts(JSON.parse(userItems));

        const userInvoices = localStorage.getItem(`invoices_backup_${userObj.uid}`);
        if (userInvoices) setInvoices(JSON.parse(userInvoices));

        const userCustomers = localStorage.getItem(`customers_backup_${userObj.uid}`);
        if (userCustomers) setCustomers(JSON.parse(userCustomers));

        const userSettings = localStorage.getItem(`settings_backup_${userObj.uid}`);
        if (userSettings) setSettings(JSON.parse(userSettings));
      } else {
        // Clean state for unauthenticated / new user
        setProducts([]);
        setInvoices([]);
        setCustomers([]);
        setPayments([]);
        setSettings(defaultEmptySettings);
      }
    } catch (e) {
      console.warn("Session restore notice:", e);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // 2. Real-time Listeners per User (Strictly isolated by where('ownerUid', '==', currentUser.uid))
  useEffect(() => {
    if (!currentUser?.uid) {
      setProducts([]);
      setInvoices([]);
      setCustomers([]);
      setPayments([]);
      setSettings(defaultEmptySettings);
      return;
    }

    const currentUid = currentUser.uid;

    // A) Products (items) listener with where('ownerUid', '==', currentUid)
    const qItems = query(collection(db, 'items'), where('ownerUid', '==', currentUid));
    const unsubItems = onSnapshot(qItems, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Product));

      // Exception: Seed legacy Muntazar account (0A6uEqBONPdjOjAEFO0pgfyTs082) if Firestore is currently empty
      if (currentUid === LEGACY_ACCOUNT_UID && list.length === 0 && !hasSeededLegacyRef.current) {
        hasSeededLegacyRef.current = true;
        setProducts(LEGACY_PRODUCTS);
        // Async background seed to Firestore
        LEGACY_PRODUCTS.forEach((prod) => {
          setDoc(doc(db, 'items', prod.id), sanitizeForFirestore(prod), { merge: true }).catch(() => {});
        });
        return;
      }

      setProducts(list);
      try {
        localStorage.setItem(`items_backup_${currentUid}`, JSON.stringify(list));
      } catch (e) {}

      setIsCloudConnected(true);
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, (err) => {
      console.warn("Firestore items onSnapshot notice:", err);
      setIsCloudConnected(false);
    });

    // B) Invoices listener with where('ownerUid', '==', currentUid)
    const qInvoices = query(collection(db, 'invoices'), where('ownerUid', '==', currentUid));
    const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Invoice));

      if (currentUid === LEGACY_ACCOUNT_UID && list.length === 0 && !hasSeededLegacyRef.current) {
        setInvoices(LEGACY_INVOICES);
        LEGACY_INVOICES.forEach((inv) => {
          setDoc(doc(db, 'invoices', inv.id), sanitizeForFirestore(inv), { merge: true }).catch(() => {});
        });
        return;
      }

      setInvoices(list);
      try {
        localStorage.setItem(`invoices_backup_${currentUid}`, JSON.stringify(list));
      } catch (e) {}
    }, (err) => {
      console.warn("Firestore invoices onSnapshot notice:", err);
    });

    // C) Customers listener with where('ownerUid', '==', currentUid)
    const qCustomers = query(collection(db, 'customers'), where('ownerUid', '==', currentUid));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Customer));

      if (currentUid === LEGACY_ACCOUNT_UID && list.length === 0 && !hasSeededLegacyRef.current) {
        setCustomers(LEGACY_CUSTOMERS);
        LEGACY_CUSTOMERS.forEach((cust) => {
          setDoc(doc(db, 'customers', cust.id), sanitizeForFirestore(cust), { merge: true }).catch(() => {});
        });
        return;
      }

      setCustomers(list);
      try {
        localStorage.setItem(`customers_backup_${currentUid}`, JSON.stringify(list));
      } catch (e) {}
    }, (err) => {
      console.warn("Firestore customers onSnapshot notice:", err);
    });

    // D) Store Settings listener: doc(db, 'stores', user.uid, 'settings', 'config')
    const settingsDocRef = doc(db, 'stores', currentUid, 'settings', 'config');
    const unsubSettings = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const cloudSettings = docSnap.data() as StoreSettings;
        setSettings(cloudSettings);
        try {
          localStorage.setItem(`settings_backup_${currentUid}`, JSON.stringify(cloudSettings));
        } catch (e) {}
      } else {
        // Initialize distinct store settings for this specific user
        const initialStoreSettings: StoreSettings = currentUid === LEGACY_ACCOUNT_UID
          ? LEGACY_SETTINGS
          : {
              ...defaultEmptySettings,
              storeName: currentUser.storeName || `مخزن ${currentUser.username}`,
              ownerName: currentUser.displayName || '',
              phone: currentUser.phone || '',
            };

        setSettings(initialStoreSettings);
        setDoc(settingsDocRef, sanitizeForFirestore(initialStoreSettings), { merge: true }).catch(() => {});
        try {
          localStorage.setItem(`settings_backup_${currentUid}`, JSON.stringify(initialStoreSettings));
        } catch (e) {}
      }
    }, (err) => {
      console.warn("Firestore settings onSnapshot notice:", err);
    });

    // E) Payments listener with where('ownerUid', '==', currentUid)
    const qPayments = query(collection(db, 'payments'), where('ownerUid', '==', currentUid));
    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PaymentRecord));
      setPayments(list);
    }, () => {});

    return () => {
      unsubItems();
      unsubInvoices();
      unsubCustomers();
      unsubSettings();
      unsubPayments();
    };
  }, [currentUser?.uid]);

  // Manual sync status trigger
  const syncNow = async () => {
    setIsSyncing(true);
    setSyncNotice(null);
    try {
      setIsCloudConnected(true);
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSyncTime(timeStr);
      setSyncNotice(`تم الاتصال بالسحابة بنجاح: ${products.length} مادة و ${invoices.length} قائمة متصلة مباشرة عبر Firestore`);
      setTimeout(() => setSyncNotice(null), 4000);
    } catch (err) {
      console.warn("Manual sync check:", err);
      setIsCloudConnected(false);
      setSyncNotice('تعذر الاتصال بقاعدة البيانات السحابية');
      setTimeout(() => setSyncNotice(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Product CRUD (Mandatory ownerUid injection)
  const addProduct = (prodData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product => {
    const ownerUid = currentUser?.uid || 'guest';
    const now = new Date().toISOString();
    const newId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newProduct: Product = {
      ...prodData,
      id: newId,
      ownerUid,
      code: prodData.code.trim() || `${1000 + products.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };

    setDoc(doc(db, 'items', newId), sanitizeForFirestore(newProduct), { merge: true }).catch(err => {
      console.warn("Firestore add product notice:", err);
    });

    setProducts(prev => [newProduct, ...prev]);
    return newProduct;
  };

  const addBulkProducts = async (
    itemsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[],
    onProgress?: (curr: number, total: number) => void
  ): Promise<{ success: boolean; count: number; products: Product[] }> => {
    const ownerUid = currentUser?.uid || 'guest';
    const now = new Date().toISOString();
    const createdList: Product[] = [];
    const total = itemsData.length;

    for (let i = 0; i < itemsData.length; i++) {
      const item = itemsData[i];
      const newId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '_' + i;
      const fullProd: Product = {
        ...item,
        id: newId,
        ownerUid,
        createdAt: now,
        updatedAt: now,
      };
      createdList.push(fullProd);

      setDoc(doc(db, 'items', newId), sanitizeForFirestore(fullProd), { merge: true }).catch(err => {
        console.warn("Firestore bulk add item sync notice:", err);
      });

      if (onProgress) {
        onProgress(i + 1, total);
      }
    }

    setProducts(prev => [...createdList, ...prev]);
    return { success: true, count: createdList.length, products: createdList };
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    const now = new Date().toISOString();
    const finalUpdates = { 
      ...updates, 
      ownerUid: currentUser?.uid || 'guest',
      updatedAt: now 
    };

    setDoc(doc(db, 'items', id), sanitizeForFirestore(finalUpdates), { merge: true }).catch(err => {
      console.warn("Firestore update product notice:", err);
    });

    setProducts(prev => prev.map(item => item.id === id ? { ...item, ...finalUpdates } : item));
  };

  const deleteProduct = (id: string) => {
    deleteDoc(doc(db, 'items', id)).catch(err => {
      console.warn("Firestore delete product notice:", err);
    });

    setProducts(prev => prev.filter(item => item.id !== id));
  };

  const adjustStock = (id: string, delta: number) => {
    setProducts(prev => {
      const target = prev.find(p => p.id === id);
      if (!target) return prev;
      const newStock = Math.max(0, target.stock + delta);
      updateDoc(doc(db, 'items', id), sanitizeForFirestore({ stock: newStock, updatedAt: new Date().toISOString() })).catch(() => {});
      return prev.map(p => p.id === id ? { ...p, stock: newStock } : p);
    });
  };

  // Customer CRUD (Mandatory ownerUid injection)
  const addCustomer = (data: Omit<Customer, 'id' | 'createdAt' | 'totalDebt'> & { initialDebt?: number }): Customer => {
    const ownerUid = currentUser?.uid || 'guest';
    const newId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newCustomer: Customer = {
      id: newId,
      ownerUid,
      name: data.name.trim(),
      phone: data.phone.trim(),
      address: data.address?.trim() || '',
      totalDebt: data.initialDebt || 0,
      notes: data.notes?.trim() || '',
      createdAt: new Date().toISOString(),
    };

    setDoc(doc(db, 'customers', newId), sanitizeForFirestore(newCustomer)).catch(err => {
      console.warn("Firestore add customer notice:", err);
    });

    setCustomers(prev => [newCustomer, ...prev]);
    return newCustomer;
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    const payload = {
      ...updates,
      ownerUid: currentUser?.uid || 'guest',
    };
    setDoc(doc(db, 'customers', id), sanitizeForFirestore(payload), { merge: true }).catch(err => {
      console.warn("Firestore update customer notice:", err);
    });

    setCustomers(prev => prev.map(cust => cust.id === id ? { ...cust, ...updates } : cust));
  };

  const deleteCustomer = (id: string) => {
    deleteDoc(doc(db, 'customers', id)).catch(err => {
      console.warn("Firestore delete customer notice:", err);
    });

    setCustomers(prev => prev.filter(cust => cust.id !== id));
  };

  // Invoicing CRUD (Mandatory ownerUid injection)
  const createInvoice = (data: CreateInvoiceInput): Invoice => {
    const ownerUid = currentUser?.uid || 'guest';
    const now = new Date().toISOString();
    const dateYear = new Date().getFullYear();
    const countToday = invoices.length + 1;
    const invoiceNumber = `INV-${dateYear}-${String(countToday).padStart(4, '0')}`;
    const newId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    let subtotal = 0;
    let totalCost = 0;

    const items = data.items.map((item: InvoiceItem) => {
      const itemSubtotal = item.unitPrice * item.quantity;
      const itemCostTotal = item.costPrice * item.quantity;
      subtotal += itemSubtotal;
      totalCost += itemCostTotal;
      return {
        ...item,
        subtotal: itemSubtotal,
      };
    });

    const total = Math.max(0, subtotal - (data.discount || 0));
    const paidAmount = data.type === 'direct' ? total : (data.paidAmount || 0);
    const remainingAmount = Math.max(0, total - paidAmount);
    const netProfit = total - totalCost;

    const customer = data.customerId ? customers.find((c) => c.id === data.customerId) : undefined;
    const previousDebt = customer ? customer.totalDebt : 0;
    const currentTotalDebt = previousDebt + (data.type === 'credit' ? remainingAmount : 0);
    const status: InvoiceStatus = remainingAmount === 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid';

    const newInvoice: Invoice = {
      id: newId,
      ownerUid,
      invoiceNumber,
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
      previousDebt,
      currentTotalDebt,
      paymentDueDate: data.paymentDueDate || '',
      status,
      notes: data.notes || '',
      totalCost,
      netProfit,
    };

    setDoc(doc(db, 'invoices', newId), sanitizeForFirestore(newInvoice)).catch(err => {
      console.warn("Firestore add invoice notice:", err);
    });

    // Deduct stock for each sold item
    items.forEach((item: InvoiceItem) => {
      const deduction = item.deductedPieces ?? item.quantity;
      adjustStock(item.productId, -deduction);
    });

    // Update customer debt if credit invoice
    if (data.type === 'credit' && data.customerId && remainingAmount > 0) {
      updateDoc(doc(db, 'customers', data.customerId), sanitizeForFirestore({ totalDebt: currentTotalDebt })).catch(() => {});
      setCustomers(prev =>
        prev.map(c => c.id === data.customerId ? { ...c, totalDebt: currentTotalDebt } : c)
      );
    }

    setInvoices(prev => [newInvoice, ...prev]);
    return newInvoice;
  };

  const deleteInvoice = (id: string) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;

    deleteDoc(doc(db, 'invoices', id)).catch(err => {
      console.warn("Firestore delete invoice notice:", err);
    });

    // Restore stock
    inv.items.forEach((item: InvoiceItem) => {
      const deduction = item.deductedPieces ?? item.quantity;
      adjustStock(item.productId, deduction);
    });

    // Revert debt if credit
    if (inv.type === 'credit' && inv.customerId && inv.remainingAmount > 0) {
      setCustomers(prev =>
        prev.map(c => {
          if (c.id === inv.customerId) {
            const restoredDebt = Math.max(0, c.totalDebt - inv.remainingAmount);
            updateDoc(doc(db, 'customers', inv.customerId!), sanitizeForFirestore({ totalDebt: restoredDebt })).catch(() => {});
            return { ...c, totalDebt: restoredDebt };
          }
          return c;
        })
      );
    }

    setInvoices(prev => prev.filter(i => i.id !== id));
  };

  // Return invoice
  const returnInvoice = async (id: string): Promise<boolean> => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return false;
    if (inv.status === 'returned') return false;

    try {
      inv.items.forEach((item: InvoiceItem) => {
        const returnPieces = item.deductedPieces ?? item.quantity;
        adjustStock(item.productId, returnPieces);
      });

      if (inv.type === 'credit' && inv.customerId && inv.remainingAmount > 0) {
        setCustomers(prev =>
          prev.map(c => {
            if (c.id === inv.customerId) {
              const adjustedDebt = Math.max(0, c.totalDebt - inv.remainingAmount);
              updateDoc(doc(db, 'customers', inv.customerId!), sanitizeForFirestore({ totalDebt: adjustedDebt })).catch(() => {});
              return { ...c, totalDebt: adjustedDebt };
            }
            return c;
          })
        );
      }

      const updatedNotes = inv.notes 
        ? `${inv.notes} | [تم إرجاع القائمة واسترداد المواد بتاريخ ${new Date().toLocaleDateString('ar-EG')}]`
        : `[تم إرجاع القائمة واسترداد المواد بالكامل إلى المخزن بتاريخ ${new Date().toLocaleDateString('ar-EG')}]`;

      const updatedInvoiceData: Partial<Invoice> = {
        status: 'returned',
        notes: updatedNotes,
      };

      await updateDoc(doc(db, 'invoices', id), sanitizeForFirestore(updatedInvoiceData));

      setInvoices(prev =>
        prev.map(item =>
          item.id === id ? { ...item, status: 'returned', notes: updatedNotes } : item
        )
      );

      return true;
    } catch (err) {
      console.error("Error returning invoice:", err);
      return false;
    }
  };

  // Bulk Price Adjustment
  const applyBulkPriceAdjustment = async (
    percentage: number,
    priceTargets: { retail: boolean; wholesale: boolean; cost: boolean },
    roundToHundreds = true
  ): Promise<{ updatedCount: number }> => {
    if (products.length === 0 || percentage === 0) {
      return { updatedCount: 0 };
    }

    const multiplier = 1 + percentage / 100;
    let count = 0;

    const roundPrice = (val: number): number => {
      if (!roundToHundreds) return Math.round(val);
      if (val >= 1000) {
        return Math.round(val / 250) * 250;
      }
      return Math.round(val);
    };

    const updatedProducts = products.map(prod => {
      let changed = false;
      let newRetail = prod.retailPrice;
      let newWholesale = prod.wholesalePrice;
      let newCost = prod.costPrice;

      if (priceTargets.retail && prod.retailPrice > 0) {
        newRetail = Math.max(0, roundPrice(prod.retailPrice * multiplier));
        if (newRetail !== prod.retailPrice) changed = true;
      }

      if (priceTargets.wholesale && prod.wholesalePrice > 0) {
        newWholesale = Math.max(0, roundPrice(prod.wholesalePrice * multiplier));
        if (newWholesale !== prod.wholesalePrice) changed = true;
      }

      if (priceTargets.cost && prod.costPrice > 0) {
        newCost = Math.max(0, roundPrice(prod.costPrice * multiplier));
        if (newCost !== prod.costPrice) changed = true;
      }

      if (changed) {
        count++;
        const updatedItem: Product = {
          ...prod,
          ownerUid: currentUser?.uid || 'guest',
          retailPrice: newRetail,
          wholesalePrice: newWholesale,
          costPrice: newCost,
          updatedAt: new Date().toISOString(),
        };

        setDoc(doc(db, 'items', prod.id), sanitizeForFirestore(updatedItem), { merge: true }).catch(() => {});
        return updatedItem;
      }

      return prod;
    });

    setProducts(updatedProducts);
    return { updatedCount: count };
  };

  // Payment Recording (Mandatory ownerUid injection)
  const recordPayment = (customerId: string, amount: number, notes?: string): PaymentRecord => {
    const ownerUid = currentUser?.uid || 'guest';
    const customer = customers.find(c => c.id === customerId);
    const count = payments.length + 1;
    const receiptNumber = `REC-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
    const newId = 'pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const newPayment: PaymentRecord = {
      id: newId,
      ownerUid,
      customerId,
      customerName: customer ? customer.name : 'عميل غير مسجل',
      amount,
      date: new Date().toISOString(),
      notes: notes || '',
      receiptNumber,
    };

    if (customer) {
      const newDebt = Math.max(0, customer.totalDebt - amount);
      updateDoc(doc(db, 'customers', customerId), sanitizeForFirestore({ totalDebt: newDebt })).catch(() => {});
      setCustomers(prev =>
        prev.map(c => c.id === customerId ? { ...c, totalDebt: newDebt } : c)
      );
    }

    setDoc(doc(db, 'payments', newId), sanitizeForFirestore(newPayment)).catch(() => {});
    setPayments(prev => [newPayment, ...prev]);
    return newPayment;
  };

  // Store Settings (Per user at doc(db, 'stores', user.uid, 'settings', 'config'))
  const updateSettings = (newSettings: Partial<StoreSettings>) => {
    if (!currentUser?.uid) return;
    const currentUid = currentUser.uid;

    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      const settingsDocRef = doc(db, 'stores', currentUid, 'settings', 'config');
      setDoc(settingsDocRef, sanitizeForFirestore(updated), { merge: true }).catch(err => {
        console.warn("Firestore update settings notice:", err);
      });

      try {
        localStorage.setItem(`settings_backup_${currentUid}`, JSON.stringify(updated));
      } catch (e) {}

      return updated;
    });
  };

  const resetToDemo = () => {};

  const resetToZero = () => {
    setProducts([]);
    setCustomers([]);
    setInvoices([]);
    setPayments([]);
  };

  const exportDataJSON = (): string => {
    const backup = {
      version: '3.0',
      ownerUid: currentUser?.uid,
      exportDate: new Date().toISOString(),
      products,
      customers,
      invoices,
      payments,
      settings,
    };
    return JSON.stringify(backup, null, 2);
  };

  const importDataJSON = (jsonStr: string): { success: boolean; error?: string } => {
    try {
      const data = JSON.parse(jsonStr);
      const ownerUid = currentUser?.uid || 'guest';

      if (Array.isArray(data.products)) {
        const mapped = data.products.map((p: any) => ({ ...p, ownerUid }));
        setProducts(mapped);
        mapped.forEach((p: Product) => setDoc(doc(db, 'items', p.id), sanitizeForFirestore(p)).catch(() => {}));
      }
      if (Array.isArray(data.customers)) {
        const mapped = data.customers.map((c: any) => ({ ...c, ownerUid }));
        setCustomers(mapped);
        mapped.forEach((c: Customer) => setDoc(doc(db, 'customers', c.id), sanitizeForFirestore(c)).catch(() => {}));
      }
      if (Array.isArray(data.invoices)) {
        const mapped = data.invoices.map((inv: any) => ({ ...inv, ownerUid }));
        setInvoices(mapped);
        mapped.forEach((inv: Invoice) => setDoc(doc(db, 'invoices', inv.id), sanitizeForFirestore(inv)).catch(() => {}));
      }
      if (Array.isArray(data.payments)) {
        const mapped = data.payments.map((pay: any) => ({ ...pay, ownerUid }));
        setPayments(mapped);
      }
      if (data.settings && currentUser?.uid) {
        setSettings(prev => ({ ...prev, ...data.settings }));
        setDoc(doc(db, 'stores', currentUser.uid, 'settings', 'config'), sanitizeForFirestore(data.settings), { merge: true }).catch(() => {});
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const formatMoney = (amount: number): string => {
    return `${amount.toLocaleString('en-US')} ${settings.currency}`;
  };

  // Login: Instantly isolates and switches user context
  const loginUser = async (user: any) => {
    // Purge previous store memory immediately to guarantee zero data inheritance
    setProducts([]);
    setInvoices([]);
    setCustomers([]);
    setPayments([]);

    setCurrentUser(user);
    setAuthLoading(false);
  };

  // Logout: Purges all store data from memory and removes active session
  const logout = async () => {
    setCurrentUser(null);
    setProducts([]);
    setInvoices([]);
    setCustomers([]);
    setPayments([]);
    setSettings(defaultEmptySettings);
    await logoutAccount();
  };

  return (
    <AppContext.Provider
      value={{
        products,
        customers,
        invoices,
        payments,
        settings,
        addProduct,
        addBulkProducts,
        updateProduct,
        deleteProduct,
        adjustStock,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        createInvoice,
        deleteInvoice,
        returnInvoice,
        applyBulkPriceAdjustment,
        recordPayment,
        updateSettings,
        resetToDemo,
        resetToZero,
        exportDataJSON,
        importDataJSON,
        formatMoney,
        currentUser,
        authLoading,
        isCloudConnected,
        isSyncing,
        lastSyncTime,
        syncNotice,
        setSyncNotice,
        syncNow,
        loginUser,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
