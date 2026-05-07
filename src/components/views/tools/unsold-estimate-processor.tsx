'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Calendar, Download, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAdminSecret } from '@/lib/hooks/use-admin-secret';

interface FetchedRow {
  opportunity_number?: string;
  customer_name?: string;
  location_phone?: string;
  customer_email?: string;
  business_unit?: string;
  email_sent?: unknown;
  estimate_created_by?: string;
  creation_date?: string;
  follow_up_date?: string;
  number_of_follow_ups?: number;
  estimate_age_days?: number;
  estimates_subtotal_cents?: number;
  estimates_discount_total_cents?: number;
}

interface OutputRow {
  'Opportunity Number': string;
  'Customer Name': string;
  'Location Phone': string;
  'Customer Email': string;
  'Business Unit': string;
  'Email Sent': unknown;
  'Average Estimate': number;
  'Average Discount': number;
  'Number of Options': number;
  'Estimate Created By': string;
  'Creation Date': string;
  'Follow Up Date': string;
  'Number of Follow Ups': number;
  'Estimate Age (Days)': number;
}

interface ProcessResult {
  workbook: XLSX.WorkBook;
  totalOpportunities: number;
  totalEstimates: number;
  totalRealisticRevenue: number;
  fileName: string;
}

function fmtMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function UnsoldEstimateProcessor() {
  const { authHeaders } = useAdminSecret();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState<'idle' | 'fetching' | 'processing'>('idle');
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    setStartDate(first.toISOString().slice(0, 10));
    setEndDate(now.toISOString().slice(0, 10));
  }, []);

  const fetchAndProcess = async () => {
    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }
    setBusy('fetching');
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admin/unsold-estimates-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...Object.fromEntries(authHeaders().entries()) },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `${res.status}`);
      }
      const json = (await res.json()) as { data: FetchedRow[] };
      if (!json.data || json.data.length === 0) {
        throw new Error('No unsold estimates found for the selected date range');
      }
      setBusy('processing');

      // Group by opportunity_number; average subtotals + discounts.
      const groups = new Map<
        string,
        {
          first: FetchedRow;
          subtotals: number[];
          discounts: number[];
        }
      >();
      for (const row of json.data) {
        const key = row.opportunity_number ?? '';
        if (!key) continue;
        const g = groups.get(key) ?? { first: row, subtotals: [], discounts: [] };
        const sub = Number(row.estimates_subtotal_cents ?? 0);
        const disc = Number(row.estimates_discount_total_cents ?? 0);
        if (Number.isFinite(sub)) g.subtotals.push(sub);
        if (Number.isFinite(disc)) g.discounts.push(disc);
        groups.set(key, g);
      }

      const outputRows: OutputRow[] = [];
      for (const [key, g] of groups) {
        const avgEst =
          g.subtotals.length > 0 ? g.subtotals.reduce((a, b) => a + b, 0) / g.subtotals.length : 0;
        const avgDisc =
          g.discounts.length > 0 ? g.discounts.reduce((a, b) => a + b, 0) / g.discounts.length : 0;
        outputRows.push({
          'Opportunity Number': key,
          'Customer Name': g.first.customer_name ?? '',
          'Location Phone': g.first.location_phone ?? '',
          'Customer Email': g.first.customer_email ?? '',
          'Business Unit': g.first.business_unit ?? '',
          'Email Sent': g.first.email_sent,
          'Average Estimate': Math.round(avgEst * 100) / 100,
          'Average Discount': Math.round(avgDisc * 100) / 100,
          'Number of Options': g.subtotals.length,
          'Estimate Created By': g.first.estimate_created_by ?? '',
          'Creation Date': g.first.creation_date ?? '',
          'Follow Up Date': g.first.follow_up_date ?? '',
          'Number of Follow Ups': Number(g.first.number_of_follow_ups ?? 0),
          'Estimate Age (Days)': Number(g.first.estimate_age_days ?? 0),
        });
      }
      outputRows.sort((a, b) => b['Average Estimate'] - a['Average Estimate']);

      const totalOpps = outputRows.length;
      const totalRev = outputRows.reduce((s, r) => s + r['Average Estimate'], 0);
      const ws = XLSX.utils.json_to_sheet(outputRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Unsold Estimates');
      const fileName = `unsold_estimates_${startDate}_to_${endDate}.xlsx`;

      setResult({
        workbook: wb,
        totalOpportunities: totalOpps,
        totalEstimates: json.data.length,
        totalRealisticRevenue: totalRev,
        fileName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('idle');
    }
  };

  const downloadXlsx = () => {
    if (!result) return;
    XLSX.writeFile(result.workbook, result.fileName);
  };

  const inputClass =
    'w-full bg-surface-2 border border-border rounded-btn py-2 pl-10 pr-3 text-[13px] focus:outline-none focus:border-accent transition-colors';

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted leading-relaxed">
        Pulls unsold estimates from ServiceTitan in the selected window, groups them
        by opportunity, averages the option prices per customer, and exports the
        result as an Excel spreadsheet for follow-up.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[12px] text-muted mb-1.5">Start Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="block text-[12px] text-muted mb-1.5">End Date</label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-[13px] text-down bg-down-bg border border-down/30 rounded-btn p-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="button"
        onClick={fetchAndProcess}
        disabled={!startDate || !endDate || busy !== 'idle'}
        className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-btn bg-accent text-bg font-semibold text-[13px] disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <RefreshCw className={`h-4 w-4 ${busy !== 'idle' ? 'animate-spin' : ''}`} />
        {busy === 'fetching'
          ? 'Fetching from ServiceTitan…'
          : busy === 'processing'
            ? 'Processing data…'
            : 'Fetch & Process'}
      </button>

      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[14px] text-up font-medium">
            <CheckCircle className="h-4 w-4" />
            Processing complete
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col p-3 rounded-card bg-surface-2 border border-border">
              <span className="text-eyebrow uppercase text-muted">Opportunities</span>
              <span className="text-[20px] font-semibold font-mono tabular-nums">
                {result.totalOpportunities.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex flex-col p-3 rounded-card bg-surface-2 border border-border">
              <span className="text-eyebrow uppercase text-muted">Total Estimates</span>
              <span className="text-[20px] font-semibold font-mono tabular-nums text-accent">
                {result.totalEstimates.toLocaleString('en-US')}
              </span>
            </div>
            <div className="flex flex-col p-3 rounded-card bg-surface-2 border border-border">
              <span className="text-eyebrow uppercase text-muted">Avg pipeline</span>
              <span className="text-[20px] font-semibold font-mono tabular-nums text-up">
                {fmtMoney(result.totalRealisticRevenue)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={downloadXlsx}
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-btn bg-up/15 text-up border border-up/40 font-semibold text-[13px] hover:bg-up/25 transition-colors"
          >
            <Download className="h-4 w-4" />
            Download {result.fileName}
          </button>
        </div>
      )}
    </div>
  );
}
