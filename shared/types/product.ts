export type ApiProduct = {
  id: string;
  name: string;
  image: string;
  quantity: number;
  stockQuantity: number;
  price: number;
};

export type ApiOrder = {
  orderId: string;
  createdAt: string;
  products: ApiProduct[];
};

export type ApiResponse = {
  data: ApiOrder[];
};

// Flattened unique product for UI
export type Product = {
  product_id: string;
  image: string;
  title: string;
  stock: number;
  price: string;
  critical_stock_value?: number;
  stock_end_date?: string;
  stock_remaining_day?: number;
};
