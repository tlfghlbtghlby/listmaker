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
  currentUser: User | null;
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

// Recursively remove undefined values so Firestore setDoc/updateDoc never fails
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isCloudConnected, setIsCloudConnected] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // 1. Initial Local Backup Read for instant 0ms startup
  useEffect(() => {
    try {
      const itemsRaw = localStorage.getItem('items_backup');
      if (itemsRaw) setProducts(JSON.parse(itemsRaw));
      const invRaw = localStorage.getItem('invoices_backup');
      if (invRaw) setInvoices(JSON.parse(invRaw));
      const custRaw = localStorage.getItem('customers_backup');
      if (custRaw) setCustomers(JSON.parse(custRaw));
      const settingsRaw = localStorage.getItem('settings_backup');
      if (settingsRaw) setSettings(JSON.parse(settingsRaw));

      const activeSession = localStorage.getItem('active_client_session');
      if (activeSession) {
        const userObj = JSON.parse(activeSession);
        setCurrentUser(userObj);

        // Fetch latest store data from server if local is empty or to reconcile
        if (userObj?.uid) {
          fetch(`/api/sync/${userObj.uid}`)
            .then(r => r.json())
            .then(res => {
              if (res.success && res.data) {
                if (Array.isArray(res.data.products) && res.data.products.length > 0) {
                  setProducts(prev => prev.length === 0 ? res.data.products : prev);
                  if (!itemsRaw) {
                    try { localStorage.setItem('items_backup', JSON.stringify(res.data.products)); } catch (e) {}
                  }
                }
                if (Array.isArray(res.data.invoices) && res.data.invoices.length > 0) {
                  setInvoices(prev => prev.length === 0 ? res.data.invoices : prev);
                }
                if (Array.isArray(res.data.customers) && res.data.customers.length > 0) {
                  setCustomers(prev => prev.length === 0 ? res.data.customers : prev);
                }
                if (res.data.settings && !settingsRaw) {
                  setSettings(prev => ({ ...prev, ...res.data.settings }));
                }
              }
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Local storage backup read notice:", e);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // 2. Real-time Listeners (READ ONLY - NO WRITES to prevent infinite loop)
  useEffect(() => {
    // A) Listen to items (products) collection
    const unsubItems = onSnapshot(collection(db, 'items'), (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Product));
      setProducts(list);
      try {
        localStorage.setItem('items_backup', JSON.stringify(list));
      } catch (e) {}
      setIsCloudConnected(true);
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, (err) => {
      console.warn("Firestore items onSnapshot notice:", err);
      setIsCloudConnected(false);
    });

    // B) Listen to invoices collection
    const unsubInvoices = onSnapshot(collection(db, 'invoices'), (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Invoice));
      setInvoices(list);
      try {
        localStorage.setItem('invoices_backup', JSON.stringify(list));
      } catch (e) {}
      setIsCloudConnected(true);
    }, (err) => {
      console.warn("Firestore invoices onSnapshot notice:", err);
    });

    // C) Listen to customers collection
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Customer));
      setCustomers(list);
      try {
        localStorage.setItem('customers_backup', JSON.stringify(list));
      } catch (e) {}
      setIsCloudConnected(true);
    }, (err) => {
      console.warn("Firestore customers onSnapshot notice:", err);
    });

    // D) Listen to store settings document
    const unsubSettings = onSnapshot(doc(db, 'settings', 'store_settings'), (docSnap) => {
      if (docSnap.exists()) {
        const cloudSettings = docSnap.data() as StoreSettings;
        setSettings(prev => ({ ...prev, ...cloudSettings }));
        try {
          localStorage.setItem('settings_backup', JSON.stringify(cloudSettings));
        } catch (e) {}
      }
    }, (err) => {
      console.warn("Firestore settings onSnapshot notice:", err);
    });

    return () => {
      unsubItems();
      unsubInvoices();
      unsubCustomers();
      unsubSettings();
    };
  }, []);

  // 3. Manual sync / status check (NO write loops)
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

  // 4. EVENT-DRIVEN WRITES ONLY (Direct user action -> Firestore)

  // Product CRUD
  const addProduct = (prodData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>): Product => {
    const now = new Date().toISOString();
    const newId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newProduct: Product = {
      ...prodData,
      id: newId,
      code: prodData.code.trim() || `${1000 + products.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };

    // Direct write to Firestore collection 'items' (Atomic persistent offline/online sync)
    setDoc(doc(db, 'items', newId), sanitizeForFirestore(newProduct), { merge: true }).catch(err => {
      console.warn("Firestore add product notice:", err);
    });

    setProducts(prev => {
      const updated = [newProduct, ...prev];
      try { localStorage.setItem('items_backup', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });

    // Sync to server backend
    const uid = currentUser?.uid;
    if (uid) {
      fetch(`/api/sync/${uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: [newProduct, ...products], invoices, customers, settings })
      }).catch(() => {});
    }

    return newProduct;
  };

  const addBulkProducts = async (
    itemsData: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[],
    onProgress?: (curr: number, total: number) => void
  ): Promise<{ success: boolean; count: number; products: Product[] }> => {
    const now = new Date().toISOString();
    const createdList: Product[] = [];
    const total = itemsData.length;

    for (let i = 0; i < itemsData.length; i++) {
      const item = itemsData[i];
      const newId = 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7) + '_' + i;
      const fullProd: Product = {
        ...item,
        id: newId,
        createdAt: now,
        updatedAt: now,
      };
      createdList.push(fullProd);

      // Non-blocking fire-and-forget write to Firestore so offline/latency never freezes execution
      setDoc(doc(db, 'items', newId), sanitizeForFirestore(fullProd), { merge: true }).catch(err => {
        console.warn("Firestore bulk add item sync notice:", err);
      });

      if (onProgress) {
        onProgress(i + 1, total);
      }
    }

    let allUpdated: Product[] = [];
    setProducts(prev => {
      allUpdated = [...createdList, ...prev];
      try {
        localStorage.setItem('items_backup', JSON.stringify(allUpdated));
      } catch (e) {}
      return allUpdated;
    });

    // Also sync updated store data to server endpoint
    const uid = currentUser?.uid;
    if (uid) {
      try {
        fetch(`/api/sync/${uid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            products: allUpdated.length > 0 ? allUpdated : [...createdList, ...products],
            invoices,
            customers,
            settings
          })
        }).catch(() => {});
      } catch (e) {}
    }

    return { success: true, count: createdList.length, products: createdList };
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    const now = new Date().toISOString();
    const finalUpdates = { ...updates, updatedAt: now };

    // Direct write to Firestore collection 'items'
    setDoc(doc(db, 'items', id), sanitizeForFirestore(finalUpdates), { merge: true }).catch(err => {
      console.warn("Firestore update product notice:", err);
    });

    setProducts(prev => {
      const updated = prev.map(item => item.id === id ? { ...item, ...finalUpdates } : item);
      try { localStorage.setItem('items_backup', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const deleteProduct = (id: string) => {
    // Direct delete from Firestore collection 'items'
    deleteDoc(doc(db, 'items', id)).catch(err => {
      console.warn("Firestore delete product notice:", err);
    });

    setProducts(prev => {
      const updated = prev.filter(item => item.id !== id);
      try { localStorage.setItem('items_backup', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
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

  // Customer CRUD
  const addCustomer = (data: Omit<Customer, 'id' | 'createdAt' | 'totalDebt'> & { initialDebt?: number }): Customer => {
    const newId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newCustomer: Customer = {
      id: newId,
      name: data.name.trim(),
      phone: data.phone.trim(),
      address: data.address?.trim() || '',
      totalDebt: data.initialDebt || 0,
      notes: data.notes?.trim() || '',
      createdAt: new Date().toISOString(),
    };

    // Direct write to Firestore collection 'customers'
    setDoc(doc(db, 'customers', newId), sanitizeForFirestore(newCustomer)).catch(err => {
      console.error("Firestore add customer error:", err);
    });

    setCustomers(prev => [newCustomer, ...prev]);
    return newCustomer;
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    // Direct write to Firestore collection 'customers'
    setDoc(doc(db, 'customers', id), sanitizeForFirestore(updates), { merge: true }).catch(err => {
      console.error("Firestore update customer error:", err);
    });

    setCustomers(prev => prev.map(cust => cust.id === id ? { ...cust, ...updates } : cust));
  };

  const deleteCustomer = (id: string) => {
    // Direct delete from Firestore collection 'customers'
    deleteDoc(doc(db, 'customers', id)).catch(err => {
      console.error("Firestore delete customer error:", err);
    });

    setCustomers(prev => prev.filter(cust => cust.id !== id));
  };

  // Invoicing CRUD
  const createInvoice = (data: CreateInvoiceInput): Invoice => {
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

    // 1. Direct write invoice to Firestore collection 'invoices' with complete sanitation
    const firestoreInvoicePayload = sanitizeForFirestore(newInvoice);
    setDoc(doc(db, 'invoices', newId), firestoreInvoicePayload).catch(err => {
      console.error("Firestore add invoice error:", err);
    });

    // 2. Deduct stock for each sold item directly
    items.forEach((item: InvoiceItem) => {
      const deduction = item.deductedPieces ?? item.quantity;
      adjustStock(item.productId, -deduction);
    });

    // 3. Update customer debt if credit invoice
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

    // Direct delete from Firestore collection 'invoices'
    deleteDoc(doc(db, 'invoices', id)).catch(err => {
      console.error("Firestore delete invoice error:", err);
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

  // إرجاع القائمة / مشتريات الزبون المتراجع عن الشراء
  const returnInvoice = async (id: string): Promise<boolean> => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return false;
    if (inv.status === 'returned') return false; // تم إرجاعها مسبقاً

    try {
      // 1. إعادة كميات المواد المباعة إلى رصيد المخزن تلقائياً
      inv.items.forEach((item: InvoiceItem) => {
        const returnPieces = item.deductedPieces ?? item.quantity;
        adjustStock(item.productId, returnPieces);
      });

      // 2. إذا كانت القائمة دين (آجلة)، نقوم بإنقاص دين العميل بالمبلغ المتبقي غير المسدد
      if (inv.type === 'credit' && inv.customerId && inv.remainingAmount > 0) {
        setCustomers(prev =>
          prev.map(c => {
            if (c.id === inv.customerId) {
              const adjustedDebt = Math.max(0, c.totalDebt - inv.remainingAmount);
              updateDoc(doc(db, 'customers', inv.customerId!), sanitizeForFirestore({ totalDebt: adjustedDebt })).catch(err => {
                console.error("Firestore revert customer debt error:", err);
              });
              return { ...c, totalDebt: adjustedDebt };
            }
            return c;
          })
        );
      }

      // 3. تحديث حالة الفاتورة في السحاب والمحلي إلى 'returned' (مرتجعة)
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

  // ميزة تصعيد أو تعديل أسعار كافة المواد بنسبة مئوية (مثلاً +15% أو +20% أو -10%)
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
      // تقريب لأقرب 250 أو 500 أو 100 دينار / سنت حسب القيمة لتكون الأسعار تجارية أنيقة
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
          retailPrice: newRetail,
          wholesalePrice: newWholesale,
          costPrice: newCost,
          updatedAt: new Date().toISOString(),
        };

        // تحديث مباشر في Firestore
        setDoc(doc(db, 'items', prod.id), sanitizeForFirestore(updatedItem)).catch(err => {
          console.error(`Firestore update item ${prod.id} error:`, err);
        });

        return updatedItem;
      }

      return prod;
    });

    setProducts(updatedProducts);
    return { updatedCount: count };
  };

  // Payment Recording
  const recordPayment = (customerId: string, amount: number, notes?: string): PaymentRecord => {
    const customer = customers.find(c => c.id === customerId);
    const count = payments.length + 1;
    const receiptNumber = `REC-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
    const newId = 'pay_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const newPayment: PaymentRecord = {
      id: newId,
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

    // Direct write to payments
    setDoc(doc(db, 'payments', newId), sanitizeForFirestore(newPayment)).catch(() => {});
    setPayments(prev => [newPayment, ...prev]);
    return newPayment;
  };

  // Settings
  const updateSettings = (newSettings: Partial<StoreSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      // Direct write to Firestore doc 'settings/store_settings'
      setDoc(doc(db, 'settings', 'store_settings'), sanitizeForFirestore(updated), { merge: true }).catch(err => {
        console.error("Firestore update settings error:", err);
      });
      try {
        localStorage.setItem('settings_backup', JSON.stringify(updated));
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
      version: '2.0',
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
      if (Array.isArray(data.products)) {
        setProducts(data.products);
        data.products.forEach((p: Product) => setDoc(doc(db, 'items', p.id), sanitizeForFirestore(p)).catch(() => {}));
      }
      if (Array.isArray(data.customers)) {
        setCustomers(data.customers);
        data.customers.forEach((c: Customer) => setDoc(doc(db, 'customers', c.id), sanitizeForFirestore(c)).catch(() => {}));
      }
      if (Array.isArray(data.invoices)) {
        setInvoices(data.invoices);
        data.invoices.forEach((inv: Invoice) => setDoc(doc(db, 'invoices', inv.id), sanitizeForFirestore(inv)).catch(() => {}));
      }
      if (Array.isArray(data.payments)) {
        setPayments(data.payments);
      }
      if (data.settings) {
        setSettings(prev => ({ ...prev, ...data.settings }));
        setDoc(doc(db, 'settings', 'store_settings'), sanitizeForFirestore(data.settings), { merge: true }).catch(() => {});
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const formatMoney = (amount: number): string => {
    return `${amount.toLocaleString('en-US')} ${settings.currency}`;
  };

  const loginUser = async (user: any) => {
    setCurrentUser(user);
    setAuthLoading(false);
  };

  const logout = async () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('active_client_session');
      localStorage.removeItem('last_active_user_uid');
    } catch (e) {}
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
