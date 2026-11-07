/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Phone, Lock, User, Mail, MapPin, Sparkles, Building2, Globe, ShieldCheck, 
  ShoppingBag, Bike, Building, RotateCcw, ArrowRight, CheckCircle2, KeyRound,
  ShieldAlert, Eye, EyeOff, LayoutDashboard, Settings
} from 'lucide-react';
import { Address } from '../types';
import NuvvoLogo from './NuvvoLogo';
import OTPVerification from './OTPVerification';
import { translations } from '../utils/translations';

type AuthStep = 
  | 'customer_login'           // Part 3: Username/Email + Password or Email OTP
  | 'customer_register'        // Part 1: Full Name, Email, Location
  | 'customer_email_otp'       // Part 1: 6-digit Email OTP Verification
  | 'customer_db_otp'          // Supabase user_otps database verification component
  | 'customer_profile_setup'   // Part 2: Username, Password, Mobile, Address, Landmark
  | 'customer_forgot_password' // Customer Forgot Password: Enter Email
  | 'customer_reset_password'  // Customer Reset Password: Enter OTP & New Password
  | 'admin_phone'              // Part 4: Admin mobile entry
  | 'admin_pin'                // Part 4: Server-prompted Admin PIN entry
  | 'admin_choice_modal'       // Part 4: Dialog: "Open Admin Dashboard" vs "Open Admin Settings"
  | 'partner_phone'            // Franchise mobile entry
  | 'partner_otp';             // Franchise mobile OTP

export default function Auth() {
  const { 
    sendCustomerEmailOtp, 
    verifyCustomerEmailOtp, 
    setupCustomerProfile, 
    loginCustomerWithPassword,
    resetCustomerPassword,
    adminCheckPhone, 
    adminVerifyPin,
    loginWithPhone, 
    verifyOtpAndLogin, 
    directLoginWithPhone, 
    setCurrentPage, 
    language, 
    setLanguage 
  } = useApp();

  const t = translations[language] || translations.en;

  // Primary Role selection: Customer | Admin | Franchise (internal delivery managed via admin)
  const [roleOption, setRoleOption] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('nuvvo_auth_role');
      if (saved && saved !== 'Delivery Partner') return saved;
    } catch {}
    return 'Customer';
  });

  // Current active sub-step
  const [step, setStep] = useState<AuthStep>('customer_login');

  // Customer Login (Part 3) state
  const [customerLoginMode, setCustomerLoginMode] = useState<'password' | 'email_otp'>('password');
  const [loginIdentifier, setLoginIdentifier] = useState(''); // username or email
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Customer Forgot & Reset Password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetOtpCode, setResetOtpCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Customer Registration (Part 1) state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regLocation, setRegLocation] = useState('Chirala Central Hub');

  // Email OTP verification state
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailChallengeToken, setEmailChallengeToken] = useState<string>('');
  const [emailDeliveryNotice, setEmailDeliveryNotice] = useState<string>('');
  const [isSimulatedEmail, setIsSimulatedEmail] = useState<boolean>(false);
  const [emailDefaultOtp, setEmailDefaultOtp] = useState<string>('');
  const [resendTimer, setResendTimer] = useState(30);

  // Customer Profile Setup (Part 2) state
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [setupMobile, setSetupMobile] = useState('');
  const [setupLocation, setSetupLocation] = useState('Chirala Central Hub');
  const [setupFlatNo, setSetupFlatNo] = useState('');
  const [setupArea, setSetupArea] = useState('');
  const [setupLandmark, setSetupLandmark] = useState('');
  const [setupCity, setSetupCity] = useState('Chirala');

  // Admin Security Flow - PIN field ONLY rendered after server confirmation
  const [adminPhoneNumber, setAdminPhoneNumber] = useState('9063692135');
  const [adminPinCode, setAdminPinCode] = useState('');
  const [adminMaskedPhone, setAdminMaskedPhone] = useState('');
  const [isAdminAccountConfirmed, setIsAdminAccountConfirmed] = useState(false);
  const [confirmedAdminPhone, setConfirmedAdminPhone] = useState('');

  // Partner / Franchise mobile state
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerOtp, setPartnerOtp] = useState('');

  // Universal UI feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Switch Role handler
  const handleSelectRole = (newRole: string) => {
    setRoleOption(newRole);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      localStorage.setItem('nuvvo_auth_role', newRole);
    } catch {}

    if (newRole === 'Customer') {
      setStep('customer_login');
    } else if (newRole === 'Admin') {
      setStep('admin_phone');
      setIsAdminAccountConfirmed(false);
      setConfirmedAdminPhone('');
      setAdminPinCode('');
    } else {
      setStep('partner_phone');
    }
  };

  // Timer countdown for OTP resend
  useEffect(() => {
    if ((step !== 'customer_email_otp' && step !== 'partner_otp') || resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  // ==========================================
  // PART 1: CUSTOMER REGISTRATION & EMAIL OTP
  // ==========================================
  const handleCustomerSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!regFullName.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    const cleanEmail = regEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMsg('Please enter a valid email address to receive your verification code.');
      return;
    }
    if (!regLocation.trim()) {
      setErrorMsg('Please specify your delivery area / location.');
      return;
    }

    setIsLoading(true);
    const res = await sendCustomerEmailOtp(cleanEmail, regFullName.trim(), regLocation.trim());
    setIsLoading(false);

    if (res.success) {
      setEmailChallengeToken(res.challengeToken || '');
      setIsSimulatedEmail(Boolean(res.isSimulatedDelivery));
      setEmailDefaultOtp(res.defaultOtp || '');
      setSetupLocation(regLocation.trim());
      setSetupArea(regLocation.trim());
      setEmailDeliveryNotice(res.message || 'Verification code sent to your email.');
      setStep('customer_email_otp');
      setResendTimer(30);
    } else {
      setErrorMsg(res.error || 'Failed to dispatch email verification code. Please check your email and try again.');
    }
  };

  const handleCustomerVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const code = emailOtpCode.trim();
    if (!code || code.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code sent to your email.');
      return;
    }

    setIsLoading(true);
    const res = await verifyCustomerEmailOtp(regEmail.trim().toLowerCase(), code, emailChallengeToken);
    setIsLoading(false);

    if (res.success) {
      // Suggest default unique username from email prefix
      const defaultUsername = regEmail.trim().toLowerCase().split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
      setSetupUsername(defaultUsername);
      setSuccessMsg('Email verified successfully! Complete your profile setup to start ordering.');
      setStep('customer_profile_setup');
    } else {
      setErrorMsg(res.error || 'Invalid or expired verification code. Please check the code or request a new one.');
    }
  };

  // ==========================================
  // PART 2: CUSTOMER PROFILE SETUP
  // ==========================================
  const handleCustomerSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUsername = setupUsername.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      setErrorMsg('Username must be at least 3 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setErrorMsg('Username may only contain letters, numbers, and underscores.');
      return;
    }
    if (!setupPassword || setupPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setErrorMsg('Passwords do not match. Please verify your password confirmation.');
      return;
    }
    const cleanMobile = setupMobile.replace(/\D/g, '');
    if (!cleanMobile || cleanMobile.length !== 10) {
      setErrorMsg('Please supply a valid 10-digit mobile number.');
      return;
    }
    if (!setupFlatNo.trim() || !setupArea.trim()) {
      setErrorMsg('Please supply your complete delivery address (Flat/Door no. and Area/Street).');
      return;
    }

    setIsLoading(true);
    const completeAddress = `${setupFlatNo.trim()}, ${setupArea.trim()}${setupLandmark.trim() ? ` (Near ${setupLandmark.trim()})` : ''}, ${setupCity}`;
    
    const res = await setupCustomerProfile({
      username: cleanUsername,
      password: setupPassword,
      mobile: cleanMobile,
      location: setupLocation.trim() || setupArea.trim(),
      deliveryAddress: completeAddress,
      landmark: setupLandmark.trim(),
      fullName: regFullName.trim(),
      email: regEmail.trim().toLowerCase()
    });
    setIsLoading(false);

    if (res.success) {
      setCurrentPage('home');
    } else {
      setErrorMsg(res.error || 'Failed to save customer profile. Please try again.');
    }
  };

  // ==========================================
  // PART 3: CUSTOMER FUTURE LOGIN
  // ==========================================
  const handleCustomerPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!loginIdentifier.trim()) {
      setErrorMsg('Please enter your Username or Email Address.');
      return;
    }
    if (!loginPassword) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setIsLoading(true);
    const res = await loginCustomerWithPassword(loginIdentifier.trim(), loginPassword);
    setIsLoading(false);

    if (res.success) {
      setCurrentPage('home');
    } else {
      setErrorMsg(res.error || 'Login failed. Please verify your username/email and password.');
    }
  };

  const handleCustomerSendLoginEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = loginIdentifier.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address to receive a login code.');
      return;
    }

    setIsLoading(true);
    const res = await sendCustomerEmailOtp(cleanEmail, 'Returning Customer', 'Chirala');
    setIsLoading(false);

    if (res.success) {
      setRegEmail(cleanEmail);
      setEmailChallengeToken(res.challengeToken || '');
      setIsSimulatedEmail(Boolean(res.isSimulatedDelivery));
      setEmailDefaultOtp(res.defaultOtp || '');
      setEmailDeliveryNotice(res.message || 'Login code sent to your email.');
      setStep('customer_db_otp');
      setResendTimer(30);
    } else {
      setErrorMsg(res.error || 'Failed to send login code.');
    }
  };

  const handleCustomerSendForgotPasswordOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const cleanEmail = forgotEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    const res = await sendCustomerEmailOtp(cleanEmail, 'Password Reset', 'Chirala');
    setIsLoading(false);

    if (res.success) {
      setRegEmail(cleanEmail);
      setEmailChallengeToken(res.challengeToken || '');
      setIsSimulatedEmail(Boolean(res.isSimulatedDelivery));
      setEmailDefaultOtp(res.defaultOtp || '');
      setEmailDeliveryNotice(res.message || 'Password reset code sent to your email.');
      setStep('customer_reset_password');
      setResendTimer(30);
    } else {
      setErrorMsg(res.error || 'Failed to send password reset code. Please check your email.');
    }
  };

  const handleCustomerResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const code = resetOtpCode.trim();
    if (!code || code.length !== 6) {
      setErrorMsg('Please enter the 6-digit verification code.');
      return;
    }
    if (!resetNewPassword || resetNewPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    const res = await resetCustomerPassword(regEmail.trim().toLowerCase(), code, resetNewPassword);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg('Your password has been reset successfully! Please sign in with your new password.');
      setLoginIdentifier(regEmail.trim().toLowerCase());
      setLoginPassword('');
      setStep('customer_login');
      setCustomerLoginMode('password');
    } else {
      setErrorMsg(res.error || 'Failed to reset password. Please verify the code or request a new one.');
    }
  };

  // ==========================================
  // PART 4: ADMIN PHONE & SERVER PIN AUTH
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
      setAdminMaskedPhone(res.maskedPhone || `+91 ${digits}`);
      setStep('admin_pin');
      setAdminPinCode('');
      setSuccessMsg(`Authorized administrator account verified on server. Security PIN unlocked.`);
    } else {
      setIsAdminAccountConfirmed(false);
      setConfirmedAdminPhone('');
      setStep('admin_phone');
      setErrorMsg(res.error || `Access Denied: Mobile number (+91 ${digits}) is not associated with an authorized Admin or Super Admin account.`);
    }
  };

  const handleAdminVerifyPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isAdminAccountConfirmed && step !== 'admin_pin') {
      setErrorMsg('Please submit and verify your administrator mobile number first.');
      return;
    }

    const pin = adminPinCode.trim();
    if (!pin || pin.length < 4 || pin.length > 8) {
      setErrorMsg('Please enter your 4-digit Administrator Security PIN.');
      return;
    }

    const targetPhone = confirmedAdminPhone || adminPhoneNumber.replace(/\D/g, '');
    setIsLoading(true);
    const res = await adminVerifyPin(targetPhone, pin);
    setIsLoading(false);

    if (res.success) {
      // Step 4 Requirement: Prompt Admin with choices: "Open Admin Dashboard" vs "Open Admin Settings"
      setStep('admin_choice_modal');
    } else {
      setErrorMsg(res.error || 'Incorrect PIN. Verification failed.');
    }
  };

  // ==========================================
  // PARTNER & FRANCHISE MOBILE OTP FLOW
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

  const handleQuickCustomerEnter = async () => {
    setIsLoading(true);
    const res = await directLoginWithPhone('9876543210', 'Customer');
    setIsLoading(false);
    if (res.success) {
      setCurrentPage('home');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 transition-colors duration-300">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        
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
              <div className="flex items-center justify-between pt-1 border-t border-rose-200/60 dark:border-rose-900/40">
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-[11px] font-black text-rose-700 dark:text-rose-300 hover:underline uppercase tracking-wider flex items-center gap-1 cursor-pointer"
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
          {/* STEP: CUSTOMER LOGIN (PART 3)                             */}
          {/* ========================================================= */}
          {step === 'customer_login' && roleOption === 'Customer' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {/* Login / Register Tab Header */}
              <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-2xl mb-5">
                <button
                  type="button"
                  onClick={() => { setErrorMsg(''); setStep('customer_login'); }}
                  className="flex-1 py-2 text-xs font-black rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-xs cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setErrorMsg(''); setStep('customer_register'); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                >
                  Create Account (OTP)
                </button>
              </div>

              <div className="text-center mb-4">
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Welcome Back</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {customerLoginMode === 'password'
                    ? 'Log in using your Username or Email and Custom Password'
                    : 'Enter your Email address to receive a secure login code'}
                </p>
              </div>

              {customerLoginMode === 'password' ? (
                <form onSubmit={handleCustomerPasswordLogin} className="space-y-3.5">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Username or Email Address
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. arjun or customer@email.com"
                        value={loginIdentifier}
                        onChange={e => setLoginIdentifier(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setCustomerLoginMode('email_otp')}
                        className="text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                      >
                        Login via Email OTP
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Enter your password"
                        value={loginPassword}
                        onChange={e => setLoginPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-10 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(p => !p)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex justify-end mt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg('');
                          setForgotEmail(loginIdentifier.includes('@') ? loginIdentifier : '');
                          setStep('customer_forgot_password');
                        }}
                        className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
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
              ) : (
                <form onSubmit={handleCustomerSendLoginEmailOtp} className="space-y-3.5">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="email"
                        required
                        placeholder="customer@email.com"
                        value={loginIdentifier}
                        onChange={e => setLoginIdentifier(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 mt-2"
                  >
                    {isLoading ? 'Sending Code...' : 'Send Login Code via Email'}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setCustomerLoginMode('password')}
                      className="text-xs font-bold text-zinc-500 hover:underline cursor-pointer"
                    >
                      ← Back to Password Login
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: CUSTOMER FORGOT PASSWORD - STEP 1 (EMAIL ENTRY)    */}
          {/* ========================================================= */}
          {step === 'customer_forgot_password' && roleOption === 'Customer' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 font-mono bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/40">
                  <KeyRound className="w-3.5 h-3.5" /> Password Recovery
                </div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Forgot Password?</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
                  Enter your registered email address to receive a secure 6-digit password reset verification code.
                </p>
              </div>

              <form onSubmit={handleCustomerSendForgotPasswordOtp} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="email"
                      required
                      placeholder="customer@email.com"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 mt-2 flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  <span>{isLoading ? 'Sending Reset Code...' : 'Send Password Reset Code'}</span>
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setErrorMsg(''); setStep('customer_login'); }}
                    className="text-xs font-bold text-zinc-500 hover:underline cursor-pointer"
                  >
                    ← Back to Sign In
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: CUSTOMER RESET PASSWORD - STEP 2 (CODE & NEW PASS)  */}
          {/* ========================================================= */}
          {step === 'customer_reset_password' && roleOption === 'Customer' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 font-mono bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/40">
                  <KeyRound className="w-3.5 h-3.5" /> Verification & Reset
                </div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Set New Password</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Verification code sent to <strong className="text-zinc-800 dark:text-zinc-200">{regEmail}</strong>
                </p>
              </div>

              {/* Informative notice when verification code is sent */}
              {emailDeliveryNotice && (
                <div className="mb-4 p-3 bg-orange-50 dark:bg-zinc-800/80 border border-orange-200 dark:border-zinc-700 rounded-2xl text-xs space-y-1">
                  <p className="text-zinc-700 dark:text-zinc-300 font-medium">{emailDeliveryNotice}</p>
                </div>
              )}

              <form onSubmit={handleCustomerResetPassword} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={resetOtpCode}
                    onChange={e => setResetOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 px-4 py-3 text-center tracking-[0.4em] font-mono text-xl font-black rounded-2xl border border-slate-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    New Password (Min 6 Characters)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      required
                      placeholder="Enter new password"
                      value={resetNewPassword}
                      onChange={e => setResetNewPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-10 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(p => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                      type={showResetPassword ? 'text' : 'password'}
                      required
                      placeholder="Confirm new password"
                      value={resetConfirmPassword}
                      onChange={e => setResetConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 mt-2 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isLoading ? 'Updating Password...' : 'Reset & Save Password'}</span>
                </button>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => { setErrorMsg(''); setStep('customer_forgot_password'); }}
                    className="text-xs font-bold text-zinc-500 hover:underline cursor-pointer"
                  >
                    ← Change Email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setErrorMsg(''); setStep('customer_login'); }}
                    className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: CUSTOMER FIRST-TIME REGISTRATION (PART 1)          */}
          {/* ========================================================= */}
          {step === 'customer_register' && roleOption === 'Customer' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-2xl mb-5">
                <button
                  type="button"
                  onClick={() => { setErrorMsg(''); setStep('customer_login'); }}
                  className="flex-1 py-2 text-xs font-bold rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setErrorMsg(''); setStep('customer_register'); }}
                  className="flex-1 py-2 text-xs font-black rounded-xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 shadow-xs cursor-pointer"
                >
                  Create Account (OTP)
                </button>
              </div>

              <div className="text-center mb-4">
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Customer Registration</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Step 1: Enter your details to receive a 6-digit verification code on your email
                </p>
              </div>

              <form onSubmit={handleCustomerSendEmailOtp} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    1. Customer Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      value={regFullName}
                      onChange={e => setRegFullName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    2. Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="email"
                      required
                      placeholder="name@gmail.com"
                      value={regEmail}
                      onChange={e => setRegEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    3. Customer Location / Area
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Chirala Central Hub, Bapatla, etc."
                      value={regLocation}
                      onChange={e => setRegLocation(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 pl-10 pr-3.5 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-sm font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 mt-2 flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  <span>{isLoading ? 'Sending OTP...' : 'Send OTP'}</span>
                </button>
              </form>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: EMAIL OTP CODE VERIFICATION (PART 1)                */}
          {/* ========================================================= */}
          {step === 'customer_email_otp' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 font-mono bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-950/40 dark:border-orange-900/40">
                  ✉️ Email Verification
                </div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Enter Email OTP</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Please enter the 6-digit verification code sent to <span className="font-bold text-zinc-800 dark:text-zinc-100">{regEmail}</span>
                </p>
              </div>

              {/* Informative notice when verification code is sent */}
              {emailDeliveryNotice && (
                <div className="mb-4 p-3 bg-orange-50 dark:bg-zinc-800/80 border border-orange-200 dark:border-zinc-700 rounded-2xl text-xs space-y-1">
                  <p className="text-zinc-700 dark:text-zinc-300 font-medium">{emailDeliveryNotice}</p>
                </div>
              )}

              <form onSubmit={handleCustomerVerifyEmailOtp} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    placeholder="• • • • • •"
                    value={emailOtpCode}
                    onChange={e => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-50 dark:bg-zinc-800 text-center font-mono text-2xl font-black tracking-widest py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98"
                >
                  {isLoading ? 'Verifying...' : 'Verify Code & Proceed to Profile Setup'}
                </button>
              </form>

              <div className="flex items-center justify-between mt-5 text-xs text-zinc-500">
                <button
                  type="button"
                  onClick={() => setStep('customer_register')}
                  className="text-orange-600 font-bold hover:underline cursor-pointer"
                >
                  Change Email
                </button>
                <span>
                  {resendTimer > 0 ? (
                    `Resend code in ${resendTimer}s`
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        sendCustomerEmailOtp(regEmail, regFullName || 'Customer', regLocation || 'Chirala');
                        setResendTimer(30);
                      }}
                      className="text-orange-600 font-bold hover:underline cursor-pointer"
                    >
                      Resend Code
                    </button>
                  )}
                </span>
              </div>
            </motion.div>
          )}

          {/* ========================================================= */}
          {/* STEP: SUPABASE USER_OTPS DATABASE VERIFICATION            */}
          {/* ========================================================= */}
          {step === 'customer_db_otp' && (
            <OTPVerification
              identifier={regEmail}
              purpose="email_login"
              title="Verify Login Code"
              subtitle={`Enter the 6-digit verification code sent to ${regEmail}`}
              notice={emailDeliveryNotice}
              onBack={() => setStep('customer_login')}
              onResend={async () => {
                await sendCustomerEmailOtp(regEmail, regFullName || 'Returning Customer', 'Chirala');
              }}
              onSuccess={(result) => {
                if (result.metadata?.fullName) {
                  setRegFullName(result.metadata.fullName);
                }
                setCurrentPage('home');
              }}
            />
          )}

          {/* ========================================================= */}
          {/* STEP: CUSTOMER PROFILE SETUP (PART 2)                     */}
          {/* ========================================================= */}
          {step === 'customer_profile_setup' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 font-mono bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/40">
                  ✓ Step 2 of 2: Profile Setup
                </div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">Set Up Your Profile</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Create your unique username, password, and delivery address
                </p>
              </div>

              <form onSubmit={handleCustomerSaveProfile} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Username (Unique)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. arjun22"
                      value={setupUsername}
                      onChange={e => setSetupUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="w-full bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Mobile Number (10 Digits)
                    </label>
                    <input
                      type="tel"
                      maxLength={10}
                      required
                      placeholder="9876543210"
                      value={setupMobile}
                      onChange={e => setSetupMobile(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Custom Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Min 6 characters"
                      value={setupPassword}
                      onChange={e => setSetupPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Re-enter password"
                      value={setupConfirmPassword}
                      onChange={e => setSetupConfirmPassword(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-zinc-800 pt-2.5 mt-2 space-y-2">
                  <p className="text-[11px] font-black text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-orange-500" />
                    Delivery Address Details
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9.5px] font-bold text-zinc-500 uppercase mb-0.5">Flat / Door No.</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Flat 301, Tower A"
                        value={setupFlatNo}
                        onChange={e => setSetupFlatNo(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9.5px] font-bold text-zinc-500 uppercase mb-0.5">Area / Street</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Main Road, Trunk Rd"
                        value={setupArea}
                        onChange={e => setSetupArea(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9.5px] font-bold text-zinc-500 uppercase mb-0.5">Optional Landmark</label>
                      <input
                        type="text"
                        placeholder="e.g. Near Clock Tower"
                        value={setupLandmark}
                        onChange={e => setSetupLandmark(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9.5px] font-bold text-zinc-500 uppercase mb-0.5">City</label>
                      <select
                        value={setupCity}
                        onChange={e => setSetupCity(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-zinc-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500"
                      >
                        <option value="Chirala">Chirala</option>
                        <option value="Bapatla">Bapatla</option>
                        <option value="Ongole">Ongole</option>
                        <option value="Guntur">Guntur</option>
                        <option value="Vijayawada">Vijayawada</option>
                        <option value="Hyderabad">Hyderabad</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-orange-500/20 cursor-pointer active:scale-98 mt-3"
                >
                  {isLoading ? 'Saving Profile...' : 'Complete Registration & Start Ordering'}
                </button>
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
                  {isAdminAccountConfirmed ? 'Step 2: Security PIN Verification' : 'Step 1: Admin Identity Check'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {isAdminAccountConfirmed
                    ? <>Authorized account <span className="font-bold font-mono text-zinc-800 dark:text-zinc-200">{adminMaskedPhone || `+91 ${adminPhoneNumber}`}</span> confirmed. Enter your secret PIN.</>
                    : 'Enter authorized administrator mobile number to verify account access.'}
                </p>
              </div>

              <form onSubmit={isAdminAccountConfirmed ? handleAdminVerifyPinSubmit : handleAdminPhoneCheck} className="space-y-4">
                {/* Mobile Number Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                      Administrator Mobile Number
                    </label>
                    {isAdminAccountConfirmed && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAdminAccountConfirmed(false);
                          setConfirmedAdminPhone('');
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
                      type="tel"
                      maxLength={10}
                      required
                      disabled={isAdminAccountConfirmed || isLoading}
                      placeholder="9063692135"
                      value={adminPhoneNumber}
                      onChange={e => {
                        setAdminPhoneNumber(e.target.value.replace(/\D/g, ''));
                        if (isAdminAccountConfirmed) {
                          setIsAdminAccountConfirmed(false);
                          setConfirmedAdminPhone('');
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
                    <span>Authorized account verified on server. Security PIN unlocked.</span>
                  </motion.div>
                )}

                {/* PIN INPUT FIELD - RENDERED ONLY AFTER SERVER CONFIRMATION */}
                {isAdminAccountConfirmed ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-wider mb-1">
                        Administrator Security PIN
                      </label>
                      <div className="relative">
                        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="password"
                          maxLength={6}
                          required
                          autoFocus
                          placeholder="••••"
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
                      <p className="mt-0.5">Cell identity is verified strictly on the server before PIN input is enabled.</p>
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 disabled:opacity-60 text-white py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shadow-rose-600/20 cursor-pointer active:scale-98 flex items-center justify-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{isLoading ? 'Verifying Phone On Server...' : 'Verify Admin Phone'}</span>
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
                    `Resend code in ${resendTimer}s`
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        loginWithPhone(partnerPhone, roleOption);
                        setResendTimer(30);
                      }}
                      className="text-orange-600 font-bold hover:underline cursor-pointer"
                    >
                      Resend OTP
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
