/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { motion } from 'motion/react';
import { 
  Phone, Lock, User, Mail, MapPin, Globe, ShieldCheck, 
  ShoppingBag, Building, RotateCcw, CheckCircle2, KeyRound,
  Eye, EyeOff, LayoutDashboard, Settings, Home
} from 'lucide-react';
import NuvvoLogo from './NuvvoLogo';
import ForgotPassword from './ForgotPassword';
import { translations } from '../utils/translations';
import { getAuthPersistencePreference } from '../utils/supabase/client';

type AuthStep = 
  | 'customer_login'           // Username or Email + Password
  | 'customer_register'        // Full Password-based Customer Registration Form
  | 'customer_verify_email'    // First-time Supabase Email Confirmation Notice
  | 'customer_forgot_password' // Send Verified Password Reset Email
  | 'customer_recovery_reset'  // Supabase PASSWORD_RECOVERY New Password Form
  | 'admin_phone'              // Admin mobile entry
  | 'admin_pin'                // Server-prompted Admin PIN entry
  | 'admin_choice_modal'       // Dialog: "Open Admin Dashboard" vs "Open Admin Settings"
  | 'partner_phone'            // Franchise mobile entry
  | 'partner_otp';             // Franchise mobile OTP

export default function Auth() {
  const { 
    isPasswordRecoveryMode,
    authRecoveryError,
    clearAuthRecoveryError,
    cancelPasswordRecoveryMode,
    registerCustomerWithPassword,
    loginCustomerWithPassword,
    resendCustomerVerificationEmail,
    completeCustomerPasswordRecovery,
    adminCheckPhone, 
    adminVerifyPin,
    loginWithPhone, 
    verifyOtpAndLogin, 
    setCurrentPage, 
    language, 
    setLanguage 
  } = useApp();

  const t = translations[language] || translations.en;

  // Primary Role selection: Customer | Admin | Franchise (internal delivery managed via admin)
  const [roleOption, setRoleOption] = useState<string>(() => {
    if (isPasswordRecoveryMode || authRecoveryError) return 'Customer';
    try {
      const saved = localStorage.getItem('nuvvo_auth_role');
      if (saved && saved !== 'Delivery Partner') return saved;
    } catch {}
    return 'Customer';
  });

  // Current active sub-step
  const [step, setStep] = useState<AuthStep>(() => {
    if (isPasswordRecoveryMode) return 'customer_recovery_reset';
    if (authRecoveryError) return 'customer_forgot_password';
    return 'customer_login';
  });

  // Sync automatically if Supabase enters PASSWORD_RECOVERY mode or returns a link error
  useEffect(() => {
    if (isPasswordRecoveryMode) {
      setRoleOption('Customer');
      setStep('customer_recovery_reset');
      setErrorMsg('');
      setSuccessMsg('Email link verified! Please set your new account password below.');
    }
  }, [isPasswordRecoveryMode]);

  useEffect(() => {
    if (authRecoveryError) {
      setRoleOption('Customer');
      const friendlyMsg =
        authRecoveryError.toLowerCase().includes('expired') || authRecoveryError.toLowerCase().includes('invalid')
          ? `${authRecoveryError} Please request a new password reset link below.`
          : authRecoveryError;
      if (isPasswordRecoveryMode) {
        setErrorMsg(friendlyMsg);
      } else {
        setInitialForgotError(friendlyMsg);
        setStep('customer_forgot_password');
      }
      clearAuthRecoveryError();
    }
  }, [authRecoveryError, isPasswordRecoveryMode]);

  // Customer Login state
  const [loginIdentifier, setLoginIdentifier] = useState(''); // username or email
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState<boolean>(() => getAuthPersistencePreference());
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState('');

  // Customer Forgot & Recovery Password state
  const [initialForgotError, setInitialForgotError] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [showRecoveryConfirmPassword, setShowRecoveryConfirmPassword] = useState(false);

  // Customer Registration Form state (Single comprehensive password registration form)
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regLocation, setRegLocation] = useState('Chirala Central Hub');
  const [regDeliveryAddress, setRegDeliveryAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regWhatsappNumber, setRegWhatsappNumber] = useState('');
  const [regWhatsappOptIn, setRegWhatsappOptIn] = useState(false); // Explicitly unchecked by default

  // Admin Security Flow - Admin must manually enter mobile number and master password/PIN
  const [adminPhoneNumber, setAdminPhoneNumber] = useState('');
  const [adminPinCode, setAdminPinCode] = useState('');
  const [adminMaskedPhone, setAdminMaskedPhone] = useState('');
  const [isAdminAccountConfirmed, setIsAdminAccountConfirmed] = useState(false);
  const [confirmedAdminPhone, setConfirmedAdminPhone] = useState('');

  // Partner / Franchise mobile state
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerOtp, setPartnerOtp] = useState('');

  // Resend timer for Franchise OTP & verification email resend
  const [resendTimer, setResendTimer] = useState(30);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Universal UI feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Switch Role handler
  const handleSelectRole = (newRole: string) => {
    if (isPasswordRecoveryMode) {
      cancelPasswordRecoveryMode();
    }
    setRoleOption(newRole);
    setErrorMsg('');
    setSuccessMsg('');
    setPendingVerifyEmail('');
    try {
      localStorage.setItem('nuvvo_auth_role', newRole);
    } catch {}

    if (newRole === 'Customer') {
      setStep('customer_login');
    } else if (newRole === 'Admin') {
      setStep('admin_phone');
      setAdminPhoneNumber('');
      setAdminMaskedPhone('');
      setIsAdminAccountConfirmed(false);
      setConfirmedAdminPhone('');
      setAdminPinCode('');
    } else {
      setStep('partner_phone');
    }
  };

  // Timer countdown for Franchise OTP resend & verification email resend
  useEffect(() => {
    if ((step !== 'partner_otp' && step !== 'customer_verify_email') || resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  // ==========================================
  // CUSTOMER PASSWORD-BASED REGISTRATION
  // ==========================================
  const handleCustomerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanFullName = regFullName.trim();
    if (!cleanFullName || cleanFullName.length < 2) {
      setErrorMsg('Please enter your Full Name.');
      return;
    }

    const cleanUsername = regUsername.trim();
    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 30) {
      setErrorMsg('Username must be between 3 and 30 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
      setErrorMsg('Username can only contain letters, numbers, underscores (_), dots (.), and hyphens (-).');
      return;
    }

    const cleanEmail = regEmail.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid Email Address.');
      return;
    }

    const cleanMobile = regMobile.replace(/\D/g, '');
    if (cleanMobile.length !== 10) {
      setErrorMsg('Please enter a valid 10-digit Mobile Number.');
      return;
    }

    const cleanLocation = regLocation.trim();
    if (!cleanLocation || cleanLocation.length < 2) {
      setErrorMsg('Please enter your Location / Area.');
      return;
    }

    const cleanAddress = regDeliveryAddress.trim();
    if (!cleanAddress || cleanAddress.length < 5) {
      setErrorMsg('Please enter your Full Delivery Address.');
      return;
    }

    if (!regPassword || regPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('Password and Confirm Password do not match.');
      return;
    }

    const rawWhatsapp = regWhatsappNumber.trim();
    if (rawWhatsapp.includes('@')) {
      setErrorMsg('Email address cannot be used as a WhatsApp number. Enter a valid 10-digit WhatsApp mobile number.');
      return;
    }
    const cleanWaDigits = rawWhatsapp.replace(/\D/g, '');
    if (rawWhatsapp && cleanWaDigits.length < 10) {
      setErrorMsg('Please enter a valid 10-digit WhatsApp mobile number.');
      return;
    }
    if (regWhatsappOptIn && cleanWaDigits.length < 10) {
      setErrorMsg('Please enter a valid 10-digit WhatsApp mobile number to enable WhatsApp order updates.');
      return;
    }

    setIsLoading(true);
    const res = await registerCustomerWithPassword({
      fullName: cleanFullName,
      username: cleanUsername,
      email: cleanEmail,
      mobile: cleanMobile,
      location: cleanLocation,
      deliveryAddress: cleanAddress,
      password: regPassword,
      confirmPassword: regConfirmPassword,
      whatsappNumber: cleanWaDigits ? `+91${cleanWaDigits.slice(-10)}` : undefined,
      whatsappOptIn: regWhatsappOptIn,
      rememberMe
    });
    setIsLoading(false);

    if (!res.success) {
      setErrorMsg(res.error || 'Could not create your account. Please check your details and try again.');
      return;
    }

    if (res.requiresEmailVerification) {
      setPendingVerifyEmail(cleanEmail);
      setLoginIdentifier(cleanUsername);
      setResendTimer(30);
      setSuccessMsg(
        res.message ||
          `Account created! We sent a verification link to ${cleanEmail}. Please verify your email before signing in.`
      );
      setStep('customer_verify_email');
    } else {
      setCurrentPage('home');
    }
  };

  // ==========================================
  // CUSTOMER SIGN IN (USERNAME OR EMAIL + PASSWORD)
  // ==========================================
  const handleCustomerPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setPendingVerifyEmail('');

    if (!loginIdentifier.trim()) {
      setErrorMsg('Please enter your Username or Email Address.');
      return;
    }
    if (!loginPassword) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setIsLoading(true);
    const res = await loginCustomerWithPassword(loginIdentifier.trim(), loginPassword, rememberMe);
    setIsLoading(false);

    if (res.success) {
      setCurrentPage('home');
    } else {
      if (res.requiresEmailVerification && res.email) {
        setPendingVerifyEmail(res.email);
      }
      setErrorMsg(res.error || 'Login failed. Please verify your username/email and password.');
    }
  };

  const handleResendVerificationEmail = async (emailOrId?: string) => {
    const target = (emailOrId || pendingVerifyEmail || regEmail || loginIdentifier).trim();
    if (!target) {
      setErrorMsg('Please enter your email or username first.');
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    const res = await resendCustomerVerificationEmail(target);
    setIsLoading(false);
    if (res.success) {
      setResendTimer(30);
      setSuccessMsg(res.message || 'Verification email sent! Please check your inbox and spam folder.');
    } else {
      setErrorMsg(res.error || 'Unable to resend verification email right now.');
    }
  };

  // ==========================================
  // CUSTOMER PASSWORD RECOVERY - SET NEW PASSWORD
  // ==========================================
  const handleCustomerRecoveryPasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!recoveryNewPassword || recoveryNewPassword.length < 6) {
      setErrorMsg('New Password must be at least 6 characters long.');
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setErrorMsg('New Password and Confirm Password do not match.');
      return;
    }

    setIsLoading(true);
    const res = await completeCustomerPasswordRecovery(recoveryNewPassword);
    setIsLoading(false);

    if (res.success) {
      setRecoveryNewPassword('');
      setRecoveryConfirmPassword('');
      setLoginPassword('');
      if (res.email && !loginIdentifier.trim()) {
        setLoginIdentifier(res.email);
      }
      setSuccessMsg(res.message || 'Password updated successfully! Please sign in with your new password.');
      setStep('customer_login');
    } else {
      setErrorMsg(res.error || 'Failed to update password. Please request a fresh recovery link.');
    }
  };

  // ==========================================
  // ADMIN PHONE & SERVER PIN AUTH (PRESERVED)
  // ==========================================
  const handleAdminPhoneCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const digits = adminPhoneNumber.replace(/\D/g, '');
    if (!digits || digits.length < 10) {
      setErrorMsg('Please enter a valid 10-digit administrator mobile number.');
      return;
    }

    setIsLoading(true);
    const res = await adminCheckPhone(digits);
    setIsLoading(false);

    if (res.success && res.promptForPin) {
      setIsAdminAccountConfirmed(true);
      setConfirmedAdminPhone(digits);
      setAdminMaskedPhone(res.maskedPhone || '+91 ••••••••••');
      setStep('admin_pin');
      setAdminPinCode('');
      setSuccessMsg('Authorized administrator mobile verified. Enter your Master Password / Security PIN to continue.');
    } else {
      setIsAdminAccountConfirmed(false);
      setConfirmedAdminPhone('');
      setStep('admin_phone');
      setErrorMsg(res.error || 'Access Denied: Entered mobile number is not associated with an authorized Admin or Super Admin account.');
    }
  };

  const handleAdminVerifyPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isAdminAccountConfirmed && step !== 'admin_pin') {
      setErrorMsg('Please enter and verify your administrator mobile number first.');
      return;
    }

    const pin = adminPinCode.trim();
    if (!pin || pin.length < 4 || pin.length > 8) {
      setErrorMsg('Please enter your Master Password / Security PIN.');
      return;
    }

    const targetPhone = confirmedAdminPhone || adminPhoneNumber.replace(/\D/g, '');
    setIsLoading(true);
    const res = await adminVerifyPin(targetPhone, pin);
    setIsLoading(false);

    if (res.success) {
      setStep('admin_choice_modal');
    } else {
      setErrorMsg(res.error || 'Incorrect Master Password / PIN. Verification failed.');
    }
  };

  // ==========================================
  // PARTNER & FRANCHISE MOBILE OTP FLOW (PRESERVED)
  // ==========================================
  const handlePartnerSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const digits = partnerPhone.replace(/\D/g, '');
    if (!digits || digits.length !== 10) {
      setErrorMsg('Please supply a valid 10-digit mobile number.');
      return;
    }

    setIsLoading(true);
    const res = await loginWithPhone(digits, roleOption);
    setIsLoading(false);

    if (res.success) {
      setStep('partner_otp');
      setResendTimer(30);
    } else {
      setErrorMsg(res.error || 'Failed to dispatch verification code.');
    }
  };

  const handlePartnerVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const code = partnerOtp.trim();
    if (!code || code.length < 4) {
      setErrorMsg('Please enter your verification code.');
      return;
    }

    setIsLoading(true);
    const res = await verifyOtpAndLogin(partnerPhone, code, roleOption);
    setIsLoading(false);

    if (res.success) {
      if (roleOption === 'Delivery Partner') {
        setCurrentPage('partner');
      } else if (roleOption === 'Franchise') {
        setCurrentPage('franchise');
      } else {
        setCurrentPage('home');
      }
    } else {
      setErrorMsg(res.error || 'Verification failed. Please check the code.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen min-h-[100dvh] w-full bg-slate-50 dark:bg-zinc-950 p-3 sm:p-4 transition-colors duration-300">
      <div className="w-full max-w-md sm:max-w-lg bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Banner with Logo branding */}
        <div className="bg-gradient-to-b from-[#FAF8F5] to-white dark:from-zinc-900 dark:to-zinc-950 p-6 text-center relative border-b dark:border-zinc-800">
          <div className="absolute top-4 right-4 text-zinc-300 dark:text-zinc-700 text-3xl opacity-30 select-none">✨</div>
          <NuvvoLogo size="md" showText={true} animate={false} />
          <p className="text-[9px] font-bold font-mono tracking-widest text-zinc-400 uppercase mt-2">{t.secureGateway}</p>
        </div>

        {/* Global Language Selector Bar */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 dark:bg-zinc-850/80 border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            <Globe className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[10px] font-black uppercase tracking-wider font-mono">Language / భాష:</span>
          </div>
          <div className="flex items-center gap-1">
            {[
              { id: 'en', label: 'English', flag: '🇬🇧' },
              { id: 'te', label: 'తెలుగు', flag: '🇮🇳' },
              { id: 'hi', label: 'हिंदी', flag: '🇮🇳' }
            ].map(l => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLanguage(l.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  language === l.id
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'bg-white dark:bg-zinc-800 text-zinc-650 dark:text-zinc-350 hover:bg-slate-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700'
                }`}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Role Selector Grid */}
        <div className="p-4 pb-2 border-b border-slate-100 dark:border-zinc-800">
          <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">
            Select Portal Access Role:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'Customer', label: 'Customer', icon: ShoppingBag, color: 'orange' },
              { id: 'Admin', label: 'Admin', icon: ShieldCheck, color: 'rose' },
              { id: 'Franchise', label: 'Franchise', icon: Building, color: 'amber' }
            ].map(r => {
              const Icon = r.icon;
              const isSelected = roleOption === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRole(r.id)}
                  className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    isSelected
                      ? r.color === 'rose'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                        : 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                      : 'bg-slate-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-[10.5px] font-bold truncate w-full">{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {/* Universal Error Message Banner */}
          {errorMsg && (
            <div className="mb-4 bg-rose-50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs p-3.5 rounded-2xl font-medium flex flex-col gap-2 shadow-xs animate-fadeIn">
              <div className="flex items-start gap-2">
                <span className="text-sm">⚠️</span>
                <span className="flex-1 leading-relaxed">{errorMsg}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-rose-200/60 dark:border-rose-900/40 gap-2 flex-wrap">
                {pendingVerifyEmail && (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleResendVerificationEmail(pendingVerifyEmail)}
                    className="text-[11px] font-black text-orange-600 dark:text-orange-400 hover:underline uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                  >
                    <Mail className="w-3 h-3" /> Resend Verification Email
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-[11px] font-black text-rose-700 dark:text-rose-300 hover:underline uppercase tracking-wider flex items-center gap-1 cursor-pointer ml-auto"
                >
                  <RotateCcw className="w-3 h-3" /> Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Universal Success Message Banner */}
          {successMsg && (
            <div className="mb-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs p-3 rounded-2xl font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP: CUSTOMER LOGIN (USERNAME OR EMAIL + PASSWORD)       */}
          {/* ========================================================= */}
          {step === 'customer_login' && roleOption === 'Customer' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {/* Login / Register Tab Header */}
              <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-2xl mb-5">
                <button
                  type="button"
                  onClick={() => { setErrorMsg(''); setSuccessMsg(''); setStep('customer_login'); }}
                  className="flex-1 py-2 text-xs font-black rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-xs cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setErrorMsg(''); setSuccessMsg(''); setStep('customer_register'); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                >
                  Create Account
                </button>
              </div>

              <div className="text-center mb-4">
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Welcome Back</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Sign in with your Username or Email Address and Password
                </p>
              </div>

              <form onSubmit={handleCustomerPasswordLogin} autoComplete="on" className="space-y-3.5">
                <div>
                  <label htmlFor="customer-login-identifier" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    Username or Email Address
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      id="customer-login-identifier"
                      name="username"
                      type="text"
                      required
                      autoComplete="username"
                      placeholder="e.g. arjun22 or customer@email.com"
                      value={loginIdentifier}
                      onChange={e => setLoginIdentifier(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="customer-login-password" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      id="customer-login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-10 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        id="customer-remember-me"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                        className="w-4 h-4 accent-orange-500 rounded cursor-pointer"
                      />
                      <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                        Remember me on this device
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setSuccessMsg('');
                        setInitialForgotError('');
                        setStep('customer_forgot_password');
                      }}
                      className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer shrink-0"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 mt-2"
                >
                  {isLoading ? 'Signing In...' : 'Sign In'}
                </button>
              </form>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: CUSTOMER PASSWORD-BASED REGISTRATION                */}
          {/* ========================================================= */}
          {step === 'customer_register' && roleOption === 'Customer' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-2xl mb-5">
                <button
                  type="button"
                  onClick={() => { setErrorMsg(''); setSuccessMsg(''); setStep('customer_login'); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setErrorMsg(''); setSuccessMsg(''); setStep('customer_register'); }}
                  className="flex-1 py-2 text-xs font-black rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-xs cursor-pointer"
                >
                  Create Account
                </button>
              </div>

              <div className="text-center mb-4">
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Create Customer Account</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Register with your unique username and password to start ordering
                </p>
              </div>

              <form onSubmit={handleCustomerRegister} autoComplete="on" className="space-y-3">
                {/* Full Name & Unique Username */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-full-name" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Full Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                      <input
                        id="reg-full-name"
                        name="name"
                        type="text"
                        required
                        autoComplete="name"
                        placeholder="e.g. Ramesh Kumar"
                        value={regFullName}
                        onChange={e => setRegFullName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-username" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Unique Username *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-orange-500">@</span>
                      <input
                        id="reg-username"
                        name="username"
                        type="text"
                        required
                        autoComplete="username"
                        placeholder="e.g. arjun22"
                        value={regUsername}
                        onChange={e => setRegUsername(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ''))}
                        className="w-full bg-slate-50 dark:bg-zinc-800 pl-7 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Email & Mobile Number */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-email" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                      <input
                        id="reg-email"
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="name@gmail.com"
                        value={regEmail}
                        onChange={e => setRegEmail(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-mobile" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Mobile Number (10 Digits) *
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                      <input
                        id="reg-mobile"
                        name="tel"
                        type="tel"
                        maxLength={10}
                        required
                        autoComplete="tel-national"
                        placeholder="9876543210"
                        value={regMobile}
                        onChange={e => setRegMobile(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-slate-50 dark:bg-zinc-800 pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Location / Area */}
                <div>
                  <label htmlFor="reg-location" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    Location / Area *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input
                      id="reg-location"
                      name="address-level2"
                      type="text"
                      required
                      autoComplete="address-level2"
                      placeholder="e.g. Chirala Central Hub, Kothapet Road"
                      value={regLocation}
                      onChange={e => setRegLocation(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Full Delivery Address */}
                <div>
                  <label htmlFor="reg-delivery-address" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    Full Delivery Address *
                  </label>
                  <div className="relative">
                    <Home className="absolute left-3 top-3 w-3.5 h-3.5 text-zinc-400" />
                    <textarea
                      id="reg-delivery-address"
                      name="street-address"
                      required
                      rows={2}
                      autoComplete="street-address"
                      placeholder="Flat / House No., Street Name, Landmark, Chirala"
                      value={regDeliveryAddress}
                      onChange={e => setRegDeliveryAddress(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500 resize-none"
                    />
                  </div>
                </div>

                {/* Password & Confirm Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-password" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Password (Min 6 chars) *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                      <input
                        id="reg-password"
                        name="new-password"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        placeholder="Create password"
                        value={regPassword}
                        onChange={e => setRegPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword(p => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                      >
                        {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-confirm-password" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                      <input
                        id="reg-confirm-password"
                        name="confirm-password"
                        type={showRegConfirmPassword ? 'text' : 'password'}
                        required
                        autoComplete="new-password"
                        placeholder="Re-enter password"
                        value={regConfirmPassword}
                        onChange={e => setRegConfirmPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegConfirmPassword(p => !p)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                      >
                        {showRegConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Notification Number & Explicit Consent (Optional, unchecked by default) */}
                <div className="p-3 rounded-2xl bg-orange-50/50 dark:bg-zinc-800/70 border border-orange-200/70 dark:border-zinc-700 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-[10px] font-black text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
                      WhatsApp Mobile Number (Optional)
                    </label>
                    {regMobile.replace(/\D/g, '').length === 10 && (
                      <button
                        type="button"
                        onClick={() => setRegWhatsappNumber(regMobile.replace(/\D/g, ''))}
                        className="text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        Use mobile number
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-zinc-400">+91</span>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="10-digit WhatsApp number"
                      value={regWhatsappNumber}
                      onChange={e => setRegWhatsappNumber(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-white dark:bg-zinc-900 pl-10 pr-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer pt-0.5 select-none">
                    <input
                      type="checkbox"
                      checked={regWhatsappOptIn}
                      onChange={e => setRegWhatsappOptIn(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-orange-500 rounded cursor-pointer shrink-0"
                    />
                    <span className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-300 font-medium">
                      Send automatic order confirmations and live delivery status updates on WhatsApp. (Explicit consent; opt out anytime in Account Settings.)
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 mt-2"
                >
                  {isLoading ? 'Creating Account...' : 'Create Account'}
                </button>
              </form>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: FIRST-TIME SUPABASE EMAIL VERIFICATION NOTICE       */}
          {/* ========================================================= */}
          {step === 'customer_verify_email' && roleOption === 'Customer' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4 py-2">
              <div className="w-14 h-14 bg-orange-100 dark:bg-orange-950/40 text-orange-600 mx-auto rounded-3xl flex items-center justify-center border border-orange-200 dark:border-orange-800 shadow-sm">
                <Mail className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Confirm Your Email Address</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  We sent a verification link to{' '}
                  <strong className="text-zinc-800 dark:text-zinc-200">{pendingVerifyEmail || regEmail}</strong>.
                  Please open your inbox and confirm your email before signing in.
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setStep('customer_login');
                  }}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98"
                >
                  Proceed to Sign In
                </button>

                <button
                  type="button"
                  disabled={isLoading || resendTimer > 0}
                  onClick={() => handleResendVerificationEmail(pendingVerifyEmail || regEmail)}
                  className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 disabled:opacity-50 text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer transition"
                >
                  {resendTimer > 0 ? `Resend Verification Email (${resendTimer}s)` : 'Resend Verification Email'}
                </button>
              </div>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: CUSTOMER FORGOT PASSWORD COMPONENT                  */}
          {/* ========================================================= */}
          {step === 'customer_forgot_password' && roleOption === 'Customer' && (
            <ForgotPassword
              initialEmail={loginIdentifier.trim()}
              initialError={initialForgotError}
              onBackToSignIn={() => {
                setErrorMsg('');
                setSuccessMsg('');
                setInitialForgotError('');
                setStep('customer_login');
              }}
            />
          )}

          {/* ========================================================= */}
          {/* STEP: SUPABASE PASSWORD RECOVERY - SET NEW PASSWORD       */}
          {/* ========================================================= */}
          {step === 'customer_recovery_reset' && roleOption === 'Customer' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 font-mono bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/40">
                  <KeyRound className="w-3.5 h-3.5" /> Verified Recovery Session
                </div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Set New Password</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Enter and confirm your new password below.
                </p>
              </div>

              <form onSubmit={handleCustomerRecoveryPasswordUpdate} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    New Password (Min 6 Characters)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type={showRecoveryPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="Enter new password"
                      value={recoveryNewPassword}
                      onChange={e => setRecoveryNewPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-10 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecoveryPassword(p => !p)}
                      aria-label={showRecoveryPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      {showRecoveryPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type={showRecoveryConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="Confirm new password"
                      value={recoveryConfirmPassword}
                      onChange={e => setRecoveryConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-10 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecoveryConfirmPassword(p => !p)}
                      aria-label={showRecoveryConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      {showRecoveryConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {recoveryConfirmPassword && recoveryNewPassword !== recoveryConfirmPassword && (
                    <p className="text-[11px] font-semibold text-rose-500 mt-1">
                      Passwords do not match yet.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoading || recoveryNewPassword.length < 6 || recoveryNewPassword !== recoveryConfirmPassword}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 mt-2 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isLoading ? 'Updating Password...' : 'Save New Password'}</span>
                </button>

                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      cancelPasswordRecoveryMode();
                      setErrorMsg('');
                      setSuccessMsg('');
                      setInitialForgotError('');
                      setStep('customer_forgot_password');
                    }}
                    className="font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                  >
                    Request New Reset Link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      cancelPasswordRecoveryMode();
                      setErrorMsg('');
                      setSuccessMsg('');
                      setStep('customer_login');
                    }}
                    className="font-bold text-zinc-500 hover:underline cursor-pointer"
                  >
                    Cancel & Back to Sign In
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* ADMIN LOGIN: PIN FIELD DISPLAYED ONLY AFTER SERVER CHECK */}
          {/* ========================================================= */}
          {roleOption === 'Admin' && step !== 'admin_choice_modal' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 font-mono bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900/40">
                  🛡️ Administrator Access Gateway
                </div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">
                  {isAdminAccountConfirmed ? 'Step 2: Enter Master Password / PIN' : 'Step 1: Enter Admin Mobile Number'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isAdminAccountConfirmed
                    ? 'Administrator account confirmed. Enter your Master Password / Security PIN to unlock.'
                    : 'Manually enter your authorized administrator mobile number to continue.'}
                </p>
              </div>

              <form onSubmit={isAdminAccountConfirmed ? handleAdminVerifyPinSubmit : handleAdminPhoneCheck} autoComplete="off" className="space-y-4">
                {/* Mobile Number Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="admin-phone-input" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                      Administrator Mobile Number
                    </label>
                    {isAdminAccountConfirmed && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAdminAccountConfirmed(false);
                          setConfirmedAdminPhone('');
                          setAdminPhoneNumber('');
                          setAdminMaskedPhone('');
                          setAdminPinCode('');
                          setStep('admin_phone');
                          setErrorMsg('');
                          setSuccessMsg('');
                        }}
                        className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                      >
                        Change Number
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold font-mono text-sm">+91</span>
                    <input
                      id="admin-phone-input"
                      name="admin-mobile-entry"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={10}
                      required
                      disabled={isAdminAccountConfirmed || isLoading}
                      placeholder="Enter 10-digit admin mobile"
                      value={isAdminAccountConfirmed ? '••••••••••' : adminPhoneNumber}
                      onChange={e => {
                        setAdminPhoneNumber(e.target.value.replace(/\D/g, ''));
                        if (isAdminAccountConfirmed) {
                          setIsAdminAccountConfirmed(false);
                          setConfirmedAdminPhone('');
                          setAdminMaskedPhone('');
                          setAdminPinCode('');
                          setStep('admin_phone');
                        }
                      }}
                      className={`w-full bg-slate-50 dark:bg-zinc-800 pl-14 pr-10 py-3 rounded-2xl border transition-all ${
                        isAdminAccountConfirmed 
                          ? 'border-emerald-500/70 bg-emerald-50/20 text-emerald-900 dark:text-emerald-100 font-bold' 
                          : 'border-slate-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                      } font-mono text-base tracking-widest focus:outline-none focus:border-rose-500`}
                    />
                    {isAdminAccountConfirmed && (
                      <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" />
                    )}
                  </div>
                </div>

                {/* Confirmed Account Server Status Banner */}
                {isAdminAccountConfirmed && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 font-medium"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Authorized identity confirmed. Enter your Master Password / Security PIN below.</span>
                  </motion.div>
                )}

                {/* MASTER PASSWORD / PIN INPUT FIELD - RENDERED ONLY AFTER SERVER CONFIRMATION */}
                {isAdminAccountConfirmed ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    <div>
                      <label htmlFor="admin-master-pin" className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                        Master Password / Security PIN
                      </label>
                      <div className="relative">
                        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          id="admin-master-pin"
                          name="admin-master-pin"
                          type="password"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={8}
                          required
                          autoFocus
                          placeholder="Enter master PIN"
                          value={adminPinCode}
                          onChange={e => setAdminPinCode(e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-slate-50 dark:bg-zinc-800 pl-11 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-center font-mono font-black text-2xl tracking-widest text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-rose-500"
                        />
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-400 text-center">
                      Protected with server-side PBKDF2 hashing and 5-attempt rate-limiting.
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-rose-600/20 cursor-pointer active:scale-98 flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{isLoading ? 'Authenticating with Server...' : 'Authenticate & Unlock'}</span>
                    </button>
                  </motion.div>
                ) : (
                  <>
                    <div className="bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 p-3 rounded-2xl text-[11px] text-zinc-600 dark:text-zinc-300">
                      <p className="font-bold text-rose-700 dark:text-rose-400">🔒 Server-Enforced Security:</p>
                      <p className="mt-0.5">Both your authorized mobile number and Master Password / Security PIN must be entered manually to unlock Admin access.</p>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-rose-600/20 cursor-pointer active:scale-98 flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{isLoading ? 'Verifying Admin Identity...' : 'Verify Admin Mobile'}</span>
                    </button>
                  </>
                )}
              </form>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: ADMIN CHOICE MODAL (PART 4 REQUIREMENT)            */}
          {/* ========================================================= */}
          {step === 'admin_choice_modal' && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-2 space-y-4">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 mx-auto rounded-3xl flex items-center justify-center border border-emerald-200 dark:border-emerald-800 shadow-md">
                <ShieldCheck className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">
                  Administrator Verified
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Choose where you want to navigate:
                </p>
              </div>

              <div className="space-y-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem('nuvvo_admin_target_tab', 'command');
                    } catch {}
                    setCurrentPage('super-admin');
                  }}
                  className="w-full p-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-2xl font-black text-sm transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-2.5 cursor-pointer active:scale-98"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  <span>Open Admin Dashboard</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.setItem('nuvvo_admin_target_tab', 'settings');
                    } catch {}
                    setCurrentPage('admin');
                  }}
                  className="w-full p-4 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-800 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-98"
                >
                  <Settings className="w-5 h-5 text-orange-500" />
                  <span>Open Admin Settings</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: PARTNER & FRANCHISE PHONE ENTRY                     */}
          {/* ========================================================= */}
          {step === 'partner_phone' && (roleOption === 'Delivery Partner' || roleOption === 'Franchise') && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-5">
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">
                  {roleOption === 'Delivery Partner' ? 'Rider Delivery Portal' : 'Cloud Kitchen Franchise'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Enter your registered mobile number to receive an OTP
                </p>
              </div>

              <form onSubmit={handlePartnerSendOtp} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 font-bold font-mono text-sm">+91</span>
                    <input
                      type="tel"
                      maxLength={10}
                      required
                      placeholder="9876543210"
                      value={partnerPhone}
                      onChange={e => setPartnerPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-14 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono font-bold text-base tracking-widest focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98"
                >
                  {isLoading ? 'Sending Code...' : 'Get OTP Code'}
                </button>
              </form>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: PARTNER & FRANCHISE OTP VERIFY                     */}
          {/* ========================================================= */}
          {step === 'partner_otp' && (roleOption === 'Delivery Partner' || roleOption === 'Franchise') && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-5">
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Enter Verification Code</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Enter code sent to <span className="font-bold text-zinc-800 dark:text-zinc-100 font-mono">+91 {partnerPhone}</span>
                </p>
              </div>

              <form onSubmit={handlePartnerVerifyOtp} className="space-y-4">
                <div>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={partnerOtp}
                    onChange={e => setPartnerOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 text-center font-mono text-2xl font-black tracking-widest py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98"
                >
                  {isLoading ? 'Verifying...' : 'Verify & Enter Portal'}
                </button>
              </form>

              <div className="flex items-center justify-between mt-5 text-xs text-zinc-500">
                <button
                  type="button"
                  onClick={() => setStep('partner_phone')}
                  className="text-orange-600 font-bold hover:underline cursor-pointer"
                >
                  Change Phone
                </button>
                <span>
                  {resendTimer > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-zinc-800 rounded-xl text-zinc-500 font-mono text-[11px] border border-slate-200 dark:border-zinc-700">
                      <RotateCcw className="w-3 h-3 animate-spin text-zinc-400" />
                      <span>Resend OTP in <strong>{resendTimer}s</strong></span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => {
                        const nextRetry = retryCount + 1;
                        setRetryCount(nextRetry);
                        loginWithPhone(partnerPhone, roleOption);
                        setResendTimer(30);
                      }}
                      className="px-3.5 py-1.5 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/40 text-orange-600 dark:text-orange-400 font-black rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 border border-orange-200 dark:border-orange-800/60 shadow-xs active:scale-95"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Resend OTP</span>
                      {retryCount > 0 && (
                        <span className="px-1.5 py-0.2 text-[10px] bg-orange-200 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded-full font-mono font-bold">
                          {retryCount}
                        </span>
                      )}
                    </button>
                  )}
                </span>
              </div>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
}
