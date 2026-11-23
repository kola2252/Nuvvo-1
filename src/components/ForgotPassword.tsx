/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Mail,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ArrowLeft,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const RESET_COOLDOWN_STORAGE_KEY = 'nuvvo_pwd_reset_cooldown_until';
const RESET_COOLDOWN_TOTAL_KEY = 'nuvvo_pwd_reset_cooldown_total';
const RESET_LAST_TARGET_KEY = 'nuvvo_pwd_reset_last_target';
const DEFAULT_COOLDOWN_SECONDS = 60;

export interface ForgotPasswordProps {
  initialEmail?: string;
  initialError?: string;
  onBackToSignIn?: () => void;
  onResetSent?: (email: string) => void;
}

function formatCooldown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s >= 60) {
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${String(rem).padStart(2, '0')}`;
  }
  return `${s}s`;
}

export default function ForgotPassword({
  initialEmail = '',
  initialError = '',
  onBackToSignIn,
  onResetSent
}: ForgotPasswordProps) {
  const { requestCustomerPasswordReset } = useApp();

  const [email, setEmail] = useState(() => {
    if (initialEmail) return initialEmail;
    try {
      return localStorage.getItem(RESET_LAST_TARGET_KEY) || '';
    } catch {
      return '';
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [cooldownTotal, setCooldownTotal] = useState<number>(() => {
    try {
      const savedTotal = Number(localStorage.getItem(RESET_COOLDOWN_TOTAL_KEY) || 0);
      return savedTotal > 0 ? savedTotal : DEFAULT_COOLDOWN_SECONDS;
    } catch {
      return DEFAULT_COOLDOWN_SECONDS;
    }
  });
  const [resendCooldown, setResendCooldown] = useState<number>(() => {
    try {
      const until = Number(localStorage.getItem(RESET_COOLDOWN_STORAGE_KEY) || 0);
      const rem = Math.ceil((until - Date.now()) / 1000);
      return rem > 0 ? rem : 0;
    } catch {
      return 0;
    }
  });
  const [resendCount, setResendCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState(initialError);
  const [successMsg, setSuccessMsg] = useState('');

  const activateCooldown = (seconds: number, targetIdentifier?: string) => {
    const safeSec = Math.max(15, Math.round(seconds));
    const expiresAt = Date.now() + safeSec * 1000;
    setCooldownTotal(safeSec);
    setResendCooldown(safeSec);
    try {
      localStorage.setItem(RESET_COOLDOWN_STORAGE_KEY, String(expiresAt));
      localStorage.setItem(RESET_COOLDOWN_TOTAL_KEY, String(safeSec));
      if (targetIdentifier) {
        localStorage.setItem(RESET_LAST_TARGET_KEY, targetIdentifier);
      }
    } catch {}
  };

  useEffect(() => {
    if (initialEmail && !email) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  useEffect(() => {
    if (initialError) {
      setErrorMsg(initialError);
    }
  }, [initialError]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      try {
        localStorage.removeItem(RESET_COOLDOWN_STORAGE_KEY);
      } catch {}
      return;
    }
    const timer = setInterval(() => {
      try {
        const until = Number(localStorage.getItem(RESET_COOLDOWN_STORAGE_KEY) || 0);
        if (until > 0) {
          const rem = Math.ceil((until - Date.now()) / 1000);
          setResendCooldown(rem > 0 ? rem : 0);
          return;
        }
      } catch {}
      setResendCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e?: React.FormEvent, isResendAction = false) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (resendCooldown > 0) {
      setErrorMsg(`Please wait ${formatCooldown(resendCooldown)} before requesting another password reset email.`);
      return;
    }

    const cleanInput = email.trim();
    if (!cleanInput) {
      setErrorMsg('Please enter your registered email address or username.');
      return;
    }

    if (cleanInput.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRegex.test(cleanInput.toLowerCase())) {
        setErrorMsg('Please enter a valid email address (for example, name@gmail.com).');
        return;
      }
    } else if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(cleanInput)) {
      setErrorMsg('Please enter a valid email address or username (3-30 characters).');
      return;
    }

    const normalizedIdentifier = cleanInput.toLowerCase();
    setIsLoading(true);
    const res = await requestCustomerPasswordReset(normalizedIdentifier);
    setIsLoading(false);

    if (res.success) {
      setIsSent(true);
      if (isResendAction) {
        setResendCount(c => c + 1);
      }
      activateCooldown(res.cooldownSeconds || DEFAULT_COOLDOWN_SECONDS, normalizedIdentifier);
      const confirmationText =
        res.message ||
        `If an account is registered with ${normalizedIdentifier}, a Supabase password reset link has been sent to your inbox.`;
      setSuccessMsg(
        isResendAction
          ? `Fresh password reset email dispatched! ${confirmationText}`
          : confirmationText
      );
      if (onResetSent) {
        onResetSent(normalizedIdentifier);
      }
    } else {
      if (res.retryAfterSeconds && res.retryAfterSeconds > 0) {
        activateCooldown(res.retryAfterSeconds, normalizedIdentifier);
      }
      setErrorMsg(res.error || 'Unable to send password reset email. Please try again.');
    }
  };

  const cooldownProgressPct =
    resendCooldown > 0 && cooldownTotal > 0
      ? Math.min(100, Math.max(0, Math.round(((cooldownTotal - resendCooldown) / cooldownTotal) * 100)))
      : 100;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 font-mono bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/40">
          <KeyRound className="w-3.5 h-3.5" /> Password Recovery
        </div>
        <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">
          {isSent ? 'Check Your Email' : 'Forgot Password?'}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">
          {isSent
            ? 'Click the recovery link in your email to set a new password. Remember to check your Spam or Promotions folder.'
            : 'Enter your registered email address or username and we will send you a secure Supabase password reset link.'}
        </p>
      </div>

      {/* Inline Error Banner */}
      {errorMsg && (
        <div
          role="alert"
          className="bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs p-3.5 rounded-2xl font-medium flex items-start gap-2 shadow-xs"
        >
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            aria-label="Dismiss error"
            className="text-[11px] font-black text-rose-700 dark:text-rose-300 hover:underline uppercase tracking-wider flex items-center gap-1 cursor-pointer shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Inline Success Banner */}
      {successMsg && (
        <div
          role="status"
          className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs p-3.5 rounded-2xl font-medium flex items-start gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{successMsg}</span>
        </div>
      )}

      {/* Persistent Rate-Limiting Cooldown Indicator */}
      {resendCooldown > 0 && (
        <div
          aria-live="polite"
          className="p-3 rounded-2xl bg-amber-50/90 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/60 space-y-2"
        >
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-800 dark:text-amber-300">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Rate-Limit Cooldown Active</span>
            </span>
            <span className="font-mono font-black px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200">
              {formatCooldown(resendCooldown)}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-amber-200/70 dark:bg-amber-900/40 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-500 rounded-full"
              style={{ width: `${cooldownProgressPct}%` }}
            />
          </div>
          <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3 h-3 shrink-0" />
            <span>
              To prevent spam, you can request or resend another reset email in{' '}
              <strong className="font-mono">{formatCooldown(resendCooldown)}</strong>.
            </span>
          </p>
        </div>
      )}

      {isSent ? (
        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-2xl bg-orange-50/70 dark:bg-zinc-800/80 border border-orange-200/80 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-200 text-center space-y-1">
            <p className="font-bold">Password reset email requested for:</p>
            <p className="font-mono font-black text-orange-600 dark:text-orange-400 break-all">
              {email.trim().toLowerCase()}
            </p>
            {resendCount > 0 && (
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold">
                Resent {resendCount} {resendCount === 1 ? 'time' : 'times'}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={isLoading || resendCooldown > 0}
            onClick={() => handleSubmit(undefined, true)}
            className="w-full py-3.5 px-4 rounded-2xl bg-orange-50 hover:bg-orange-100 border border-orange-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 dark:border-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed text-xs font-black text-orange-700 dark:text-orange-400 cursor-pointer transition flex items-center justify-center gap-2"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>
              {isLoading
                ? 'Resending Reset Email...'
                : resendCooldown > 0
                ? `Resend Password Reset Email (${formatCooldown(resendCooldown)})`
                : 'Resend Password Reset Email'}
            </span>
          </button>

          <div className="flex items-center justify-between pt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setIsSent(false);
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className="font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
            >
              Use a different account
            </button>
            {onBackToSignIn && (
              <button
                type="button"
                onClick={onBackToSignIn}
                className="font-bold text-zinc-500 hover:underline cursor-pointer flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={e => handleSubmit(e, false)} className="space-y-3.5" noValidate>
          <div>
            <label
              htmlFor="forgot-password-email"
              className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1"
            >
              Registered Email Address or Username
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                id="forgot-password-email"
                type="text"
                required
                autoFocus
                autoComplete="username"
                placeholder="e.g. customer@gmail.com or username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || resendCooldown > 0}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" />
            <span>
              {isLoading
                ? 'Sending Reset Link...'
                : resendCooldown > 0
                ? `Wait ${formatCooldown(resendCooldown)} to Send Again`
                : 'Send Password Reset Email'}
            </span>
          </button>

          {onBackToSignIn && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={onBackToSignIn}
                className="text-xs font-bold text-zinc-500 hover:underline cursor-pointer inline-flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            </div>
          )}
        </form>
      )}
    </motion.div>
  );
}
