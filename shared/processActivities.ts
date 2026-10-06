import type { ProcessNode } from "./enterprise";

export const activityDetails = {
  input: {
    label: "Receive",
    building: "Receiving square",
    color: "#688f8b",
    description: "Couriers bring incoming messages into the flow.",
  },
  validate: {
    label: "Validate",
    building: "Validation gate",
    color: "#a48e58",
    description:
      "The gatekeeper checks messages before they continue. Errors raise a warning at the gate.",
  },
  transform: {
    label: "Transform",
    building: "Transformation mill",
    color: "#8e7eaa",
    description:
      "The mill changes a crate’s color to represent mapping a payload into the next system’s format.",
  },
  route: {
    label: "Route",
    building: "Routing office",
    color: "#618da5",
    description:
      "The dispatcher sends crates down different lanes. The lanes illustrate routing; destination shares are not measured here.",
  },
  aggregate: {
    label: "Aggregate",
    building: "Aggregation barn",
    color: "#b28161",
    description:
      "Small crates come together into one bundle. The merge illustrates aggregation; batch size and correlation state are not reported by this feed.",
  },
  request: {
    label: "Connect",
    building: "Partner station",
    color: "#648a9c",
    description:
      "A courier carries work to a downstream system. Longer node latency slows the delivery animation.",
  },
  database: {
    label: "Store",
    building: "Record library",
    color: "#7e9770",
    description:
      "The archivist shelves records. Node counts show successful and failed storage operations.",
  },
  output: {
    label: "Deliver",
    building: "Delivery depot",
    color: "#769784",
    description:
      "Completed work leaves the village by cart, reply, queue, or event stream.",
  },
  compute: {
    label: "Compute",
    building: "Processing workshop",
    color: "#9d8870",
    description:
      "A craftsman processes each message. The bench animates while this flow has traffic.",
  },
} as const;
export type ProcessActivity = keyof typeof activityDetails;

/** Node names describe the operation; unrecognized Compute nodes stay generic. */
export function nodeActivity(node: ProcessNode): ProcessActivity {
  if (node.type === "INPUT") return "input";
  if (node.type === "REPLY" || node.type === "MQ_OUTPUT") return "output";
  if (node.type === "DATABASE") return "database";
  const name = node.name.toLowerCase();
  if (/aggregat|collect|consolidat|merge|join|reconcil/.test(name))
    return "aggregate";
  if (/rout|dispatch|switch|fan.?out/.test(name)) return "route";
  if (/transform|mapping|\bmap\b|normaliz|convert|enrich/.test(name))
    return "transform";
  if (/validat|security|auth|verif|check|filter/.test(name)) return "validate";
  if (node.type === "HTTP_REQUEST") return "request";
  return "compute";
}

/** Business-specific sample Compute operations. These are mock flows, not deployed ACE configuration. */
export const demoOperations: Record<
  string,
  { check: string; transform: string; process?: string }
> = {
  "QRIS Dynamic": {
    check: "Validate Merchant",
    transform: "Transform QR Payload",
  },
  "Bank Transfer Inbound": {
    check: "Validate Transfer",
    transform: "Transform ISO Message",
  },
  "Bank Transfer Outbound": {
    check: "Check Transfer Limits",
    transform: "Transform Bank Request",
  },
  "Reconciliation Batch": {
    check: "Validate Batch",
    transform: "Aggregate Settlement Records",
  },
  "E-Wallet Settlement": {
    check: "Validate Settlement",
    transform: "Aggregate Wallet Totals",
  },
  "Customer Account Ingestion": {
    check: "Validate Account",
    transform: "Normalize Account Record",
  },
  "Virtual Account Engine": {
    check: "Validate VA Request",
    transform: "Transform Account Request",
    process: "Route by Account Provider",
  },
  "Balance Inquiry Service": {
    check: "Authorize Account Access",
    transform: "Transform Balance Request",
  },
  "Statement Generation": {
    check: "Validate Statement Period",
    transform: "Aggregate Statement Entries",
  },
  "Overdraft Check": {
    check: "Check Credit Policy",
    transform: "Transform Limit Request",
  },
  "Customer 360 Sync": {
    check: "Validate Customer Event",
    transform: "Normalize Customer Profile",
    process: "Aggregate Customer Records",
  },
  "SSO Auth Broker": {
    check: "Verify Security Token",
    transform: "Transform Identity Claims",
    process: "Route to Identity Provider",
  },
  "KYC Verification Adapter": {
    check: "Validate KYC Document",
    transform: "Transform KYC Request",
  },
  "Notification Dispatcher (SMS/WA/Email)": {
    check: "Validate Recipient",
    transform: "Transform Message Template",
    process: "Route SMS / WA / Email",
  },
  "Loyalty Points Hub": {
    check: "Validate Loyalty Event",
    transform: "Aggregate Loyalty Points",
  },
  "Order Ingestion Gateway": {
    check: "Validate Order",
    transform: "Transform Order Payload",
    process: "Route by Order Type",
  },
  "Inventory Lock Service": {
    check: "Check Stock Availability",
    transform: "Transform Reservation",
  },
  "Courier Dispatch Adapter": {
    check: "Validate Shipment",
    transform: "Transform Courier Request",
    process: "Route by Courier Region",
  },
  "Delivery Status Webhook": {
    check: "Verify Webhook Signature",
    transform: "Normalize Delivery Status",
  },
  "Return Processor": {
    check: "Validate Return Policy",
    transform: "Transform Return Request",
    process: "Route Refund / Replacement",
  },
  "SAP Master Data Sync": {
    check: "Validate SAP Record",
    transform: "Transform SAP IDoc",
  },
  "Procurement Flow": {
    check: "Validate Purchase Order",
    transform: "Transform Supplier Order",
    process: "Route by Supplier",
  },
  "General Ledger Ingestion": {
    check: "Validate Ledger Entry",
    transform: "Transform Journal Schema",
  },
  "Invoice Archiver": {
    check: "Validate Invoice",
    transform: "Transform Invoice Metadata",
  },
  "Audit Log Shipper": {
    check: "Filter Sensitive Fields",
    transform: "Normalize Audit Event",
  },
};
