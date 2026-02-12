export type PredictPeriods = {
  week1: number;
  week2: number;
  week3: number;
  week4: number;
};

export type ProductPrediction = {
  product_id: string;
  image: string;
  title: string;
  stock: number;
  price: string;
  predited_total_stock: number;
  predict_periods: PredictPeriods;
};

export type AnalysisReport = {
  sku: string;
  current_stock?: number;
  total_orders?: number;
  total_quantity?: number;
  total_revenue: number;
  avg_price?: number;
  recommended_price: number;
  recommended_discount: number;
  discount_reason?: string;
  avg_daily_quantity: number;
  peak_daily_quantity?: number;
  min_daily_quantity?: number;
  demand_level: string;
  weekly_trend_pct: number;
  critical_stock_value: number;
  stock_remaining_day: number;
  stock_end_date: string;
  action_plan: string[];
  daily_trend?: Record<string, number>;
  time_range?: { earliest: string; latest: string };
  needs_order?: boolean;
};
