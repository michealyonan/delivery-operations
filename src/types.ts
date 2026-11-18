export type UserRole = 'admin' | 'restaurant' | 'courier' | 'support';

export type SupportConversationStatus = 'open' | 'in_progress' | 'resolved';
export type BreakStartedBy = 'admin' | 'courier';
export type OrderReturnStatus = 'in_transit' | 'returned_by_courier' | 'closed';
export type OrderAssignmentAttemptStatus = 'awaiting' | 'not_accepted' | 'accepted';

export type OrderStatus =
  | 'pending'
  | 'assigned'
  | 'accepted'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';
export type CourierShiftBookingStatus =
  | 'booked'
  | 'swap_listed'
  | 'completed'
  | 'admin_removed'
  | 'cancelled';
export type OrderTransferReason =
  | 'vehicle_issue'
  | 'health_issue'
  | 'restaurant_delay'
  | 'customer_unavailable'
  | 'order_issue'
  | 'other';
export type OrderTransferStatus = 'pending' | 'approved' | 'rejected';

export interface AppProfile {
  id: string;
  role: UserRole;
  name: string;
  email?: string;
  phone?: string;
  profilePhotoUrl?: string;
  restaurantId?: number;
  restaurantAddress?: string;
  restaurantLatitude?: number;
  restaurantLongitude?: number;
  restaurantAcceptsOrders?: boolean;
  courierId?: number;
  courierCode?: string;
  isOnShift?: boolean;
  shiftStartedAt?: string;
  shiftCloseRequestedAt?: string;
  shiftEndedAt?: string;
  breakUntil?: string;
  breakStartedBy?: BreakStartedBy;
  contractStartDate?: string;
  contractEndDate?: string;
  isTerminated?: boolean;
}

export interface CourierLocation {
  courierId: number;
  latitude: number;
  longitude: number;
  recordedAt: string;
}

export interface CourierFeeRemittance {
  id: string;
  courierId: number;
  amountPiasters: number;
  receivedAt: string;
  receivedBy?: string;
}

export interface Courier {
  id: number;
  code: string;
  fullName: string;
  phone: string;
  email: string;
  profilePhotoUrl?: string;
  nationalId?: string;
  address?: string;
  idCardPath?: string;
  isActive: boolean;
  isOnShift: boolean;
  isOnBreak: boolean;
  breakUntil?: string;
  breakStartedBy?: BreakStartedBy;
  shiftStartedAt?: string;
  shiftCloseRequestedAt?: string;
  shiftEndedAt?: string;
  contractStartDate: string;
  contractEndDate: string;
  isTerminated: boolean;
  location?: CourierLocation;
}

export interface CourierShiftSlot {
  id: number;
  shiftDate: string;
  startsAt: string;
  endsAt: string;
  isCancelled: boolean;
}

export interface CourierShiftBooking {
  id: number;
  slotId: number;
  courierId: number;
  status: CourierShiftBookingStatus;
  bookedAt: string;
  swapListedAt?: string;
}

export interface CourierShiftRecord {
  id: number;
  courierId: number;
  bookingId?: number;
  startedAt?: string;
  endedAt?: string;
}

export interface CourierBreakPeriod {
  id: number;
  courierId: number;
  shiftId?: number;
  startedAt: string;
  scheduledEndAt: string;
  endedAt?: string;
  startedBy: BreakStartedBy;
}

export interface CourierShiftDayBlock {
  courierId: number;
  shiftDate: string;
  reason: string;
}

export interface Restaurant {
  id: number;
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  latitude?: number;
  longitude?: number;
  acceptsOrders: boolean;
}

export interface DeliveryOrder {
  id: string;
  code: string;
  orderSource: 'restaurant' | 'admin';
  restaurantId: number;
  restaurantName: string;
  restaurantAddress: string;
  restaurantLatitude?: number;
  restaurantLongitude?: number;
  courierId?: number;
  courierName?: string;
  courierPhone?: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  itemsText: string;
  notes: string;
  amountDuePiasters: number;
  deliveryFeePiasters?: number;
  deliveryFeeRemittedPiasters?: number;
  restaurantDuePiasters: number;
  lineItems?: OrderLineItem[];
  collectedPiasters?: number;
  paidToRestaurantPiasters?: number;
  paidToPreviousCourierPiasters?: number;
  previousCourierId?: number;
  status: OrderStatus;
  createdAt: string;
  restaurantAcceptedAt?: string;
  assignedAt?: string;
  lastUnacceptedCourierId?: number;
  assignmentExpiredAt?: string;
  acceptedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
}

export interface OrderReturn {
  id: string;
  orderId: string;
  courierId: number;
  restaurantId: number;
  status: OrderReturnStatus;
  reason: string;
  startedAt: string;
  returnedAt?: string;
  courierReceivedRestaurantRefund?: boolean;
  photoUrl?: string;
}

export interface OrderAssignmentAttempt {
  id: string;
  orderId: string;
  orderCode: string;
  courierId: number;
  assignedAt: string;
  status: OrderAssignmentAttemptStatus;
  acceptedAt?: string;
  resolvedAt?: string;
}

export interface OrderTransferRequest {
  id: string;
  orderId: string;
  fromCourierId: number;
  fromCourierName: string;
  fromCourierCode: string;
  fromCourierPhone: string;
  toCourierId?: number;
  toCourierName?: string;
  toCourierCode?: string;
  reason: OrderTransferReason;
  reasonDetails: string;
  status: OrderTransferStatus;
  requiresHandoff: boolean;
  requestedAt: string;
  resolvedAt?: string;
}

export interface OrderLineItem {
  id: number;
  menuItemId?: number;
  name: string;
  quantity: number;
  unitPricePiasters: number;
  lineTotalPiasters: number;
}

export interface RestaurantMenuItem {
  id: number;
  name: string;
  pricePiasters: number;
  isAvailable: boolean;
}

export interface NewOrderInput {
  restaurantId?: number;
  deliveryFeePiasters?: number;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  items: { itemId: number; quantity: number }[];
}

export interface NewCourierInput {
  email: string;
  fullName: string;
  phone: string;
  nationalId: string;
  address: string;
  idCard: {
    base64: string;
    mimeType: string;
    fileSize?: number;
  };
  selfie: {
    base64: string;
    mimeType: string;
    fileSize?: number;
  };
}

export interface NewRestaurantInput {
  email: string;
  name: string;
  phone: string;
  address: string;
}

export interface TemporaryCredentials {
  code: string;
  email: string;
  temporaryPassword: string;
}

export interface SupportConversation {
  id: string;
  openedBy: string;
  requesterRole: 'restaurant' | 'courier';
  requesterName: string;
  subject: string;
  relatedOrderId?: string;
  relatedOrderCode?: string;
  status: SupportConversationStatus;
  assignedTo?: string;
  assignedName?: string;
  lastMessageBody: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface SupportMessage {
  id: number;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  body: string;
  createdAt: string;
}

export interface SupportAgent {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt: string;
}

export type ManagedAccountType = 'courier' | 'restaurant' | 'support';

export interface CourierPrivateDetails {
  id: number;
  code: string;
  fullName: string;
  email: string;
  phone: string;
  nationalId: string;
  address: string;
  idCardUrl: string;
  selfieUrl?: string;
  isActive: boolean;
  isOnShift: boolean;
  breakUntil?: string;
  contractStartDate: string;
  contractEndDate: string;
  terminatedAt?: string;
}

export interface CourierProfileUpdateInput {
  fullName: string;
  email: string;
  phone: string;
  nationalId: string;
  address: string;
  idCard?: {
    base64: string;
    mimeType: string;
    fileSize?: number;
  };
  selfie?: {
    base64: string;
    mimeType: string;
    fileSize?: number;
  };
}

export interface NewSupportAgentInput {
  email: string;
  fullName: string;
  phone: string;
}
