import type { OrderTransferReason } from '../types';

export const orderTransferReasonOptions: { id: OrderTransferReason; label: string }[] = [
  { id: 'vehicle_issue', label: 'عطل بالمركبة' },
  { id: 'health_issue', label: 'ظرف صحي' },
  { id: 'restaurant_delay', label: 'تأخر المطعم' },
  { id: 'customer_unavailable', label: 'تعذر الوصول للعميل' },
  { id: 'order_issue', label: 'مشكلة في الطلب' },
  { id: 'other', label: 'سبب آخر' },
];

export const orderTransferReasonLabels: Record<OrderTransferReason, string> = {
  vehicle_issue: 'عطل بالمركبة',
  health_issue: 'ظرف صحي',
  restaurant_delay: 'تأخر المطعم',
  customer_unavailable: 'تعذر الوصول للعميل',
  order_issue: 'مشكلة في الطلب',
  other: 'سبب آخر',
};
