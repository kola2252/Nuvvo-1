/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CreditCard, Wallet, Smartphone, CheckCircle, ChevronLeft, ShieldCheck, 
  Lock, AlertCircle, QrCode, RefreshCw, Sparkles, ArrowRight, 
  ChevronDown, ChevronUp, Check, Zap, Building2,
  Receipt, Shield, IndianRupee, Copy, ExternalLink, HelpCircle,
  Clock, CheckCheck, X, Download, Maximize2, Share2, Info
} from 'lucide-react';
import QRCode from 'qrcode';
import { Address, SavedCard, PaymentMethodType, CartItem, PaymentStatusType } from '../types';
import { useApp } from '../context/AppContext';

interface PaymentMethodScreenProps {
  amountPayable: number;
  deliveryAddress: Address | null;
  itemCount: number;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  packagingFee: number;
  tax: number;
  tip: number;
  userPhone?: string;
  userName?: string;
  cartItems?: CartItem[];
  restaurantName?: string;
  onBack: () => void;
  onCompletePayment: (method: PaymentMethodType, paymentDetails?: any) => void;
}

type PaymentCategory = 'UPI' | 'COD' | 'PhonePe' | 'Wallet' | 'Credit Card';

export default function PaymentMethodScreen({
  amountPayable,
  deliveryAddress,
  itemCount,
  subtotal,
  discount,
  deliveryFee,
  packagingFee,
  tax,
  tip,
  userPhone = '9876543210',
  userName = 'Gourmet Customer',
  cartItems = [],
  restaurantName = 'Nuvvo Food & Hospitality',
  onBack,
  onCompletePayment
}: PaymentMethodScreenProps) {
  const { storePaymentSettings } = useApp();

  // Dynamic Store UPI configuration provided by Admin
  const activeUpiId = (storePaymentSettings?.upiId || 'arjun.gorrepati@axl').trim().toLowerCase();
  const activeBankName = storePaymentSettings?.bankName || 'Karur Vysya Bank - 4761';
  const activeMerchantName = storePaymentSettings?.merchantName || restaurantName || 'Nuvvo Food & Hospitality';
  const activePhonePeNumber = storePaymentSettings?.phonePeNumber || '9876543210';
  const activeAccountHolder = storePaymentSettings?.accountHolderName || 'Arjun Gorrepati (Nuvvo Foods)';
  const staticQrImage = storePaymentSettings?.staticQrImage;
  const isUpiEnabled = storePaymentSettings?.enableUpi !== false;
  const isCodEnabled = storePaymentSettings?.enableCod !== false;
  const customInstructions = storePaymentSettings?.customerInstructions;

  // Selected category & method - respects admin enable/disable flags
  const [selectedCategory, setSelectedCategory] = useState<PaymentCategory>(() => {
    if (isUpiEnabled) return 'UPI';
    if (isCodEnabled) return 'COD';
    return 'Wallet';
  });
  
  // Stable Order Reference for the checkout session to prevent duplicate orders
  const [orderRef] = useState<string>(() => {
    const timestamp = Date.now().toString().slice(-6);
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `NUVVO-${timestamp}-${rand}`;
  });

  // Dynamic UPI URI construction with exact amount, merchant name and reference
  // 1. Food bill amount - strict two-decimal format, minimum 1.00
  const formattedAmount = (Math.max(1, Math.round(Number(amountPayable) * 100) / 100)).toFixed(2);
  
  // 2. Payee name: clean alphanumeric string (max 25 chars) to prevent UPI parser crashes
  const merchantNameClean = activeMerchantName.replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 25);
  
  // 3. Clean alphanumeric reference
  const cleanRef = orderRef.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30);
  
  const upiUri = `upi://pay?pa=${activeUpiId}&pn=${encodeURIComponent(merchantNameClean)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent('FoodBill' + cleanRef)}&tr=${cleanRef}`;

  // Dynamic QR Code data URL generated using client-side qrcode library
  // 1. Pure SVG vector data URL for razor-sharp, zero-blur rendering on any screen/DPI
  // 2. High-Res 1024x1024 PNG data URL for gallery saving and downloading
  const [qrSvgDataUrl, setQrSvgDataUrl] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(true);
  const [copiedUpi, setCopiedUpi] = useState<boolean>(false);
  const [upiSubMode, setUpiSubMode] = useState<'qr' | 'apps'>('qr');

  // Guard against duplicate orders or duplicate payment submissions
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);

  // UPI payment lifecycle states: 'pending' | 'initiated' | 'awaiting_confirmation'
  const [upiPaymentState, setUpiPaymentState] = useState<'pending' | 'initiated' | 'awaiting_confirmation'>('pending');
  const [customerUtr, setCustomerUtr] = useState<string>('');
  const [showUpiConfirmModal, setShowUpiConfirmModal] = useState<boolean>(false);
  const [showFallbackQrModal, setShowFallbackQrModal] = useState<boolean>(false);

  // App-specific UPI selection
  const [preferredUpiApp, setPreferredUpiApp] = useState<'all' | 'phonepe' | 'gpay' | 'paytm' | 'bhim'>('all');

  // UI accordion & summary
  const [showPriceBreakdown, setShowPriceBreakdown] = useState<boolean>(true);

  // Wallets & Cards fallback states
  const [nuvvoWalletBalance] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('nuvvo_wallet_balance');
      return (stored !== null && stored !== '') ? Number(stored) : 0;
    } catch {
      return 0;
    }
  });

  // PhonePe Gateway status check (non-blocking, server-verified)
  const [phonePeStatus, setPhonePeStatus] = useState<{ isConfigured: boolean; environment?: string; missingVariables?: string[] } | null>(null);
  const [isInitiatingPhonePe, setIsInitiatingPhonePe] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/payment/phonepe/status')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setPhonePeStatus({
            isConfigured: Boolean(d.isConfigured),
            environment: d.environment,
            missingVariables: d.missingVariables || []
          });
        }
      })
      .catch(() => {});
  }, []);

  // Generate 100% crystal-clear dynamic QR Code (SVG Vector + 1024px PNG) with High Error Correction 'H'
  useEffect(() => {
    setIsGeneratingQr(true);
    let isCancelled = false;

    // Generate pure vector SVG (Infinite resolution, crystal clear without blur or pixel distortion)
    QRCode.toString(upiUri, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then(svg => {
        if (!isCancelled && svg) {
          const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          setQrSvgDataUrl(svgUrl);
        }
      })
      .catch(err => {
        console.error('Failed to generate dynamic SVG QR code:', err);
      });

    // Generate Ultra High-Res 1024x1024 PNG with High Error Correction for instant camera scanning
    QRCode.toDataURL(upiUri, {
      width: 1024,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
      .then(url => {
        if (!isCancelled) {
          setQrCodeDataUrl(url);
          setIsGeneratingQr(false);
        }
      })
      .catch(err => {
        console.error('Failed to generate dynamic PNG QR code:', err);
        if (!isCancelled) setIsGeneratingQr(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [upiUri]);

  // Download QR Code directly to user device/gallery
  const handleDownloadQr = () => {
    const downloadSource = qrCodeDataUrl || qrSvgDataUrl;
    if (!downloadSource) return;
    const link = document.createElement('a');
    link.href = downloadSource;
    link.download = `PhonePe-Bill-Rs${formattedAmount}-${cleanRef}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Android Lifecycle detection: When customer switches back from UPI app to browser/food app
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && upiPaymentState === 'initiated') {
        setUpiPaymentState('awaiting_confirmation');
        setShowUpiConfirmModal(true);
      }
    };

    const handleWindowFocus = () => {
      if (upiPaymentState === 'initiated') {
        setUpiPaymentState('awaiting_confirmation');
        setShowUpiConfirmModal(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [upiPaymentState]);

  // Copy UPI ID to clipboard
  const handleCopyUpiId = () => {
    try {
      navigator.clipboard.writeText(activeUpiId);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2500);
    } catch {
      alert(`PhonePe UPI ID: ${activeUpiId}`);
    }
  };

  /**
   * Launch UPI intent on Android or open deep link
   * Generates native intent chooser showing PhonePe, Google Pay, Paytm, BHIM, etc.
   */
  const handleLaunchUpi = (appType: 'all' | 'phonepe' | 'gpay' | 'paytm' | 'bhim' = 'all') => {
    let targetUri = upiUri;

    // Specific URI schemes if requested, while default 'all' launches the native Android UPI chooser
    if (appType === 'phonepe') {
      targetUri = `phonepe://pay?pa=${activeUpiId}&pn=${encodeURIComponent(merchantNameClean)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent('FoodBill' + cleanRef)}&tr=${cleanRef}`;
    } else if (appType === 'gpay') {
      targetUri = `tez://upi/pay?pa=${activeUpiId}&pn=${encodeURIComponent(merchantNameClean)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent('FoodBill' + cleanRef)}&tr=${cleanRef}`;
    } else if (appType === 'paytm') {
      targetUri = `paytmmp://pay?pa=${activeUpiId}&pn=${encodeURIComponent(merchantNameClean)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent('FoodBill' + cleanRef)}&tr=${cleanRef}`;
    } else if (appType === 'bhim') {
      targetUri = `bhim://pay?pa=${activeUpiId}&pn=${encodeURIComponent(merchantNameClean)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent('FoodBill' + cleanRef)}&tr=${cleanRef}`;
    }

    // Update state to 'Payment Initiated'
    setUpiPaymentState('initiated');

    // Trigger Android Intent Launch via native anchor tag and direct location
    try {
      const link = document.createElement('a');
      link.href = targetUri;
      link.target = '_self';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      window.location.href = targetUri;
    }

    // Show confirmation modal after a brief delay if user remains in browser or comes right back
    setTimeout(() => {
      setShowUpiConfirmModal(true);
    }, 2000);
  };

  /**
   * Complete payment submission
   * Records order with amountPayable, activeUpiId, activeBankName, and customer UTR
   */
  const handleConfirmUpiOrder = () => {
    if (isSubmittingOrder) return;
    setIsSubmittingOrder(true);

    const paymentDetails = {
      category: 'UPI',
      amount: amountPayable,
      paymentStatus: 'awaiting_confirmation' as PaymentStatusType,
      transactionRef: cleanRef,
      orderId: `order_${cleanRef}`,
      provider: `Direct PhonePe UPI (${activeBankName})`,
      maskedInfo: activeUpiId,
      upiDetails: {
        upiId: activeUpiId,
        merchantName: merchantNameClean,
        bankName: activeBankName,
        phonePeNumber: activePhonePeNumber,
        accountHolderName: activeAccountHolder,
        amount: amountPayable,
        transactionRef: cleanRef,
        upiUri: upiUri,
        customerUtr: customerUtr ? customerUtr.trim() : undefined,
        initiatedAt: new Date().toISOString()
      }
    };

    setShowUpiConfirmModal(false);
    setShowFallbackQrModal(false);
    onCompletePayment('UPI', paymentDetails);
  };

  // Alternative payment completion (COD, Wallet, Card)
  const handleNonUpiPayment = (method: PaymentMethodType) => {
    if (isSubmittingOrder) return;
    setIsSubmittingOrder(true);

    let details: any = {
      category: method,
      amount: amountPayable,
      transactionRef: orderRef,
      orderId: `order_${orderRef}`,
      paymentStatus: method === 'COD' || method === 'Pay on Delivery' ? 'pending' : 'pending'
    };

    if (method === 'Wallet') {
      if (nuvvoWalletBalance < amountPayable) {
        alert(`Insufficient Nuvvo Wallet balance (₹${nuvvoWalletBalance}). Please select UPI or Cash on Delivery.`);
        return;
      }
      details.provider = 'Nuvvo Cash Wallet';
      details.maskedInfo = `Deducted ₹${amountPayable}`;
    } else if (method === 'COD' || method === 'Pay on Delivery') {
      details.provider = 'Pay on Delivery';
      details.maskedInfo = 'Pay in Cash or UPI upon doorstep delivery';
    } else {
      details.provider = 'Credit / Debit Card';
      details.maskedInfo = '•••• •••• •••• 4821';
    }

    onCompletePayment(method, details);
  };

  // Official PhonePe Standard Checkout Gateway initiation
  const handlePhonePeGatewayPayment = () => {
    if (isSubmittingOrder || isInitiatingPhonePe) return;
    setIsInitiatingPhonePe(true);
    setIsSubmittingOrder(true);

    const details = {
      provider: 'PHONEPE_GATEWAY',
      paymentMethod: 'PhonePe',
      category: 'PhonePe',
      amount: amountPayable,
      transactionRef: orderRef,
      orderId: `order_${orderRef}`,
      paymentStatus: 'initiated',
      notes: 'Initiated via PhonePe Official Payment Gateway'
    };

    onCompletePayment('PhonePe', details);
  };

  return (
    <div id="payment-selection-screen" className="min-h-screen bg-slate-50 dark:bg-zinc-950 pb-36 text-zinc-900 dark:text-zinc-50 transition-colors duration-200">
      
      {/* TOP HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            id="back-to-cart-review-btn"
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition cursor-pointer active:scale-95 flex items-center justify-center"
            title="Back to Cart Review"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-black p-0.5 border border-amber-500/30 shrink-0 flex items-center justify-center shadow-xs">
            <img src="/nuvvo-logo.png" alt="Nuvvo Logo" className="w-full h-full rounded-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-50 uppercase flex items-center gap-1.5">
              Payment & Checkout
            </h1>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
              Ref: #{orderRef} • {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>
        </div>

        {/* Amount Pill */}
        <div className="text-right">
          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block">Payable</span>
          <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
            ₹{amountPayable}
          </span>
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">

        {/* 1. ORDER SUMMARY ACCORDION */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-4 shadow-xs space-y-3">
          <button
            type="button"
            onClick={() => setShowPriceBreakdown(!showPriceBreakdown)}
            className="w-full flex items-center justify-between text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-600">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">
                  Order Summary
                </h3>
                <p className="text-[10px] text-zinc-400">
                  {restaurantName} • {itemCount} dishes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-zinc-500 text-xs font-mono font-bold">
              <span>₹{amountPayable}</span>
              {showPriceBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showPriceBreakdown && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="space-y-2 border-t border-slate-100 dark:border-zinc-800/80 pt-3 text-xs"
            >
              {/* Items List preview */}
              {cartItems && cartItems.length > 0 && (
                <div className="space-y-1 pb-2 border-b border-dashed border-slate-100 dark:border-zinc-800">
                  {cartItems.map(item => (
                    <div key={item.foodItem.id} className="flex justify-between text-[11px] text-zinc-600 dark:text-zinc-300">
                      <span>{item.quantity}x {item.foodItem.name}</span>
                      <span className="font-mono">₹{item.foodItem.price * item.quantity}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                <div className="flex justify-between">
                  <span>Food Items Total</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">₹{subtotal}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold">
                    <span>Discount / Points Savings</span>
                    <span className="font-mono">-₹{discount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Delivery Charges</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">{deliveryFee > 0 ? `₹${deliveryFee}` : 'FREE'}</span>
                </div>
                {tax > 0 && (
                  <div className="flex justify-between">
                    <span>Applicable Taxes & GST</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">₹{tax}</span>
                  </div>
                )}
                {tip > 0 && (
                  <div className="flex justify-between">
                    <span>Delivery Partner Tip</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">₹{tip}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-zinc-750 font-black text-sm text-zinc-900 dark:text-zinc-50">
                <span>Final Payable Amount</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400 text-base">₹{amountPayable}</span>
              </div>

              {deliveryAddress && (
                <p className="text-[10px] text-zinc-400 truncate pt-1">
                  📍 Drop: {deliveryAddress.streetName || deliveryAddress.locality || deliveryAddress.area || 'Chirala'}
                </p>
              )}
            </motion.div>
          )}
        </div>

        {/* Custom Admin Payment Instructions */}
        {customInstructions && customInstructions.trim() && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2 shadow-2xs">
            <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-extrabold uppercase text-[10px] tracking-wider block text-amber-800 dark:text-amber-300">
                Payment Instructions:
              </span>
              <p className="text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                {customInstructions.trim()}
              </p>
            </div>
          </div>
        )}

        {/* 2. PAYMENT METHOD SELECTOR TABS */}
        <div className="flex bg-slate-200/70 dark:bg-zinc-850 p-1 rounded-2xl gap-1">
          {isUpiEnabled && (
            <button
              type="button"
              onClick={() => setSelectedCategory('UPI')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                selectedCategory === 'UPI'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" /> Direct UPI
            </button>
          )}

          {isCodEnabled && (
            <button
              type="button"
              onClick={() => setSelectedCategory('COD')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                selectedCategory === 'COD'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <IndianRupee className="w-3.5 h-3.5" /> Cash on Delivery (COD)
            </button>
          )}

          <button
            type="button"
            onClick={() => setSelectedCategory('PhonePe')}
            className={`flex-1 py-2.5 px-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              selectedCategory === 'PhonePe'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" /> PhonePe PG
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('Wallet')}
            className={`py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              selectedCategory === 'Wallet'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" /> Wallet
          </button>
        </div>

        {/* 3. DIRECT UPI SECTION (PRIMARY USER REQUEST) */}
        {selectedCategory === 'UPI' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Merchant Account & Verified Bank Badge (PhonePe Merchant Account) */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-purple-600 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">
                    पे
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-50 leading-tight">
                      {activeBankName}
                    </h4>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                      PhonePe Primary Account • {activeAccountHolder}
                    </p>
                  </div>
                </div>

                <span className="text-[9px] bg-purple-500/10 text-purple-600 dark:text-purple-400 font-black uppercase px-2 py-0.5 rounded-full border border-purple-500/20">
                  PhonePe Verified
                </span>
              </div>

              {/* UPI ID with Copy Button */}
              <div className="bg-slate-50 dark:bg-zinc-850 p-3 rounded-2xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Admin PhonePe UPI ID
                  </span>
                  <span className="text-xs font-black font-mono text-zinc-900 dark:text-zinc-50 select-all">
                    {activeUpiId}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyUpiId}
                  className="px-2.5 py-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-orange-500 text-zinc-700 dark:text-zinc-200 rounded-xl text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition active:scale-95"
                >
                  {copiedUpi ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy ID</span>
                    </>
                  )}
                </button>
              </div>

              {/* Telugu PhonePe Direct Transfer Assurance */}
              <div className="p-2.5 bg-purple-500/5 border border-purple-500/15 rounded-xl text-[10.5px] text-purple-900 dark:text-purple-300 space-y-0.5">
                <p className="font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  <span>డైరెక్ట్ బ్యాంక్ బదిలీ (Direct Bank Transfer):</span>
                </p>
                <p className="text-[10px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                  QR కోడ్ స్కాన్ చేసి పే చేయగానే ఫుడ్ బిల్ అమౌంట్ ₹{amountPayable} ఎటువంటి ఎర్రర్ లేకుండా నేరుగా అడ్మిన్ PhonePe ఖాతాకు అనుసంధానించబడిన బ్యాంక్ అకౌంట్ (<strong>{activeBankName}</strong>) లోకి బదిలీ అవుతుంది.
                </p>
              </div>

              {/* UPI Payment Status Indicator */}
              <div className="flex items-center justify-between text-[11px] pt-1 px-1">
                <span className="text-zinc-500 font-medium">Payment Status:</span>
                <span className={`font-black uppercase px-2 py-0.5 rounded-full text-[9.5px] ${
                  upiPaymentState === 'awaiting_confirmation'
                    ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                    : upiPaymentState === 'initiated'
                    ? 'bg-blue-500/10 text-blue-600 border border-blue-500/30'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}>
                  {upiPaymentState === 'awaiting_confirmation' && '🔍 Awaiting Payment Confirmation'}
                  {upiPaymentState === 'initiated' && '🚀 Payment Initiated'}
                  {upiPaymentState === 'pending' && '⏳ Payment Pending'}
                </span>
              </div>
            </div>

            {/* UPI Sub-Mode Switcher: Scan & Pay QR vs Direct Apps */}
            <div className="flex bg-slate-200/80 dark:bg-zinc-800 p-1 rounded-2xl gap-1">
              <button
                type="button"
                onClick={() => setUpiSubMode('qr')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  upiSubMode === 'qr'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Scan & Pay QR (PhonePe QR)</span>
              </button>
              <button
                type="button"
                onClick={() => setUpiSubMode('apps')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  upiSubMode === 'apps'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Direct UPI Apps</span>
              </button>
            </div>

            {/* DYNAMIC UPI QR CODE SECTION - 100% CLEAR, VECTOR SHARP AND UNOBSTRUCTED */}
            {upiSubMode === 'qr' && (
              <div id="inline-upi-qr-card" className="bg-white dark:bg-zinc-900 border-2 border-purple-500/30 dark:border-purple-500/20 rounded-3xl p-5 shadow-md text-center space-y-4">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-zinc-800">
                  <div className="text-left">
                    <span className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 tracking-wider flex items-center gap-1">
                      <QrCode className="w-3.5 h-3.5" /> PhonePe పేమెంట్ QR కోడ్ • Clear UPI QR
                    </span>
                    <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-50">
                      {activeBankName}
                    </h4>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] bg-purple-500/10 text-purple-700 dark:text-purple-300 font-extrabold px-2 py-0.5 rounded-full border border-purple-500/20">
                      PhonePe
                    </span>
                    <span className="text-[9px] bg-blue-500/10 text-blue-700 dark:text-blue-300 font-extrabold px-2 py-0.5 rounded-full border border-blue-500/20">
                      GPay
                    </span>
                    <span className="text-[9px] bg-sky-500/10 text-sky-700 dark:text-sky-300 font-extrabold px-2 py-0.5 rounded-full border border-sky-500/20">
                      Paytm
                    </span>
                  </div>
                </div>

                {/* Crystal Clear Dynamic QR Code Container - Pure White High Contrast Background */}
                <div className="bg-white p-4 rounded-3xl border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center">
                  {isGeneratingQr || (!qrSvgDataUrl && !qrCodeDataUrl) ? (
                    <div className="w-64 h-64 flex flex-col items-center justify-center text-zinc-400 space-y-2">
                      <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
                      <span className="text-xs font-bold">Generating crystal-clear QR code...</span>
                    </div>
                  ) : (
                    <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-xs relative group">
                      <img
                        src={qrSvgDataUrl || qrCodeDataUrl}
                        alt={`Dynamic UPI QR Code for ₹${amountPayable}`}
                        className="w-64 h-64 sm:w-72 sm:h-72 object-contain rounded-xl mx-auto block bg-white"
                      />
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          type="button"
                          onClick={() => setShowFallbackQrModal(true)}
                          className="p-1.5 bg-black/70 hover:bg-black text-white rounded-lg shadow-sm backdrop-blur-xs transition cursor-pointer"
                          title="Zoom / Fullscreen QR"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Quick QR Action Controls */}
                  <div className="flex items-center gap-2 mt-3 w-full">
                    <button
                      type="button"
                      onClick={() => setShowFallbackQrModal(true)}
                      className="flex-1 py-2 px-3 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/20 dark:hover:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/40 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>జూమ్ చేయండి (Zoom QR)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      className="py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                      title="Download QR to phone gallery"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save QR</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 text-center mt-3 w-full">
                    <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-black text-zinc-900 bg-slate-50 py-2 px-3 rounded-xl border border-slate-200">
                      <span>UPI ID: {activeUpiId}</span>
                      <button
                        type="button"
                        onClick={handleCopyUpiId}
                        className="p-1 hover:text-orange-500 text-zinc-600 transition cursor-pointer"
                        title="Copy UPI ID"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {copiedUpi && <span className="text-[10px] text-emerald-600 font-sans font-bold">Copied!</span>}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-300 font-mono shadow-xs">
                        Food Bill Amount: ₹{amountPayable}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-zinc-600 dark:text-zinc-300 pt-1">
                      PhonePe, Google Pay, Paytm, లేదా ఏదైనా UPI యాప్‌తో ఈ QR స్కాన్ చేస్తే బిల్లు మొత్తం <strong>₹{amountPayable}</strong> ఆటోమేటిక్‌గా ఫిల్ అవుతుంది.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowUpiConfirmModal(true)}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95 flex items-center justify-center gap-2"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>I Have Paid ₹{amountPayable} via PhonePe / QR Scanner</span>
                </button>
              </div>
            )}

            {/* Android Fast-App Selector Grid (Shown when 'apps' mode is active, or toggleable) */}
            {upiSubMode === 'apps' && (
              <>
                <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                      Supported on All UPI Apps
                    </span>
                    <span className="text-[9px] font-bold text-zinc-400 flex items-center gap-0.5">
                      <Zap className="w-3 h-3 text-orange-500" /> Instant Intent
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => handleLaunchUpi('phonepe')}
                      className="p-3 rounded-2xl border border-purple-200/80 dark:border-purple-900/50 bg-purple-500/5 hover:bg-purple-500/15 flex flex-col items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-purple-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                        पे
                      </div>
                      <span className="text-[11px] font-extrabold text-zinc-900 dark:text-zinc-100 group-hover:text-purple-600">
                        PhonePe
                      </span>
                      <span className="text-[8px] bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold px-1.5 py-0.2 rounded-full">
                        Recommended
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLaunchUpi('gpay')}
                      className="p-3 rounded-2xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-500/5 hover:bg-blue-500/15 flex flex-col items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                        G
                      </div>
                      <span className="text-[11px] font-extrabold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600">
                        Google Pay
                      </span>
                      <span className="text-[8px] text-zinc-400 font-medium">GPay Intent</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLaunchUpi('paytm')}
                      className="p-3 rounded-2xl border border-sky-200/80 dark:border-sky-900/50 bg-sky-500/5 hover:bg-sky-500/15 flex flex-col items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-sky-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                        P
                      </div>
                      <span className="text-[11px] font-extrabold text-zinc-900 dark:text-zinc-100 group-hover:text-sky-600">
                        Paytm
                      </span>
                      <span className="text-[8px] text-zinc-400 font-medium">Paytm UPI</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLaunchUpi('bhim')}
                      className="p-3 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-500/5 hover:bg-emerald-500/15 flex flex-col items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                        BH
                      </div>
                      <span className="text-[11px] font-extrabold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600">
                        BHIM UPI
                      </span>
                      <span className="text-[8px] text-zinc-400 font-medium">NPCI App</span>
                    </button>
                  </div>

                  {/* Fallback QR Trigger Button */}
                  <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                    <span className="text-zinc-500 text-[11px]">
                      Prefer Scanning with Camera / QR?
                    </span>
                    <button
                      type="button"
                      onClick={() => setUpiSubMode('qr')}
                      className="text-orange-600 dark:text-orange-400 hover:underline font-extrabold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" /> Switch to QR Code
                    </button>
                  </div>
                </div>

                {/* Prominent PAY NOW Button */}
                <div className="space-y-2">
                  <button
                    id="upi-pay-now-primary-btn"
                    type="button"
                    onClick={() => handleLaunchUpi('all')}
                    className="w-full py-4 px-6 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black rounded-2xl text-base shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <Zap className="w-5 h-5 fill-current" />
                    <span>Pay Now • ₹{amountPayable}</span>
                  </button>

                  <p className="text-[10px] text-center text-zinc-400 leading-relaxed px-4">
                    Tapping "Pay Now" automatically triggers the native Android intent chooser to open PhonePe, Google Pay, or your preferred UPI app directly.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* 4. CASH / PAY ON DELIVERY SECTION */}
        {selectedCategory === 'COD' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600">
                  <IndianRupee className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50">
                    Pay on Delivery / Cash on Delivery
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Pay in cash or UPI scan when your food arrives
                  </p>
                </div>
              </div>

              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" /> Payment Lifecycle:
                </p>
                <p className="leading-relaxed">
                  Your order status will progress: <strong>Order Placed → Confirmed → Preparing → Out for Delivery → Delivered</strong>. Payment status stays strictly <strong>"Payment Pending"</strong> until delivery completion.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleNonUpiPayment('Pay on Delivery')}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-sm transition cursor-pointer active:scale-95 shadow-md shadow-emerald-600/20"
              >
                Place Order via Pay on Delivery (₹{amountPayable})
              </button>
            </div>
          </motion.div>
        )}

        {/* 5. WALLET SECTION */}
        {selectedCategory === 'Wallet' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <Wallet className="w-5 h-5 text-orange-500" />
                  <span className="text-xs font-black uppercase text-zinc-900 dark:text-zinc-50">
                    Nuvvo Cash Wallet
                  </span>
                </div>
                <span className="text-xs font-mono font-black text-zinc-900 dark:text-zinc-100">
                  Balance: ₹{nuvvoWalletBalance}
                </span>
              </div>

              {nuvvoWalletBalance < amountPayable ? (
                <div className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-2xl text-xs text-rose-600 dark:text-rose-400 space-y-1">
                  <p className="font-bold">Insufficient Wallet Balance</p>
                  <p className="text-[11px]">
                    You need ₹{amountPayable - nuvvoWalletBalance} more. Please switch to <strong>Direct UPI</strong> to pay with PhonePe or Google Pay.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNonUpiPayment('Wallet')}
                  className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-black rounded-2xl text-sm transition cursor-pointer active:scale-95"
                >
                  Pay ₹{amountPayable} from Wallet
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* 6. OFFICIAL PHONEPE PAYMENT GATEWAY SECTION */}
        {selectedCategory === 'PhonePe' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className="bg-white dark:bg-zinc-900 border-2 border-purple-500/30 dark:border-purple-500/20 rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-purple-600 text-white font-extrabold text-base flex items-center justify-center shadow-md shadow-purple-600/30">
                    पे
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5">
                      <span>PhonePe Payment Gateway</span>
                    </h4>
                    <p className="text-[10px] text-zinc-400 font-medium">
                      Official PG Standard Checkout (Cards, NetBanking, UPI)
                    </p>
                  </div>
                </div>

                <span className="text-[9px] bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-extrabold uppercase px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800">
                  {phonePeStatus?.environment === 'PRODUCTION' ? 'Live PG' : 'Sandbox PG'}
                </span>
              </div>

              {/* Supported payment instruments banner */}
              <div className="p-3 bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/15 rounded-2xl text-[11px] space-y-2">
                <span className="font-extrabold text-[10px] uppercase tracking-wider text-purple-700 dark:text-purple-300 block">
                  Accepted Payment Methods:
                </span>
                <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                  <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700">
                    📱 UPI Apps
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700">
                    💳 Cards (Visa/MC)
                  </div>
                  <div className="p-2 rounded-xl bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700">
                    🏦 NetBanking
                  </div>
                </div>
              </div>

              {/* Status Notice if credentials are not yet injected into Vercel */}
              {phonePeStatus && !phonePeStatus.isConfigured && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 shrink-0" /> Merchant Setup Notice:
                  </p>
                  <p className="text-[10.5px] leading-relaxed">
                    PhonePe API credentials (<code>PHONEPE_MERCHANT_ID</code>, <code>PHONEPE_SALT_KEY</code>, <code>PHONEPE_SALT_INDEX</code>) are awaiting setup in Vercel. You can still test order placement or switch to <strong>Direct UPI QR</strong> or <strong>Cash on Delivery</strong>.
                  </p>
                </div>
              )}

              {/* Price Row */}
              <div className="flex justify-between items-center py-2 px-1 text-xs font-mono font-bold">
                <span className="text-zinc-500">Order Total Payable:</span>
                <span className="text-base font-black text-purple-600 dark:text-purple-400">₹{amountPayable}</span>
              </div>

              {/* Primary Gateway Proceed Button */}
              <button
                type="button"
                id="phonepe-gateway-proceed-btn"
                disabled={isSubmittingOrder || isInitiatingPhonePe}
                onClick={handlePhonePeGatewayPayment}
                className="w-full py-4 bg-purple-600 hover:bg-purple-700 active:scale-[0.98] text-white font-black rounded-2xl text-sm transition-all cursor-pointer shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isInitiatingPhonePe ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Connecting to PhonePe...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Pay ₹{amountPayable} with PhonePe Gateway</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[9.5px] text-zinc-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                <span>256-Bit Encrypted Bank Grade Checkout • S2S Verified</span>
              </div>
            </div>
          </motion.div>
        )}

      </div>

      {/* MODAL 1: RETURN CONFIRMATION MODAL (CUSTOMER RETURN FROM UPI APP) */}
      <AnimatePresence>
        {showUpiConfirmModal && (
          <div className="fixed inset-0 z-50 bg-zinc-950/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-zinc-800 shadow-2xl text-left space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50 leading-tight">
                      Confirm UPI Payment
                    </h3>
                    <p className="text-[10px] text-zinc-400 font-mono">
                      Ref: #{orderRef} • ₹{amountPayable}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowUpiConfirmModal(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Core Requirement #8 & #15 notice */}
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl text-xs space-y-2">
                <p className="font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <span>Payment initiated. Please confirm that you completed the UPI payment.</span>
                </p>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300 leading-relaxed">
                  Your order will be placed as <strong>"Awaiting Payment Confirmation"</strong>. Our admin team verifies transactions externally against the receiver account: <strong>{activeUpiId}</strong> ({activeBankName}).
                </p>
              </div>

              {/* Optional UTR / Reference number input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                  UPI Ref / UTR Number (Optional, 12 digits)
                </label>
                <input
                  type="text"
                  maxLength={16}
                  value={customerUtr}
                  onChange={e => setCustomerUtr(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="e.g. 439281928392"
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                />
                <p className="text-[9.5px] text-zinc-400">
                  Entering UTR from your PhonePe/GPay debited screen helps the admin confirm your order faster.
                </p>
              </div>

              {/* Primary Action Button */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={isSubmittingOrder}
                  onClick={handleConfirmUpiOrder}
                  className={`w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 ${
                    isSubmittingOrder ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer active:scale-95'
                  }`}
                >
                  {isSubmittingOrder ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Recording Order...</span>
                    </>
                  ) : (
                    <>
                      <CheckCheck className="w-4 h-4" />
                      <span>I Have Completed UPI Payment (₹{amountPayable})</span>
                    </>
                  )}
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleLaunchUpi('all')}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-[10.5px] font-bold cursor-pointer transition text-center"
                  >
                    🔄 Reopen UPI App
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUpiConfirmModal(false);
                      setShowFallbackQrModal(true);
                    }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-[10.5px] font-bold cursor-pointer transition text-center"
                  >
                    📱 Show QR Code
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: DYNAMIC FALLBACK QR CODE MODAL (Requirement #9 & #10) */}
      <AnimatePresence>
        {showFallbackQrModal && (
          <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl p-6 max-w-sm w-full border border-slate-200 dark:border-zinc-800 shadow-2xl text-center space-y-4"
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-zinc-800 pb-3">
                <div className="text-left">
                  <span className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 tracking-wider flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5" /> PhonePe QR • Clear UPI QR
                  </span>
                  <h3 className="text-xs font-black text-zinc-900 dark:text-zinc-50">
                    {activeBankName}
                  </h3>
                </div>
                <button
                  onClick={() => setShowFallbackQrModal(false)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dynamic QR Code (High-Contrast Vector Sharpness) */}
              <div className="bg-white p-4 rounded-3xl border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center space-y-3">
                {isGeneratingQr || (!qrSvgDataUrl && !qrCodeDataUrl) ? (
                  <div className="w-64 h-64 flex flex-col items-center justify-center text-zinc-400 space-y-2">
                    <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
                    <span className="text-xs font-bold">Generating crystal-clear QR...</span>
                  </div>
                ) : (
                  <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-xs">
                    <img
                      src={qrSvgDataUrl || qrCodeDataUrl}
                      alt={`Dynamic UPI QR Code for ₹${amountPayable}`}
                      className="w-64 h-64 sm:w-72 sm:h-72 rounded-xl object-contain mx-auto block bg-white"
                    />
                  </div>
                )}

                <div className="space-y-1.5 text-center w-full">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-black text-zinc-900 bg-slate-50 py-1.5 px-3 rounded-xl border border-slate-200">
                    <span>UPI ID: {activeUpiId}</span>
                    <button
                      type="button"
                      onClick={handleCopyUpiId}
                      className="p-1 hover:text-orange-500 text-zinc-600 transition cursor-pointer"
                      title="Copy UPI ID"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {copiedUpi && <span className="text-[10px] text-emerald-600 font-sans font-bold">Copied!</span>}
                  </div>
                  <div className="flex items-center justify-center">
                    <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 font-mono">
                      Payable: ₹{amountPayable}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    PhonePe, Google Pay, Paytm, BHIM లేదా ఏదైనా UPI యాప్‌తో స్కాన్ చేసి పే చేయండి.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowFallbackQrModal(false);
                    setShowUpiConfirmModal(true);
                  }}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  ✓ I Have Paid ₹{amountPayable} via Scanner
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadQr}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Save QR Code
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLaunchUpi('all')}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open UPI App
                  </button>
                </div>
              </div>

              <div className="pt-1 text-[9px] text-zinc-400 font-medium">
                Supported: PhonePe • Google Pay • Paytm • BHIM • CRED • All UPI Apps
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
