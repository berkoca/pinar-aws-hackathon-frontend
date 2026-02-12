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
  critical_stock_value: number;
  stock_end_date: string;
  stock_remaining_day: number;
  avg_daily_quantity: number;
  recommended_discount: number;
  recommended_price: number;
  demand_level: string;
  action_plan: string[];
  weekly_trend_pct: number;
  total_revenue: number;
  needs_order?: boolean;
};
