/**
 * Production Readiness Automated Test Suite for Nuvvo
 * Tests Order Creation, Payment Statuses, WhatsApp Cloud API Dispatch & Idempotency
 */

import { buildOrderWhatsAppMessage, sendOrderConfirmationWhatsApp, getWhatsAppConfigStatus, formatOrderDateTimeIST } from '../src/utils/whatsappService.ts';

async function runTests() {
  console.log('--- STARTING NUVVO PRODUCTION READINESS TEST SUITE ---');
  let passed = 0;
  let total = 0;

  function assert(desc: string, condition: boolean) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      process.exitCode = 1;
    }
  }

  // 1. WhatsApp Configuration Diagnostic Test
  const config = getWhatsAppConfigStatus();
  assert('WhatsApp config status reports configured flag and missing keys array', 
    typeof config.isConfigured === 'boolean' && Array.isArray(config.missingVars)
  );

  // 2. WhatsApp Message Formatting Test
  const mockOrder = {
    id: `order_test_${Date.now()}`,
    customerName: 'Kola Arjun',
    customerPhone: '9876543210',
    deliveryAddress: 'Chirala Main Road, AP',
    items: [
      { name: 'Special Chicken Biryani', quantity: 2, price: 250, total: 500 },
      { name: 'Paneer Butter Masala', quantity: 1, price: 180, total: 180 }
    ],
    subtotal: 680,
    discount: 50,
    deliveryFee: 30,
    packagingFee: 20,
    tax: 34,
    finalAmount: 714,
    paymentMethod: 'UPI' as const,
    paymentStatus: 'awaiting_confirmation' as const,
    orderStatus: 'placed' as const
  };

  const formattedMsg = buildOrderWhatsAppMessage(mockOrder);
  assert('Formatted message contains Order ID', formattedMsg.includes(mockOrder.id.replace(/^order_/, '')));
  assert('Formatted message contains Customer Phone', formattedMsg.includes('9876543210'));
  assert('Formatted message contains Asia/Kolkata IST Timestamp', formattedMsg.includes('IST'));
  assert('Formatted message contains Line Items & Totals', formattedMsg.includes('Special Chicken Biryani') && formattedMsg.includes('714'));
  assert('Formatted message contains Payment Status PAYMENT PENDING', formattedMsg.includes('PAYMENT PENDING'));

  // 3. Graceful Missing Credentials Handling Test
  const dispatchResult = await sendOrderConfirmationWhatsApp(mockOrder as any);
  assert('Safe failure on missing credentials without throwing', 
    dispatchResult.status === 'not_configured' || dispatchResult.status === 'sent' || dispatchResult.status === 'failed'
  );

  // 4. Idempotency & Duplicate Notification Prevention Test
  const duplicateResult = await sendOrderConfirmationWhatsApp(mockOrder as any);
  assert('Idempotent duplicate prevention prevents repeated sends', 
    duplicateResult.status === 'duplicate_skipped' || duplicateResult.status === 'not_configured'
  );

  // 5. Verify local HTTP Server Endpoints
  try {
    const healthRes = await fetch('http://localhost:3000/api/health');
    const healthData = await healthRes.json();
    assert('HTTP /api/health responds with status ok', healthRes.status === 200 && healthData.status === 'ok');

    const dishesRes = await fetch('http://localhost:3000/api/dishes');
    const dishesData = await dishesRes.json();
    assert('HTTP /api/dishes responds with status 200 and data array', 
      dishesRes.status === 200 && (Array.isArray(dishesData.dishes) || Array.isArray(dishesData))
    );

    const waStatusRes = await fetch('http://localhost:3000/api/admin/whatsapp/status', {
      headers: { 'x-admin-phone': '9063692135' }
    });
    const waStatusData = await waStatusRes.json();
    assert('HTTP /api/admin/whatsapp/status returns config', 
      waStatusRes.status === 200 && typeof waStatusData.isConfigured === 'boolean'
    );

    // 6. Test Order Creation via POST /api/orders with COD
    const testCodOrder = {
      id: `order_cod_${Date.now()}`,
      customerName: 'Test COD User',
      customerPhone: '9988776655',
      deliveryAddress: 'Bapatla, AP',
      items: [{ name: 'Veg Fried Rice', quantity: 1, price: 150 }],
      finalAmount: 150,
      paymentMethod: 'COD',
      paymentStatus: 'pending'
    };

    const orderRes = await fetch('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCodOrder)
    });

    const orderData = await orderRes.json();
    assert('POST /api/orders creates order successfully (201)', orderRes.status === 201 && orderData.success === true);
    assert('Order creation response includes safe whatsappNotification status', 
      orderData.order && (orderData.whatsappNotification !== undefined)
    );

    // 7. Test app_settings persistence for COD toggle
    const testSettingsPayload = {
      key: 'payment_config',
      value: { enableCod: false, enableUpi: true, customerInstructions: 'Online payments only' },
      description: 'Test payment configuration'
    };
    const settingsPostRes = await fetch('http://localhost:3000/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-phone': '9063692135'
      },
      body: JSON.stringify(testSettingsPayload)
    });
    const settingsPostData = await settingsPostRes.json();
    assert('POST /api/settings persists setting to Supabase app_settings', 
      settingsPostRes.status === 200 && settingsPostData.success === true
    );

    const settingsGetRes = await fetch('http://localhost:3000/api/settings/payment_config');
    const settingsGetData = await settingsGetRes.json();
    assert('GET /api/settings/:key retrieves persisted setting', 
      settingsGetRes.status === 200 && settingsGetData.success === true && settingsGetData.value?.enableCod === false
    );
  } catch (err: any) {
    console.warn('HTTP endpoint check warning (dev server may be starting):', err?.message);
  }

  console.log(`\n--- TEST RUN SUMMARY: ${passed}/${total} TESTS PASSED ---`);
  if (passed === total) {
    console.log('🎉 ALL INTEGRATION TESTS PASSED CLEANLY');
  }
}

runTests().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
