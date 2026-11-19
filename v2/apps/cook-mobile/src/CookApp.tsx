import React, { useState, useMemo } from 'react';
import {
  COOK_APP_IDENTITY,
  buildCookScreenViewModel
} from './cookController.mjs';
import type {
  SupportedLocale,
  PublicCookDiscoveryItem,
  CookOrderView,
  OrderStatus
} from '../../../packages/shared/src/types.js';

export type SofrehThemeId = 'default' | 'terracotta' | 'forest' | 'navy-saffron';

export interface CookAppProps {
  initialLocale?: SupportedLocale;
  initialTheme?: SofrehThemeId;
  kitchen: PublicCookDiscoveryItem;
  orders: CookOrderView[];
  onUpdateDeliveryFee?: (deliveryFeeCents: number) => Promise<void>;
  onTransitionOrder?: (orderId: string, nextStatus: OrderStatus) => Promise<void>;
}

/**
 * Separate Cook Mobile App Root Component (Sofreh Cook - ca.sofreh.cook)
 * Supports en-CA (LTR) and fa-IR (RTL), cook-set delivery fee management, order queue control,
 * and three reversible color-theme alternatives (terracotta, forest, navy-saffron) plus recoverable default.
 */
export function CookApp({
  initialLocale = 'en-CA',
  initialTheme = 'default',
  kitchen,
  orders,
  onUpdateDeliveryFee,
  onTransitionOrder
}: CookAppProps) {
  const [locale, setLocale] = useState<SupportedLocale>(initialLocale);
  const [theme, setTheme] = useState<SofrehThemeId>(initialTheme);
  const [feeInputCents, setFeeInputCents] = useState<number>(kitchen.deliveryFeeCents);

  const vm = useMemo(
    () =>
      buildCookScreenViewModel({
        locale,
        kitchen: { ...kitchen, deliveryFeeCents: feeInputCents },
        orders
      }),
    [locale, kitchen, feeInputCents, orders]
  );

  return (
    <div dir={vm.direction} data-app-id={COOK_APP_IDENTITY.appId} data-locale={vm.locale} data-theme={theme}>
      <header>
        <span>{vm.labels.testOnlyBanner}</span>
        <div>
          <label htmlFor="cookThemeSelect">Color Theme:</label>
          <select
            id="cookThemeSelect"
            aria-label="Color Theme Selector"
            value={theme}
            onChange={(e) => setTheme(e.target.value as SofrehThemeId)}
          >
            <option value="default">Current Default (Recoverable)</option>
            <option value="terracotta">1) Warm Terracotta / Cream</option>
            <option value="forest">2) Forest / Cream</option>
            <option value="navy-saffron">3) Navy / Saffron</option>
          </select>
        </div>
        <h1>{vm.labels.title}</h1>
        <p>{vm.labels.subtitle}</p>
        <button
          type="button"
          onClick={() => setLocale(vm.locale === 'en-CA' ? 'fa-IR' : 'en-CA')}
        >
          {vm.locale === 'en-CA' ? 'فارسی (RTL)' : 'English (LTR)'}
        </button>
      </header>

      {vm.kitchen && (
        <div className="ue-kpi-strip">
          <div className="ue-kpi-pill">
            <span className="ue-kpi-label">{vm.locale === 'fa-IR' ? 'هزینه ارسال' : 'Delivery Fee'}</span>
            <span className="ue-kpi-value">{vm.kitchen.deliveryFeeFormatted}</span>
          </div>
          <div className="ue-kpi-pill">
            <span className="ue-kpi-label">{vm.locale === 'fa-IR' ? 'صف سفارش' : 'Live Queue'}</span>
            <span className="ue-kpi-value">{vm.orders.length}</span>
          </div>
          <div className="ue-kpi-pill">
            <span className="ue-kpi-label">{vm.locale === 'fa-IR' ? 'پایگاه داده' : 'Persistence'}</span>
            <span className="ue-kpi-value">SQLite WAL</span>
          </div>
        </div>
      )}

      {vm.kitchen && (
        <section>
          <h2>[{vm.kitchen.syntheticBadgeLabel}] {vm.kitchen.kitchenName}</h2>
          <label>
            {vm.labels.deliveryFeeSetting}:
            <input
              type="number"
              min={0}
              max={5000}
              step={50}
              value={feeInputCents}
              onChange={(e) => setFeeInputCents(Number(e.target.value))}
            />
          </label>
          <span>({vm.kitchen.deliveryFeeFormatted})</span>
          <button
            type="button"
            onClick={() => onUpdateDeliveryFee?.(feeInputCents)}
          >
            {vm.labels.updateDeliveryFee}
          </button>
        </section>
      )}

      <section>
        <h2>{vm.labels.incomingOrders}</h2>
        <p>{vm.labels.privacyNotice}</p>
        <ul>
          {vm.orders.map((order) => (
            <li key={order.id}>
              <strong>{order.id}</strong> — {order.customerDisplayName} — {order.statusLabel} ({order.totalFormatted})
              {order.deliveryAddressForFulfillment && (
                <div>Delivery: {order.deliveryAddressForFulfillment}</div>
              )}
              <div>
                {order.availableNextStatuses.map((nextStatus) => (
                  <button
                    key={nextStatus}
                    type="button"
                    onClick={() => onTransitionOrder?.(order.id, nextStatus as OrderStatus)}
                  >
                    {nextStatus}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
