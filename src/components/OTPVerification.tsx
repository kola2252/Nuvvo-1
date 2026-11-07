/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OTPVerification Component
 * 
 * Validates 6-digit OTP codes against the Supabase `user_otps` table
 * (via the `/api/auth/verify-db-otp` or `/api/auth/verify-email-otp` endpoints).
 * Supports automatic attempt countdown, expiration timer, and resend workflows.
 */

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { CheckCircle2, RotateCcw, ShieldCheck, Mail, ArrowLeft, AlertCircle } from "lucide-react";

export interface OTPVerificationProps {
  identifier: string; // Email or Mobile Number
  purpose?: string;   // 'email_login' | 'registration' | 'login' | 'password_reset'
  title?: string;
  subtitle?: string;
  onSuccess: (result: { token?: string; user?: any; metadata?: any }) => void;
  onBack?: () => void;
  onResend?: () => Promise<boolean | void>;
  notice?: string;
  autoFocus?: boolean;
}

export default function OTPVerification({
  identifier,
  purpose = "email_login",
  title = "Verify Login Code",
  subtitle,
  onSuccess,
  onBack,
  onResend,
  notice,
  autoFocus = true
}: OTPVerificationProps) {
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [resendTimer, setResendTimer] = useState(60);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Resend cooldown timer (60-second cooldown to prevent spamming)
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const cleanCode = otpCode.trim().replace(/\D/g, "");
    if (!cleanCode || cleanCode.length !== 6) {
      setErrorMsg("Please enter the complete 6-digit verification code.");
      return;
    }

    setIsLoading(true);

    try {
      // Validate against the Supabase user_otps table
      const res = await fetch("/api/auth/verify-db-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier,
          otp: cleanCode,
          purpose
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setSuccessMsg("Verification successful! Logging you in...");
        if (data.token) {
          try {
            localStorage.setItem("nuvvo_auth_token", data.token);
          } catch {}
        }
        setTimeout(() => {
          onSuccess(data);
        }, 400);
      } else {
        if (typeof data.remainingAttempts === "number") {
          setRemainingAttempts(data.remainingAttempts);
        }
        setErrorMsg(data.error || "Verification failed. Please check the code and try again.");
      }
    } catch (err: any) {
      // Fallback: try universal /api/auth/verify-email-otp
      try {
        const fallbackRes = await fetch("/api/auth/verify-email-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: identifier,
            otp: cleanCode
          })
        });
        const fallbackData = await fallbackRes.json().catch(() => ({}));
        if (fallbackRes.ok && fallbackData.success) {
          setSuccessMsg("Verification successful!");
          onSuccess(fallbackData);
          return;
        }
      } catch {}

      setErrorMsg("Unable to connect to verification service. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendClick = async () => {
    if (resendTimer > 0 || isLoading) return;
    setErrorMsg("");
    setSuccessMsg("");
    setIsLoading(true);

    try {
      if (onResend) {
        await onResend();
      } else {
        // Default resend trigger
        await fetch("/api/auth/send-email-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: identifier,
            fullName: "Valued Customer",
            location: "Chirala"
          })
        });
      }
      setSuccessMsg("A fresh 6-digit code has been sent!");
      setResendTimer(60);
      setOtpCode("");
    } catch {
      setErrorMsg("Failed to resend code. Please try again shortly.");
    } finally {
      setIsLoading(false);
    }
  };

  const maskedIdentifier = identifier.includes("@")
    ? `${identifier[0]}***@${identifier.split("@")[1]}`
    : identifier.length >= 10
      ? `+91 ${identifier.slice(0, 2)}••••••${identifier.slice(-2)}`
      : identifier;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-full">
      <div className="text-center mb-5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 font-mono bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/40">
          <ShieldCheck className="w-3.5 h-3.5" /> Supabase Database Verification
        </div>
        <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">{title}</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          {subtitle || (
            <>
              Enter the 6-digit code issued for{" "}
              <strong className="text-zinc-800 dark:text-zinc-200">{maskedIdentifier}</strong>
            </>
          )}
        </p>
      </div>

      {notice && (
        <div className="mb-4 p-3 bg-orange-50 dark:bg-zinc-800/80 border border-orange-200 dark:border-zinc-700 rounded-2xl text-xs space-y-1">
          <p className="text-zinc-700 dark:text-zinc-300 font-medium">{notice}</p>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs p-3 rounded-2xl font-medium flex items-start gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{errorMsg}</span>
            {remainingAttempts !== null && remainingAttempts > 0 && (
              <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300 mt-0.5">
                {remainingAttempts} attempt{remainingAttempts === 1 ? "" : "s"} remaining before temporary lockout.
              </p>
            )}
          </div>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs p-3 rounded-2xl font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1.5 text-center">
            Enter 6-Digit Code
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoFocus={autoFocus}
            maxLength={6}
            pattern="[0-9]*"
            placeholder="• • • • • •"
            value={otpCode}
            onChange={e => setOtpCode(e.target.value.replace(/\D/g, ""))}
            className="w-full bg-slate-50 dark:bg-zinc-800 text-center font-mono text-2xl font-black tracking-[0.4em] py-3.5 rounded-2xl border border-slate-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || otpCode.length < 6}
          className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <RotateCcw className="w-4 h-4 animate-spin" />
              <span>Verifying against database...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Verify & Complete Login</span>
            </>
          )}
        </button>
      </form>

      <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100 dark:border-zinc-800 text-xs text-zinc-500">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 font-bold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        ) : (
          <span />
        )}

        <div>
          {resendTimer > 0 ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-zinc-800 rounded-xl text-zinc-500 font-mono text-[11px]">
              <RotateCcw className="w-3 h-3 animate-spin text-zinc-400" />
              <span>Resend OTP in <strong>{resendTimer}s</strong></span>
            </div>
          ) : (
            <button
              type="button"
              disabled={isLoading}
              onClick={handleResendClick}
              className="px-3 py-1 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/40 text-orange-600 dark:text-orange-400 font-extrabold rounded-xl text-xs transition cursor-pointer flex items-center gap-1 border border-orange-200 dark:border-orange-800/60 active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resend OTP</span>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
