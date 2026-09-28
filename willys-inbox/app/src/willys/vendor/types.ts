// Vendored from https://github.com/ErikHellman/willys-agent (MIT, Erik Hellman)
export interface Customer {
  uid: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  socialSecurityNumer: string;
  storeId: string;
  homeStoreId: string;
  displayUid: string;
  defaultBillingAddress: Address | null;
  defaultShippingAddress: Address | null;
  linkedAccounts: { name: string; isPrimary: boolean }[];
  bonusInfo: Record<string, unknown>;
}

export interface Address {
  id: string;
  firstName: string;
  lastName: string;
  town: string;
  postalCode: string;
  cellphone: string;
  email: string;
  country: { isocode: string; name: string };
  formattedAddress: string;
  longitude: number;
  latitude: number;
  [key: string]: unknown;
}

export interface Product {
  name: string;
  code: string;
  price: string;
  priceValue: number;
  priceUnit: string;
  priceNoUnit: string;
  comparePrice: string;
  comparePriceUnit: string;
  productLine2: string;
  manufacturer: string;
  displayVolume: string;
  image: ProductImage | null;
  thumbnail: ProductImage | null;
  labels: string[];
  outOfStock: boolean;
  online: boolean;
  addToCartDisabled: boolean;
  productBasketType: { code: string; type: string };
  incrementValue: number;
  potentialPromotions: Promotion[];
  savingsAmount: string | null;
  depositPrice: string;
  averageWeight: number | null;
  [key: string]: unknown;
}

export interface ProductImage {
  imageType: string;
  format: string;
  url: string;
  altText: string | null;
}

export interface Promotion {
  code?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Pagination {
  pageSize: number;
  currentPage: number;
  sort: string | null;
  numberOfPages: number;
  totalNumberOfResults: number;
  allProductsInCategoriesCount: number;
  allProductsInSearchCount: number;
}

export interface SearchResult {
  results: Product[];
  pagination: Pagination;
  facets: unknown[];
  freeTextSearch: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  breadcrumbs: unknown[];
  sorts: unknown[];
}

export interface Category {
  id: string;
  category: string;
  title: string;
  url: string;
  valid: boolean;
  children: Category[];
}

export interface Cart {
  products: CartProduct[];
  totalPrice: string;
  totalItems: number;
  totalUnitCount: number;
  totalDiscount: string;
  totalTax: string;
  subTotalWithDiscounts: string;
  deliveryCost: string;
  paymentType: string;
  appliedVouchers: unknown[];
  taxes: Record<string, unknown>;
  isocode: string;
}

export interface CartProduct {
  code: string;
  name: string;
  price: string;
  priceValue: number;
  quantity: number;
  pickQuantity: number;
  totalPrice: string;
  manufacturer: string;
  displayVolume: string;
  comparePrice: string;
  comparePriceUnit: string;
  image: ProductImage | null;
  productBasketType: { code: string; type: string };
  [key: string]: unknown;
}
