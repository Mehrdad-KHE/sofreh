import React, { useState, useMemo } from 'react';
import {
  CUSTOMER_APP_IDENTITY,
  buildCustomerScreenViewModel
} from './customerController.mjs';
import type {
  SupportedLocale,
  FulfillmentType,
  PublicCookDiscoveryItem,
  CustomerOrderView,
  OrderItemInput
} from '../../../packages/shared/src/types.js';

export type SofrehThemeId = 'default' | 'terracotta' | 'forest' | 'navy-saffron';

export interface CustomerAppProps {
  initialLocale?: SupportedLocale;
  initialTheme?: SofrehThemeId;
  cooks: PublicCookDiscoveryItem[];
  orders: CustomerOrderView[];
  onSubmitOrder?: (payload: {
    cookId: string;
    fulfillmentType: FulfillmentType;
    deliveryAddress?: string;
    simulatedPaymentMethod: 'SIMULATED_CARD' | 'SIMULATED_INTERAC';
    items: OrderItemInput[];
  }) => Promise<void>;
}

/**
 * Separate Customer Mobile App Root Component (Sofreh Customer - ca.sofreh.customer)
 * Supports en-CA (LTR) and fa-IR (RTL), MapLibre + OpenFreeMap discovery, simulated checkout,
 * Uber Eats-inspired modern hierarchy/food-card density/search/cart/nav, and 3 reversible themes + default.
 */
export function CustomerApp({
  initialLocale = 'en-CA',
  initialTheme = 'default',
  cooks,
  orders,
  onSubmitOrder
}: CustomerAppProps) {
  const [locale, setLocale] = useState<SupportedLocale>(initialLocale);
  const [theme, setTheme] = useState<SofrehThemeId>(initialTheme);
  const [selectedCookId, setSelectedCookId] = useState<string | null>(
    cooks[0]?.id ?? null
  );
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [cartItems, setCartItems] = useState<OrderItemInput[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const vm = useMemo(
    () =>
      buildCustomerScreenViewModel({
        locale,
        cooks,
        selectedCookId,
        cartItems,
        fulfillmentType,
        deliveryAddress,
        orders
      }),
    [locale, cooks, selectedCookId, cartItems, fulfillmentType, deliveryAddress, orders]
  );

  const isFa = vm.locale === 'fa-IR';

  return (
    <div dir={vm.direction} data-app-id={CUSTOMER_APP_IDENTITY.appId} data-locale={vm.locale} data-theme={theme}>
      <header>
        <span>{vm.labels.testOnlyBanner}</span>
        <div>
          <label htmlFor="customerThemeSelect">Color Theme:</label>
          <select
            id="customerThemeSelect"
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

      <div className="ue-search-strip">
        <div className="ue-location-row">
          <span className="ue-location-pill">
            {isFa ? '📍 نورث یورک و ریچموند هیل، انتاریو' : '📍 North York & Richmond Hill, ON'}
          </span>
          <span className="ue-location-pill">
            {fulfillmentType === 'pickup'
              ? isFa
                ? 'تحویل حضوری فعال'
                : 'Pickup • Active'
              : isFa
              ? 'ارسال فعال'
              : 'Delivery • Active'}
          </span>
        </div>
        <div className="ue-search-box">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isFa
                ? 'جستجوی قورمه‌سبزی، تهچین، آش رشته یا آشپزخانه...'
                : 'Search home-cooked Persian dishes, saffron tahchin, herbs...'
            }
            aria-label="Search home kitchens or dishes"
          />
        </div>
      </div>

      <section aria-label={vm.labels.mapTitle} data-map-style={vm.mapView.styleUrl}>
        <h2>{vm.labels.mapTitle}</h2>
        <p>{vm.labels.privacyNotice}</p>
        <ul>
          {cooks.map((cook) => (
            <li key={cook.id}>
              <button type="button" onClick={() => setSelectedCookId(cook.id)}>
                [{cook.syntheticBadgeLabel}] {cook.kitchenName} ({cook.neighborhood})
              </button>
            </li>
          ))}
        </ul>
      </section>

      {vm.selectedCook && (
        <section>
          <h3>{vm.selectedCook.kitchenName}</h3>
          <div>
            <label>
              <input
                type="radio"
                checked={fulfillmentType === 'pickup'}
                onChange={() => setFulfillmentType('pickup')}
              />
              {vm.labels.pickupOption}
            </label>
            {vm.selectedCook.supportsDelivery && (
              <label>
                <input
                  type="radio"
                  checked={fulfillmentType === 'delivery'}
                  onChange={() => setFulfillmentType('delivery')}
                />
                {vm.labels.deliveryOption}
              </label>
            )}
          </div>
          {fulfillmentType === 'delivery' && (
            <input
              type="text"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Delivery Address"
            />
          )}
          <ul>
            {vm.selectedCook.dishes.map((dish) => (
              <li key={dish.id}>
                <strong>{dish.title}</strong> ({dish.remainingPortions})
                <button
                  type="button"
                  disabled={dish.remainingPortions <= 0}
                  onClick={() =>
                    setCartItems((prev) => [...prev, { dishId: dish.id, quantity: 1 }])
                  }
                >
                  +
                </button>
              </li>
            ))}
          </ul>
          <div>
            <p>{vm.checkout.subtotalFormatted}</p>
            <p>{vm.checkout.deliveryFeeFormatted}</p>
            <p>{vm.checkout.totalFormatted}</p>
            <p>{vm.labels.simulatedPaymentNotice}</p>
            <button
              type="button"
              onClick={() =>
                onSubmitOrder?.({
                  cookId: vm.selectedCook.id,
                  fulfillmentType,
                  deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress : undefined,
                  simulatedPaymentMethod: 'SIMULATED_CARD',
                  items: cartItems
                })
              }
            >
              {vm.labels.placeOrderButton}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
