import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Product, SaleType, PriceType, InvoiceItem, Invoice } from '../types';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  Receipt, 
  UserCheck, 
  CreditCard, 
  DollarSign, 
  AlertCircle, 
  Calendar, 
  CheckCircle2, 
  Tag, 
  Clock, 
  Printer, 
  Settings,
  ArrowLeft,
  ArrowRight,
  Scan,
  UserPlus,
  Pencil,
  Box,
  Save,
  X,
  Package
} from 'lucide-react';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface POSViewProps {
  onInvoiceCreated: (invoice: Invoice) => void;
  onOpenNewProduct: (initialBarcode?: string) => void;
  onEditProduct?: (product: Product) => void;
  onOpenSettings?: () => void;
}

// Scanner Audio Feedback using Web Audio API
const playScannerBeep = (type: 'success' | 'alert' = 'success') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1700, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(450, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    // Autoplay policy or unsupported
  }
};

export const POSView: React.FC<POSViewProps> = ({ onInvoiceCreated, onOpenNewProduct, onEditProduct, onOpenSettings }) => {
  const { products, customers, createInvoice, updateSettings, formatMoney, settings, addCustomer, updateProduct } = useApp();

  // POS State
  const [saleType, setSaleType] = useState<SaleType>('direct');
  const [globalPriceType, setGlobalPriceType] = useState<PriceType>('retail');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');
  
  // Cart Items
  const [cartItems, setCartItems] = useState<InvoiceItem[]>([]);
  
  // Customer info for sale
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customCustomerName, setCustomCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  
  // Quick Add Customer Modal State
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');
  const [quickCustomerAddress, setQuickCustomerAddress] = useState('');
  const [quickCustomerInitialDebt, setQuickCustomerInitialDebt] = useState<number | ''>('');
  const [quickCustomerError, setQuickCustomerError] = useState('');

  // Quick Price Edit Modal State (تعديل السعر المباشر من بطاقة المادة)
  const [productForPriceEdit, setProductForPriceEdit] = useState<Product | null>(null);
  const [editRetailPrice, setEditRetailPrice] = useState<number | ''>('');
  const [editWholesalePrice, setEditWholesalePrice] = useState<number | ''>('');
  const [editCostPrice, setEditCostPrice] = useState<number | ''>('');
  const [editPiecesPerCarton, setEditPiecesPerCarton] = useState<number | ''>('');

  const handleOpenPriceEdit = (prod: Product) => {
    setProductForPriceEdit(prod);
    setEditRetailPrice(prod.retailPrice);
    setEditWholesalePrice(prod.wholesalePrice);
    setEditCostPrice(prod.costPrice);
    setEditPiecesPerCarton(prod.piecesPerCarton || 1);
  };

  const handleSavePriceEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForPriceEdit) return;

    const newRetail = typeof editRetailPrice === 'number' ? editRetailPrice : productForPriceEdit.retailPrice;
    const newWholesale = typeof editWholesalePrice === 'number' ? editWholesalePrice : productForPriceEdit.wholesalePrice;
    const newCost = typeof editCostPrice === 'number' ? editCostPrice : productForPriceEdit.costPrice;
    const newCarton = typeof editPiecesPerCarton === 'number' && editPiecesPerCarton > 0 ? editPiecesPerCarton : (productForPriceEdit.piecesPerCarton || 1);

    updateProduct(productForPriceEdit.id, {
      retailPrice: newRetail,
      wholesalePrice: newWholesale,
      costPrice: newCost,
      piecesPerCarton: newCarton,
    });

    // Also update any item in the active cart with this product
    setCartItems(prev => prev.map(item => {
      if (item.productId === productForPriceEdit.id) {
        const isWholesale = item.priceType === 'wholesale';
        const basePiece = isWholesale ? newWholesale : newRetail;
        const isCarton = item.unitType === 'carton';
        const effectiveUnit = isCarton ? basePiece * newCarton : basePiece;
        return {
          ...item,
          costPrice: newCost,
          piecesPerCarton: newCarton,
          unitPrice: effectiveUnit,
          deductedPieces: isCarton ? item.quantity * newCarton : item.quantity,
          total: item.quantity * effectiveUnit,
        };
      }
      return item;
    }));

    setScanNotice(`تم تحديث أسعار مادة "${productForPriceEdit.name}" بنجاح`);
    setTimeout(() => setScanNotice(null), 3000);
    setProductForPriceEdit(null);
  };

  // Barcode scanner & instant feedback
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [cartErrorNotice, setCartErrorNotice] = useState<string | null>(null);
  const [unfoundBarcodePrompt, setUnfoundBarcodePrompt] = useState<string | null>(null);

  // Financial modifiers
  const [discount, setDiscount] = useState<number>(0);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState<string>('');

  // Categories list
  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category));
    return ['all', ...Array.from(set)];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      const matchCat = selectedCategory === 'all' || prod.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        prod.name.toLowerCase().includes(q) ||
        prod.code.toLowerCase().includes(q) ||
        prod.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Selected customer details
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Update customer selection
  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    if (id) {
      const cust = customers.find((c) => c.id === id);
      if (cust) {
        setCustomCustomerName(cust.name);
        setCustomerPhone(cust.phone);
      }
    } else {
      setCustomCustomerName('');
      setCustomerPhone('');
    }
  };

  const handleOpenQuickAddCustomer = (presetName?: string) => {
    setQuickCustomerName(presetName ?? (customCustomerName.trim() || ''));
    setQuickCustomerPhone(customerPhone.trim() || '');
    setQuickCustomerAddress('');
    setQuickCustomerInitialDebt('');
    setQuickCustomerError('');
    setShowQuickAddModal(true);
  };

  const handleSaveQuickCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = quickCustomerName.trim();
    if (!cleanName) {
      setQuickCustomerError('يرجى إدخال اسم الزبون');
      return;
    }

    const created = addCustomer({
      name: cleanName,
      phone: quickCustomerPhone.trim(),
      address: quickCustomerAddress.trim(),
      initialDebt: typeof quickCustomerInitialDebt === 'number' ? quickCustomerInitialDebt : 0,
    });

    setSelectedCustomerId(created.id);
    setCustomCustomerName(created.name);
    setCustomerPhone(created.phone);
    setShowQuickAddModal(false);
    setScanNotice(`تمت إضافة واعتماد الزبون "${created.name}" في النظام بنجاح`);
    setTimeout(() => setScanNotice(null), 4000);
  };

  // Add product to cart with chosen price type
  const addToCartWithPrice = (product: Product, priceType: PriceType, delta = 1) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.productId === product.id);
      const piecePrice = priceType === 'wholesale' ? product.wholesalePrice : product.retailPrice;

      if (existingIndex > -1) {
        const target = prev[existingIndex];
        const newQty = target.quantity + delta;
        const cartonCap = target.piecesPerCarton || product.piecesPerCarton || 1;
        const deductedPieces = target.unitType === 'carton' ? newQty * cartonCap : newQty;
        const updatedItem: InvoiceItem = {
          ...target,
          quantity: newQty,
          deductedPieces,
          total: newQty * target.unitPrice,
        };

        const otherItems = prev.filter((_, idx) => idx !== existingIndex);
        return [updatedItem, ...otherItems];
      } else {
        const cartonCap = product.piecesPerCarton || 1;
        const newItem: InvoiceItem = {
          productId: product.id,
          productName: product.name,
          code: product.code,
          unit: product.unit,
          priceType: priceType,
          unitType: 'piece',
          piecesPerCarton: cartonCap,
          deductedPieces: delta,
          costPrice: product.costPrice,
          unitPrice: piecePrice,
          quantity: delta,
          total: delta * piecePrice,
        };
        return [newItem, ...prev];
      }
    });
  };

  const addToCart = (product: Product, delta = 1) => {
    addToCartWithPrice(product, globalPriceType, delta);
  };

  const handleBarcodeScanned = (scannedCode: string) => {
    const clean = scannedCode.trim();
    if (!clean) return;

    const matched = products.find((p) => p.code.toLowerCase() === clean.toLowerCase())
      || products.find((p) => p.code === clean);

    if (matched) {
      playScannerBeep('success');
      addToCartWithPrice(matched, globalPriceType, 1);
      setSearchQuery('');
      setUnfoundBarcodePrompt(null);
      setScanNotice(`تم مسح الباركود #${clean}: زيادة كمية "${matched.name}" في القائمة (+1)`);
      setTimeout(() => setScanNotice(null), 3000);
    } else {
      playScannerBeep('alert');
      setSearchQuery('');
      setUnfoundBarcodePrompt(clean);
      setScanNotice(`الرمز الشريطي #${clean} غير مسجل في المخزن`);
      setTimeout(() => setScanNotice(null), 5000);
    }
  };

  const handleBarcodeScannedRef = useRef(handleBarcodeScanned);
  useEffect(() => {
    handleBarcodeScannedRef.current = handleBarcodeScanned;
  });

  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (showQuickAddModal || isScannerOpen || !!unfoundBarcodePrompt) return;

      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      const now = Date.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 2) {
          e.preventDefault();
          const scanned = buffer.trim();
          buffer = '';
          handleBarcodeScannedRef.current(scanned);
        }
        return;
      }

      if (e.key.length === 1) {
        if (diff > 120 && buffer.length > 0) {
          buffer = '';
        }
        if (!isInput || diff < 50) {
          buffer += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showQuickAddModal, isScannerOpen, unfoundBarcodePrompt]);

  const updateQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const cartonCap = item.piecesPerCarton || 1;
          const isCarton = item.unitType === 'carton';
          const deductedPieces = isCarton ? newQty * cartonCap : newQty;
          return {
            ...item,
            quantity: newQty,
            deductedPieces,
            total: newQty * item.unitPrice,
          };
        }
        return item;
      })
    );
  };

  const toggleItemUnitType = (productId: string, newUnitType: 'piece' | 'carton') => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const cartonCapacity = Math.max(1, prod.piecesPerCarton || 1);

    setCartItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const piecePrice = item.priceType === 'wholesale' ? prod.wholesalePrice : prod.retailPrice;
          const pieceCost = prod.costPrice;
          const isCarton = newUnitType === 'carton';
          const effectiveUnitPrice = isCarton ? piecePrice * cartonCapacity : piecePrice;
          const effectiveCostPrice = isCarton ? pieceCost * cartonCapacity : pieceCost;
          const deductedPieces = isCarton ? item.quantity * cartonCapacity : item.quantity;
          const total = item.quantity * effectiveUnitPrice;

          return {
            ...item,
            unitType: newUnitType,
            piecesPerCarton: cartonCapacity,
            unitPrice: effectiveUnitPrice,
            costPrice: effectiveCostPrice,
            deductedPieces,
            total,
          };
        }
        return item;
      })
    );
  };

  const toggleItemPriceType = (productId: string, newPriceType: PriceType) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    setCartItems((prev) =>
      prev.map((item) => {
        if (item.productId === productId) {
          const cartonCap = item.piecesPerCarton || prod.piecesPerCarton || 1;
          const isCarton = item.unitType === 'carton';
          const basePiecePrice = newPriceType === 'wholesale' ? prod.wholesalePrice : prod.retailPrice;
          const newUnitPrice = isCarton ? basePiecePrice * cartonCap : basePiecePrice;

          return {
            ...item,
            priceType: newPriceType,
            unitPrice: newUnitPrice,
            total: item.quantity * newUnitPrice,
          };
        }
        return item;
      })
    );
  };

  const handleGlobalPriceTypeChange = (type: PriceType) => {
    setGlobalPriceType(type);
    setCartItems((prev) =>
      prev.map((item) => {
        const prod = products.find((p) => p.id === item.productId);
        if (!prod) return item;
        const newUnitPrice = type === 'wholesale' ? prod.wholesalePrice : prod.retailPrice;
        return {
          ...item,
          priceType: type,
          unitPrice: newUnitPrice,
          total: item.quantity * newUnitPrice,
        };
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    setCartItems([]);
    setDiscount(0);
    setPaidAmount(0);
    setNotes('');
  };

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.total, 0);
  }, [cartItems]);

  const totalCost = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.costPrice * item.quantity, 0);
  }, [cartItems]);

  const finalTotal = Math.max(0, subtotal - discount);
  const estimatedProfit = finalTotal - totalCost;

  const actualPaidAmount = saleType === 'direct' ? finalTotal : Math.min(paidAmount, finalTotal);
  const remainingDebt = Math.max(0, finalTotal - actualPaidAmount);
  const previousCustomerDebt = selectedCustomer ? selectedCustomer.totalDebt : 0;
  const newCustomerDebt = previousCustomerDebt + remainingDebt;

  // Handle Submit
  const handleSaveInvoice = (andPrint: boolean) => {
    if (cartItems.length === 0) {
      setCartErrorNotice('الرجاء إضافة مادة واحدة على الأقل إلى القائمة');
      setTimeout(() => setCartErrorNotice(null), 4000);
      return;
    }

    let finalCustomerId: string | undefined = selectedCustomerId || undefined;
    let finalCustomerName = customCustomerName.trim();
    let finalCustomerPhone = customerPhone.trim();

    if (saleType === 'credit') {
      let activeCustomer = selectedCustomer;

      if (!activeCustomer && finalCustomerName) {
        const found = customers.find(
          (c) => c.name.trim().toLowerCase() === finalCustomerName.toLowerCase()
        );
        if (found) {
          activeCustomer = found;
          finalCustomerId = found.id;
          setSelectedCustomerId(found.id);
        }
      }

      if (!activeCustomer || !finalCustomerId) {
        setCartErrorNotice(
          'لا يمكن البيع بالآجل إلا لزبون مضاف اسمه مسبقاً في النظام لضمان حفظ الديون ومتابعتها! يرجى اختيار زبون مسجل أو الضغط على زر الاقتراح.'
        );
        setTimeout(() => setCartErrorNotice(null), 6000);
        handleOpenQuickAddCustomer(finalCustomerName || undefined);
        return;
      }

      finalCustomerId = activeCustomer.id;
      finalCustomerName = activeCustomer.name;
      finalCustomerPhone = activeCustomer.phone || finalCustomerPhone;
    } else {
      if (!finalCustomerName) {
        finalCustomerName = selectedCustomer?.name || 'زبون نقدي مباشر';
      }
      if (!finalCustomerPhone && selectedCustomer) {
        finalCustomerPhone = selectedCustomer.phone || '';
      }
    }

    const created = createInvoice({
      type: saleType,
      customerId: finalCustomerId,
      customerName: finalCustomerName,
      customerPhone: finalCustomerPhone,
      items: cartItems,
      discount: discount,
      paidAmount: actualPaidAmount,
      paymentDueDate: saleType === 'credit' ? dueDate : undefined,
      notes: notes.trim(),
    });

    clearCart();
    if (saleType === 'credit') {
      setSelectedCustomerId('');
      setCustomCustomerName('');
      setCustomerPhone('');
    }

    // إرسال أمر الطباعة الصامتة المباشرة إذا كانت مفعلة في الإعدادات وكان التطبيق يعمل داخل Electron
    if (andPrint && settings.directPrintEnabled && (window as any).electronAPI?.printSilent) {
      (window as any).electronAPI.printSilent(settings.printFormat || 'thermal58');
    }

    onInvoiceCreated(created);
  };

  const isMobileMode = settings.deviceMode === 'mobile';

  return (
    <div className="flex flex-col gap-4">
      {/* Mobile Mode Switcher Tabs */}
      {isMobileMode && (
        <div className="flex items-center bg-slate-200/90 p-1 rounded-xl text-xs font-bold w-full shadow-inner">
          <button
            type="button"
            onClick={() => setMobileTab('products')}
            className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
              mobileTab === 'products'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="w-3.5 h-3.5 text-slate-600" />
            <span>تصفح المواد والبحث</span>
          </button>
          
          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer relative ${
              mobileTab === 'cart'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>فاتورة البيع الحالية</span>
            {cartItems.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                mobileTab === 'cart' ? 'bg-white text-emerald-800' : 'bg-emerald-600 text-white'
              }`}>
                {cartItems.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Main Content Grid */}
      <div className={isMobileMode ? 'flex flex-col gap-4' : 'grid grid-cols-12 gap-4 lg:gap-6'}>
        
        {/* Products Column */}
        {(!isMobileMode || mobileTab === 'products') && (
          <div className={`${isMobileMode ? 'w-full' : 'col-span-12 md:col-span-7'} flex flex-col gap-4`}>
            
            <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim()) {
                        e.preventDefault();
                        handleBarcodeScanned(searchQuery.trim());
                      }
                    }}
                    placeholder="ابحث باسم المادة أو امسح الباركود بجهاز القارئ..."
                    className="w-full pl-3 pr-10 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50/50"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-xs text-slate-400 hover:text-slate-600 absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer font-bold"
                    >
                      مسح
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                  title="مسح باركود المادة بالكاميرا لإضافتها للسلة فوراً"
                >
                  <Scan className="w-4 h-4" />
                  <span className="hidden sm:inline">مسح باركود</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenNewProduct()}
                  className="px-3 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                  title="إضافة مادة جديدة للمخزن مباشرة دون مغادرة الشاشة"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline">مادة جديدة</span>
                </button>
              </div>

              {scanNotice && (
                <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{scanNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScanNotice(null)}
                    className="text-slate-400 hover:text-slate-700 font-bold px-1"
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat === 'all' ? 'جميع المواد' : cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 flex-1 pb-24">
              {filteredProducts.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-xl border border-slate-200 p-6">
                  <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">لا توجد مواد تطابق البحث</p>
                  <p className="text-xs text-slate-400 mt-1">تأكد من كتابة الاسم بدقة</p>
                </div>
              ) : (
                filteredProducts.map((prod) => {
                  const isLowStock = prod.stock <= prod.minStock;
                  const isOutOfStock = prod.stock <= 0;

                  return (
                    <div
                      key={prod.id}
                      className={`bg-white rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition text-right group select-none relative ${
                        isOutOfStock
                          ? 'border-rose-300 bg-rose-50/20 hover:border-rose-500 hover:shadow-xs'
                          : 'border-slate-200 hover:border-emerald-500 hover:shadow-xs'
                      }`}
                    >
                      <div
                        onClick={() => addToCart(prod)}
                        className="flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                          <span
                            className={`text-xs font-black px-2.5 py-0.5 rounded-md border flex items-center gap-1 shrink-0 ${
                              isOutOfStock
                                ? 'bg-rose-100 text-rose-800 border-rose-400 animate-pulse font-mono'
                                : isLowStock
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            <Package className={`w-3.5 h-3.5 shrink-0 ${isOutOfStock ? 'text-rose-600' : ''}`} />
                            {isOutOfStock ? (
                              <span className="text-rose-700 font-black">
                                رصيد القطع: {prod.stock} {prod.unit} (تنبيه: رصيد نافد، يُسمح بالبيع)
                              </span>
                            ) : (
                              <span>المتوفر: {prod.stock} {prod.unit}</span>
                            )}
                            {prod.piecesPerCarton && prod.piecesPerCarton > 1 && !isOutOfStock && (
                              <span className="text-[10px] text-slate-500 font-normal mr-1">
                                ({Math.floor(prod.stock / prod.piecesPerCarton)} كرتون)
                              </span>
                            )}
                          </span>

                          <span className="text-[11px] font-mono text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-bold shrink-0">
                            #{prod.code}
                          </span>
                          <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded shrink-0">
                            {prod.category}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug group-hover:text-emerald-700 transition">
                            {prod.name}
                          </h3>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPriceEdit(prod);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200/90 rounded-md transition shadow-2xs shrink-0 cursor-pointer"
                            title="تعديل سعر المادة"
                          >
                            <Pencil className="w-3 h-3 text-blue-600" />
                            <span className="text-[10px] font-bold">تعديل السعر</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 shrink-0">
                        <div className="bg-slate-100 border border-slate-300/80 rounded-lg px-2.5 py-1 text-right min-w-[95px] shrink-0">
                          <div className="text-[10px] text-slate-600 font-bold">
                            سعر تكلفة الجملة:
                          </div>
                          <div className="text-xs sm:text-sm font-black text-slate-800 font-mono">
                            {formatMoney(prod.costPrice)}
                          </div>
                        </div>

                        {settings.enableWholesale && (
                          <div className="bg-amber-50/90 border border-amber-200/90 rounded-lg px-2.5 py-1 text-right min-w-[95px] shrink-0">
                            <div className="text-[10px] text-amber-800 font-bold">
                              سعر بيع الجملة:
                            </div>
                            <div className="text-xs sm:text-sm font-black text-amber-950 font-mono">
                              {formatMoney(prod.wholesalePrice)}
                            </div>
                          </div>
                        )}

                        <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-lg px-3 py-1.5 text-right min-w-[105px] shrink-0">
                          <div className="text-[10px] text-emerald-800 font-bold">
                            {settings.enableWholesale ? 'سعر بيع المفرد:' : 'سعر البيع:'}
                          </div>
                          <div className="text-xs sm:text-base font-black text-emerald-950 font-mono">
                            {formatMoney(prod.retailPrice)}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {settings.enableWholesale ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToCartWithPrice(prod, 'retail');
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer shrink-0 ${
                                  isOutOfStock
                                    ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-300'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                                title={isOutOfStock ? "إضافة بسعر المفرد (تنبيه: الرصيد صفر في المخزن)" : "إضافة بسعر البيع المفرد"}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>مفرد</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToCartWithPrice(prod, 'wholesale');
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer shrink-0 ${
                                  isOutOfStock
                                    ? 'bg-rose-700 hover:bg-rose-800 text-white ring-2 ring-rose-300'
                                    : 'bg-amber-600 hover:bg-amber-700 text-white'
                                }`}
                                title={isOutOfStock ? "إضافة بسعر الجملة (تنبيه: الرصيد صفر في المخزن)" : "إضافة بسعر بيع الجملة"}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>جملة</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCartWithPrice(prod, 'retail');
                              }}
                              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer shrink-0 ${
                                isOutOfStock
                                  ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-300'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              }`}
                              title={isOutOfStock ? "إضافة للقائمة (تنبيه: الرصيد صفر في المخزن)" : "إضافة المادة للقائمة بسعر المفرد"}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{isOutOfStock ? 'بيع (رصيد 0)' : 'إضافة للقائمة'}</span>
                            </button>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {isMobileMode && cartItems.length > 0 && mobileTab === 'products' && (
              <div className="fixed bottom-3 left-3 right-3 z-30 bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl flex items-center justify-between border border-slate-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    {cartItems.length}
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-300">مجموع القائمة:</div>
                    <div className="text-sm font-extrabold text-emerald-400 font-mono">{formatMoney(finalTotal)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileTab('cart')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <span>عرض الفاتورة والمحاسبة</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            )}

          </div>
        )}

        {/* Invoice Builder & Cart Column */}
        {(!isMobileMode || mobileTab === 'cart') && (
          <div className={`${isMobileMode ? 'w-full' : 'col-span-12 md:col-span-5 md:sticky md:top-4'} flex flex-col gap-4`}>
            
            {isMobileMode && (
              <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setMobileTab('products')}
                  className="text-xs font-bold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-100 transition"
                >
                  <ArrowRight className="w-4 h-4 text-emerald-600" />
                  <span>العودة لإضافة مواد أخرى</span>
                </button>
                <span className="text-xs font-bold text-slate-500">
                  عدد المواد في السلة: {cartItems.length}
                </span>
              </div>
            )}
            
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
          
          <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">نوع القائمة:</span>
              <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-bold">
                <button
                  onClick={() => setSaleType('direct')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                    saleType === 'direct'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>بيع مباشر (نقدي)</span>
                </button>
                <button
                  onClick={() => setSaleType('credit')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                    saleType === 'credit'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>بيع آجل (دين)</span>
                </button>
              </div>
            </div>

            {settings.enableWholesale && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                <span className="text-xs font-bold text-slate-700">سعر البيع المطبق:</span>
                <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => handleGlobalPriceTypeChange('retail')}
                    className={`px-3 py-1 rounded-md transition ${
                      globalPriceType === 'retail'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    سعر البيع العادي (تجزئة)
                  </button>
                  <button
                    onClick={() => handleGlobalPriceTypeChange('wholesale')}
                    className={`px-3 py-1 rounded-md transition ${
                      globalPriceType === 'wholesale'
                        ? 'bg-white text-emerald-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    سعر الجملة
                  </button>
                </div>
              </div>
            )}

          </div>

          <div className="flex-1 overflow-y-auto p-3 min-h-[160px] max-h-[520px] lg:max-h-[calc(100vh-320px)]">
            {cartItems.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-slate-400 text-center">
                <ShoppingCart className="w-10 h-10 mb-2 stroke-1 text-slate-300" />
                <p className="text-sm font-semibold text-slate-600">القائمة فارغة حالياً</p>
                <p className="text-xs text-slate-400 mt-0.5">انقر على أي مادة من القائمة لإضافتها</p>
              </div>
            ) : (
              <div className="space-y-2">
                {cartItems.map((item) => {
                  const itemProfit = (item.unitPrice - item.costPrice) * item.quantity;
                  const cartonCapacity = item.piecesPerCarton || 1;
                  const isCarton = item.unitType === 'carton';
                  const prodRef = products.find(p => p.id === item.productId);
                  const isStockZero = prodRef ? prodRef.stock <= 0 : false;

                  return (
                    <div
                      key={item.productId}
                      className={`border rounded-lg p-2.5 flex flex-col gap-2 ${
                        isStockZero 
                          ? 'bg-rose-50/50 border-rose-300' 
                          : 'bg-slate-50 border-slate-200/90'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 leading-snug">
                              {item.productName}
                            </span>
                            {isStockZero && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white text-[10px] font-black animate-pulse">
                                رصيد القطع صفر بالمخزن ({prodRef?.stock ?? 0})
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span>الوحدة الأساسية: {item.unit}</span>
                            <span>·</span>
                            <span className="text-emerald-700 font-medium">
                              تكلفة: {formatMoney(item.costPrice)}
                            </span>
                            {prodRef && (
                              <span className={prodRef.stock <= 0 ? "text-rose-600 font-bold" : "text-slate-600"}>
                                · رصيد المخزن: {prodRef.stock} {prodRef.unit}
                              </span>
                            )}
                            {isCarton && (
                              <span className="text-amber-800 font-bold bg-amber-100/90 px-1.5 py-0.2 rounded text-[10px]">
                                (كرتون = {cartonCapacity} قطعة)
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="inline-flex items-center bg-slate-200/80 p-0.5 rounded-md border border-slate-300 text-[10px] font-bold">
                            <button
                              type="button"
                              onClick={() => toggleItemUnitType(item.productId, 'piece')}
                              className={`px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-0.5 ${
                                !isCarton
                                  ? 'bg-white text-emerald-800 shadow-2xs font-extrabold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                              title="بيع بالقطعة"
                            >
                              <span>قطعة</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleItemUnitType(item.productId, 'carton')}
                              className={`px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1 ${
                                isCarton
                                  ? 'bg-amber-600 text-white shadow-2xs font-extrabold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                              title={`بيع بالكرتون (${cartonCapacity} قطعة)`}
                            >
                              <Box className="w-3 h-3" />
                              <span>كرتون</span>
                            </button>
                          </div>

                          {settings.enableWholesale && (
                            <button
                              type="button"
                              onClick={() =>
                                toggleItemPriceType(
                                  item.productId,
                                  item.priceType === 'retail' ? 'wholesale' : 'retail'
                                )
                              }
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition cursor-pointer ${
                                item.priceType === 'wholesale'
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-slate-200 text-slate-800 border-slate-300'
                              }`}
                              title="انقر للتبديل بين سعر التجزئة وسعر الجملة لهذه المادة"
                            >
                              {item.priceType === 'wholesale' ? 'جملة' : 'مفرد'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => removeFromCart(item.productId)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer rounded hover:bg-rose-50"
                            title="حذف المادة من القائمة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center bg-white border border-slate-300 rounded-md overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                              className="p-1 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateQuantity(item.productId, parseInt(e.target.value) || 1)
                              }
                              className="w-12 text-center text-xs font-bold py-0.5 border-x border-slate-200 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                              className="p-1 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <span className="text-[11px] font-bold text-slate-700">
                            {isCarton ? 'كرتون' : item.unit || 'قطعة'}
                          </span>
                          {isCarton && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              (= {item.deductedPieces || item.quantity * cartonCapacity} قطعة)
                            </span>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-[11px] text-slate-500">
                            {formatMoney(item.unitPrice)} × {item.quantity} =
                          </span>
                          <span className="font-extrabold text-slate-900 mr-1.5">
                            {formatMoney(item.total)}
                          </span>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col gap-3">
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>المجموع الأولي:</span>
                <span className="font-bold text-slate-800">{formatMoney(subtotal)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span>الخصم (مبلغ نقدي):</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    value={discount || ''}
                    placeholder="0"
                    onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-24 text-left px-2 py-0.5 text-xs font-bold border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span>{settings.currency}</span>
                </div>
              </div>

              <div className="flex justify-between text-base font-extrabold text-slate-900 pt-1.5 border-t border-slate-200">
                <span>المبلغ المطلوب:</span>
                <span className="text-emerald-700">{formatMoney(finalTotal)}</span>
              </div>

              <div className="text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded flex justify-between font-medium">
                <span>صافي الربح التقديري للقائمة:</span>
                <span className="font-bold">{formatMoney(estimatedProfit)}</span>
              </div>
            </div>

            <div className={`p-3 rounded-2xl border flex flex-col gap-2.5 transition ${
              saleType === 'credit'
                ? 'bg-amber-50/70 border-amber-300 shadow-2xs'
                : 'bg-slate-100/80 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className={`font-bold flex items-center gap-1.5 ${
                  saleType === 'credit' ? 'text-amber-950 font-black' : 'text-slate-800'
                }`}>
                  <UserCheck className={`w-4 h-4 ${saleType === 'credit' ? 'text-amber-700' : 'text-slate-600'}`} />
                  <span>
                    {saleType === 'credit' ? 'اختيار زبون آجل (مسجل مسبقاً):' : 'بيانات الزبون:'}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => handleOpenQuickAddCustomer(customCustomerName.trim() || undefined)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-2xs ${
                    saleType === 'credit'
                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
                  }`}
                  title="إضافة واقتراح زبون جديد للنظام للتمكن من البيع بالآجل"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ اقتراح إضافة زبون</span>
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {saleType === 'credit' ? (
                    <span className="text-amber-900">
                      قائمة الزبائن المسجلين مسبقاً <span className="text-rose-600 font-extrabold">* (إلزامي للآجل)</span>:
                    </span>
                  ) : (
                    <span>اختر زبون قديم مسجل مسبقاً (اختياري):</span>
                  )}
                </label>

                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className={`w-full text-xs bg-white border rounded-lg px-2.5 py-2 font-bold focus:outline-none focus:ring-2 ${
                    saleType === 'credit'
                      ? selectedCustomerId
                        ? 'border-emerald-500 text-emerald-950 bg-emerald-50/20'
                        : 'border-amber-400 text-amber-950 ring-1 ring-amber-300'
                      : 'border-slate-300 text-slate-800 focus:ring-emerald-500'
                  }`}
                >
                  <option value="">
                    {saleType === 'credit'
                      ? '-- اضغط هنا لاختيار الزبون المسجل مسبقاً (إلزامي) --'
                      : '-- زبون نقدي مباشر (بدون اختيار زبون مسجل) --'}
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''} {c.totalDebt > 0 ? `· عليه دين: ${formatMoney(c.totalDebt)}` : '· (خالص)'}
                    </option>
                  ))}
                </select>
              </div>

              {saleType === 'credit' && !selectedCustomerId && (
                <div className="bg-amber-100 border border-amber-300 text-amber-950 p-2.5 rounded-lg text-[11px] flex items-start gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-extrabold">لا يمكن البيع بالآجل إلا لزبون مضاف اسمه مسبقاً في النظام.</p>
                    <p className="text-[10px] text-amber-800 mt-0.5">
                      اختر الزبون من القائمة أعلاه، أو اضغط على زر الاقتراح لإضافته واعتماده فوراً:
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenQuickAddCustomer(customCustomerName.trim() || undefined)}
                      className="mt-1.5 px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-md font-bold text-[10px] inline-flex items-center gap-1 cursor-pointer transition shadow-2xs"
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>اقتراح إضافة هذا الزبون الآن</span>
                    </button>
                  </div>
                </div>
              )}

              {selectedCustomer && (
                <div className="bg-white border border-emerald-300 rounded-lg p-2.5 text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <div className="flex items-center gap-1.5 text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>زبون معتمد: {selectedCustomer.name}</span>
                    </div>
                    {selectedCustomer.phone && (
                      <span className="text-[11px] text-slate-500 font-mono" dir="ltr">{selectedCustomer.phone}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100">
                    <span className="text-slate-600">الدين السابق المستحق بذمته:</span>
                    <span className={`font-mono font-bold ${selectedCustomer.totalDebt > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {selectedCustomer.totalDebt > 0 ? formatMoney(selectedCustomer.totalDebt) : 'لا توجد ديون سابقة (خالص)'}
                    </span>
                  </div>

                  {saleType === 'credit' && remainingDebt > 0 && (
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-dashed border-amber-300 text-amber-950 font-bold">
                      <span>إجمالي الدين الجديد بعد هذه القائمة:</span>
                      <span className="font-mono text-xs text-rose-800 font-black">
                        {formatMoney(newCustomerDebt)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {saleType === 'direct' && !selectedCustomerId && (
                <div className="space-y-1 pt-1 border-t border-slate-200/60">
                  <span className="text-[11px] font-bold text-slate-600 block">
                    اسم الزبون غير المضاف (للوصل والطباعة - اختياري):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="اسم الزبون غير المضاف..."
                      value={customCustomerName}
                      onChange={(e) => setCustomCustomerName(e.target.value)}
                      className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <input
                      type="text"
                      placeholder="رقم الهاتف (اختياري)..."
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              {saleType === 'credit' && (
                <div className="space-y-2 pt-2 border-t border-amber-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 text-xs">المبلغ المسدد نقداً الآن:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max={finalTotal}
                        value={paidAmount || ''}
                        placeholder="0"
                        onChange={(e) => setPaidAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-28 text-left px-2 py-1 text-xs font-bold border border-amber-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <span className="text-amber-800 font-semibold text-xs">{settings.currency}</span>
                    </div>
                  </div>

                  <div className="flex justify-between font-bold text-amber-950 pt-1 border-t border-amber-200/60 text-xs">
                    <span>المبلغ الآجل المتبقي بالدين:</span>
                    <span className="text-rose-700">{formatMoney(remainingDebt)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-slate-600 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-amber-700" />
                      تاريخ استحقاق السداد:
                    </span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="text-xs px-2 py-0.5 border border-slate-300 rounded bg-white text-slate-700"
                    />
                  </div>
                </div>
              )}

            </div>

            <input
              type="text"
              placeholder="ملاحظات على القائمة (تظهر في الوصل)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />

            {cartErrorNotice && (
              <div className="bg-rose-50 border border-rose-300 text-rose-800 p-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shadow-2xs animate-fadeIn">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <div className="text-[11px] leading-tight">{cartErrorNotice}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setCartErrorNotice(null)}
                  className="text-rose-400 hover:text-rose-700 font-bold px-1"
                >
                  ×
                </button>
              </div>
            )}

            {saleType === 'credit' && !selectedCustomerId && (
              <div className="bg-rose-50 border border-rose-300 text-rose-800 p-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <div className="flex-1 text-[11px] leading-tight">
                  لا يمكن حفظ القائمة بالآجل إلا لزبون مضاف اسمه مسبقاً! يرجى اختيار زبون مسجل أو الضغط على زر الاقتراح لإضافته.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                disabled={cartItems.length === 0 || (saleType === 'credit' && !selectedCustomerId)}
                onClick={() => handleSaveInvoice(true)}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                title={saleType === 'credit' && !selectedCustomerId ? 'يرجى اختيار زبون مضاف مسبقاً لإتمام البيع بالآجل' : 'حفظ وطباعة القائمة'}
              >
                <Printer className="w-4 h-4" />
                <span>حفظ وطباعة القائمة</span>
              </button>

              <button
                disabled={cartItems.length === 0 || (saleType === 'credit' && !selectedCustomerId)}
                onClick={() => handleSaveInvoice(false)}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition"
                title={saleType === 'credit' && !selectedCustomerId ? 'يرجى اختيار زبون مضاف مسبقاً لإتمام البيع بالآجل' : 'حفظ القائمة فقط'}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>حفظ فقط</span>
              </button>
            </div>

            {cartItems.length > 0 && (
              <button
                onClick={clearCart}
                className="text-[11px] text-slate-500 hover:text-rose-600 text-center transition py-0.5"
              >
                تفريغ القائمة وإلغاء المواد
              </button>
            )}

          </div>

        </div>

      </div>
    )}

  </div>

  <BarcodeScannerModal
    isOpen={isScannerOpen}
    onClose={() => setIsScannerOpen(false)}
    onScan={handleBarcodeScanned}
    title="ماسح باركود نقطة البيع (POS)"
  />

  {showQuickAddModal && (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-right" dir="rtl">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">إضافة زبون جديد لسجل الديون</h3>
              <p className="text-[11px] text-slate-500">لا يمكن البيع بالآجل إلا لزبون معتمد ومسجل مسبقاً</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowQuickAddModal(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSaveQuickCustomer} className="p-4 space-y-3">
          {quickCustomerError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{quickCustomerError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              اسم الزبون الكامل <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="مثال: علي محمد حسن"
              value={quickCustomerName}
              onChange={(e) => setQuickCustomerName(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم الهاتف (اختياري)
              </label>
              <input
                type="tel"
                placeholder="0770..."
                value={quickCustomerPhone}
                onChange={(e) => setQuickCustomerPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                العنوان / المنطقة (اختياري)
              </label>
              <input
                type="text"
                placeholder="مثال: الكرادة، بغداد"
                value={quickCustomerAddress}
                onChange={(e) => setQuickCustomerAddress(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              رصيد دين سابق إن وجد (اختياري)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                placeholder="0"
                value={quickCustomerInitialDebt}
                onChange={(e) => setQuickCustomerInitialDebt(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                className="w-full pl-12 pr-3 py-2 text-xs font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                {settings.currency || 'دينار'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              إذا كان على الزبون دين متبقي من فترات سابقة قبل استخدام البرنامج.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowQuickAddModal(false)}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>حفظ واعتماد الزبون للبيع الآجل</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  )}

  {unfoundBarcodePrompt && (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-right" dir="rtl">
        <div className="p-4 border-b border-amber-200 bg-amber-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-950">مادة غير مسجلة في المخزن</h3>
              <p className="text-[11px] text-amber-800">تمت قراءة الرمز الشريطي بواسطة الماسح</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUnfoundBarcodePrompt(null)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-amber-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <div className="text-xs text-slate-500 font-bold mb-1">الرمز الشريطي (الباركود) المقروء:</div>
            <div className="text-lg font-black font-mono text-slate-900 tracking-wider">
              #{unfoundBarcodePrompt}
            </div>
          </div>

          <p className="text-xs text-slate-700 leading-relaxed">
            تمت قراءة هذا الرمز الشريطي بنجاح، ولكنه غير موجود ضمن المواد المخزنة حالياً.
            <br />
            <strong className="text-emerald-800">هل ترغب في إضافة هذه المادة الجديدة إلى المخزن الآن واعتماد هذا الرمز لها؟</strong>
          </p>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setUnfoundBarcodePrompt(null)}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={() => {
                const scanned = unfoundBarcodePrompt;
                setUnfoundBarcodePrompt(null);
                onOpenNewProduct(scanned);
              }}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ إضافة المادة للمخزن الآن</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  )}

  {productForPriceEdit && (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-right" dir="rtl">
        <div className="p-4 border-b border-blue-100 bg-blue-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">تعديل سعر المادة</h3>
              <p className="text-[11px] text-blue-700 font-medium">
                #{productForPriceEdit.code} · {productForPriceEdit.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setProductForPriceEdit(null)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-blue-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSavePriceEdit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              سعر بيع المفرد ({settings.currency}) <span className="text-emerald-600 font-bold">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                required
                value={editRetailPrice}
                onChange={(e) => setEditRetailPrice(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                className="w-full pl-12 pr-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                {settings.currency}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              سعر بيع الجملة ({settings.currency})
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                value={editWholesalePrice}
                onChange={(e) => setEditWholesalePrice(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                className="w-full pl-12 pr-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                {settings.currency}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-1">
              سعر الشراء / التكلفة ({settings.currency})
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                value={editCostPrice}
                onChange={(e) => setEditCostPrice(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                className="w-full pl-12 pr-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                {settings.currency}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              سعة الكرتون الواحد (كم قطعة بالكرتون):
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={editPiecesPerCarton}
                onChange={(e) => setEditPiecesPerCarton(e.target.value === '' ? '' : parseInt(e.target.value) || 1)}
                className="w-24 px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white"
              />
              <span className="text-xs text-slate-500 font-semibold">قطعة لكل كرتون</span>
            </div>
            {typeof editPiecesPerCarton === 'number' && editPiecesPerCarton > 1 && typeof editRetailPrice === 'number' && (
              <div className="text-[11px] text-slate-600 mt-2 font-medium">
                💡 سعر الكرتون المفرد = <span className="font-bold text-slate-900">{formatMoney(editRetailPrice * editPiecesPerCarton)}</span>
                {typeof editWholesalePrice === 'number' && (
                  <> · جملة = <span className="font-bold text-slate-900">{formatMoney(editWholesalePrice * editPiecesPerCarton)}</span></>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            {onEditProduct && (
              <button
                type="button"
                onClick={() => {
                  const prod = productForPriceEdit;
                  setProductForPriceEdit(null);
                  onEditProduct(prod);
                }}
                className="text-xs text-blue-700 hover:text-blue-900 underline font-semibold cursor-pointer"
              >
                تعديل كامل بيانات المادة
              </button>
            )}
            <div className="flex items-center gap-2 mr-auto">
              <button
                type="button"
                onClick={() => setProductForPriceEdit(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ السعر</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  )}

</div>
  );
};

export default POSView;
