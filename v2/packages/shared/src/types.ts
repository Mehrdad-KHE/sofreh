export type SupportedLocale = 'en-CA' | 'fa-IR';
export type TextDirection = 'ltr' | 'rtl';
export type UserRole = 'CUSTOMER' | 'COOK';
export type FulfillmentType = 'pickup' | 'delivery';

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED';

export type SimulatedPaymentStatus =
  | 'SIMULATED_PENDING'
  | 'SIMULATED_AUTHORIZED'
  | 'SIMULATED_PAID'
  | 'SIMULATED_REFUNDED';

export interface LocalizedText {
  'en-CA': string;
  'fa-IR': string;
}

export interface UserAccount {
  id: string;
  role: UserRole;
  displayName: string;
  phonePrivate: string;
  emailPrivate: string;
  preferredLocale: SupportedLocale;
  authToken: string;
}

export interface CookProfileRecord {
  id: string;
  userId: string;
  kitchenNameEn: string;
  kitchenNameFa: string;
  bioEn: string;
  bioFa: string;
  neighborhood: string;
  /** Approximate public latitude for MapLibre discovery pin */
  publicLat: number;
  /** Approximate public longitude for MapLibre discovery pin */
  publicLng: number;
  /** Private exact street address, never exposed in public discovery */
  exactPickupAddressPrivate: string;
  /** Cook-set delivery fee in CAD cents (applied only when fulfillmentType === 'delivery') */
  deliveryFeeCents: number;
  supportsPickup: boolean;
  supportsDelivery: boolean;
  deliveryRadiusKm: number;
  /** Explicit Stage 1 synthetic fixture flag */
  isSyntheticTestFixture: boolean;
  syntheticBadgeLabel: 'TEST ONLY';
}

export type DishAvailabilityMode = 'TODAY_AVAILABLE' | 'REGULAR_UNAVAILABLE';
export type ReviewDirection = 'CUSTOMER_TO_COOK' | 'COOK_TO_CUSTOMER';

export interface HonestReviewAggregate {
  reviewCount: number;
  averageRating: number | null;
}

export interface OrderReviewView {
  id: string;
  orderId: string;
  cookId: string;
  reviewerRole: UserRole;
  reviewerDisplayName: string;
  direction: ReviewDirection;
  rating: number;
  commentEscaped: string;
  createdAtIso: string;
}

export interface DishSlotRecord {
  id: string;
  cookId: string;
  titleEn: string;
  titleFa: string;
  descriptionEn: string;
  descriptionFa: string;
  priceCents: number;
  totalPortions: number;
  remainingPortions: number;
  serviceWindowStartIso: string;
  serviceWindowEndIso: string;
  allergens: string[];
  isActive: boolean;
  availabilityMode?: DishAvailabilityMode;
  photoUrl?: string;
  scheduleNoteEn?: string;
  scheduleNoteFa?: string;
}

export interface PublicCookDiscoveryItem {
  id: string;
  kitchenName: string;
  kitchenNameLocalized: LocalizedText;
  bio: string;
  bioLocalized: LocalizedText;
  neighborhood: string;
  publicLat: number;
  publicLng: number;
  deliveryFeeCents: number;
  supportsPickup: boolean;
  supportsDelivery: boolean;
  deliveryRadiusKm: number;
  pickupWindowLabel?: string;
  pickupSummaryLabel?: string;
  reviewSummary?: HonestReviewAggregate;
  reviews?: OrderReviewView[];
  isSyntheticTestFixture: true;
  syntheticBadgeLabel: 'TEST ONLY';
  dishes: PublicDishSlotItem[];
  todayAvailableDishes?: PublicDishSlotItem[];
  regularUnavailableDishes?: PublicDishSlotItem[];
}

export interface PublicDishSlotItem {
  id: string;
  cookId: string;
  title: string;
  titleLocalized: LocalizedText;
  description: string;
  descriptionLocalized: LocalizedText;
  priceCents: number;
  totalPortions: number;
  remainingPortions: number;
  serviceWindowStartIso: string;
  serviceWindowEndIso: string;
  allergens: string[];
  availabilityMode?: DishAvailabilityMode;
  isAvailableToday?: boolean;
  photoUrl?: string;
  scheduleNote?: string;
}

export interface OrderItemInput {
  dishId: string;
  quantity: number;
}

export interface CreateOrderInput {
  cookId: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress?: string;
  customerNotes?: string;
  simulatedPaymentMethod: 'SIMULATED_CARD' | 'SIMULATED_INTERAC';
  idempotencyKey?: string;
  items: OrderItemInput[];
}

export interface PersistedCartItemView {
  dishId: string;
  cookId: string;
  titleEn: string;
  titleFa: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  remainingPortions: number;
  photoUrl: string;
}

export interface PersistedCartView {
  customerUserId: string;
  cookId: string | null;
  kitchenNameEn: string | null;
  kitchenNameFa: string | null;
  fulfillmentType: FulfillmentType;
  deliveryAddress: string;
  items: PersistedCartItemView[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  updatedAtIso: string;
}

export interface OrderItemView {
  dishId: string;
  titleEn: string;
  titleFa: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface CustomerOrderView {
  id: string;
  cookId: string;
  kitchenNameEn: string;
  kitchenNameFa: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  simulatedPaymentStatus: SimulatedPaymentStatus;
  simulatedPaymentReference: string;
  /** Released only when fulfillmentType === 'pickup' and status is ACCEPTED, PREPARING, READY, or COMPLETED */
  pickupAddressReleased: string | null;
  deliveryAddress: string | null;
  customerNotes: string | null;
  isSyntheticTestOrder: boolean;
  syntheticBadgeLabel: 'TEST ONLY';
  createdAtIso: string;
  updatedAtIso: string;
  items: OrderItemView[];
}

export interface CookOrderView {
  id: string;
  cookId: string;
  customerDisplayName: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  simulatedPaymentStatus: SimulatedPaymentStatus;
  /** Released to cook only when fulfillmentType === 'delivery' */
  deliveryAddressForFulfillment: string | null;
  customerNotes: string | null;
  isSyntheticTestOrder: boolean;
  syntheticBadgeLabel: 'TEST ONLY';
  createdAtIso: string;
  updatedAtIso: string;
  items: OrderItemView[];
}
