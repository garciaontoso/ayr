// Flex Web Service relay — IB Flex Web Service bloquea CF Workers IPs (403),
// pero desde el NAS (IP residencial española) funciona perfectamente.
//
// Endpoint:
//   POST /flex/sync           → ejecuta sync completo: fetch XML → POST al worker
//   POST /flex/sync?dryRun=1  → solo devuelve el XML (no manda al worker)
//
// El worker tiene env.IB_FLEX_TOKEN. Aquí lo recibimos en el Bearer header
// extendido (X-AYR-Flex-Token) o env del bridge (IB_FLEX_TOKEN, opcional).

import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

const FLEX_QUERY_ID_DEFAULT = '1452278';
const FLEX_HOST = 'https://ndcdyn.interactivebrokers.com';

async function flexSendRequest(token, queryId) {
  const url = `${FLEX_HOST}/AccountManagement/FlexWebService/SendRequest?t=${token}&q=${queryId}&v=3`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!resp.ok) throw new Error(`Flex SendRequest HTTP ${resp.status}`);
  const xml = await resp.text();
  // Parse Status + ReferenceCode
  const status = (xml.match(/<Status>([^<]+)<\/Status>/) || [])[1];
  const refCode = (xml.match(/<ReferenceCode>([^<]+)<\/ReferenceCode>/) || [])[1];
  const errCode = (xml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/) || [])[1];
  const errMsg = (xml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/) || [])[1];
  if (status !== 'Success' || !refCode) {
    throw new Error(`Flex SendRequest failed: ${status} (${errCode || ''}: ${errMsg || ''})`);
  }
  return refCode;
}

async function flexGetStatement(token, refCode) {
  // Hay un delay entre SendRequest y GetStatement. Polling cada 3s hasta 30s.
  const url = `${FLEX_HOST}/AccountManagement/FlexWebService/GetStatement?t=${token}&q=${refCode}&v=3`;
  for (let i = 0; i < 10; i++) {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`Flex GetStatement HTTP ${resp.status}`);
    const xml = await resp.text();
    // Si todavía está procesando, devuelve <Status>Warn</Status>
    const status = (xml.match(/<Status>([^<]+)<\/Status>/) || [])[1];
    if (xml.includes('FlexQueryResponse') || xml.includes('FlexStatements')) {
      return xml;
    }
    if (status === 'Fail') {
      const errCode = (xml.match(/<ErrorCode>([^<]+)<\/ErrorCode>/) || [])[1];
      const errMsg = (xml.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/) || [])[1];
      throw new Error(`Flex GetStatement Fail: ${errCode}: ${errMsg}`);
    }
    // Wait 3s y reintentar
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('Flex GetStatement timeout (>30s)');
}

router.post('/sync', async (req, res) => {
  const flexToken = process.env.IB_FLEX_TOKEN || req.headers['x-ayr-flex-token'];
  const queryId = req.query.q || process.env.IB_FLEX_QUERY_ID || FLEX_QUERY_ID_DEFAULT;
  const workerUrl = process.env.AYR_WORKER_URL || 'https://api.onto-so.com';
  const dryRun = req.query.dryRun === '1';

  if (!flexToken) {
    return res.status(400).json({ error: 'IB_FLEX_TOKEN missing (env or X-AYR-Flex-Token header)' });
  }

  try {
    logger.info('flex.send_request_start', { queryId });
    const refCode = await flexSendRequest(flexToken, queryId);
    logger.info('flex.send_request_ok', { refCode });

    const xml = await flexGetStatement(flexToken, refCode);
    logger.info('flex.get_statement_ok', { bytes: xml.length });

    if (dryRun) {
      return res.json({ success: true, dryRun: true, xml_bytes: xml.length, ref_code: refCode });
    }

    // POST al worker /api/ib-flex-import
    const workerToken = process.env.AYR_WORKER_TOKEN;
    const importResp = await fetch(`${workerUrl}/api/ib-flex-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        ...(workerToken ? { 'X-AYR-Auth': workerToken } : {}),
      },
      body: xml,
      signal: AbortSignal.timeout(60000),
    });
    const importJson = await importResp.json().catch(() => ({}));
    logger.info('flex.import_done', { status: importResp.status, summary: importJson });
    return res.json({ success: importResp.ok, ref_code: refCode, xml_bytes: xml.length, import: importJson });
  } catch (e) {
    logger.error('flex.sync_failed', { error: e.message });
    return res.status(500).json({ error: e.message });
  }
});

// Internal scheduled task — corre cada 24h (8:30 Madrid local time aprox).
// El usuario tiene NAS siempre encendido, así no depende del Mac.
let scheduledTimer = null;
export function startScheduledFlexSync() {
  if (scheduledTimer) return;
  // Calcular ms hasta próximo 8:30 hora Madrid (UTC+1/+2 según DST)
  function msUntilNextRun() {
    const now = new Date();
    const target = new Date();
    target.setUTCHours(7, 30, 0, 0); // 8:30 Madrid en invierno (UTC+1) → 7:30 UTC
    if (target.getTime() <= now.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    return target.getTime() - now.getTime();
  }

  async function runScheduled() {
    try {
      logger.info('flex.scheduled_start');
      const flexToken = process.env.IB_FLEX_TOKEN;
      const queryId = process.env.IB_FLEX_QUERY_ID || FLEX_QUERY_ID_DEFAULT;
      const workerUrl = process.env.AYR_WORKER_URL || 'https://api.onto-so.com';
      if (!flexToken) {
        logger.warn('flex.scheduled_skip', { reason: 'IB_FLEX_TOKEN not set' });
        return;
      }
      const refCode = await flexSendRequest(flexToken, queryId);
      const xml = await flexGetStatement(flexToken, refCode);
      const importResp = await fetch(`${workerUrl}/api/ib-flex-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xml,
        signal: AbortSignal.timeout(60000),
      });
      logger.info('flex.scheduled_done', { status: importResp.status, bytes: xml.length });
    } catch (e) {
      logger.error('flex.scheduled_failed', { error: e.message });
    } finally {
      // Reschedule next run
      scheduledTimer = setTimeout(runScheduled, msUntilNextRun());
    }
  }

  // First run at next 8:30 Madrid
  scheduledTimer = setTimeout(runScheduled, msUntilNextRun());
  logger.info('flex.scheduler_started', { next_run_in_ms: msUntilNextRun() });
}

export default router;
