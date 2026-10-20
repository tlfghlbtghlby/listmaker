export type SaleType = 'direct' | 'credit'; // بيع مباشر (نقدي) أو بيع آجل (دين)
export type PriceType = 'retail' | 'wholesale'; // سعر البيع العادي أو سعر الجملة
export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'returned' | 'partially_returned';

export interface Product {
  id: string;
  code: string; // كود المادة أو الباركود
  name: string; // اسم المادة
  category: string; // التصنيف (غذائية، إنشائية، كهربائية، أدوات منزلية، إلخ)
  unit: string; // الوحدة (قطعة، كرتونة، كيس، كيلو، لتر، متر)
  costPrice: number; // سعر الجملة / الشراء (التكلفة)
  retailPrice: number; // سعر البيع المباشر (مفرق)
  wholesalePrice: number; // سعر بيع الجملة
  stock: number; // إجمالي القطع المتوفرة بالمخزن
  piecesPerCarton?: number; // كم يحتوي الكارتون الواحد من قطع (مثال: 6 قطع في الكارتون)
  minStock: number; // الحد الأدنى للتنبيه عند قرب النفاد
  notes?: string;
  ownerUid?: string;
  createdAt: string;
  updatedAt: string;
}

export type Item = Product;

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  totalDebt: number; // إجمالي الدين المستحق الحالي
  notes?: string;
  createdAt: string;
}

export interface InvoiceItem {
  productId: string;
  productName: string;
  name?: string; // اسم المادة (اختياري للتوافق)
  code: string;
  unit: string;
  priceType: PriceType; // سعر البيع المطبق
  unitType?: 'piece' | 'carton'; // نوع البيع: بالقطعة أو بالكرتون
  piecesPerCarton?: number; // سعة الكرتون
  deductedPieces?: number; // إجمالي القطع المخصومة من رصيد المخزن
  costPrice: number; // سعر الشراء لحساب الربح
  unitPrice: number; // سعر البيع للوحدة
  quantity: number; // الكمية الأصلية المباعة
  returnedQuantity?: number; // الكمية المسترجعة من هذا البند
  total: number; // المجموع للسطر
  isCustomPrice?: boolean; // تم تعديل السعر في هذه القائمة فقط
}

// سجل توثيق عملية استرجاع مادة معينة من القائمة مع السبب
export interface ReturnedItemRecord {
  id: string;
  productId: string;
  productName: string;
  code: string;
  unit: string;
  quantity: number; // الكمية المسترجعة في هذه العملية
  unitPrice: number; // سعر البيع وقت الشراء
  costPrice: number; // سعر التكلفة
  refundAmount: number; // المبلغ الإجمالي المخصوم لهذه المادة (quantity * unitPrice)
  reason: string; // سبب الاسترجاع (خانة السبب المطلوبة)
  notes?: string; // ملاحظات إضافية
  returnedAt: string; // تاريخ ووقت العملية
  returnedBy?: string; // منفذ العملية
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // رقم القائمة
  type: SaleType; // مباشر أم آجل
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number; // خصم نقدي
  total: number; // المبلغ الإجمالي المطلوب (بعد خصم المرتجعات إن وجدت)
  paidAmount: number; // المبلغ المسدد حالياً
  remainingAmount: number; // المبلغ المتبقي (آجل)
  previousDebt: number; // دين الزبون السابق قبل هذه الفاتورة
  currentTotalDebt: number; // إجمالي دين الزبون الجديد بعد هذه الفاتورة
  paymentDueDate?: string; // موعد استحقاق الدفع للآجل
  status: InvoiceStatus;
  notes?: string;
  date: string; // تاريخ ووقت الإنشاء
  totalCost: number; // تكلفة البضاعة المباعة
  netProfit: number; // صافي الربح المحقق (total - totalCost - discount)
  shiftId?: string; // معرف الشفت المرتبط بهذه الفاتورة
  returnedItems?: ReturnedItemRecord[]; // سجل المواد المرتجعة مع أسبابها
  totalReturnedAmount?: number; // إجمالي المبالغ المسترجعة
  isPartiallyReturned?: boolean; // وسم يوضح إذا كانت القائمة مسترجعة جزئياً
}

// مسودة قائمة نشطة أو معلقة في نقطة البيع
export interface POSDraftOrder {
  id: string;
  orderNumber: number; // رقم القائمة التسلسلي المعروض في المربع الأخضر [1]، [2]...
  cartItems: InvoiceItem[];
  saleType: SaleType;
  globalPriceType: PriceType;
  selectedCustomerId: string;
  customCustomerName: string;
  customerPhone: string;
  discount: number;
  paidAmount: number;
  dueDate: string;
  notes: string;
  updatedAt: string;
}

export interface ShiftItemSold {
  productId: string;
  productName: string;
  code: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  totalSales: number;
  totalCost: number;
  totalProfit: number;
}

export interface Shift {
  id: string;
  shiftNumber: number; // رقم تسلسلي للشفت (مثلاً شفت 1، شفت 2...)
  startTime: string; // وقت بدء الشفت
  endTime?: string; // وقت إنهاء الشفت
  status: 'active' | 'closed'; // حالة الشفت
  openedBy: {
    uid: string;
    name: string;
    role: SessionRole;
  };
  closedBy?: {
    uid: string;
    name: string;
    role: SessionRole;
  };
  startingCash?: number; // نقد البداية في القاصة
  invoicesCount: number; // عدد الفواتير الصادرة أثناء الشفت
  invoicesIds: string[]; // أرقام الفواتير
  totalSales: number; // إجمالي المبيعات (نقد + آجل)
  totalPaid: number; // إجمالي المقبوض نقداً
  totalRemaining: number; // إجمالي الآجل/الديون
  totalCost: number; // إجمالي تكلفة البضاعة المباعة
  totalProfit: number; // صافي الربح المحقق في الشفت
  itemsSold: ShiftItemSold[]; // قائمة المواد المباعة وإحصائيات كل مادة
  notes?: string;
  createdAt: string;
}

export interface CreateInvoiceInput {
  type: SaleType;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  items: InvoiceItem[];
  discount: number;
  paidAmount: number;
  paymentDueDate?: string;
  notes?: string;
}

export interface PaymentRecord {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  date: string;
  notes?: string;
  receiptNumber: string;
}

export type DeviceMode = 'desktop' | 'mobile';
export type DesktopLayoutMode = 'full' | 'partial'; // وضع الكمبيوتر الكامل | وضع الكمبيوتر الجزئي

export type UserRole = 'admin' | 'client';
export const ADMIN_EMAIL = 'tlfghlbtghlby@gmail.com';

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  displayName: string;
  storeName: string;
  phone?: string;
  password?: string;
  role: UserRole;
  isActive?: boolean;
  createdAt: string;
}

// أنواع مقاسات الورق المتاحة للطباعة
export type PrintFormatType = 'a4' | 'a5' | 'thermal' | 'thermal80' | 'thermal58';

export interface StoreSettings {
  storeName: string;
  ownerName: string;
  phone: string;
  address: string;
  currency: string; // مثلاً: د.ع (دينار عراقي) أو $ أو ر.س
  invoiceFooterNote: string;
  printFormat: PrintFormatType; // A4 أو A5 أو رول 80 مم أو رول 58 مم
  directPrintEnabled?: boolean; // تفعيل الطباعة الفورية الصامتة بدون نافذة حوار
  selectedPrinterName?: string; // اسم طابعة الكاشير المحددة للطباعة اللحظية في أقل من ثانية
  printerPaperSize?: PrintFormatType | string; // مقاس ورق الطابعة
  enableWholesale: boolean; // تفعيل أو إلغاء إظهار سعر بيع الجملة
  deviceMode: DeviceMode; // وضع الحاسبة أو وضع الهاتف (Android / iPhone)
  desktopLayout: DesktopLayoutMode; // 'full' = وضع الكمبيوتر الكامل, 'partial' = وضع الكمبيوتر الجزئي
  
  // تخصيص نصوص وترويسة القائمة حسب رغبة صاحب المحل
  headerRightSealText?: string; // مثلاً "جملة" أو "تجزئة" أو "مورد"
  headerLeftSealText?: string; // مثلاً "مفرد" أو "قطع" أو "نقد"
  businessSubtitle?: string; // مثلاً "تجارة عامة وبيع الجملة والمفرد"
  managerLabel?: string; // مثلاً "بإدارة" أو "إشراف" أو "المدير العام"

  // إعدادات جلسات الموظفين والمشرفين
  supervisorPin?: string; // الرمز السري لجلسة المشرف
  employeePermissions?: Partial<RolePermissions>; // تخصيص صلاحيات الموظف
  supervisorPermissions?: Partial<RolePermissions>; // تخصيص صلاحيات المشرف
  defaultSessionOnLaunch?: SessionRole; // الجلسة الافتراضية عند فتح البرنامج
}

// اسم مستعار لضمان التوافق مع أي استدعاء باسم Settings في التطبيق
export type Settings = StoreSettings;

export type SessionRole = 'admin' | 'supervisor' | 'employee';

export interface RolePermissions {
  canSell: boolean; // البيع وإعداد الفواتير
  canAddNewProduct: boolean; // إضافة مادة جديدة للمخزن
  canEditProductPrice: boolean; // تعديل السعر في القائمة للزبون
  canViewInvoices: boolean; // معاينة سجل الفواتير والقوائم
  canReturnInvoice: boolean; // استعادة الفاتورة للمخزن
  canDeleteInvoice: boolean; // حذف الفاتورة نهائياً
  canViewCustomers: boolean; // الدخول لسجل الديون والعملاء
  canViewReports: boolean; // الدخول لسجل الأرباح والتقارير المالية
  canAccessSettings: boolean; // الدخول لشاشة الإعدادات
  canAccessInventory: boolean; // الدخول لجدول المخزن الكامل
  canAccessShifts: boolean; // الدخول لسجل وتبويب الشفتات
  canManageShifts: boolean; // بدء وإنهاء الشفت وحفظه
}

export const DEFAULT_EMPLOYEE_PERMISSIONS: RolePermissions = {
  canSell: true,
  canAddNewProduct: true,
  canEditProductPrice: true,
  canViewInvoices: true,
  canReturnInvoice: false,
  canDeleteInvoice: false,
  canViewCustomers: false,
  canViewReports: false,
  canAccessSettings: false,
  canAccessInventory: true,
  canAccessShifts: true,
  canManageShifts: true,
};

export const DEFAULT_SUPERVISOR_PERMISSIONS: RolePermissions = {
  canSell: true,
  canAddNewProduct: true,
  canEditProductPrice: true,
  canViewInvoices: true,
  canReturnInvoice: true,
  canDeleteInvoice: false,
  canViewCustomers: true,
  canViewReports: false,
  canAccessSettings: false,
  canAccessInventory: true,
  canAccessShifts: true,
  canManageShifts: true,
};

export const DEFAULT_ADMIN_PERMISSIONS: RolePermissions = {
  canSell: true,
  canAddNewProduct: true,
  canEditProductPrice: true,
  canViewInvoices: true,
  canReturnInvoice: true,
  canDeleteInvoice: true,
  canViewCustomers: true,
  canViewReports: true,
  canAccessSettings: true,
  canAccessInventory: true,
  canAccessShifts: true,
  canManageShifts: true,
};
