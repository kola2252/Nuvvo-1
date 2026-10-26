/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Nuvvo Food Ordering Application - Microsoft Word (.doc) Daily Orders Exporter
 * Generates an executive, print-ready, comprehensive Word Document (.doc)
 * containing:
 * - Daily Summary & Financial Statistics
 * - Order-by-Order breakdown with complete Customer & Location details (GPS, Landmark, Full Address)
 * - Complete itemized dishes and billing charges (Subtotal, GST, Delivery Fee, Tips, Discounts, Final Total)
 * - Assigned Delivery Boy (Rider) details & Delivery Boy Rating / Feedback
 * - Delivery Boys Daily Performance & Rating Summary
 */

import { Order, DeliveryPartnerProfile } from '../types';

export interface DailyReportFilterOptions {
  selectedDate?: string; // YYYY-MM-DD or 'all'
  title?: string;
  territory?: string;
}

export interface DailyReportMetrics {
  totalOrders: number;
  totalRevenue: number;
  totalItems: number;
  deliveredCount: number;
  activeCount: number;
  cancelledCount: number;
  paymentBreakdown: {
    upi: number;
    phonepe: number;
    cod: number;
    wallet: number;
    other: number;
  };
  totalDeliveryFees: number;
  totalTips: number;
  totalTaxes: number;
  totalDiscounts: number;
}

export function filterOrdersByDate(orders: Order[], selectedDate?: string): Order[] {
  if (!selectedDate || selectedDate === 'all') {
    return orders;
  }

  return orders.filter(order => {
    if (!order.date) return false;
    const orderDateStr = new Date(order.date).toISOString().split('T')[0];
    return orderDateStr === selectedDate;
  });
}

export function calculateDailyMetrics(orders: Order[]): DailyReportMetrics {
  let totalRevenue = 0;
  let totalItems = 0;
  let deliveredCount = 0;
  let activeCount = 0;
  let cancelledCount = 0;
  let totalDeliveryFees = 0;
  let totalTips = 0;
  let totalTaxes = 0;
  let totalDiscounts = 0;

  const paymentBreakdown = {
    upi: 0,
    phonepe: 0,
    cod: 0,
    wallet: 0,
    other: 0
  };

  orders.forEach(order => {
    const amt = Number(order.finalAmount || order.subtotal || 0);
    totalRevenue += amt;
    totalDeliveryFees += Number(order.deliveryFee || 0);
    totalTips += Number(order.tip || 0);
    totalTaxes += Number(order.tax || 0);
    totalDiscounts += Number(order.discount || 0);

    const itemsCount = (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    totalItems += itemsCount;

    if (order.status === 'delivered') {
      deliveredCount++;
    } else if (order.status === 'cancelled') {
      cancelledCount++;
    } else {
      activeCount++;
    }

    const method = String(order.paymentMethod || '').toLowerCase();
    if (method.includes('phonepe')) {
      paymentBreakdown.phonepe += amt;
    } else if (method.includes('upi')) {
      paymentBreakdown.upi += amt;
    } else if (method.includes('cod') || method.includes('cash') || method.includes('delivery')) {
      paymentBreakdown.cod += amt;
    } else if (method.includes('wallet')) {
      paymentBreakdown.wallet += amt;
    } else {
      paymentBreakdown.other += amt;
    }
  });

  return {
    totalOrders: orders.length,
    totalRevenue,
    totalItems,
    deliveredCount,
    activeCount,
    cancelledCount,
    paymentBreakdown,
    totalDeliveryFees,
    totalTips,
    totalTaxes,
    totalDiscounts
  };
}

/**
 * Builds the Word-compatible HTML string with standard Office formatting and styling.
 */
export function buildWordReportHtml(
  orders: Order[],
  deliveryPartners: DeliveryPartnerProfile[] = [],
  options: DailyReportFilterOptions = {}
): string {
  const territory = options.territory || 'Chirala & Coastal Hub, AP';
  const displayDate = options.selectedDate && options.selectedDate !== 'all'
    ? new Date(options.selectedDate).toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : 'All Recorded Dates';

  const generatedTime = new Date().toLocaleString('en-IN', {
    dateStyle: 'full',
    timeStyle: 'medium'
  });

  const metrics = calculateDailyMetrics(orders);

  // Group delivery boy ratings from orders
  const riderRatingSummaryMap = new Map<string, {
    name: string;
    phone: string;
    vehicle: string;
    ordersCount: number;
    deliveredCount: number;
    ratings: number[];
    compliments: string[];
    comments: string[];
  }>();

  orders.forEach(order => {
    const riderName = order.deliveryPartnerName || 'Unassigned Rider';
    const riderId = order.deliveryPartnerId || riderName;
    if (!riderRatingSummaryMap.has(riderId)) {
      riderRatingSummaryMap.set(riderId, {
        name: riderName,
        phone: order.deliveryPartnerPhone || 'N/A',
        vehicle: order.deliveryPartnerVehicle || 'Standard Fleet',
        ordersCount: 0,
        deliveredCount: 0,
        ratings: [],
        compliments: [],
        comments: []
      });
    }

    const riderData = riderRatingSummaryMap.get(riderId)!;
    riderData.ordersCount++;
    if (order.status === 'delivered') riderData.deliveredCount++;

    if (order.deliveryPartnerRating && order.deliveryPartnerRating > 0) {
      riderData.ratings.push(order.deliveryPartnerRating);
    }
    if (order.deliveryPartnerRatingTags && order.deliveryPartnerRatingTags.length > 0) {
      riderData.compliments.push(...order.deliveryPartnerRatingTags);
    }
    if (order.deliveryPartnerFeedback && order.deliveryPartnerFeedback.trim()) {
      riderData.comments.push(order.deliveryPartnerFeedback.trim());
    }
  });

  // HTML Word Document
  return `
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Nuvvo Daily Orders Report - ${displayDate}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page WordSection1 {
      size: 8.5in 11.0in;
      margin: 0.6in 0.6in 0.6in 0.6in;
      mso-header-margin: 0.4in;
      mso-footer-margin: 0.4in;
    }
    div.WordSection1 {
      page: WordSection1;
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
    }
    body {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #1f2937;
      background-color: #ffffff;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3, h4, h5 {
      font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
      margin: 0;
      padding: 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 12pt;
    }
    th, td {
      padding: 6pt 8pt;
      vertical-align: top;
      font-size: 10pt;
    }
    .header-table {
      background-color: #ea580c;
      color: #ffffff;
      border: 1px solid #c2410c;
      margin-bottom: 16pt;
    }
    .header-table td {
      padding: 14pt 16pt;
    }
    .header-title {
      font-size: 22pt;
      font-weight: bold;
      letter-spacing: 0.5pt;
      color: #ffffff;
      margin-bottom: 3pt;
    }
    .header-subtitle {
      font-size: 11pt;
      color: #ffedd5;
      font-weight: normal;
    }
    .header-meta {
      font-size: 9.5pt;
      color: #ffffff;
      text-align: right;
    }
    .kpi-table {
      border: 1px solid #e5e7eb;
      margin-bottom: 18pt;
    }
    .kpi-cell {
      border: 1px solid #e5e7eb;
      background-color: #f9fafb;
      padding: 8pt 10pt;
      text-align: center;
    }
    .kpi-label {
      font-size: 8.5pt;
      text-transform: uppercase;
      font-weight: bold;
      color: #6b7280;
      margin-bottom: 3pt;
    }
    .kpi-value {
      font-size: 16pt;
      font-weight: bold;
      color: #111827;
    }
    .kpi-value-green {
      color: #059669;
    }
    .kpi-value-orange {
      color: #ea580c;
    }
    .section-title-box {
      background-color: #f3f4f6;
      border-left: 5pt solid #ea580c;
      padding: 7pt 10pt;
      margin-top: 18pt;
      margin-bottom: 10pt;
      font-size: 13pt;
      font-weight: bold;
      color: #111827;
    }
    .order-card {
      border: 1.5pt solid #d1d5db;
      margin-bottom: 16pt;
      page-break-inside: avoid;
      background-color: #ffffff;
    }
    .order-header-bar {
      background-color: #1e293b;
      color: #ffffff;
      padding: 8pt 10pt;
      font-size: 11pt;
      font-weight: bold;
    }
    .badge {
      display: inline-block;
      padding: 2pt 6pt;
      border-radius: 4pt;
      font-size: 8pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .badge-delivered { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
    .badge-accepted { background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .badge-on_the_way { background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .badge-cancelled { background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .badge-paid { background-color: #dcfce7; color: #166534; }
    .badge-pending { background-color: #ffedd5; color: #9a3412; }
    .items-table {
      border: 1px solid #e5e7eb;
      margin-top: 6pt;
      margin-bottom: 6pt;
    }
    .items-table th {
      background-color: #f3f4f6;
      font-weight: bold;
      color: #374151;
      font-size: 9pt;
      border: 1px solid #e5e7eb;
      text-align: left;
    }
    .items-table td {
      border: 1px solid #e5e7eb;
      font-size: 9pt;
    }
    .bill-summary-box {
      background-color: #fafafa;
      border: 1px solid #e5e7eb;
      padding: 6pt 10pt;
      font-size: 9.5pt;
    }
    .star-rating {
      color: #d97706;
      font-size: 11pt;
      font-weight: bold;
    }
    .tag-compliment {
      display: inline-block;
      background-color: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
      padding: 1pt 5pt;
      border-radius: 3pt;
      font-size: 8pt;
      font-weight: bold;
      margin-right: 4pt;
      margin-bottom: 3pt;
    }
    .footer-note {
      text-align: center;
      font-size: 8.5pt;
      color: #6b7280;
      margin-top: 24pt;
      border-top: 1px solid #e5e7eb;
      padding-top: 8pt;
    }
  </style>
</head>
<body>
  <div class="WordSection1">
    
    <!-- BRAND & REPORT HEADER -->
    <table class="header-table">
      <tr>
        <td style="width: 65%;">
          <div class="header-title">NUVVO GOURMET CO.</div>
          <div class="header-subtitle">Daily Orders, Customer Bills, Location & Delivery Boys Audit Report</div>
          <div style="font-size: 9.5pt; color: #ffedd5; margin-top: 4pt;">
            Territory: <b>${territory}</b> • Official Operations Ledger
          </div>
        </td>
        <td class="header-meta" style="width: 35%;">
          <div style="font-size: 13pt; font-weight: bold; color: #ffffff;">REPORT DATE</div>
          <div style="font-size: 11pt; font-weight: bold; color: #fef08a; margin-bottom: 4pt;">${displayDate}</div>
          <div style="font-size: 8.5pt; color: #fed7aa;">Generated: ${generatedTime}</div>
          <div style="font-size: 8.5pt; color: #fed7aa;">GSTIN: 37AAECN9912F1Z8</div>
        </td>
      </tr>
    </table>

    <!-- EXECUTIVE KPI SUMMARY METRICS -->
    <div class="section-title-box">1. DAILY EXECUTIVE SUMMARY & REVENUE DASHBOARD</div>
    <table class="kpi-table">
      <tr>
        <td class="kpi-cell" style="width: 20%;">
          <div class="kpi-label">Total Orders</div>
          <div class="kpi-value">${metrics.totalOrders}</div>
          <div style="font-size: 8pt; color: #6b7280;">Count</div>
        </td>
        <td class="kpi-cell" style="width: 25%;">
          <div class="kpi-label">Gross Sales / Revenue</div>
          <div class="kpi-value kpi-value-orange">₹${metrics.totalRevenue.toLocaleString('en-IN')}</div>
          <div style="font-size: 8pt; color: #6b7280;">Total Bill Amount</div>
        </td>
        <td class="kpi-cell" style="width: 20%;">
          <div class="kpi-label">Avg Order Value</div>
          <div class="kpi-value">₹${metrics.totalOrders > 0 ? Math.round(metrics.totalRevenue / metrics.totalOrders) : 0}</div>
          <div style="font-size: 8pt; color: #6b7280;">AOV per Order</div>
        </td>
        <td class="kpi-cell" style="width: 17%;">
          <div class="kpi-label">Delivered</div>
          <div class="kpi-value kpi-value-green">${metrics.deliveredCount}</div>
          <div style="font-size: 8pt; color: #059669;">Complete</div>
        </td>
        <td class="kpi-cell" style="width: 18%;">
          <div class="kpi-label">Active / Cancelled</div>
          <div class="kpi-value" style="font-size: 13pt;">${metrics.activeCount} / <span style="color: #dc2626;">${metrics.cancelledCount}</span></div>
          <div style="font-size: 8pt; color: #6b7280;">Status breakdown</div>
        </td>
      </tr>
      <tr>
        <td colspan="5" style="background-color: #ffffff; padding: 6pt 10pt; font-size: 9pt; border: 1px solid #e5e7eb;">
          <b>Payment Collection Split:</b>
          &nbsp; PhonePe Online: <b>₹${metrics.paymentBreakdown.phonepe.toLocaleString('en-IN')}</b>
          &nbsp;|&nbsp; Direct UPI: <b>₹${metrics.paymentBreakdown.upi.toLocaleString('en-IN')}</b>
          &nbsp;|&nbsp; Cash on Delivery (COD): <b>₹${metrics.paymentBreakdown.cod.toLocaleString('en-IN')}</b>
          &nbsp;|&nbsp; Wallet / Others: <b>₹${(metrics.paymentBreakdown.wallet + metrics.paymentBreakdown.other).toLocaleString('en-IN')}</b>
          &nbsp;|&nbsp; Total Delivery Fees: <b>₹${metrics.totalDeliveryFees}</b>
          &nbsp;|&nbsp; Rider Tips: <b>₹${metrics.totalTips}</b>
        </td>
      </tr>
    </table>

    <!-- DELIVERY BOYS (RIDERS) PERFORMANCE & RATING SECTION -->
    <div class="section-title-box">2. DELIVERY BOYS PERFORMANCE, RATINGS & FEEDBACK AUDIT</div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 24%;">Delivery Boy Name & Contact</th>
          <th style="width: 18%;">Vehicle & Assigned Fleet</th>
          <th style="width: 14%; text-align: center;">Orders (Delivered)</th>
          <th style="width: 18%; text-align: center;">Customer Star Rating</th>
          <th style="width: 26%;">Customer Feedback & Compliments</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from(riderRatingSummaryMap.values()).map(r => {
          const avgRating = r.ratings.length > 0 
            ? (r.ratings.reduce((a, b) => a + b, 0) / r.ratings.length).toFixed(1) 
            : '5.0';
          const starsCount = Math.round(Number(avgRating));
          const starIcons = '★'.repeat(starsCount) + '☆'.repeat(Math.max(0, 5 - starsCount));

          const uniqueCompliments = Array.from(new Set(r.compliments));
          return `
          <tr>
            <td>
              <b>${r.name}</b><br/>
              <span style="font-size: 8.5pt; color: #6b7280;">📱 +91 ${r.phone}</span>
            </td>
            <td>
              <span>${r.vehicle}</span><br/>
              <span style="font-size: 8pt; color: #6b7280;">Hyperlocal Fleet</span>
            </td>
            <td style="text-align: center;">
              <b>${r.ordersCount} orders</b><br/>
              <span style="font-size: 8pt; color: #059669;">${r.deliveredCount} delivered</span>
            </td>
            <td style="text-align: center;">
              <span class="star-rating">${starIcons}</span><br/>
              <b>${avgRating} / 5.0</b> <span style="font-size: 8pt; color: #6b7280;">(${r.ratings.length} reviews)</span>
            </td>
            <td>
              ${uniqueCompliments.length > 0 ? `
                <div style="margin-bottom: 3pt;">
                  ${uniqueCompliments.map(tag => `<span class="tag-compliment">${tag}</span>`).join(' ')}
                </div>
              ` : ''}
              ${r.comments.length > 0 ? `
                <div style="font-size: 8.5pt; color: #374151; font-style: italic;">
                  "${r.comments.slice(0, 2).join('", "')}"
                </div>
              ` : '<span style="font-size: 8pt; color: #9ca3af;">Standard delivery execution</span>'}
            </td>
          </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <!-- ORDER BY ORDER MASTER AUDIT -->
    <div class="section-title-box">3. DETAILED ORDER-BY-ORDER AUDIT (BILLS, ITEMS, LOCATION & DELIVERY BOY)</div>

    ${orders.length === 0 ? `
      <div style="padding: 20pt; text-align: center; border: 1px dashed #d1d5db; background-color: #f9fafb; margin-bottom: 20pt;">
        <p style="font-size: 12pt; color: #6b7280; font-weight: bold;">No orders recorded for ${displayDate}.</p>
      </div>
    ` : orders.map((order, index) => {
      const orderDateFormatted = new Date(order.date).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
      const orderIdFormatted = order.id.replace('order_', 'ORD-').slice(-8).toUpperCase();
      const statusClass = `badge-${order.status || 'accepted'}`;
      const isPaid = order.paymentStatus === 'confirmed' || order.paymentStatus === 'success';

      const addr = order.address || {} as any;
      const fullAddressParts = [
        addr.houseNumber || addr.flatNo,
        addr.streetName || addr.area,
        addr.locality,
        addr.landmark ? `(Landmark: ${addr.landmark})` : '',
        addr.villageTown,
        addr.city || 'Chirala',
        addr.district ? `${addr.district} Dist` : 'Bapatla Dist',
        addr.pincode ? `PIN: ${addr.pincode}` : ''
      ].filter(Boolean);
      const fullAddressStr = fullAddressParts.join(', ') || 'Chirala Municipal Territory';

      const geopin = addr.gpsCoordinates 
        ? `Lat: ${addr.gpsCoordinates.lat.toFixed(5)}, Lng: ${addr.gpsCoordinates.lng.toFixed(5)}`
        : 'Geocoded Regional Anchor';

      const riderRating = order.deliveryPartnerRating || 5;
      const riderStars = '★'.repeat(riderRating) + '☆'.repeat(5 - riderRating);

      return `
      <div class="order-card">
        <!-- Order Header Bar -->
        <table style="width: 100%; background-color: #0f172a; color: #ffffff; margin-bottom: 0;">
          <tr>
            <td style="padding: 6pt 10pt;">
              <span style="font-size: 11pt; font-weight: bold; color: #f97316;">Order #${index + 1}: ${orderIdFormatted}</span>
              &nbsp;&nbsp;<span style="font-size: 8.5pt; color: #94a3b8;">(${order.id})</span>
              &nbsp;|&nbsp; Date: <b>${orderDateFormatted}</b>
            </td>
            <td style="text-align: right; padding: 6pt 10pt;">
              <span class="badge ${statusClass}">${order.status || 'Accepted'}</span>
              &nbsp;
              <span class="badge ${isPaid ? 'badge-paid' : 'badge-pending'}">
                ${order.paymentMethod || 'UPI'}: ${order.paymentStatus || 'Pending'}
              </span>
            </td>
          </tr>
        </table>

        <!-- Order Body Grid: Customer/Location, Delivery Boy, and Bill Breakdown -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 0;">
          <tr>
            <!-- Customer & Location Info -->
            <td style="width: 50%; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; background-color: #fafafa; padding: 8pt 10pt;">
              <div style="font-size: 9.5pt; font-weight: bold; color: #ea580c; text-transform: uppercase; margin-bottom: 4pt;">
                👤 CUSTOMER & DELIVERY LOCATION
              </div>
              <div style="font-size: 10.5pt; font-weight: bold; color: #111827;">
                ${order.customerName || 'Customer'} &nbsp;
                <span style="font-size: 9.5pt; color: #4b5563; font-weight: normal;">(📞 +91 ${order.customerPhone || 'N/A'})</span>
              </div>
              <div style="font-size: 9pt; color: #374151; margin-top: 3pt; line-height: 1.35;">
                <b>Full Address:</b> ${fullAddressStr}
              </div>
              <div style="font-size: 8.5pt; color: #6b7280; margin-top: 2pt;">
                <b>Address Tag:</b> ${addr.type || 'Home'} &nbsp;|&nbsp; <b>Location Geopin:</b> ${geopin}
              </div>
              ${order.instructions ? `
                <div style="font-size: 8.5pt; color: #b45309; background-color: #fef3c7; border: 1px solid #fde68a; padding: 2pt 5pt; border-radius: 3pt; margin-top: 4pt;">
                  📝 <b>Delivery Note:</b> "${order.instructions}"
                </div>
              ` : ''}
            </td>

            <!-- Assigned Delivery Boy & Rating -->
            <td style="width: 50%; border-bottom: 1px solid #e5e7eb; background-color: #fafafa; padding: 8pt 10pt;">
              <div style="font-size: 9.5pt; font-weight: bold; color: #0284c7; text-transform: uppercase; margin-bottom: 4pt;">
                🛵 ASSIGNED DELIVERY BOY & RATING
              </div>
              <div style="font-size: 10.5pt; font-weight: bold; color: #111827;">
                ${order.deliveryPartnerName || 'Assigned Courier Fleet'} &nbsp;
                <span style="font-size: 9.5pt; color: #4b5563; font-weight: normal;">(📞 +91 ${order.deliveryPartnerPhone || '9063692135'})</span>
              </div>
              <div style="font-size: 9pt; color: #374151; margin-top: 2pt;">
                <b>Vehicle:</b> ${order.deliveryPartnerVehicle || 'Hero Splendor / Fleet Bike'}
              </div>
              <div style="font-size: 9pt; color: #374151; margin-top: 2pt;">
                <b>Delivery Status:</b> <span style="font-weight: bold; color: #059669;">${order.deliveryPartnerStatus || 'Dispatched & Handled'}</span>
              </div>
              <!-- Rating section -->
              <div style="margin-top: 4pt; padding-top: 4pt; border-top: 1px dashed #cbd5e1;">
                <b>Customer Rating for Delivery Boy:</b>
                <span class="star-rating" style="margin-left: 4pt;">${riderStars}</span>
                <span style="font-size: 9pt; font-weight: bold; color: #111827;">(${riderRating}/5)</span>
                ${order.deliveryPartnerRatingTags && order.deliveryPartnerRatingTags.length > 0 ? `
                  <div style="margin-top: 2pt;">
                    ${order.deliveryPartnerRatingTags.map(t => `<span class="tag-compliment">${t}</span>`).join(' ')}
                  </div>
                ` : ''}
                ${order.deliveryPartnerFeedback ? `
                  <div style="font-size: 8.5pt; color: #047857; margin-top: 2pt; font-style: italic;">
                    💬 Customer Feedback: "${order.deliveryPartnerFeedback}"
                  </div>
                ` : ''}
              </div>
            </td>
          </tr>
        </table>

        <!-- Itemized Food Items Table -->
        <div style="padding: 8pt 10pt;">
          <div style="font-size: 9pt; font-weight: bold; text-transform: uppercase; color: #4b5563; margin-bottom: 3pt;">
            🍽️ ORDERED FOOD DISHES & ITEMS
          </div>
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 45%;">Dish / Food Item Name</th>
                <th style="width: 15%; text-align: center;">Diet</th>
                <th style="width: 12%; text-align: center;">Qty</th>
                <th style="width: 14%; text-align: right;">Unit Price</th>
                <th style="width: 14%; text-align: right;">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${(order.items || []).map(item => {
                const itemPrice = Number(item.foodItem?.price || 0);
                const itemQty = Number(item.quantity || 1);
                const itemTotal = itemPrice * itemQty;
                const isVeg = item.foodItem?.vegIndicator === 'veg';

                const customizations = item.selectedCustomizations 
                  ? Object.values(item.selectedCustomizations).map((c: any) => c.name || c).join(', ')
                  : '';

                return `
                <tr>
                  <td>
                    <b>${item.foodItem?.name || 'Specialty Dish'}</b>
                    ${customizations ? `<br/><span style="font-size: 8pt; color: #ea580c;">└ ${customizations}</span>` : ''}
                  </td>
                  <td style="text-align: center;">
                    <span style="font-weight: bold; color: ${isVeg ? '#059669' : '#dc2626'};">
                      ${isVeg ? '🟢 VEG' : '🔴 NON-VEG'}
                    </span>
                  </td>
                  <td style="text-align: center; font-weight: bold;">
                    x${itemQty}
                  </td>
                  <td style="text-align: right;">
                    ₹${itemPrice}
                  </td>
                  <td style="text-align: right; font-weight: bold;">
                    ₹${itemTotal}
                  </td>
                </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <!-- Bill Financial Breakdown Table -->
          <table style="width: 100%; border-collapse: collapse; margin-top: 4pt; font-size: 9.5pt; background-color: #f8fafc; border: 1px solid #e2e8f0;">
            <tr>
              <td style="padding: 6pt 10pt; width: 60%; vertical-align: middle;">
                <b>Payment Method:</b> ${order.paymentMethod || 'UPI'} 
                (${order.paymentStatus === 'confirmed' || order.paymentStatus === 'success' ? '✅ Paid & Verified' : '⏳ Payment Pending'})<br/>
                ${order.couponUsed ? `<span style="font-size: 8.5pt; color: #ea580c;">🎟️ Coupon Applied: <b>${order.couponUsed}</b></span>` : ''}
                ${order.pointsRedeemed ? `<span style="font-size: 8.5pt; color: #4338ca;">✨ Cashback Points: <b>${order.pointsRedeemed} pts</b></span>` : ''}
              </td>
              <td style="padding: 6pt 10pt; width: 40%; text-align: right;">
                <div style="font-size: 9pt; color: #4b5563;">
                  Items Subtotal: ₹${order.subtotal || 0}
                  ${order.discount ? ` &nbsp;|&nbsp; Discount: -₹${order.discount}` : ''}
                  ${order.deliveryFee ? ` &nbsp;|&nbsp; Delivery: ₹${order.deliveryFee}` : ''}
                  ${order.tax ? ` &nbsp;|&nbsp; GST: ₹${order.tax}` : ''}
                  ${order.tip ? ` &nbsp;|&nbsp; Tip: ₹${order.tip}` : ''}
                </div>
                <div style="font-size: 13pt; font-weight: bold; color: #ea580c; margin-top: 3pt;">
                  Grand Total Payable: ₹${order.finalAmount || order.subtotal || 0}
                </div>
              </td>
            </tr>
          </table>
        </div>
      </div>
      `;
    }).join('')}

    <!-- FOOTER SIGNATURE & AUDIT NOTE -->
    <div class="footer-note">
      <p style="margin: 0; font-weight: bold; color: #374151;">
        NUVVO FOODS & HOSPITALITY PRIVATE LIMITED — OFFICIAL DAILY DISPATCH & ORDER ARCHIVE
      </p>
      <p style="margin: 2pt 0 0 0;">
        Chirala Regional Flavour Hub, Andhra Pradesh 523155 • Customer Care: +91 9063692135 • support@nuvvo.cloud
      </p>
      <p style="margin: 2pt 0 0 0; font-size: 7.5pt; color: #9ca3af;">
        This document is an authentic computerized audit export. Data synchronized with Supabase cloud database nodes.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

/**
 * Downloads the Word document (.doc) natively to the user's computer or device.
 */
export function downloadOrdersWordDocument(
  orders: Order[],
  deliveryPartners: DeliveryPartnerProfile[] = [],
  options: DailyReportFilterOptions = {}
): { success: boolean; filename: string; ordersCount: number } {
  const filteredOrders = filterOrdersByDate(orders, options.selectedDate);
  const htmlContent = buildWordReportHtml(filteredOrders, deliveryPartners, options);

  const dateSuffix = options.selectedDate && options.selectedDate !== 'all'
    ? options.selectedDate
    : new Date().toISOString().split('T')[0];

  const filename = `Nuvvo_Daily_Orders_Report_${dateSuffix}.doc`;

  // Create Blob with official Microsoft Word MIME type
  const blob = new Blob(['\ufeff', htmlContent], {
    type: 'application/msword;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = filename;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);

  return {
    success: true,
    filename,
    ordersCount: filteredOrders.length
  };
}
