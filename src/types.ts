export type UserRole = 'admin' | 'restaurant' | 'courier' | 'support';

export type SupportConversationStatus = 'open' | 'in_progress' | 'resolved';

export type OrderStatus =
  | 'pending'
  | 'assigned'
  | 'accepted'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

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
  nationalId?: string;
  address?: string;
  idCardPath?: string;
  isActive: boolean;
  isOnShift: boolean;
  isOnBreak: boolean;
  breakUntil?: string;
  shiftStartedAt?: string;
  shiftCloseRequestedAt?: string;
  shiftEndedAt?: string;
  contractStartDate: string;
  contractEndDate: string;
  isTerminated: boolean;
  location?: CourierLocation;
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
  status: OrderStatus;
  createdAt: string;
  assignedAt?: string;
  lastUnacceptedCourierId?: number;
  assignmentExpiredAt?: string;
  acceptedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
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
