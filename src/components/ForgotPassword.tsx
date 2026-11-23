/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Mail, KeyRound, CheckCircle2, AlertCircle, RotateCcw, ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';

export interface ForgotPasswordProps {
  initialEmail?: string;
  initialError?: string;
  onBackToSignIn?: () => void;
  onResetSent?: (email: string) => void;
}

export default function ForgotPassword({
  initialEmail = '',
  initialError = '',
  onBackToSignIn,
  onResetSent
}: ForgotPasswordProps) {
  const { requestCustomerPasswordReset } = useApp();

  const [email, setEmail] = useState(initialEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [errorMsg, setErrorMsg] = useState(initialError);
  const [successMsg, setSuccessMsg] = useState('');

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
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Please enter your registered email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address (for example, name@gmail.com).');
      return;
    }

    setIsLoading(true);
    const res = await requestCustomerPasswordReset(cleanEmail);
    setIsLoading(false);

    if (res.success) {
      setIsSent(true);
      setResendCooldown(45);
      const confirmationText =
        res.message ||
        `If an account is registered with ${cleanEmail}, a Supabase password reset link has been sent to your inbox.`;
      setSuccessMsg(confirmationText);
      if (onResetSent) {
        onResetSent(cleanEmail);
      }
    } else {
      setErrorMsg(res.error || 'Unable to send password reset email. Please try again.');
    }
  };

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
            : 'Enter your registered email address and we will send you a secure Supabase password reset link.'}
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

      {isSent ? (
        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-2xl bg-orange-50/70 dark:bg-zinc-800/80 border border-orange-200/80 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-200 text-center space-y-1">
            <p className="font-bold">Password reset email sent to:</p>
            <p className="font-mono font-black text-orange-600 dark:text-orange-400 break-all">
              {email.trim().toLowerCase()}
            </p>
          </div>

          <button
            type="button"
            disabled={isLoading || resendCooldown > 0}
            onClick={() => handleSubmit()}
            className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 disabled:opacity-50 text-xs font-black text-zinc-700 dark:text-zinc-200 cursor-pointer transition"
          >
            {isLoading
              ? 'Sending Reset Link...'
              : resendCooldown > 0
              ? `Resend Reset Email (${resendCooldown}s)`
              : 'Resend Password Reset Email'}
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
              Use a different email
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
        <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
          <div>
            <label
              htmlFor="forgot-password-email"
              className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1"
            >
              Registered Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                id="forgot-password-email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="e.g. customer@gmail.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" />
            <span>{isLoading ? 'Sending Reset Link...' : 'Send Password Reset Email'}</span>
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
