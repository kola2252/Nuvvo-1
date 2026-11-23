/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Automatic WhatsApp Cloud API Notification Status Tracker
 *
 * Displays genuine server-side Meta WhatsApp Cloud API delivery lifecycle status
 * for both Admin (+91 ••••••2135) and Consented Customer recipients:
 * Pending -> Submitted -> Sent -> Delivered -> Read | Failed | Consent Not Granted.
 * Zero Click-to-Chat URLs, zero manual Send buttons, zero faked statuses.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Clock,
  CheckCheck,
  XCircle,
  ShieldAlert
} from 'lucide-react';
import { Order } from '../types';
import { getActiveAuthToken } from '../utils/supabase/client';

interface NotificationTrackingRow {
  id: string;
  orderId: string;
  recipientRole: 'admin' | 'customer';
  recipientMasked: string;
  notificationType: string;
  templateName: string;
  status: string;
  messageId: string | null;
  consentVerified: boolean;
  errorMessage: string | null;
  submittedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WhatsAppOrderConfirmationProps {
  order: Order;
  customerPhone?: string;
  className?: string;
  compact?: boolean;
}

const STATUS_BADGE_MAP: Record<string, { label: string; tone: string }> = {
  read: {
    label: 'Read',
    tone: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60'
  },
  delivered: {
    label: 'Delivered',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
  },
  sent: {
    label: 'Sent',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
  },
  submitted: {
    label: 'Submitted',
    tone: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60'
  },
  pending: {
    label: 'Pending',
    tone: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
  },
  failed: {
    label: 'Failed',
    tone: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
  },
  skipped_no_consent: {
    label: 'No Consent',
    tone: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
  }
};

function getStatusMeta(status?: string) {
  const key = String(status || 'pending').toLowerCase();
  return STATUS_BADGE_MAP[key] || {
    label: key.toUpperCase(),
    tone: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700'
  };
}

export default function WhatsAppOrderConfirmation({
  order,
  className = '',
  compact = false
}: WhatsAppOrderConfirmationProps) {
  const [records, setRecords] = useState<NotificationTrackingRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchNotifications = useCallback(async (isManual: boolean = false) => {
    if (!order?.id) {
      setLoading(false);
      return;
    }
    if (isManual) setRefreshing(true);
    try {
      const token = await getActiveAuthToken();
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}/notifications`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.success && Array.isArray(data.notifications)) {
          setRecords(data.notifications);
        }
      }
    } catch {
      // Non-blocking status check
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [order?.id]);

  useEffect(() => {
    fetchNotifications(false);
  }, [fetchNotifications]);

  // Auto-poll briefly if any notification is still pending or submitted
  useEffect(() => {
    const hasInFlight = records.some(r => r.status === 'pending' || r.status === 'submitted');
    if (!hasInFlight) return;
    const timer = setInterval(() => {
      fetchNotifications(false);
    }, 5000);
    return () => clearInterval(timer);
  }, [records, fetchNotifications]);

  const adminRecord = records.find(r => r.recipientRole === 'admin');
  const customerRecord = records.find(r => r.recipientRole === 'customer');

  if (compact) {
    if (loading) {
      return (
        <span className={`px-2.5 py-1 rounded-md border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-500 inline-flex items-center gap-1 ${className}`}>
          <Clock className="w-3 h-3" />
          <span>WA Checking</span>
        </span>
      );
    }

    const primaryRecord = customerRecord || adminRecord;
    const badge = getStatusMeta(primaryRecord?.status || 'pending');
    return (
      <span
        className={`px-2.5 py-1 rounded-md border text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap ${badge.tone} ${className}`}
        title={primaryRecord?.errorMessage || `Automatic WhatsApp status: ${badge.label}`}
      >
        <MessageSquare className="w-3 h-3" />
        <span>WA: {badge.label}</span>
      </span>
    );
  }

  const renderStatusIcon = (status?: string) => {
    switch (status) {
      case 'read':
      case 'delivered':
        return <CheckCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'sent':
      case 'submitted':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />;
      case 'skipped_no_consent':
        return <ShieldAlert className="w-4 h-4 text-zinc-400 shrink-0" />;
      default:
        return <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />;
    }
  };

  return (
    <div
      id={`whatsapp-auto-notification-status-${order.id}`}
      className={`bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5 ${className}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-black text-zinc-900 dark:text-zinc-50 truncate">
              Automatic WhatsApp Notifications
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Official Meta Cloud API backend dispatch for Order #{order.id.replace(/^order_/, '').slice(-6).toUpperCase()}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchNotifications(true)}
          disabled={refreshing}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 text-xs text-zinc-500 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
          <span>Loading WhatsApp Cloud API delivery records...</span>
        </div>
      ) : records.length === 0 ? (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/70 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-zinc-400 shrink-0" />
          <span>Notification outbox record will appear once the order sync completes on the backend.</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {records.map(rec => {
            const meta = getStatusMeta(rec.status);
            return (
              <div
                key={rec.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-800 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {renderStatusIcon(rec.status)}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                        {rec.recipientRole === 'admin' ? 'Admin Order Alert' : 'Customer Notification'}{' '}
                        <span className="font-mono text-[11px] font-normal text-zinc-500 dark:text-zinc-400 tabular-nums">
                          ({rec.recipientMasked})
                        </span>
                      </p>
                      <p className="text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                        Template: {rec.templateName}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase whitespace-nowrap shrink-0 ${meta.tone}`}>
                    {meta.label}
                  </span>
                </div>

                {rec.messageId && (
                  <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
                    WAMID: {rec.messageId}
                  </p>
                )}

                {rec.status === 'skipped_no_consent' && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Customer WhatsApp opt-in consent was not granted for this order. Admin notification was still dispatched independently.
                  </p>
                )}

                {rec.status === 'failed' && rec.errorMessage && (
                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-[11px] text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{rec.errorMessage}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
