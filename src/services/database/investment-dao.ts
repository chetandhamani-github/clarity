import type {
  Account,
  AssetAllocationItem,
  AssetClass,
  InvestmentHolding,
  InvestmentMaturityItem,
  InvestmentSubType,
  PortfolioSummary,
} from '@/types';
import { summarizeAccounts } from '@/utils/account-metrics';
import { getDatabase } from './index';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

interface InvestmentHoldingRow {
  id: string;
  account_id: string | null;
  account_name?: string | null;
  name: string;
  asset_class: string;
  sub_type: string;
  invested_amount: number;
  current_value: number;
  units: number | null;
  nav_or_price: number | null;
  folio_or_account_number: string | null;
  interest_rate: number | null;
  maturity_date: string | null;
  sip_amount: number | null;
  sip_day_of_month: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: InvestmentHoldingRow): InvestmentHolding {
  return {
    id: row.id,
    accountId: row.account_id ?? undefined,
    accountName: row.account_name ?? undefined,
    name: row.name,
    assetClass: row.asset_class as AssetClass,
    subType: row.sub_type as InvestmentSubType,
    investedAmount: row.invested_amount,
    currentValue: row.current_value,
    units: row.units ?? undefined,
    navOrPrice: row.nav_or_price ?? undefined,
    folioOrAccountNumber: row.folio_or_account_number ?? undefined,
    interestRate: row.interest_rate ?? undefined,
    maturityDate: row.maturity_date ?? undefined,
    sipAmount: row.sip_amount ?? undefined,
    sipDayOfMonth: row.sip_day_of_month ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllInvestmentHoldings(): Promise<InvestmentHolding[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<InvestmentHoldingRow>(
    `SELECT i.*, a.name as account_name
     FROM investment_holdings i
     LEFT JOIN accounts a ON i.account_id = a.id
     ORDER BY i.current_value DESC, i.created_at DESC`
  );
  return rows.map(mapRow);
}

export async function getInvestmentHoldingById(id: string): Promise<InvestmentHolding | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<InvestmentHoldingRow>(
    `SELECT i.*, a.name as account_name
     FROM investment_holdings i
     LEFT JOIN accounts a ON i.account_id = a.id
     WHERE i.id = ?`,
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function insertInvestmentHolding(
  data: Omit<InvestmentHolding, 'id' | 'createdAt' | 'updatedAt'>
): Promise<InvestmentHolding> {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO investment_holdings (
       id, account_id, name, asset_class, sub_type, invested_amount,
       current_value, units, nav_or_price, folio_or_account_number,
       interest_rate, maturity_date, sip_amount, sip_day_of_month,
       notes, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.accountId || null,
      data.name.trim(),
      data.assetClass,
      data.subType,
      data.investedAmount || 0,
      data.currentValue || 0,
      data.units ?? null,
      data.navOrPrice ?? null,
      data.folioOrAccountNumber ? data.folioOrAccountNumber.trim() : null,
      data.interestRate ?? null,
      data.maturityDate || null,
      data.sipAmount ?? null,
      data.sipDayOfMonth ?? null,
      data.notes ? data.notes.trim() : null,
      now,
      now,
    ]
  );

  return {
    id,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateInvestmentHolding(
  id: string,
  data: Partial<Omit<InvestmentHolding, 'id' | 'createdAt'>>
): Promise<void> {
  const db = getDatabase();
  const sets: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    sets.push('name = ?');
    params.push(data.name.trim());
  }
  if (data.accountId !== undefined) {
    sets.push('account_id = ?');
    params.push(data.accountId || null);
  }
  if (data.assetClass !== undefined) {
    sets.push('asset_class = ?');
    params.push(data.assetClass);
  }
  if (data.subType !== undefined) {
    sets.push('sub_type = ?');
    params.push(data.subType);
  }
  if (data.investedAmount !== undefined) {
    sets.push('invested_amount = ?');
    params.push(data.investedAmount);
  }
  if (data.currentValue !== undefined) {
    sets.push('current_value = ?');
    params.push(data.currentValue);
  }
  if (data.units !== undefined) {
    sets.push('units = ?');
    params.push(data.units);
  }
  if (data.navOrPrice !== undefined) {
    sets.push('nav_or_price = ?');
    params.push(data.navOrPrice);
  }
  if (data.folioOrAccountNumber !== undefined) {
    sets.push('folio_or_account_number = ?');
    params.push(data.folioOrAccountNumber ? data.folioOrAccountNumber.trim() : null);
  }
  if (data.interestRate !== undefined) {
    sets.push('interest_rate = ?');
    params.push(data.interestRate);
  }
  if (data.maturityDate !== undefined) {
    sets.push('maturity_date = ?');
    params.push(data.maturityDate || null);
  }
  if (data.sipAmount !== undefined) {
    sets.push('sip_amount = ?');
    params.push(data.sipAmount);
  }
  if (data.sipDayOfMonth !== undefined) {
    sets.push('sip_day_of_month = ?');
    params.push(data.sipDayOfMonth);
  }
  if (data.notes !== undefined) {
    sets.push('notes = ?');
    params.push(data.notes ? data.notes.trim() : null);
  }

  sets.push('updated_at = ?');
  params.push(new Date().toISOString());

  params.push(id);
  await db.runAsync(`UPDATE investment_holdings SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function deleteInvestmentHolding(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM investment_holdings WHERE id = ?', [id]);
}

export async function getPortfolioSummary(accounts: Account[] = []): Promise<PortfolioSummary> {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const holdings = await getAllInvestmentHoldings();

  // Total cash from liquid accounts
  const liquidCash = safeAccounts
    .filter((a) => ['savings', 'current', 'wallet', 'checking'].includes(a.type))
    .reduce((sum, a) => sum + (a.balance > 0 ? a.balance : 0), 0);

  // Group holdings by asset class
  const classTotals: Record<AssetClass, { amount: number; invested: number }> = {
    equity: { amount: 0, invested: 0 },
    debt_fixed_income: { amount: 0, invested: 0 },
    gold: { amount: 0, invested: 0 },
    cash: { amount: liquidCash, invested: liquidCash },
    real_estate: { amount: 0, invested: 0 },
    crypto: { amount: 0, invested: 0 },
  };

  let totalHoldingsInvested = 0;
  let totalHoldingsValue = 0;

  for (const h of holdings) {
    const cls = h.assetClass;
    if (classTotals[cls]) {
      classTotals[cls].amount += h.currentValue;
      classTotals[cls].invested += h.investedAmount;
    }
    totalHoldingsInvested += h.investedAmount;
    totalHoldingsValue += h.currentValue;
  }

  const totalPortfolioValue = totalHoldingsValue + liquidCash;
  const totalInvestedAmount = totalHoldingsInvested + liquidCash;
  const unrealizedGainLoss = totalHoldingsValue - totalHoldingsInvested;
  const gainLossPercentage =
    totalHoldingsInvested > 0 ? (unrealizedGainLoss / totalHoldingsInvested) * 100 : 0;

  // Calculate comprehensive net worth across all accounts + investment holdings
  const { netBalance: accountsNetBalance } = summarizeAccounts(safeAccounts);
  const totalNetWorthWithInvestments = accountsNetBalance + totalHoldingsValue;

  // Build allocation items
  const allocationConfigs: {
    assetClass: AssetClass;
    label: string;
    color: string;
    icon: string;
  }[] = [
    { assetClass: 'equity', label: 'Equity & Mutual Funds', color: '#3B82F6', icon: 'trending-up' },
    {
      assetClass: 'debt_fixed_income',
      label: 'FD & Fixed Income',
      color: '#10B981',
      icon: 'account-balance',
    },
    { assetClass: 'gold', label: 'Gold & Commodities', color: '#F59E0B', icon: 'stars' },
    { assetClass: 'cash', label: 'Liquid Cash & Savings', color: '#06B6D4', icon: 'payments' },
    { assetClass: 'real_estate', label: 'Real Estate & Property', color: '#8B5CF6', icon: 'apartment' },
    { assetClass: 'crypto', label: 'Digital Assets / Crypto', color: '#EC4899', icon: 'currency-bitcoin' },
  ];

  const allocations: AssetAllocationItem[] = allocationConfigs
    .map((cfg) => {
      const amt = classTotals[cfg.assetClass]?.amount || 0;
      const pct = totalPortfolioValue > 0 ? (amt / totalPortfolioValue) * 100 : 0;
      return {
        assetClass: cfg.assetClass,
        label: cfg.label,
        amount: Math.round(amt * 100) / 100,
        percentage: Math.round(pct * 10) / 10,
        color: cfg.color,
        icon: cfg.icon,
      };
    })
    .filter((item) => item.amount > 0 || item.assetClass === 'cash');

  return {
    totalPortfolioValue: Math.round(totalPortfolioValue * 100) / 100,
    totalHoldingsValue: Math.round(totalHoldingsValue * 100) / 100,
    totalInvestedAmount: Math.round(totalInvestedAmount * 100) / 100,
    unrealizedGainLoss: Math.round(unrealizedGainLoss * 100) / 100,
    gainLossPercentage: Math.round(gainLossPercentage * 100) / 100,
    totalNetWorthWithInvestments: Math.round(totalNetWorthWithInvestments * 100) / 100,
    allocations,
    holdingsCount: holdings.length,
  };
}

export async function getInvestmentMaturityCalendar(): Promise<InvestmentMaturityItem[]> {
  const holdings = await getAllInvestmentHoldings();
  const items: InvestmentMaturityItem[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const h of holdings) {
    // 1. Recurring SIP Reminders
    if (h.sipDayOfMonth && h.sipDayOfMonth >= 1 && h.sipDayOfMonth <= 31) {
      items.push({
        id: `sip_${h.id}`,
        name: h.name,
        type: 'SIP',
        dateOrDay: `Day ${h.sipDayOfMonth} of every month`,
        amount: h.sipAmount || h.currentValue || 0,
        assetClass: h.assetClass,
        subType: h.subType,
      });
    }

    // 2. FD / Bond / SGB Maturity Reminders
    if (h.maturityDate) {
      const matDate = new Date(`${h.maturityDate}T00:00:00`);
      if (!isNaN(matDate.getTime())) {
        const diffMs = matDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        items.push({
          id: `mat_${h.id}`,
          name: h.name,
          type: 'MATURITY',
          dateOrDay: h.maturityDate,
          amount: h.currentValue || h.investedAmount || 0,
          assetClass: h.assetClass,
          subType: h.subType,
          interestRate: h.interestRate,
          daysRemaining,
        });
      }
    }
  }

  // Sort: maturing soonest first, followed by SIPs
  return items.sort((a, b) => {
    if (a.type === 'MATURITY' && b.type === 'MATURITY') {
      return (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999);
    }
    if (a.type === 'MATURITY') return -1;
    if (b.type === 'MATURITY') return 1;
    return a.name.localeCompare(b.name);
  });
}
