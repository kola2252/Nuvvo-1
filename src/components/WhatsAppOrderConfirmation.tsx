/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Free WhatsApp Order Confirmation Component
 * 
 * Strictly follows rules:
 * 1. Checks that order is genuinely saved to Supabase before showing confirmation option.
 * 2. Uses official WhatsApp Click-to-Chat URL (wa.me) — 100% free, zero paid API credentials.
 * 3. Pre-fills message with genuine order details (Order ID, Items, Total, Payment Method, Status).
 * 4. Never marks COD or unverified UPI orders as Paid.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, CheckCircle2, ShieldCheck, Phone, AlertCircle, RefreshCw, Send, ArrowRight } from 'lucide-react';
import { Order } from '../types';
import { supabase } from '../utils/supabase/client';
import { 
  generateWhatsAppOrderConfirmationText, 
  buildWhatsAppClickToChatUrl, 
  formatWhatsAppPhoneNumber,
  getAccuratePaymentStatusText 
} from '../utils/whatsappClickToChat';

interface WhatsAppOrderConfirmationProps {
  order: Order;
  customerPhone?: string;
  className?: string;
  compact?: boolean;
}

export default function WhatsAppOrderConfirmation({
  order,
  customerPhone,
  className = '',
  compact = false
}: WhatsAppOrderConfirmationProps) {
  // Verification state: Must be confirmed in Supabase before offering confirmation
  const [isVerifiedInSupabase, setIsVerifiedInSupabase] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(true);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Phone number state
  const initialPhone = customerPhone || order.customerPhone || '';
  const [inputPhone, setInputPhone] = useState<string>(initialPhone.replace(/\D/g, '').slice(-10));
  const [isEditingPhone, setIsEditingPhone] = useState<boolean>(!initialPhone || initialPhone.replace(/\D/g, '').length < 10);
  const [hasSent, setHasSent] = useState<boolean>(false);

  // 1. Verify that order is genuinely persisted in Supabase public.orders
  const verifyOrderInSupabase = useCallback(async () => {
    if (!order?.id) {
      setIsVerifying(false);
      setIsVerifiedInSupabase(false);
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);

    try {
      // 1. Direct Supabase query
      const { data, error } = await supabase
        .from('orders')
        .select('id, created_at, status')
        .eq('id', String(order.id))
        .maybeSingle();

      if (!error && data && data.id) {
        setIsVerifiedInSupabase(true);
        setIsVerifying(false);
        return;
      }

      // 2. Server persistence fallback verification
      const res = await fetch(`/api/orders/${order.id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.order) {
          setIsVerifiedInSupabase(true);
          setIsVerifying(false);
          return;
        }
      }

      // If neither has confirmed yet, schedule a short retry (for async cloud propagation)
      const timer = setTimeout(async () => {
        try {
          const { data: retryData } = await supabase
            .from('orders')
            .select('id')
            .eq('id', String(order.id))
            .maybeSingle();

          if (retryData && retryData.id) {
            setIsVerifiedInSupabase(true);
          } else {
            setVerificationError('ఆర్డర్ ఇంకా క్లౌడ్ డేటాబేస్ లో ధృవీకరించబడలేదు. దయచేసి కాసేపటి తర్వాత ప్రయత్నించండి.');
            setIsVerifiedInSupabase(false);
          }
        } catch {
          setIsVerifiedInSupabase(false);
        } finally {
          setIsVerifying(false);
        }
      }, 1500);

      return () => clearTimeout(timer);
    } catch (err: any) {
      console.warn('[WhatsApp Confirmation] Verification exception:', err?.message);
      setIsVerifiedInSupabase(false);
      setIsVerifying(false);
      setVerificationError('Supabase డేటాబేస్ కనెక్షన్ అందుబాటులో లేదు.');
    }
  }, [order?.id]);

  useEffect(() => {
    verifyOrderInSupabase();
  }, [verifyOrderInSupabase]);

  // Clean and validate target phone number
  const activeDigits = inputPhone.replace(/\D/g, '');
  const isValidPhone = activeDigits.length >= 10;
  const normalizedPhone = formatWhatsAppPhoneNumber(activeDigits);

  const { statusText, badgeTelugu } = getAccuratePaymentStatusText(order);

  // Handle WhatsApp Click-to-Chat trigger
  const handleOpenWhatsApp = () => {
    if (!isValidPhone) {
      setIsEditingPhone(true);
      return;
    }

    const messageText = generateWhatsAppOrderConfirmationText(order, normalizedPhone);
    const clickToChatUrl = buildWhatsAppClickToChatUrl(normalizedPhone, messageText);

    // Open WhatsApp Click-to-Chat
    if (typeof window !== 'undefined') {
      window.open(clickToChatUrl, '_blank', 'noopener,noreferrer');
      setHasSent(true);
    }
  };

  // RULE: If order is verifying or NOT saved in Supabase, do NOT display the confirmation trigger
  if (isVerifying) {
    return (
      <div className={`p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 ${className}`}>
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
          <span>ఆర్డర్ వివరాలు Supabase లో ధృవీకరించబడుతున్నాయి...</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400">Verifying DB</span>
      </div>
    );
  }

  // RULE: If order failed to save in Supabase, hide the WhatsApp confirmation option
  if (!isVerifiedInSupabase) {
    if (verificationError) {
      return (
        <div className={`p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 ${className}`}>
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">డేటాబేస్ సేవ్ కాలేదు</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              ఆర్డర్ Supabase లో విజయవంతంగా సేవ్ అయిన తర్వాత మాత్రమే WhatsApp కన్ఫర్మేషన్ అందుబాటులో ఉంటుంది.
            </p>
          </div>
          <button 
            type="button" 
            onClick={verifyOrderInSupabase}
            className="text-[10px] font-bold underline cursor-pointer text-amber-700 dark:text-amber-400"
          >
            రీట్రై
          </button>
        </div>
      );
    }
    return null;
  }

  // Compact render mode (e.g. for Order History toolbar)
  if (compact) {
    if (isVerifying || !isVerifiedInSupabase) {
      return null;
    }
    return (
      <button
        type="button"
        onClick={handleOpenWhatsApp}
        className={`px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] transition flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs ${className}`}
        title="Send Order Confirmation on WhatsApp"
      >
        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
        <span>WhatsApp</span>
      </button>
    );
  }

  return (
    <div 
      id={`whatsapp-order-confirmation-${order.id}`}
      className={`bg-white dark:bg-zinc-900 border-2 border-emerald-500/30 dark:border-emerald-500/20 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3.5 ${className}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-xs shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5">
              <span>ఉచిత WhatsApp ఆర్డర్ కన్ఫర్మేషన్</span>
            </h4>
            <p className="text-[10.5px] text-zinc-400">
              Free WhatsApp Order Confirmation (Click-to-Chat)
            </p>
          </div>
        </div>

        {/* Database Verification Badge */}
        <span className="text-[9px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 font-extrabold uppercase px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          <span>✓ Supabase Verified</span>
        </span>
      </div>

      {/* Summary Box with Accurate Payment Status */}
      <div className="p-3 bg-slate-50 dark:bg-zinc-800/70 rounded-2xl border border-slate-100 dark:border-zinc-800 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono font-bold text-zinc-500">
            Order #{order.id.replace(/^order_/, '').slice(-6).toUpperCase()}
          </span>
          <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
            ₹{order.finalAmount}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/50 dark:border-zinc-700/50">
          <span className="text-zinc-500">చెల్లింపు విధానం (Payment):</span>
          <span className="font-bold text-zinc-800 dark:text-zinc-200">
            {order.paymentMethod === 'COD' ? 'Cash on Delivery' : order.paymentMethod || 'UPI'}
          </span>
        </div>

        {/* Payment Status Badge - Strictly honest for COD & pending UPI */}
        <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-700/80 flex items-start gap-2">
          <span className="text-sm shrink-0">
            {order.paymentMethod === 'COD' ? '💵' : '📱'}
          </span>
          <div className="text-[10.5px]">
            <p className="font-bold text-zinc-900 dark:text-zinc-100">
              {statusText}
            </p>
            <p className="text-[9.5px] text-zinc-400">
              {badgeTelugu}
            </p>
          </div>
        </div>
      </div>

      {/* Phone Number Input / Confirmation */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
            <Phone className="w-3.5 h-3.5 text-emerald-600" />
            <span>కస్టమర్ WhatsApp నంబర్:</span>
          </span>
          {isEditingPhone ? (
            <span className="text-[9.5px] text-zinc-400 font-mono">10-Digit Mobile</span>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingPhone(true)}
              className="text-[10px] text-orange-600 font-bold hover:underline cursor-pointer"
            >
              మార్చండి (Change)
            </button>
          )}
        </div>

        {isEditingPhone ? (
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-zinc-400">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={inputPhone}
                onChange={e => setInputPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="9876543210"
                className="w-full pl-11 pr-3 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-mono font-bold text-zinc-900 dark:text-zinc-50 focus:outline-none focus:border-emerald-500"
              />
            </div>
            {isValidPhone && (
              <button
                type="button"
                onClick={() => setIsEditingPhone(false)}
                className="px-3 py-2 bg-slate-150 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-200 transition cursor-pointer"
              >
                సరే (OK)
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/80 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100">
            <span>+91 {inputPhone}</span>
            <span className="text-[9.5px] text-emerald-600 dark:text-emerald-400 font-sans font-bold flex items-center gap-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> సిద్ధంగా ఉంది
            </span>
          </div>
        )}
      </div>

      {/* Main Required Action Button: "Send Order Confirmation on WhatsApp" */}
      <button
        type="button"
        id="send-order-confirmation-whatsapp-btn"
        disabled={!isValidPhone}
        onClick={handleOpenWhatsApp}
        className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-black rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
      >
        <MessageSquare className="w-4 h-4 fill-white" />
        <span>Send Order Confirmation on WhatsApp</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>

      {/* Telugu helper instruction */}
      <div className="text-center space-y-0.5">
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
          ఈ బటన్ నొక్కగానే WhatsApp తెరుచుకుని ఆర్డర్ వివరాలు ఆటోమేటిక్‌గా ఫిల్ అవుతాయి. మీరు సులభంగా Send నొక్కవచ్చు.
        </p>
        <p className="text-[9px] text-zinc-400">
          100% ఉచితం • ఎటువంటి అదనపు ఛార్జీలు లేదా API క్రెడెన్షియల్స్ అవసరం లేదు
        </p>
      </div>

      {hasSent && (
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center text-[10px] text-emerald-800 dark:text-emerald-200 font-bold flex items-center justify-center gap-1.5 animate-fadeIn">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>WhatsApp ఓపెన్ చేయబడింది. సందేశాన్ని సమీక్షించి Send నొక్కండి!</span>
        </div>
      )}
    </div>
  );
}
