# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

- Delivery managers dispatch orders, monitor couriers, and review order and cash totals.
- Each restaurant has a separate account; its staff enter orders and follow their dispatch and delivery status.
- Couriers receive assigned orders, update delivery status, and record cash handled per order.
- Support staff respond to courier and restaurant questions in the shared support inbox.
- Managers create courier accounts and maintain their identity records.

## Product Purpose

Provide one Arabic-language app that connects restaurant order entry, manual management dispatch, courier delivery, location visibility, per-order cash reporting, and operational support conversations.

## Positioning

The shared order record connects a restaurant's submission to management assignment, courier completion, location visibility, and cash reporting. This is a description of the requested workflow, not a comparative market claim.

## Operating Context

The app is intended for delivery operations in Egypt and uses Arabic with right-to-left layouts. The initial currency assumption is Egyptian pounds. Shared order and location features require internet access.

## Capabilities and Constraints

- One app presents role-specific screens for management, restaurants, and couriers.
- Managers assign orders manually. Completed deliveries count toward daily and monthly totals; cancelled orders are reported separately.
- Every order is linked to the restaurant account that submitted it. Couriers can see the restaurant name and customer delivery address in the order details.
- Order details include the restaurant address/location and a text list of item names and quantities. If restaurant coordinates are available, the courier can open them in a maps app; otherwise the address is used for the map search.
- Couriers record cash collected from customers and cash paid to restaurants. The first release does not process electronic payments or settlements.
- Courier location is shared only while on shift or handling an active delivery. The app shows unavailable or stale location states instead of implying tracking succeeded.
- Managers create courier accounts with a full legal name, national ID number, address, and ID-card image. Each courier receives a permanent, generated identifier distinct from the national ID.
- Courier accounts also require a phone number for restaurant contact. The login email and temporary password are separate from that phone number.
- Managers create separate restaurant accounts so orders remain associated with the restaurant that submitted them.
- Couriers and restaurants can open support conversations, optionally link one of their own orders, and continue the exchange in the same thread. Management creates support staff accounts; support staff can claim and resolve conversations.
- Support conversations update in real time while connected. The first release supports text messages and conversation status, not file attachments or offline delivery.
- After a courier accepts an order, only the restaurant account that submitted that order can see that courier's name and phone number.
- Courier identity details and ID-card images are sensitive personal information and must be restricted to management; they must not be exposed in logs or public storage.
- Initial login is assumed to use a required email address and a temporary password generated for the courier. SMS login and account recovery remain open decisions.
- Android is the first target. iPhone, offline synchronization, automatic dispatch, historical location trails, electronic payment, and store publication are outside the first release.

## Evidence on Hand

No product logo, menu data, customer data, courier records, or map/payment credentials have been provided. Any sample data used for previews must be clearly labeled as synthetic.

## Product Principles

1. Make order ownership and the next required action unmistakable.
2. Keep courier controls quick and usable while the courier is on the move.
3. Keep personal identity data private and reveal tracking availability honestly.
4. Make operational and cash totals traceable to completed order records.
