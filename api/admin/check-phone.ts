/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Standalone Vercel Serverless Function: /api/admin/check-phone
 * Verifies if a mobile number is associated with an authorized Admin or Super Admin account.
 * Only authorized numbers receive promptForPin: true.
 */

import handler from "../auth/admin-check-phone";

export default handler;
